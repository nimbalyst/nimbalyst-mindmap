import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

// The binding only re-exports COLLAB_INIT_ORIGIN from the SDK; the SDK's dist
// chain drags in @nimbalyst/runtime which isn't installable here.
vi.mock('@nimbalyst/extension-sdk', () => ({
  COLLAB_INIT_ORIGIN: Symbol('nimbalyst:collab-init'),
}));

import { MindmapBinding } from '../src/collab/mindmapBinding';
import { getYMeta, getYNodes, createYNode, META_ROOT_ID, META_TITLE } from '../src/collab/yShape';
import { createEmptyDocument, createInitialState, editorReducer } from '../src/model';
import type { MindmapNode } from '../src/types';

/**
 * NIM-1521: a reducer state that predates the binding's latest remote
 * snapshot must never be forwarded into the shared Y.Doc — the diff against
 * the newer baseline mass-deletes remote content ("Untitled map" clobber).
 * The invariant: forward only when state.collabEpoch === binding.getEpoch().
 * These tests pin the two halves of that contract.
 */

function makeNode(id: string, text: string, parentId: string | null, childIds: string[] = []): MindmapNode {
  return {
    id,
    text,
    note: '',
    parentId,
    childIds,
    position: { x: 0, y: 0 },
    tags: [],
    status: 'none' as MindmapNode['status'],
    color: 'default' as MindmapNode['color'],
  };
}

function seededYDoc(): Y.Doc {
  const yDoc = new Y.Doc();
  const nodes = getYNodes(yDoc);
  const meta = getYMeta(yDoc);
  yDoc.transact(() => {
    nodes.set('node_root', createYNode(makeNode('node_root', 'Real content', null, ['n1'])));
    nodes.set('n1', createYNode(makeNode('n1', 'Important child', 'node_root')));
    meta.set(META_TITLE, 'Real map');
    meta.set(META_ROOT_ID, 'node_root');
  });
  return yDoc;
}

describe('collab epoch guard (NIM-1521)', () => {
  it('binding bumps its epoch on every remote snapshot and reports it to the callback', () => {
    const yDoc = seededYDoc();
    const seen: number[] = [];
    const binding = new MindmapBinding(yDoc, createEmptyDocument(), {
      onRemoteDocument: (_doc, epoch) => seen.push(epoch),
    });

    // Construction pushed the existing content once.
    expect(binding.getEpoch()).toBe(1);
    expect(seen).toEqual([1]);

    // A remote transaction (foreign origin) pushes again.
    yDoc.transact(() => {
      getYMeta(yDoc).set(META_TITLE, 'Renamed remotely');
    }, 'remote-origin');
    expect(binding.getEpoch()).toBe(2);
    expect(seen).toEqual([1, 2]);
    binding.destroy();
  });

  it('REPLACE_DOCUMENT carries the epoch into reducer state; other actions preserve it', () => {
    const initial = createInitialState(createEmptyDocument());
    expect(initial.collabEpoch).toBe(0);

    const replaced = editorReducer(initial, {
      type: 'REPLACE_DOCUMENT',
      document: {
        ...createEmptyDocument(),
        title: 'Real map',
      },
      collabEpoch: 3,
    });
    expect(replaced.collabEpoch).toBe(3);

    // A follow-up commit derived from the replaced state keeps the epoch, so
    // it remains forwardable; the ORIGINAL stale state still carries 0.
    const moved = editorReducer(replaced, {
      type: 'UPDATE_POSITIONS',
      positions: { [replaced.document.rootId]: { x: 10, y: 20 } },
    });
    expect(moved.collabEpoch).toBe(3);
    expect(initial.collabEpoch).toBe(0);
  });

  it('REPLACE_DOCUMENT preserves an in-progress edit when the merged node still exists', () => {
    const initial = createInitialState(createEmptyDocument());
    const child = makeNode('local-child', 'Untitled', initial.document.rootId);
    const withChild = editorReducer(initial, {
      type: 'CREATE_NODE',
      parentId: initial.document.rootId,
      node: child,
    });
    expect(withChild.selectedNodeId).toBe(child.id);
    expect(withChild.editingNodeId).toBe(child.id);

    const remoteSnapshot = {
      ...withChild.document,
      title: 'Renamed remotely',
    };
    const replaced = editorReducer(withChild, {
      type: 'REPLACE_DOCUMENT',
      document: remoteSnapshot,
      collabEpoch: 4,
    });

    expect(replaced.selectedNodeId).toBe(child.id);
    expect(replaced.editingNodeId).toBe(child.id);
    expect(replaced.collabEpoch).toBe(4);
  });

  it('the guarded forward never lets a stale default state delete remote nodes', () => {
    const yDoc = seededYDoc();
    const binding = new MindmapBinding(yDoc, createEmptyDocument(), {
      onRemoteDocument: vi.fn(),
    });

    // Simulate the editor effect with the guard: the stale initial state
    // (epoch 0, default document) must NOT be forwarded once the binding has
    // pushed a snapshot (epoch 1).
    const staleState = createInitialState(createEmptyDocument());
    if (staleState.collabEpoch === binding.getEpoch()) {
      binding.applyLocalDocument(staleState.document);
    }

    const nodes = getYNodes(yDoc);
    expect(nodes.size).toBe(2);
    expect(getYMeta(yDoc).get(META_TITLE)).toBe('Real map');
    binding.destroy();
  });
});

describe('empty-content write guards (the reopen clobber)', () => {
  it('seedMindmapYDoc refuses empty content (no default "Untitled map" write)', async () => {
    const { seedMindmapYDoc } = await import('../src/collab/seed');
    const yDoc = new Y.Doc();
    seedMindmapYDoc(yDoc, '');
    seedMindmapYDoc(yDoc, '   \n');
    expect(getYNodes(yDoc).size).toBe(0);
    expect(getYMeta(yDoc).get(META_TITLE)).toBeUndefined();
  });

  it('codec.applyFromFile refuses to wipe a populated doc with empty source', async () => {
    const { mindmapCodec } = await import('../src/collab/codec');
    const yDoc = seededYDoc();
    mindmapCodec.applyFromFile!(yDoc, '');
    expect(getYNodes(yDoc).size).toBe(2);
    expect(getYMeta(yDoc).get(META_TITLE)).toBe('Real map');
  });

  it('UNDO cannot resurrect a pre-snapshot document (stacks cleared on REPLACE_DOCUMENT)', async () => {
    const { editorReducer, createInitialState, createEmptyDocument } = await import('../src/model');
    const initial = createInitialState(createEmptyDocument());
    const replaced = editorReducer(initial, {
      type: 'REPLACE_DOCUMENT',
      document: { ...createEmptyDocument(), title: 'Real map' },
      collabEpoch: 1,
    });
    expect(replaced.undoStack).toHaveLength(0);
    const undone = editorReducer(replaced, { type: 'UNDO' });
    // Nothing to undo into -- the stale default document is unreachable.
    expect(undone.document.title).toBe('Real map');
  });
});

describe('LOAD_DOCUMENT lineage reset', () => {
  it('a file-loaded document is never forwardable (collabEpoch reset to 0)', async () => {
    const { editorReducer, createInitialState, createEmptyDocument } = await import('../src/model');
    const initial = createInitialState(createEmptyDocument());
    const replaced = editorReducer(initial, {
      type: 'REPLACE_DOCUMENT',
      document: { ...createEmptyDocument(), title: 'Real map' },
      collabEpoch: 2,
    });
    expect(replaced.collabEpoch).toBe(2);
    // The lifecycle load (parse of '' or a stale file) must drop the epoch so
    // the forwarding effect can never diff it against the collab baseline.
    const loaded = editorReducer(replaced, {
      type: 'LOAD_DOCUMENT',
      document: createEmptyDocument(),
    });
    expect(loaded.collabEpoch).toBe(0);
  });
});
