// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { estimateNodeHeight, estimateNodeWidth } from '../src/model';
import { createFrameRefitter } from '../src/frameRefit';
import type { MindmapNode } from '../src/types';

/**
 * NIM-7526: the width estimate becomes the node's fixed style.width and the
 * label ellipsizes inside it, so the estimate must leave the label its text
 * width after the chrome styles.css draws around it.
 *
 * Chrome, from styles.css: root padding 22px and border 2px each side; other
 * nodes 14px and 1.5px. Status icon 16px plus the 6px flex gap. Collapse
 * button: 6px gap, 2px padding each side, 10px text of about 6px per glyph.
 */
function makeNode(text: string, overrides: Partial<MindmapNode> = {}): MindmapNode {
  return {
    id: 'n',
    text,
    note: '',
    parentId: null,
    childIds: [],
    position: { x: 0, y: 0 },
    tags: [],
    status: 'none',
    color: 'default',
    link: '',
    pinned: false,
    ...overrides,
  };
}

function textRoom(node: MindmapNode, isRoot: boolean): number {
  const chrome = isRoot ? 2 * (22 + 2) : 2 * (14 + 1.5);
  const status = node.status === 'none' ? 0 : 16 + 6;
  const childCount = node.childIds.length;
  const collapse = childCount === 0 ? 0 : 6 + 4 + (1 + String(childCount).length) * 6;
  return estimateNodeWidth(node, isRoot) - chrome - status - collapse;
}

describe('node width estimate (NIM-7526)', () => {
  it('leaves the root label "Retry launch" its full text width beside the collapse button and status icon', () => {
    // "Retry launch" in the root's 15px semibold system font is about 88px wide.
    const withChildren = makeNode('Retry launch', { childIds: ['a', 'b', 'c'] });
    expect(textRoom(withChildren, true)).toBeGreaterThanOrEqual(88);

    const withStatus = makeNode('Retry launch', { childIds: ['a', 'b', 'c'], status: 'in-progress' });
    expect(textRoom(withStatus, true)).toBeGreaterThanOrEqual(88);
  });

  it('sizes a collapsed branch for its "+N" button so collapsing never truncates the label', () => {
    const node = makeNode('Launch', { childIds: Array.from({ length: 12 }, (_, i) => `c${i}`), status: 'todo' });
    // "Launch" in 13px semibold is about 45px wide.
    expect(textRoom(node, false)).toBeGreaterThanOrEqual(45);
  });

  it('gives the root its taller box: 12px padding, a 15px line, and a 2px border', () => {
    const root = makeNode('Retry launch');
    // 2 * 12 padding + 15px * 1.4 line height + 2 * 2 border
    expect(estimateNodeHeight(root, true)).toBeGreaterThanOrEqual(24 + 21 + 4);
    expect(estimateNodeHeight(root, true)).toBeGreaterThan(estimateNodeHeight(root, false));
  });
});

describe('embedded frame refit (NIM-7526)', () => {
  it('refits when the frame size changes after the first size, and not for the first size or repeats', () => {
    let fits = 0;
    const observe = createFrameRefitter(() => { fits += 1; });
    observe({ width: 898, height: 418 });
    expect(fits).toBe(0);
    observe({ width: 898.2, height: 418 });
    expect(fits).toBe(0);
    observe({ width: 898, height: 460 });
    expect(fits).toBe(1);
    observe({ width: 600, height: 460 });
    expect(fits).toBe(2);
  });

  it('ignores a zero-sized frame and refits once it gets a real size', () => {
    let fits = 0;
    const observe = createFrameRefitter(() => { fits += 1; });
    observe({ width: 0, height: 0 });
    expect(fits).toBe(0);
    observe({ width: 898, height: 418 });
    expect(fits).toBe(1);
    observe({ width: 0, height: 418 });
    observe({ width: 898, height: 418 });
    expect(fits).toBe(1);
  });
});
