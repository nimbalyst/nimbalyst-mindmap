// Mindmap document types

// Imperative API exposed to AI tools via host.registerEditorAPI()
export interface MindmapEditorAPI {
  getDocument(): MindmapDocument;
  getContext(nodeId?: string, depth?: number): MindmapContext;
  addNode(parentId: string, text: string, options?: {
    color?: NodeColor;
    status?: NodeStatus;
    tags?: string[];
    note?: string;
    link?: string;
    index?: number;
  }): string; // returns new node ID
  updateNode(nodeId: string, updates: {
    text?: string;
    color?: NodeColor;
    status?: NodeStatus;
    tags?: string[];
    note?: string;
    link?: string;
  }): void;
  deleteNode(nodeId: string): void;
  moveNode(nodeId: string, newParentId: string, index?: number): void;
  applyOperations(operations: MindmapOperation[]): {
    createdNodeIds: Record<string, string>;
    operationCount: number;
  };
}

export interface MindmapContext {
  selectedNodeId: string | null;
  rootId: string;
  node: MindmapNode;
  path: Array<{ id: string; text: string }>;
  subtree: MindmapNode[];
}

export type MindmapOperation =
  | {
      type: 'add';
      /** Existing node id or an alias declared by an earlier add operation. */
      parentId: string;
      alias?: string;
      text: string;
      note?: string;
      tags?: string[];
      status?: NodeStatus;
      color?: NodeColor;
      link?: string;
      index?: number;
    }
  | {
      type: 'update';
      nodeId: string;
      text?: string;
      note?: string;
      tags?: string[];
      status?: NodeStatus;
      color?: NodeColor;
      link?: string;
    }
  | { type: 'delete'; nodeId: string }
  | { type: 'move'; nodeId: string; newParentId: string; index?: number };

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
  /** Optional related URL, workspace path, or artifact reference. */
  link: string;
  /** Manual positions are preserved by hybrid layout. */
  pinned: boolean;
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

export type LayoutMode = 'balanced' | 'right';

export interface MindmapDocument {
  version: number;
  title: string;
  rootId: string;
  nodes: Record<string, MindmapNode>;
  metadata: {
    layout: LayoutMode;
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
  | { type: 'UPDATE_POSITIONS'; positions: Record<string, { x: number; y: number }>; pin?: boolean }
  | { type: 'SET_ALL_PINNED'; pinned: boolean }
  | { type: 'EXPAND_PATH'; nodeId: string }
  | { type: 'APPLY_DOCUMENT'; document: MindmapDocument; selectedNodeId?: string | null }
  | { type: 'UNDO' }
  | { type: 'REDO' };
