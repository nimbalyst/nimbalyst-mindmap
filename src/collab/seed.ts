/**
 * Bootstrap seeding for the Mindmap collaborative Y.Doc.
 *
 * `useCollaborativeEditor` wraps this call in a `yDoc.transact(...,
 * COLLAB_INIT_ORIGIN)`. Two clients racing on a fresh document both call
 * seed and their CRDT updates merge -- as long as this routine is fully
 * deterministic given the same input, the merged shape is identical to
 * either client's individual output (no duplicate nodes, no fork in
 * childIds order).
 *
 * Determinism comes from two places:
 *
 *  1. Node ids. Root is the fixed string `node_root`. Non-root nodes carry
 *     the id assigned during file parse, which is `node_${Date.now()}_${i}`
 *     -- the same input file therefore produces the same ids on every
 *     client BUT ONLY if both clients parse the same file at the same
 *     wall-clock moment. They won't. The robust path is to derive ids from
 *     content + position-in-file: we replace the parse-assigned ids with
 *     stable `n${index}` ids before writing.
 *
 *  2. childIds order. Y.Array preserves insertion order; we push children
 *     in the exact order they appear in the parsed document.
 */

import * as Y from 'yjs';
import type { MindmapDocument, MindmapNode } from '../types';
import { parseDocument } from '../model';
import {
  createYNode,
  getYMeta,
  getYNodes,
  META_ROOT_ID,
  META_TITLE,
  META_LAYOUT,
} from './yShape';

/**
 * Whether the Y.Doc already carries Mindmap content. Used as the
 * `useCollaborativeEditor` `isEmpty` guard so we don't re-seed a doc that
 * was just sync'd in.
 */
export function isMindmapYDocEmpty(yDoc: Y.Doc): boolean {
  return getYNodes(yDoc).size === 0;
}

/**
 * Populate the Y.Doc from raw file content. Caller (the SDK hook) wraps
 * this in a transaction with COLLAB_INIT_ORIGIN.
 */
export function seedMindmapYDoc(
  yDoc: Y.Doc,
  content: string | ArrayBuffer,
): void {
  const raw = typeof content === 'string' ? content : decodeBuffer(content);
  // NEVER seed from empty content: the host returns '' when it has no bytes
  // for the doc (reopening an already-shared document), and parseDocument('')
  // yields the DEFAULT "Untitled map" -- writing that into the shared room
  // clobbers the real title/meta for every client. An unseeded doc is filled
  // by the room sync or the first real edit instead.
  if (raw.trim() === '') return;
  const parsed = parseDocument(raw);
  const stable = makeIdsDeterministic(parsed);
  writeDocument(yDoc, stable);
}

function decodeBuffer(buf: ArrayBuffer): string {
  try {
    return new TextDecoder().decode(buf);
  } catch {
    return '';
  }
}

function writeDocument(yDoc: Y.Doc, doc: MindmapDocument): void {
  const yNodes = getYNodes(yDoc);
  const yMeta = getYMeta(yDoc);

  yMeta.set(META_TITLE, doc.title);
  yMeta.set(META_ROOT_ID, doc.rootId);
  yMeta.set(META_LAYOUT, doc.metadata.layout);

  for (const id of Object.keys(doc.nodes)) {
    const node = doc.nodes[id];
    if (!yNodes.has(id)) {
      yNodes.set(id, createYNode(node));
    }
  }
}

/**
 * Replace the timestamp-based parse ids with deterministic content-derived
 * ones (`node_root`, `n1`, `n2`, ...) using a stable traversal order so two
 * clients parsing the same file always produce the same id sequence.
 *
 * Traversal: depth-first preorder starting at root, visiting children in
 * the order they appear in the parent's `childIds`. The parse already
 * preserves source order, so this is equivalent to "id by line number".
 */
function makeIdsDeterministic(doc: MindmapDocument): MindmapDocument {
  const remap = new Map<string, string>();
  remap.set(doc.rootId, 'node_root');

  let counter = 0;
  const stack: string[] = [doc.rootId];
  while (stack.length > 0) {
    const oldId = stack.pop()!;
    const node = doc.nodes[oldId];
    if (!node) continue;
    // Push children in reverse so we pop them in source order.
    for (let i = node.childIds.length - 1; i >= 0; i--) {
      const childOldId = node.childIds[i];
      if (!remap.has(childOldId)) {
        remap.set(childOldId, `n${++counter}`);
        stack.push(childOldId);
      }
    }
  }

  const newNodes: Record<string, MindmapNode> = {};
  for (const [oldId, node] of Object.entries(doc.nodes)) {
    const newId = remap.get(oldId) ?? oldId;
    newNodes[newId] = {
      ...node,
      id: newId,
      parentId: node.parentId ? remap.get(node.parentId) ?? node.parentId : null,
      childIds: node.childIds.map((c) => remap.get(c) ?? c),
    };
  }

  return {
    ...doc,
    rootId: remap.get(doc.rootId) ?? 'node_root',
    nodes: newNodes,
  };
}
