/**
 * Mindmap <-> Y.Doc binding.
 *
 * The mindmap editor is reducer-driven (`editorReducer` over `EditorState`).
 * In local-only mode the reducer is authoritative -- it owns the document
 * and pushes/pops the undo stack.
 *
 * In collab mode the Y.Doc is authoritative for `document.nodes` and
 * `document.title`. The binding bridges between them:
 *
 *   1. Editor -> Y.Doc:
 *      We diff `state.document` against the last applied snapshot on every
 *      reducer commit and emit the minimum-cost set of Y.Map mutations. The
 *      mutations are wrapped in a `yDoc.transact(..., binding)` so the
 *      remote observer below ignores them.
 *
 *   2. Y.Doc -> Editor:
 *      A deep observer on `nodes`/`meta` rebuilds the document snapshot
 *      from the Y.Doc and dispatches a single `REPLACE_DOCUMENT` action.
 *      The REPLACE bypasses the undo stack (or rather: undo only tracks
 *      the local Y.UndoManager, not the reducer's stack).
 *
 *   3. Awareness:
 *      We expose `setLocalAwareness(state)` so the editor can publish
 *      `selectedNodeId` / `editingNodeId`. Subscribers render "X is editing
 *      this node" badges from the standard `awareness.on('change')` event.
 */

import * as Y from 'yjs';
import type * as awarenessProtocol from 'y-protocols/awareness';
import { COLLAB_INIT_ORIGIN } from '@nimbalyst/extension-sdk';
import type { MindmapDocument, MindmapNode } from '../types';
import {
  createYNode,
  getYMeta,
  getYNodes,
  META_ROOT_ID,
  META_TITLE,
  META_LAYOUT,
  NODE_CHILD_IDS,
  NODE_COLOR,
  NODE_NOTE,
  NODE_PARENT_ID,
  NODE_POS_X,
  NODE_POS_Y,
  NODE_STATUS,
  NODE_TAGS,
  NODE_TEXT,
  NODE_LINK,
  NODE_PINNED,
  readYDoc,
} from './yShape';

export interface MindmapBindingCallbacks {
  /**
   * Push a remote snapshot into the reducer. `epoch` is the binding's snapshot
   * counter at dispatch time; the editor must store it in reducer state
   * (REPLACE_DOCUMENT.collabEpoch) and only forward states whose stored epoch
   * matches `getEpoch()` — states derived from an older snapshot would diff
   * against a newer baseline and mass-delete remote content.
   */
  onRemoteDocument(doc: MindmapDocument, epoch: number): void;
  /** Called when remote awareness changes (e.g. for "X is editing here" badges). */
  onRemoteAwareness?(): void;
}

export interface MindmapAwarenessLocal {
  selectedNodeId?: string | null;
  editingNodeId?: string | null;
}

export class MindmapBinding {
  private yDoc: Y.Doc;
  private yNodes: Y.Map<Y.Map<unknown>>;
  private yMeta: Y.Map<unknown>;
  private awareness?: awarenessProtocol.Awareness;
  private callbacks: MindmapBindingCallbacks;

  private subscriptions: Array<() => void> = [];
  /** Snapshot last pushed to the Y.Doc; the diff baseline for local commits. */
  private lastAppliedDocument: MindmapDocument;
  /** Suppress the next remote-observer fire if it's our own write. */
  private localTxnOrigin = Symbol('mindmap-local-txn');
  /** Bumped on every remote snapshot pushed to the editor; see getEpoch(). */
  private epoch = 0;

  constructor(
    yDoc: Y.Doc,
    initialDocument: MindmapDocument,
    callbacks: MindmapBindingCallbacks,
    awareness?: awarenessProtocol.Awareness,
  ) {
    this.yDoc = yDoc;
    this.yNodes = getYNodes(yDoc);
    this.yMeta = getYMeta(yDoc);
    this.callbacks = callbacks;
    this.awareness = awareness;
    this.lastAppliedDocument = initialDocument;

    // Remote -> editor
    const onNodesChange = (
      _events: Array<Y.YEvent<Y.AbstractType<unknown>>>,
      txn: Y.Transaction,
    ): void => {
      if (txn.origin === this.localTxnOrigin) return;
      this.pushRemoteSnapshot();
    };
    this.yNodes.observeDeep(onNodesChange);
    this.subscriptions.push(() => this.yNodes.unobserveDeep(onNodesChange));

    const onMetaChange = (
      _event: Y.YMapEvent<unknown>,
      txn: Y.Transaction,
    ): void => {
      if (txn.origin === this.localTxnOrigin) return;
      this.pushRemoteSnapshot();
    };
    this.yMeta.observe(onMetaChange);
    this.subscriptions.push(() => this.yMeta.unobserve(onMetaChange));

    if (this.awareness) {
      const onAwareness = () => this.callbacks.onRemoteAwareness?.();
      this.awareness.on('change', onAwareness);
      this.subscriptions.push(() => this.awareness?.off('change', onAwareness));
    }

    // If the doc already has content at construction time, push it once so
    // the editor's reducer state matches the Y.Doc baseline. The hook calls
    // this constructor only after the SDK has either seeded the doc or
    // confirmed it already has content.
    if (this.yNodes.size > 0) {
      this.pushRemoteSnapshot();
    }
  }

  destroy(): void {
    for (const s of this.subscriptions) {
      try {
        s();
      } catch {
        /* ignore */
      }
    }
    this.subscriptions = [];
  }

  /**
   * Called by the editor whenever the reducer emits a new document state.
   * Computes the diff against `lastAppliedDocument` and writes the minimum
   * set of Y.Map/Y.Array mutations into the Y.Doc.
   */
  applyLocalDocument(next: MindmapDocument): void {
    const prev = this.lastAppliedDocument;
    if (next === prev) return;

    this.yDoc.transact(() => {
      // Title / rootId on meta
      if (next.title !== prev.title) {
        this.yMeta.set(META_TITLE, next.title);
      }
      if (next.rootId !== prev.rootId) {
        this.yMeta.set(META_ROOT_ID, next.rootId);
      }
      if (next.metadata.layout !== prev.metadata.layout) {
        this.yMeta.set(META_LAYOUT, next.metadata.layout);
      }

      const prevIds = new Set(Object.keys(prev.nodes));
      const nextIds = new Set(Object.keys(next.nodes));

      // Deletes
      for (const id of prevIds) {
        if (!nextIds.has(id)) this.yNodes.delete(id);
      }

      // Adds + per-field updates
      for (const id of nextIds) {
        const nextNode = next.nodes[id];
        if (!prevIds.has(id) || !this.yNodes.has(id)) {
          this.yNodes.set(id, createYNode(nextNode));
          continue;
        }
        const yNode = this.yNodes.get(id);
        if (!yNode) {
          // Shouldn't happen given the has() check above, but be defensive.
          this.yNodes.set(id, createYNode(nextNode));
          continue;
        }
        this.applyLocalNode(yNode, prev.nodes[id], nextNode);
      }
    }, this.localTxnOrigin);

    this.lastAppliedDocument = next;
  }

  private applyLocalNode(
    yNode: Y.Map<unknown>,
    prev: MindmapNode,
    next: MindmapNode,
  ): void {
    if (next.text !== prev.text) yNode.set(NODE_TEXT, next.text);
    if (next.note !== prev.note) yNode.set(NODE_NOTE, next.note);
    if (next.parentId !== prev.parentId) yNode.set(NODE_PARENT_ID, next.parentId);
    if (next.color !== prev.color) yNode.set(NODE_COLOR, next.color);
    if (next.status !== prev.status) yNode.set(NODE_STATUS, next.status);
    if (next.position.x !== prev.position.x) yNode.set(NODE_POS_X, next.position.x);
    if (next.position.y !== prev.position.y) yNode.set(NODE_POS_Y, next.position.y);
    if (next.link !== prev.link) yNode.set(NODE_LINK, next.link);
    if (next.pinned !== prev.pinned) yNode.set(NODE_PINNED, next.pinned);

    if (!arraysEqual(prev.childIds, next.childIds)) {
      const yChildIds = yNode.get(NODE_CHILD_IDS) as Y.Array<string> | undefined;
      if (yChildIds) {
        replaceArray(yChildIds, next.childIds);
      } else {
        const arr = new Y.Array<string>();
        if (next.childIds.length > 0) arr.push(next.childIds.slice());
        yNode.set(NODE_CHILD_IDS, arr);
      }
    }

    if (!arraysEqual(prev.tags, next.tags)) {
      const yTags = yNode.get(NODE_TAGS) as Y.Array<string> | undefined;
      if (yTags) {
        replaceArray(yTags, next.tags);
      } else {
        const arr = new Y.Array<string>();
        if (next.tags.length > 0) arr.push(next.tags.slice());
        yNode.set(NODE_TAGS, arr);
      }
    }
  }

  /**
   * Publish local awareness. The standard `user` block is pre-populated by
   * the host before this is called; we layer the mindmap-specific extras
   * on top of whatever the host put there.
   */
  setLocalAwareness(local: MindmapAwarenessLocal): void {
    if (!this.awareness) return;
    if (local.selectedNodeId !== undefined) {
      this.awareness.setLocalStateField('selectedNodeId', local.selectedNodeId);
    }
    if (local.editingNodeId !== undefined) {
      this.awareness.setLocalStateField('editingNodeId', local.editingNodeId);
    }
  }

  /** Map of remote userId -> editing node id (or null), for "X is editing here" badges. */
  getRemoteEditingByUser(): Map<string, string | null> {
    const out = new Map<string, string | null>();
    if (!this.awareness) return out;
    const states = this.awareness.getStates();
    for (const [clientId, state] of states) {
      if (clientId === this.awareness.clientID) continue;
      const userId = (state.user as { id?: string } | undefined)?.id;
      if (!userId) continue;
      const editingNodeId = (state as { editingNodeId?: string | null }).editingNodeId ?? null;
      out.set(userId, editingNodeId);
    }
    return out;
  }

  /**
   * The current snapshot epoch. A reducer state is safe to forward into the
   * Y.Doc only when its stored `collabEpoch` equals this value — otherwise the
   * state predates the baseline and its diff would delete newer content.
   */
  getEpoch(): number {
    return this.epoch;
  }

  private pushRemoteSnapshot(): void {
    const snapshot = readYDoc(this.yDoc);
    // Carry over local-only metadata fields (createdAt, viewport) from our
    // current baseline so the reducer doesn't think they changed.
    const merged: MindmapDocument = {
      ...snapshot,
      metadata: {
        ...this.lastAppliedDocument.metadata,
        layout: snapshot.metadata.layout,
      },
    };
    this.lastAppliedDocument = merged;
    this.epoch++;
    this.callbacks.onRemoteDocument(merged, this.epoch);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Replace the contents of a Y.Array with `next`. We diff for the longest
 * common prefix / suffix so concurrent edits at one end don't get clobbered
 * by a wholesale replace.
 */
function replaceArray(target: Y.Array<string>, next: readonly string[]): void {
  const current = target.toArray();
  let prefix = 0;
  while (
    prefix < current.length &&
    prefix < next.length &&
    current[prefix] === next[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < current.length - prefix &&
    suffix < next.length - prefix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }

  const removeCount = current.length - prefix - suffix;
  const inserts = next.slice(prefix, next.length - suffix);

  if (removeCount > 0) target.delete(prefix, removeCount);
  if (inserts.length > 0) target.insert(prefix, inserts.slice());
}

// Re-export for callers that want to ignore init-origin transactions in
// their own observers.
export { COLLAB_INIT_ORIGIN };
