// Graph model: parsing, serialization, mutations, layout

import type { MindmapDocument, MindmapNode, NodeStatus, NodeColor, EditorState, EditorAction, MindmapOperation, LayoutMode } from './types';

// --- ID generation ---

let idCounter = 0;
export function generateNodeId(): string {
  return `node_${Date.now()}_${idCounter++}`;
}

// --- Empty document ---

export function createEmptyDocument(): MindmapDocument {
  const rootId = 'node_root';
  const now = new Date().toISOString();
  return {
    version: 1,
    title: 'Untitled map',
    rootId,
    nodes: {
      [rootId]: {
        id: rootId,
        text: 'Central idea',
        note: '',
        parentId: null,
        childIds: [],
        position: { x: 0, y: 0 },
        tags: [],
        status: 'none',
        color: 'default',
        link: '',
        pinned: false,
      },
    },
    metadata: {
      layout: 'balanced',
      createdAt: now,
      updatedAt: now,
      canvas: { viewport: { x: 0, y: 0, zoom: 1 } },
    },
  };
}

// --- Metadata parsing helpers ---

const VALID_STATUSES: NodeStatus[] = ['idea', 'question', 'todo', 'in-progress', 'done'];
const VALID_COLORS: NodeColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

interface ParsedMeta {
  text: string;
  color: NodeColor;
  status: NodeStatus;
  tags: string[];
  link: string;
  pinned: boolean;
  x?: number;
  y?: number;
}

/** Parse trailing {key: value, ...} metadata from a line, returning cleaned text + metadata */
export function parseInlineMetadata(raw: string): ParsedMeta {
  const result: ParsedMeta = { text: raw, color: 'default', status: 'none', tags: [], link: '', pinned: false };
  const metaMatch = raw.match(/\{([^}]+)\}\s*$/);
  if (!metaMatch) return result;

  result.text = raw.slice(0, metaMatch.index).trim();
  const metaStr = metaMatch[1];

  // Split on "key:" boundaries to handle commas inside tag values
  // e.g. "color: blue, status: todo, tags: frontend, urgent"
  // -> ["color: blue", "status: todo", "tags: frontend, urgent"]
  const keyValuePairs: { key: string; val: string }[] = [];
  const keyPattern = /\b(color|status|tags|link|pinned|x|y)\s*:/g;
  let match: RegExpExecArray | null;
  const starts: { key: string; start: number }[] = [];
  while ((match = keyPattern.exec(metaStr)) !== null) {
    starts.push({ key: match[1], start: match.index + match[0].length });
  }
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length
      ? metaStr.lastIndexOf(',', starts[i + 1].start)
      : metaStr.length;
    keyValuePairs.push({
      key: starts[i].key,
      val: metaStr.slice(starts[i].start, end).trim(),
    });
  }

  for (const { key, val } of keyValuePairs) {
    switch (key) {
      case 'color':
        if (VALID_COLORS.includes(val as NodeColor)) result.color = val as NodeColor;
        break;
      case 'status':
        if (VALID_STATUSES.includes(val as NodeStatus)) result.status = val as NodeStatus;
        break;
      case 'tags':
        result.tags = val.split(',').map((t) => t.trim()).filter(Boolean);
        break;
      case 'link':
        result.link = val;
        break;
      case 'pinned':
        result.pinned = val === 'true';
        break;
      case 'x': {
        const x = Number(val);
        if (Number.isFinite(x)) result.x = x;
        break;
      }
      case 'y': {
        const y = Number(val);
        if (Number.isFinite(y)) result.y = y;
        break;
      }
    }
  }
  return result;
}

/** Format metadata as inline {key: value} string, or empty string if no metadata */
function formatInlineMetadata(node: MindmapNode): string {
  const parts: string[] = [];
  if (node.color !== 'default') parts.push(`color: ${node.color}`);
  if (node.status !== 'none') parts.push(`status: ${node.status}`);
  if (node.tags.length > 0) parts.push(`tags: ${node.tags.join(', ')}`);
  if (node.link) parts.push(`link: ${node.link}`);
  if (node.pinned) {
    parts.push('pinned: true');
    parts.push(`x: ${Math.round(node.position.x)}`);
    parts.push(`y: ${Math.round(node.position.y)}`);
  }
  return parts.length > 0 ? ` {${parts.join(', ')}}` : '';
}

// --- Markdown Parser ---

export function parseDocument(raw: string): MindmapDocument {
  if (!raw || !raw.trim()) {
    return createEmptyDocument();
  }

  const lines = raw.split('\n');
  let lineIdx = 0;

  // Parse optional YAML frontmatter
  let title = '';
  let layout: LayoutMode = 'balanced';
  if (lines[0]?.trim() === '---') {
    lineIdx = 1;
    while (lineIdx < lines.length && lines[lineIdx].trim() !== '---') {
      const fmMatch = lines[lineIdx].match(/^(\w+):\s*(.*)/);
      if (fmMatch && fmMatch[1] === 'title') {
        title = fmMatch[2].trim();
      } else if (fmMatch && fmMatch[1] === 'layout' && (fmMatch[2].trim() === 'balanced' || fmMatch[2].trim() === 'right')) {
        layout = fmMatch[2].trim() as LayoutMode;
      }
      lineIdx++;
    }
    lineIdx++; // skip closing ---
  }

  const rootId = 'node_root';
  const nodes: Record<string, MindmapNode> = {};

  // Stack tracks the current path in the tree: { id, depth }
  // Depth: root=0, ##=1, ###=2, list items start at heading depth + 1
  interface StackItem { id: string; depth: number; }
  const stack: StackItem[] = [];

  // Helper to create a node and wire it to its parent
  function addNode(text: string, depth: number, meta: ParsedMeta): string {
    const isRoot = stack.length === 0;
    const id = isRoot ? rootId : generateNodeId();

    // Pop stack to find parent at depth - 1
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;

    nodes[id] = {
      id,
      text,
      note: '',
      parentId,
      childIds: [],
      position: { x: meta.x ?? 0, y: meta.y ?? 0 },
      tags: meta.tags,
      status: meta.status,
      color: meta.color,
      link: meta.link,
      pinned: meta.pinned,
    };

    if (parentId && nodes[parentId]) {
      nodes[parentId].childIds.push(id);
    }

    stack.push({ id, depth });
    return id;
  }

  // Track the current "heading base depth" for list items under a heading
  // e.g., under ##, list items at indent 0 are depth 2; under ###, depth 3
  let listBaseDepth = 1; // default: lists under root are depth 1

  while (lineIdx < lines.length) {
    const line = lines[lineIdx];
    lineIdx++;

    // Skip blank lines
    if (!line.trim()) continue;

    // Blockquote note: attach to the last node on the stack
    if (line.match(/^\s*>/)) {
      if (stack.length > 0) {
        const lastNode = nodes[stack[stack.length - 1].id];
        if (lastNode) {
          const noteText = line.replace(/^\s*>\s?/, '');
          lastNode.note = lastNode.note ? lastNode.note + '\n' + noteText : noteText;
        }
      }
      continue;
    }

    // Heading: # (root, depth 0), ## (depth 1), ### (depth 2)
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length; // 1, 2, or 3
      const depth = level - 1; // # = 0, ## = 1, ### = 2
      const meta = parseInlineMetadata(headingMatch[2].trim());
      addNode(meta.text, depth, meta);
      listBaseDepth = depth + 1;
      continue;
    }

    // List item: - or * with indentation
    const listMatch = line.match(/^(\s*)[-*]\s+(.*)/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const listDepth = listBaseDepth + Math.floor(indent / 2);
      const meta = parseInlineMetadata(listMatch[2].trim());
      addNode(meta.text, listDepth, meta);
      continue;
    }
  }

  // If no root was created, make a default
  if (!nodes[rootId]) {
    return createEmptyDocument();
  }

  if (!title) {
    title = nodes[rootId].text;
  }

  return {
    version: 1,
    title,
    rootId,
    nodes,
    metadata: {
      layout,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      canvas: { viewport: { x: 0, y: 0, zoom: 1 } },
    },
  };
}

// --- Markdown Serializer ---

export function serializeDocument(doc: MindmapDocument): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: ${doc.title}`);
  lines.push(`layout: ${doc.metadata.layout}`);
  lines.push('---');
  lines.push('');

  function serializeNode(nodeId: string, depth: number): void {
    const node = doc.nodes[nodeId];
    if (!node) return;

    const meta = formatInlineMetadata(node);

    if (depth <= 2) {
      // Use headings for depths 0-2: #, ##, ###
      const prefix = '#'.repeat(depth + 1);
      lines.push(`${prefix} ${node.text}${meta}`);
    } else {
      // Use list items for depth 3+
      const indent = '  '.repeat(depth - 3); // depth 3 = no indent, depth 4 = 2 spaces, etc.
      lines.push(`${indent}- ${node.text}${meta}`);
    }

    // Note as blockquote
    if (node.note) {
      const noteLines = node.note.split('\n');
      for (const noteLine of noteLines) {
        if (depth <= 2) {
          lines.push(`> ${noteLine}`);
        } else {
          const indent = '  '.repeat(depth - 3);
          lines.push(`${indent}  > ${noteLine}`);
        }
      }
    }

    // Blank line after headings for readability
    if (depth <= 2 && node.childIds.length > 0) {
      // Only add blank line after heading if next child is also a heading
      const firstChild = doc.nodes[node.childIds[0]];
      if (firstChild && depth + 1 <= 2) {
        lines.push('');
      }
    }

    for (const childId of node.childIds) {
      serializeNode(childId, depth + 1);
    }

    // Blank line after top-level sections
    if (depth === 1) {
      lines.push('');
    }
  }

  serializeNode(doc.rootId, 0);

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// --- Layout algorithm (balanced mindmap layout) ---

interface LayoutResult {
  positions: Record<string, { x: number; y: number }>;
}

const DEFAULT_NODE_WIDTH = 160;
const NODE_HEIGHT = 48;
const TAG_ROW_HEIGHT = 20;
const H_SPACING = 70;
const V_SPACING = 20;
const MAX_NODE_WIDTH = 300;
const CHAR_WIDTH = 7.5; // approximate px per character at 13px font
const NODE_H_PADDING = 28; // 14px padding each side
const STATUS_ICON_WIDTH = 22; // icon + gap
const COLLAPSE_BTN_WIDTH = 20;

/** Estimate the rendered width of a node based on its text content */
export function estimateNodeWidth(node: MindmapNode, isRoot: boolean): number {
  const text = node.text || 'Untitled';
  let width = NODE_H_PADDING + text.length * CHAR_WIDTH;
  if (node.status !== 'none') width += STATUS_ICON_WIDTH;
  if (node.childIds.length > 0) width += COLLAPSE_BTN_WIDTH;
  if (isRoot) {
    // Root has larger padding (22px each side) and larger font (~8.5px/char)
    width = 44 + text.length * 8.5;
  }
  if (node.note) {
    const notePreview = node.note.replace(/\s+/g, ' ').trim();
    const notePadding = isRoot ? 44 : NODE_H_PADDING;
    width = Math.max(width, notePadding + Math.min(notePreview.length, 42) * 6.2);
  }
  return Math.max(80, Math.min(MAX_NODE_WIDTH, Math.round(width)));
}

/** Estimate the rendered height of a node (accounts for tag rows) */
export function estimateNodeHeight(node: MindmapNode): number {
  const noteHeight = node.note ? 22 : 0;
  return (node.tags.length > 0 ? NODE_HEIGHT + TAG_ROW_HEIGHT : NODE_HEIGHT) + noteHeight;
}

interface SubtreeSize {
  width: number;
  height: number;
}

function getSubtreeSize(
  nodeId: string,
  nodes: Record<string, MindmapNode>,
  collapsed: Set<string>,
  rootId: string
): SubtreeSize {
  const node = nodes[nodeId];
  if (!node) return { width: DEFAULT_NODE_WIDTH, height: NODE_HEIGHT };

  const nodeWidth = estimateNodeWidth(node, nodeId === rootId);
  const nodeHeight = estimateNodeHeight(node);

  if (collapsed.has(nodeId) || node.childIds.length === 0) {
    return { width: nodeWidth, height: nodeHeight };
  }

  let totalChildHeight = 0;
  let maxChildWidth = 0;
  for (const childId of node.childIds) {
    const childSize = getSubtreeSize(childId, nodes, collapsed, rootId);
    totalChildHeight += childSize.height;
    maxChildWidth = Math.max(maxChildWidth, childSize.width);
  }
  totalChildHeight += (node.childIds.length - 1) * V_SPACING;

  return {
    width: nodeWidth + H_SPACING + maxChildWidth,
    height: Math.max(nodeHeight, totalChildHeight),
  };
}

function layoutSubtree(
  nodeId: string,
  x: number,
  y: number,
  nodes: Record<string, MindmapNode>,
  collapsed: Set<string>,
  positions: Record<string, { x: number; y: number }>,
  direction: 'right' | 'left',
  rootId: string
): void {
  const node = nodes[nodeId];
  if (!node) return;

  const subtreeSize = getSubtreeSize(nodeId, nodes, collapsed, rootId);
  const nodeHeight = estimateNodeHeight(node);
  // Center the node vertically within its subtree
  const nodeY = y + (subtreeSize.height - nodeHeight) / 2;
  positions[nodeId] = { x, y: nodeY };

  if (collapsed.has(nodeId) || node.childIds.length === 0) return;

  const nodeWidth = estimateNodeWidth(node, nodeId === rootId);

  let currentY = y;
  for (const childId of node.childIds) {
    const childNode = nodes[childId];
    const childSize = getSubtreeSize(childId, nodes, collapsed, rootId);
    const childWidth = childNode ? estimateNodeWidth(childNode, false) : DEFAULT_NODE_WIDTH;
    const childX = direction === 'right'
      ? x + nodeWidth + H_SPACING
      : x - H_SPACING - childWidth;
    layoutSubtree(childId, childX, currentY, nodes, collapsed, positions, direction, rootId);
    currentY += childSize.height + V_SPACING;
  }
}

export function computeLayout(
  doc: MindmapDocument,
  collapsed: Set<string>
): LayoutResult {
  const positions: Record<string, { x: number; y: number }> = {};
  const root = doc.nodes[doc.rootId];
  if (!root) return { positions };

  const rootWidth = estimateNodeWidth(root, true);

  if (doc.metadata.layout === 'right') {
    const size = getSubtreeSize(doc.rootId, doc.nodes, collapsed, doc.rootId);
    layoutSubtree(doc.rootId, 0, -size.height / 2, doc.nodes, collapsed, positions, 'right', doc.rootId);
    return { positions };
  }

  // Split children into left and right halves for balanced layout
  const children = root.childIds.filter((id) => doc.nodes[id]);
  const midpoint = Math.ceil(children.length / 2);
  const rightChildren = children.slice(0, midpoint);
  const leftChildren = children.slice(midpoint);

  // Layout right side
  let rightHeight = 0;
  for (const childId of rightChildren) {
    rightHeight += getSubtreeSize(childId, doc.nodes, collapsed, doc.rootId).height + V_SPACING;
  }
  if (rightChildren.length > 0) rightHeight -= V_SPACING;

  let currentY = -rightHeight / 2;
  for (const childId of rightChildren) {
    const size = getSubtreeSize(childId, doc.nodes, collapsed, doc.rootId);
    layoutSubtree(childId, rootWidth + H_SPACING, currentY, doc.nodes, collapsed, positions, 'right', doc.rootId);
    currentY += size.height + V_SPACING;
  }

  // Layout left side
  let leftHeight = 0;
  for (const childId of leftChildren) {
    leftHeight += getSubtreeSize(childId, doc.nodes, collapsed, doc.rootId).height + V_SPACING;
  }
  if (leftChildren.length > 0) leftHeight -= V_SPACING;

  currentY = -leftHeight / 2;
  for (const childId of leftChildren) {
    const size = getSubtreeSize(childId, doc.nodes, collapsed, doc.rootId);
    const childNode = doc.nodes[childId];
    const childWidth = childNode ? estimateNodeWidth(childNode, false) : DEFAULT_NODE_WIDTH;
    layoutSubtree(childId, -(H_SPACING + childWidth), currentY, doc.nodes, collapsed, positions, 'left', doc.rootId);
    currentY += size.height + V_SPACING;
  }

  // Root at center
  const rootHeight = estimateNodeHeight(root);
  positions[doc.rootId] = { x: 0, y: -rootHeight / 2 };

  return { positions };
}

// --- Reducer ---

function pushUndo(state: EditorState): EditorState {
  return {
    ...state,
    undoStack: [...state.undoStack.slice(-49), { ...state.document }],
    redoStack: [],
  };
}

function deleteNodeRecursive(
  nodes: Record<string, MindmapNode>,
  nodeId: string
): Record<string, MindmapNode> {
  const node = nodes[nodeId];
  if (!node) return nodes;

  let result = { ...nodes };
  // Delete children first
  for (const childId of node.childIds) {
    result = deleteNodeRecursive(result, childId);
  }
  // Remove from parent's childIds
  if (node.parentId && result[node.parentId]) {
    result[node.parentId] = {
      ...result[node.parentId],
      childIds: result[node.parentId].childIds.filter((id) => id !== nodeId),
    };
  }
  delete result[nodeId];
  return result;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'LOAD_DOCUMENT':
      return {
        ...state,
        document: action.document,
        selectedNodeId: action.document.rootId,
        editingNodeId: null,
        collapsedNodeIds: new Set(),
        undoStack: [],
        redoStack: [],
        // File-lineage state: never forwardable to a collab doc. Any state
        // loaded from disk predates the room's snapshots by definition, so a
        // current epoch here would let it diff-delete newer shared content.
        collabEpoch: 0,
      };

    case 'SET_SELECTED':
      return { ...state, selectedNodeId: action.nodeId, editingNodeId: null };

    case 'SET_EDITING':
      return { ...state, editingNodeId: action.nodeId };

    case 'TOGGLE_COLLAPSE': {
      const newCollapsed = new Set(state.collapsedNodeIds);
      if (newCollapsed.has(action.nodeId)) {
        newCollapsed.delete(action.nodeId);
      } else {
        newCollapsed.add(action.nodeId);
      }
      return { ...state, collapsedNodeIds: newCollapsed };
    }

    case 'UPDATE_NODE': {
      const prev = pushUndo(state);
      const node = prev.document.nodes[action.nodeId];
      if (!node) return state;
      return {
        ...prev,
        document: {
          ...prev.document,
          nodes: {
            ...prev.document.nodes,
            [action.nodeId]: { ...node, ...action.updates },
          },
        },
      };
    }

    case 'CREATE_NODE': {
      const prev = pushUndo(state);
      const parent = prev.document.nodes[action.parentId];
      if (!parent) return state;
      const newChildIds = [...parent.childIds];
      if (action.index !== undefined) {
        newChildIds.splice(action.index, 0, action.node.id);
      } else {
        newChildIds.push(action.node.id);
      }
      return {
        ...prev,
        document: {
          ...prev.document,
          nodes: {
            ...prev.document.nodes,
            [action.parentId]: { ...parent, childIds: newChildIds },
            [action.node.id]: action.node,
          },
        },
        selectedNodeId: action.node.id,
        editingNodeId: action.node.id,
      };
    }

    case 'DELETE_NODE': {
      if (action.nodeId === state.document.rootId) return state;
      const prev = pushUndo(state);
      const newNodes = deleteNodeRecursive(prev.document.nodes, action.nodeId);
      const deletedNode = prev.document.nodes[action.nodeId];
      return {
        ...prev,
        document: { ...prev.document, nodes: newNodes },
        selectedNodeId: deletedNode?.parentId || state.document.rootId,
        editingNodeId: null,
      };
    }

    case 'MOVE_NODE': {
      if (action.nodeId === state.document.rootId) return state;
      const prev = pushUndo(state);
      const node = prev.document.nodes[action.nodeId];
      if (!node) return state;

      // Check we're not moving to a descendant
      let check: string | null = action.newParentId;
      while (check) {
        if (check === action.nodeId) return state;
        check = prev.document.nodes[check]?.parentId ?? null;
      }

      let nodes = { ...prev.document.nodes };

      // Remove from old parent
      if (node.parentId && nodes[node.parentId]) {
        nodes[node.parentId] = {
          ...nodes[node.parentId],
          childIds: nodes[node.parentId].childIds.filter((id) => id !== action.nodeId),
        };
      }

      // Add to new parent
      const newParent = nodes[action.newParentId];
      if (!newParent) return state;
      const newChildIds = [...newParent.childIds];
      if (action.index !== undefined) {
        newChildIds.splice(action.index, 0, action.nodeId);
      } else {
        newChildIds.push(action.nodeId);
      }
      nodes[action.newParentId] = { ...newParent, childIds: newChildIds };
      nodes[action.nodeId] = { ...node, parentId: action.newParentId, pinned: false };

      return {
        ...prev,
        document: { ...prev.document, nodes },
      };
    }

    case 'REORDER_CHILDREN': {
      const prev = pushUndo(state);
      const parent = prev.document.nodes[action.parentId];
      if (!parent) return state;
      return {
        ...prev,
        document: {
          ...prev.document,
          nodes: {
            ...prev.document.nodes,
            [action.parentId]: { ...parent, childIds: action.childIds },
          },
        },
      };
    }

    case 'REPLACE_DOCUMENT': {
      // Remote snapshot (collab). Clear BOTH history stacks: undoing past a
      // remote snapshot restores a stale document (often the initial default)
      // whose collabEpoch is still current, so the forwarding effect would
      // diff it against the newer baseline and mass-delete the room content
      // (NIM-1521 undo hole). Collab undo belongs to Y.UndoManager later;
      // reducer undo stays local-mode only.
      return {
        ...state,
        document: action.document,
        selectedNodeId: action.document.rootId,
        editingNodeId: null,
        undoStack: [],
        redoStack: [],
        collabEpoch: action.collabEpoch ?? state.collabEpoch,
      };
    }

    case 'UPDATE_POSITIONS': {
      const nodes = { ...state.document.nodes };
      for (const [id, pos] of Object.entries(action.positions)) {
        if (nodes[id]) {
          nodes[id] = { ...nodes[id], position: pos, ...(action.pin === undefined ? {} : { pinned: action.pin }) };
        }
      }
      return {
        ...state,
        document: { ...state.document, nodes },
      };
    }

    case 'SET_ALL_PINNED': {
      const nodes: Record<string, MindmapNode> = {};
      for (const [id, node] of Object.entries(state.document.nodes)) {
        nodes[id] = { ...node, pinned: action.pinned };
      }
      return { ...state, document: { ...state.document, nodes } };
    }

    case 'EXPAND_PATH': {
      const collapsedNodeIds = new Set(state.collapsedNodeIds);
      let current: string | null = action.nodeId;
      while (current) {
        collapsedNodeIds.delete(current);
        current = state.document.nodes[current]?.parentId ?? null;
      }
      return { ...state, collapsedNodeIds };
    }

    case 'APPLY_DOCUMENT': {
      const prev = pushUndo(state);
      return {
        ...prev,
        document: action.document,
        selectedNodeId: action.selectedNodeId === undefined ? state.selectedNodeId : action.selectedNodeId,
        editingNodeId: null,
      };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const previous = state.undoStack[state.undoStack.length - 1];
      return {
        ...state,
        document: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.document],
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      return {
        ...state,
        document: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, state.document],
      };
    }

    default:
      return state;
  }
}

/** Apply an AI/user batch as one validated document mutation. */
export function applyMindmapOperations(
  document: MindmapDocument,
  operations: MindmapOperation[],
): { document: MindmapDocument; createdNodeIds: Record<string, string> } {
  if (operations.length === 0) return { document, createdNodeIds: {} };
  if (operations.length > 200) throw new Error('A batch may contain at most 200 operations');

  let nodes = Object.fromEntries(
    Object.entries(document.nodes).map(([id, node]) => [id, { ...node, childIds: [...node.childIds], tags: [...node.tags] }]),
  ) as Record<string, MindmapNode>;
  const aliases: Record<string, string> = {};
  const resolve = (value: string): string => aliases[value] ?? value;
  const requireNode = (value: string): MindmapNode => {
    const id = resolve(value);
    const node = nodes[id];
    if (!node) throw new Error(`Node ${value} not found`);
    return node;
  };
  const isDescendant = (ancestorId: string, candidateId: string): boolean => {
    let current: string | null = candidateId;
    while (current) {
      if (current === ancestorId) return true;
      current = nodes[current]?.parentId ?? null;
    }
    return false;
  };
  const deleteRecursive = (nodeId: string): void => {
    const node = nodes[nodeId];
    if (!node) return;
    for (const childId of [...node.childIds]) deleteRecursive(childId);
    if (node.parentId && nodes[node.parentId]) {
      nodes[node.parentId] = { ...nodes[node.parentId], childIds: nodes[node.parentId].childIds.filter((id) => id !== nodeId) };
    }
    delete nodes[nodeId];
  };

  for (const operation of operations) {
    if (operation.type === 'add') {
      const parent = requireNode(operation.parentId);
      const id = generateNodeId();
      if (operation.alias) {
        if (aliases[operation.alias] || nodes[operation.alias]) throw new Error(`Duplicate alias ${operation.alias}`);
        aliases[operation.alias] = id;
      }
      const childIds = [...parent.childIds];
      const index = operation.index === undefined ? childIds.length : Math.max(0, Math.min(childIds.length, operation.index));
      childIds.splice(index, 0, id);
      nodes[parent.id] = { ...parent, childIds };
      nodes[id] = {
        id,
        text: operation.text.trim() || 'Untitled',
        note: operation.note ?? '',
        parentId: parent.id,
        childIds: [],
        position: { x: parent.position.x + 230, y: parent.position.y },
        tags: operation.tags ?? [],
        status: operation.status ?? 'none',
        color: operation.color ?? 'default',
        link: operation.link ?? '',
        pinned: false,
      };
    } else if (operation.type === 'update') {
      const node = requireNode(operation.nodeId);
      const updates = Object.fromEntries(
        Object.entries(operation).filter(([key, value]) => key !== 'type' && key !== 'nodeId' && value !== undefined),
      );
      nodes[node.id] = { ...node, ...updates };
    } else if (operation.type === 'delete') {
      const node = requireNode(operation.nodeId);
      if (node.id === document.rootId) throw new Error('Cannot delete the root node');
      deleteRecursive(node.id);
    } else if (operation.type === 'move') {
      const node = requireNode(operation.nodeId);
      const requestedParent = requireNode(operation.newParentId);
      if (node.id === document.rootId) throw new Error('Cannot move the root node');
      if (isDescendant(node.id, requestedParent.id)) throw new Error(`Cannot move ${node.id} under its descendant ${requestedParent.id}`);
      if (node.parentId && nodes[node.parentId]) {
        nodes[node.parentId] = { ...nodes[node.parentId], childIds: nodes[node.parentId].childIds.filter((id) => id !== node.id) };
      }
      const parent = nodes[requestedParent.id];
      const childIds = [...parent.childIds];
      const index = operation.index === undefined ? childIds.length : Math.max(0, Math.min(childIds.length, operation.index));
      childIds.splice(index, 0, node.id);
      nodes[parent.id] = { ...parent, childIds };
      nodes[node.id] = { ...node, parentId: parent.id, pinned: false };
    }
  }

  return { document: { ...document, nodes }, createdNodeIds: aliases };
}

export function createInitialState(doc: MindmapDocument): EditorState {
  return {
    document: doc,
    selectedNodeId: doc.rootId,
    editingNodeId: null,
    collapsedNodeIds: new Set(),
    undoStack: [],
    redoStack: [],
    collabEpoch: 0,
  };
}
