import type { MindmapNode } from './types';

export interface MindmapSelectionContextItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  groupLabel: string;
  data: {
    nodeId: string;
    text: string;
    path: string[];
    directChildCount: number;
    note?: string;
    tags: string[];
    status: MindmapNode['status'];
    color: MindmapNode['color'];
    link?: string;
    position: { x: number; y: number };
  };
  includeData: true;
}

const TEXT_LIMIT = 180;
const NOTE_LIMIT = 900;
const PATH_LIMIT = 32;
const TAG_LIMIT = 16;

function boundedText(value: unknown, limit: number): string {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 14))}… [truncated]`;
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function buildMindmapSelectionContextItem(
  node: MindmapNode,
  nodes: Record<string, MindmapNode>,
): MindmapSelectionContextItem {
  const path: string[] = [];
  const visited = new Set<string>();
  let current: MindmapNode | undefined = node;
  while (current && path.length < PATH_LIMIT && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(boundedText(current.text || 'Untitled', TEXT_LIMIT));
    current = current.parentId ? nodes[current.parentId] : undefined;
  }
  if (current) path.unshift('[earlier ancestors omitted]');

  const text = boundedText(node.text || 'Untitled', TEXT_LIMIT);
  const nodeId = boundedText(node.id, 240);
  const note = boundedText(node.note, NOTE_LIMIT);
  const link = boundedText(node.link, TEXT_LIMIT);
  const tags = node.tags.slice(0, TAG_LIMIT).map((tag) => boundedText(tag, 80));
  const omittedTags = Math.max(0, node.tags.length - tags.length);
  const data: MindmapSelectionContextItem['data'] = {
    nodeId,
    text,
    path,
    directChildCount: node.childIds.length,
    tags,
    status: node.status,
    color: node.color,
    position: { x: finite(node.position.x), y: finite(node.position.y) },
    ...(note ? { note } : {}),
    ...(link ? { link } : {}),
  };
  const description = [
    `Selected mindmap node "${text}" (id ${nodeId}).`,
    `Path: ${path.join(' > ')}.`,
    `It has ${node.childIds.length} direct ${node.childIds.length === 1 ? 'child' : 'children'}.`,
    `Status: ${node.status}; color: ${node.color}; position: (${data.position.x}, ${data.position.y}).`,
    tags.length ? `Tags: ${tags.join(', ')}${omittedTags ? `; ${omittedTags} omitted` : ''}.` : '',
    note ? `Note: ${note}` : '',
    link ? `Link: ${link}` : '',
    'Use mindmap.get_context for the branch and mindmap.apply_operations for atomic edits.',
  ].filter(Boolean).join(' ');

  return {
    id: `node:${boundedText(node.id, 460)}`,
    label: text,
    description,
    icon: 'account_tree',
    groupLabel: 'mindmap nodes',
    data,
    includeData: true,
  };
}
