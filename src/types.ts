// Mindmap document types

// Imperative API exposed to AI tools via host.registerEditorAPI()
export interface MindmapEditorAPI {
  getDocument(): MindmapDocument;
  addNode(parentId: string, text: string, options?: {
    color?: NodeColor;
    status?: NodeStatus;
    tags?: string[];
    note?: string;
    index?: number;
  }): string; // returns new node ID
  updateNode(nodeId: string, updates: {
    text?: string;
    color?: NodeColor;
    status?: NodeStatus;
    tags?: string[];
    note?: string;
  }): void;
  deleteNode(nodeId: string): void;
  moveNode(nodeId: string, newParentId: string, index?: number): void;
}

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
  /**
   * Collab lineage marker: the binding epoch of the last remote snapshot this
   * state absorbed (via REPLACE_DOCUMENT). The forwarding effect only pushes
   * `document` into the shared Y.Doc when this matches the binding's current
   * epoch — a state derived from an older snapshot (e.g. the initial default
   * document plus an auto-layout commit) must never be diffed against a newer
   * baseline, or the diff mass-deletes the newer content for every client.
   * Stays 0 (and unused) in local-only mode.
   */
  collabEpoch: number;
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
  | { type: 'REPLACE_DOCUMENT'; document: MindmapDocument; collabEpoch?: number }
  | { type: 'UPDATE_POSITIONS'; positions: Record<string, { x: number; y: number }> }
  | { type: 'UNDO' }
  | { type: 'REDO' };
