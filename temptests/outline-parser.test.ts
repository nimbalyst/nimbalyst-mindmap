import { describe, it, expect } from 'vitest';

// We need to test the outline parsing logic. Since it's in aiTools.ts which has
// SDK imports, let's extract and test the core parsing separately.
// For now, inline the parser logic here.

import type { MindmapNode } from '../src/types';

function generateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function outlineToNodes(outline: string) {
  const lines = outline.split('\n').filter((l) => l.trim());
  const rootId = 'node_root';
  const nodes: Record<string, MindmapNode> = {};

  interface StackItem { id: string; depth: number; }
  const stack: StackItem[] = [];

  for (const line of lines) {
    const match = line.match(/^(\s*)[-*]\s+(.*)/);
    if (!match) continue;

    const indent = match[1].length;
    const depth = Math.floor(indent / 2);
    let rawText = match[2].trim();

    let note = '';
    let tags: string[] = [];
    let status: MindmapNode['status'] = 'none';
    let color: MindmapNode['color'] = 'default';

    const metaMatch = rawText.match(/\[([^\]]+)\]\s*$/);
    if (metaMatch) {
      rawText = rawText.slice(0, metaMatch.index).trim();
      const parts = metaMatch[1].split('|').map((s) => s.trim());
      for (const part of parts) {
        if (part.startsWith('note:')) {
          note = part.slice(5).trim();
        } else if (part.startsWith('tags:')) {
          tags = part.slice(5).split(',').map((t) => t.trim()).filter(Boolean);
        } else if (['idea', 'question', 'todo', 'in-progress', 'done'].includes(part)) {
          status = part as MindmapNode['status'];
        } else if (['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'].includes(part)) {
          color = part as MindmapNode['color'];
        }
      }
    }

    const isRoot = stack.length === 0;
    const id = isRoot ? rootId : generateId();

    let parentId: string | null = null;
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    if (stack.length > 0) {
      parentId = stack[stack.length - 1].id;
    }

    nodes[id] = {
      id,
      text: rawText,
      note,
      parentId,
      childIds: [],
      position: { x: 0, y: 0 },
      tags,
      status,
      color,
    };

    if (parentId && nodes[parentId]) {
      nodes[parentId].childIds.push(id);
    }

    stack.push({ id, depth });
  }

  return { nodes, rootId };
}

describe('outline parser', () => {
  it('parses a simple outline', () => {
    const outline = `- Root
  - Child 1
  - Child 2
    - Grandchild`;

    const { nodes, rootId } = outlineToNodes(outline);
    expect(nodes[rootId].text).toBe('Root');
    expect(nodes[rootId].childIds).toHaveLength(2);

    const child1 = nodes[nodes[rootId].childIds[0]];
    expect(child1.text).toBe('Child 1');
    expect(child1.parentId).toBe(rootId);
    expect(child1.childIds).toHaveLength(0);

    const child2 = nodes[nodes[rootId].childIds[1]];
    expect(child2.text).toBe('Child 2');
    expect(child2.childIds).toHaveLength(1);

    const grandchild = nodes[child2.childIds[0]];
    expect(grandchild.text).toBe('Grandchild');
    expect(grandchild.parentId).toBe(child2.id);
  });

  it('parses metadata brackets', () => {
    const outline = `- Root
  - Task [todo | green]
  - Note node [note: important detail | tags: a, b]`;

    const { nodes, rootId } = outlineToNodes(outline);
    const task = nodes[nodes[rootId].childIds[0]];
    expect(task.text).toBe('Task');
    expect(task.status).toBe('todo');
    expect(task.color).toBe('green');

    const noteNode = nodes[nodes[rootId].childIds[1]];
    expect(noteNode.text).toBe('Note node');
    expect(noteNode.note).toBe('important detail');
    expect(noteNode.tags).toEqual(['a', 'b']);
  });

  it('handles deep nesting', () => {
    const outline = `- A
  - B
    - C
      - D
        - E`;

    const { nodes, rootId } = outlineToNodes(outline);
    let current = nodes[rootId];
    const texts = [current.text];
    while (current.childIds.length > 0) {
      current = nodes[current.childIds[0]];
      texts.push(current.text);
    }
    expect(texts).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('handles siblings at various levels', () => {
    const outline = `- Root
  - Branch 1
    - Leaf 1a
    - Leaf 1b
  - Branch 2
    - Leaf 2a`;

    const { nodes, rootId } = outlineToNodes(outline);
    expect(nodes[rootId].childIds).toHaveLength(2);

    const b1 = nodes[nodes[rootId].childIds[0]];
    expect(b1.text).toBe('Branch 1');
    expect(b1.childIds).toHaveLength(2);

    const b2 = nodes[nodes[rootId].childIds[1]];
    expect(b2.text).toBe('Branch 2');
    expect(b2.childIds).toHaveLength(1);
  });

  it('handles typical AI output with asterisks', () => {
    const outline = `* AI Types
  * Machine Learning
    * Supervised Learning
    * Unsupervised Learning
  * Deep Learning
    * Transformers
    * Diffusion Models`;

    const { nodes, rootId } = outlineToNodes(outline);
    expect(nodes[rootId].text).toBe('AI Types');
    expect(nodes[rootId].childIds).toHaveLength(2);
  });
});
