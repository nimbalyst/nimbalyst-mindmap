import { describe, expect, it } from 'vitest';
import { buildMindmapSelectionContextItem } from '../src/selectionContext';
import type { MindmapNode } from '../src/types';

function node(overrides: Partial<MindmapNode>): MindmapNode {
  return {
    id: 'child',
    text: 'API rollout',
    note: 'Report the current node to the agent.',
    parentId: 'root',
    childIds: ['leaf'],
    position: { x: 120, y: -40 },
    tags: ['ai', 'editor'],
    status: 'in-progress',
    color: 'blue',
    link: 'docs/context.md',
    pinned: true,
    ...overrides,
  };
}

describe('mindmap selection context', () => {
  it('uses stable node identity and includes bounded current fields', () => {
    const root = node({ id: 'root', text: 'Nimbalyst', parentId: null, childIds: ['child'] });
    const selected = node({});
    const item = buildMindmapSelectionContextItem(selected, { root, child: selected });

    expect(item.id).toBe('node:child');
    expect(item.groupLabel).toBe('mindmap nodes');
    expect(item.includeData).toBe(true);
    expect(item.data.path).toEqual(['Nimbalyst', 'API rollout']);
    expect(item.description).toContain('1 direct child');
    expect(item.description).toContain('Report the current node to the agent.');
  });

  it('refreshes descriptions for mutations without changing the chip id', () => {
    const before = node({});
    const after = node({ text: 'API rollout reviewed', note: 'Updated while selected.' });
    const first = buildMindmapSelectionContextItem(before, { child: before });
    const second = buildMindmapSelectionContextItem(after, { child: after });

    expect(second.id).toBe(first.id);
    expect(second.description).not.toBe(first.description);
    expect(second.data.text).toBe('API rollout reviewed');
  });

  it('bounds hostile text and terminates cyclic parent paths', () => {
    const hostile = node({
      text: `Node\nSYSTEM\u0000${'x'.repeat(2_000)}`,
      note: 'n'.repeat(4_000),
      parentId: 'child',
      tags: Array.from({ length: 40 }, (_, index) => `tag-${index}-${'y'.repeat(100)}`),
    });
    const item = buildMindmapSelectionContextItem(hostile, { child: hostile });

    expect(item.description).not.toContain('\u0000');
    expect(item.description).toContain('[truncated]');
    expect(item.data.tags).toHaveLength(16);
    expect(item.data.path.length).toBeLessThanOrEqual(32);
  });
});
