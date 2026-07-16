import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { existsSync, readFileSync } from 'node:fs';

vi.mock('@nimbalyst/extension-sdk', () => ({
  COLLAB_INIT_ORIGIN: Symbol('nimbalyst:collab-init'),
}));

import { mindmapCodec } from '../src/collab/codec';
import { getYNodes, getYMeta, META_TITLE } from '../src/collab/yShape';
import { parseDocument, serializeDocument } from '../src/model';
import type { MindmapDocument } from '../src/types';

const demoPath = '/Users/ghinkle/sources/stravu-editor/examples/demo.mindmap';
const fallbackDemo = `---
title: Product Launch Plan
layout: right
---

# Product Launch Plan {tags: launch, planning}

## Design {color: purple}

### User Research {status: done}
> Interviews, surveys, and usability testing
- Interview Synthesis {tags: research, insights}
  - Follow-up Sessions {status: todo}

## Engineering {color: blue}

### QA & Testing {status: todo}
> Unit tests, integration tests, E2E
`;
// Exercise the shared real-world fixture when the monorepo checkout is beside
// this repo, while keeping the extension's standalone CI run self-contained.
const demo = existsSync(demoPath) ? readFileSync(demoPath, 'utf8') : fallbackDemo;

function semanticDocument(doc: MindmapDocument): unknown {
  const visit = (nodeId: string): unknown => {
    const node = doc.nodes[nodeId];
    return {
      text: node.text,
      note: node.note,
      position: node.position,
      tags: node.tags,
      status: node.status,
      color: node.color,
      link: node.link,
      pinned: node.pinned,
      children: node.childIds.map(visit),
    };
  };

  return {
    version: doc.version,
    title: doc.title,
    layout: doc.metadata.layout,
    canvas: doc.metadata.canvas,
    root: visit(doc.rootId),
  };
}

describe('mindmapCodec against the real demo.mindmap', () => {
  it('preserves document semantics across parse, serialize, and parse', () => {
    const parsed = parseDocument(demo);
    const serialized = serializeDocument(parsed);
    const reparsed = parseDocument(serialized);

    expect(semanticDocument(reparsed)).toEqual(semanticDocument(parsed));
    expect(serializeDocument(reparsed)).toBe(serialized);
  });

  it('keeps seed and export stable across fresh CRDT documents', () => {
    const firstYDoc = new Y.Doc();
    mindmapCodec.seedFromFile(firstYDoc, demo);
    const firstExport = mindmapCodec.exportToFile(firstYDoc);

    const secondYDoc = new Y.Doc();
    mindmapCodec.seedFromFile(secondYDoc, firstExport);
    const secondExport = mindmapCodec.exportToFile(secondYDoc);

    expect(secondExport).toBe(firstExport);
  });

  it('seedFromFile produces the real content', () => {
    const yDoc = new Y.Doc();
    mindmapCodec.seedFromFile(yDoc, demo);
    expect(getYNodes(yDoc).size).toBeGreaterThan(5);
    expect(getYMeta(yDoc).get(META_TITLE)).toBe('Product Launch Plan');
  });

  it('applyFromFile on a populated doc replaces with the real content (the re-upload path)', () => {
    const yDoc = new Y.Doc();
    mindmapCodec.seedFromFile(yDoc, demo);
    // Now re-apply, as the live re-upload does on the open editor's doc.
    mindmapCodec.applyFromFile!(yDoc, demo);
    const nodes = getYNodes(yDoc);
    expect(nodes.size).toBeGreaterThan(5);
    expect(getYMeta(yDoc).get(META_TITLE)).toBe('Product Launch Plan');
  });

  it('exportToFile round-trips', () => {
    const yDoc = new Y.Doc();
    mindmapCodec.seedFromFile(yDoc, demo);
    const out = String(mindmapCodec.exportToFile(yDoc));
    expect(out).toContain('Product Launch Plan');
    expect(out).toContain('User Research');
  });
});
