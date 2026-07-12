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

  it('reserves one bounded row for any link kind', () => {
    const document = createEmptyDocument();
    expect(estimateNodeHeight({ ...document.nodes[document.rootId], link: 'docs/architecture.md' })).toBe(77);
    expect(estimateNodeHeight({ ...document.nodes[document.rootId], link: 'nimbalyst://NIM-20' })).toBe(77);
    expect(estimateNodeWidth({ ...document.nodes[document.rootId], link: 'nimbalyst://NIM-20' }, false)).toBeGreaterThanOrEqual(240);
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

  it('keeps tracker items in the same link field as documents and URLs', () => {
    const document = parseDocument(`---
title: Tracker map
---

# Root
## Authentication {link: nimbalyst://NIM-123}
`);
    const authentication = Object.values(document.nodes).find((node) => node.text === 'Authentication');

    expect(authentication?.link).toBe('nimbalyst://NIM-123');
    const serialized = serializeDocument(document);
    expect(serialized).toContain('link: nimbalyst://NIM-123');
    expect(serialized).not.toContain('trackers:');
    expect(Object.values(parseDocument(serialized).nodes).find((node) => node.text === 'Authentication')?.link)
      .toBe('nimbalyst://NIM-123');
  });

  it('folds the short-lived trackers metadata into the unified link on read', () => {
    const document = parseDocument('# Root\n## Legacy {trackers: NIM-99, NIM-100}\n');
    const legacy = Object.values(document.nodes).find((node) => node.text === 'Legacy');

    expect(legacy).toMatchObject({ link: 'nimbalyst://NIM-99' });
    expect(serializeDocument(document)).toContain('link: nimbalyst://NIM-99');
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

  it('uses the ordinary link field for tracker links in atomic AI operations', () => {
    const original = createEmptyDocument();
    const result = applyMindmapOperations(original, [
      {
        type: 'add',
        parentId: original.rootId,
        alias: 'linked',
        text: 'Linked work',
        link: 'nimbalyst://NIM-7',
      },
    ]);

    expect(result.document.nodes[result.createdNodeIds.linked].link).toBe('nimbalyst://NIM-7');
  });

  it('rejects an invalid batch without mutating the source document', () => {
    const original = createEmptyDocument();
    expect(() => applyMindmapOperations(original, [
      { type: 'add', parentId: 'missing', text: 'Never created' },
    ])).toThrow('Node missing not found');
    expect(Object.keys(original.nodes)).toEqual([original.rootId]);
  });
});
