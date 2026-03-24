// Mindmap document types

export interface MindmapNode {
  id: string;
  text: string;
  note: string;
  parentId: string | null;
  childIds: string[];
  position: { x: number; y: number };
  tags: string[];
  status: NodeStatus;
  color: NodeColor;
}

export type NodeStatus = 'none' | 'idea' | 'question' | 'todo' | 'in-progress' | 'done';

export type NodeColor =
  | 'default'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink';

export interface MindmapDocument {
  version: number;
  title: string;
  rootId: string;
  nodes: Record<string, MindmapNode>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    canvas: {
      viewport: { x: number; y: number; zoom: number };
    };
  };
}

export interface EditorState {
  document: MindmapDocument;
  selectedNodeId: string | null;
  editingNodeId: string | null;
  collapsedNodeIds: Set<string>;
  undoStack: MindmapDocument[];
  redoStack: MindmapDocument[];
}

// Action types for the reducer
export type EditorAction =
  | { type: 'LOAD_DOCUMENT'; document: MindmapDocument }
  | { type: 'SET_SELECTED'; nodeId: string | null }
  | { type: 'SET_EDITING'; nodeId: string | null }
  | { type: 'TOGGLE_COLLAPSE'; nodeId: string }
  | { type: 'UPDATE_NODE'; nodeId: string; updates: Partial<MindmapNode> }
  | { type: 'CREATE_NODE'; parentId: string; node: MindmapNode; index?: number }
  | { type: 'DELETE_NODE'; nodeId: string }
  | { type: 'MOVE_NODE'; nodeId: string; newParentId: string; index?: number }
  | { type: 'REORDER_CHILDREN'; parentId: string; childIds: string[] }
  | { type: 'REPLACE_DOCUMENT'; document: MindmapDocument }
  | { type: 'UPDATE_POSITIONS'; positions: Record<string, { x: number; y: number }> }
  | { type: 'UNDO' }
  | { type: 'REDO' };
