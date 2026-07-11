import { describe, expect, it } from 'vitest';
import {
  applyMindmapOperations,
  createEmptyDocument,
  estimateNodeHeight,
  estimateNodeWidth,
  parseDocument,
  serializeDocument,
} from '../src/model';

describe('roadmap model capabilities', () => {
  it('accounts for compact note previews in node geometry', () => {
    const document = createEmptyDocument();
    const root = {
      ...document.nodes[document.rootId],
      note: 'A long supporting description that should influence width without creating a tall card.',
    };
    expect(estimateNodeWidth(root, true)).toBe(300);
    expect(estimateNodeHeight(root)).toBe(70);
  });

  it('round-trips links and pinned manual positions through readable markdown', () => {
    const document = parseDocument(`---
title: Linked map
---

# Root
## Reference {link: docs/architecture.md, pinned: true, x: 321, y: -45}
> Supporting context.
`);
    const reference = Object.values(document.nodes).find((node) => node.text === 'Reference');

    expect(reference).toMatchObject({
      link: 'docs/architecture.md',
      pinned: true,
      position: { x: 321, y: -45 },
      note: 'Supporting context.',
    });

    const reparsed = parseDocument(serializeDocument(document));
    expect(Object.values(reparsed.nodes).find((node) => node.text === 'Reference')).toMatchObject({
      link: 'docs/architecture.md',
      pinned: true,
      position: { x: 321, y: -45 },
    });
  });

  it('supports aliases within an atomic AI batch', () => {
    const original = createEmptyDocument();
    const result = applyMindmapOperations(original, [
      { type: 'add', parentId: original.rootId, alias: 'research', text: 'Research', color: 'blue' },
      { type: 'add', parentId: 'research', alias: 'interviews', text: 'Interviews', status: 'todo' },
      { type: 'update', nodeId: 'interviews', note: 'Talk with five customers.' },
    ]);

    const researchId = result.createdNodeIds.research;
    const interviewsId = result.createdNodeIds.interviews;
    expect(result.document.nodes[researchId].childIds).toEqual([interviewsId]);
    expect(result.document.nodes[interviewsId]).toMatchObject({
      parentId: researchId,
      status: 'todo',
      note: 'Talk with five customers.',
    });
    expect(original.nodes[original.rootId].childIds).toEqual([]);
  });

  it('rejects an invalid batch without mutating the source document', () => {
    const original = createEmptyDocument();
    expect(() => applyMindmapOperations(original, [
      { type: 'add', parentId: 'missing', text: 'Never created' },
    ])).toThrow('Node missing not found');
    expect(Object.keys(original.nodes)).toEqual([original.rootId]);
  });
});
