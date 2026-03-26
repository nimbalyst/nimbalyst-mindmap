import React, { useState, useEffect, useReducer, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeChange,
  type OnNodesChange,
  type NodeDragHandler,
  BackgroundVariant,
} from '@xyflow/react';
import { useEditorLifecycle, type EditorHostProps } from '@nimbalyst/extension-sdk';
import type { MindmapNode, MindmapEditorAPI, EditorAction } from './types';
import {
  parseDocument,
  serializeDocument,
  createEmptyDocument,
  editorReducer,
  createInitialState,
  computeLayout,
  generateNodeId,
  estimateNodeWidth,
} from './model';
import { MindmapNodeComponent, type MindmapNodeData } from './MindmapNode';
import { MindmapEdge } from './MindmapEdge';
import { EditOverlay } from './EditOverlay';
import { Inspector } from './Inspector';
import { OutlinePanel } from './OutlinePanel';

import '@xyflow/react/dist/style.css';

const nodeTypes = { mindmap: MindmapNodeComponent };
const edgeTypes = { mindmap: MindmapEdge };

function MindmapCanvas({
  host,
}: EditorHostProps) {
  const [state, dispatch] = useReducer(editorReducer, createInitialState(createEmptyDocument()));
  const [showOutline, setShowOutline] = useState(false);
  const [needsLayout, setNeedsLayout] = useState(false);
  const { fitView } = useReactFlow();
  const pendingFitViewRef = useRef(false);
  const reactFlowReadyRef = useRef(false);

  // Use the SDK lifecycle hook for load/save/dirty/echo detection
  const stateRef = useRef(state);
  stateRef.current = state;

  const readOnly = host.readOnly ?? false;

  const { markDirty, isLoading, theme, diffState } = useEditorLifecycle(host, {
    applyContent: (doc) => {
      dispatch({ type: 'LOAD_DOCUMENT', document: doc });
      setNeedsLayout(true);
    },
    getCurrentContent: () => stateRef.current.document,
    parse: parseDocument,
    serialize: serializeDocument,
    onExternalChange: () => {
      setNeedsLayout(true);
    },
  });

  // Register imperative API for AI tools
  useEffect(() => {
    const api: MindmapEditorAPI = {
      getDocument: () => stateRef.current.document,
      addNode: (parentId, text, options) => {
        const parent = stateRef.current.document.nodes[parentId];
        if (!parent) throw new Error(`Parent node ${parentId} not found`);
        const newId = generateNodeId();
        const newNode: MindmapNode = {
          id: newId,
          text,
          note: options?.note ?? '',
          parentId,
          childIds: [],
          position: { x: parent.position.x + 220, y: parent.position.y },
          tags: options?.tags ?? [],
          status: options?.status ?? 'none',
          color: options?.color ?? 'default',
        };
        dispatch({ type: 'CREATE_NODE', parentId, node: newNode, index: options?.index });
        setNeedsLayout(true);
        markDirty();
        return newId;
      },
      updateNode: (nodeId, updates) => {
        if (!stateRef.current.document.nodes[nodeId]) throw new Error(`Node ${nodeId} not found`);
        dispatch({ type: 'UPDATE_NODE', nodeId, updates });
        markDirty();
      },
      deleteNode: (nodeId) => {
        if (nodeId === stateRef.current.document.rootId) throw new Error('Cannot delete root node');
        if (!stateRef.current.document.nodes[nodeId]) throw new Error(`Node ${nodeId} not found`);
        dispatch({ type: 'DELETE_NODE', nodeId });
        setNeedsLayout(true);
        markDirty();
      },
      moveNode: (nodeId, newParentId, index) => {
        if (nodeId === stateRef.current.document.rootId) throw new Error('Cannot move root node');
        dispatch({ type: 'MOVE_NODE', nodeId, newParentId, index });
        setNeedsLayout(true);
        markDirty();
      },
    };
    host.registerEditorAPI(api);
    return () => host.registerEditorAPI(null);
  }, [host, dispatch, markDirty]);

  // When AI edits trigger diff mode, apply the modified content so it renders
  useEffect(() => {
    if (diffState) {
      dispatch({ type: 'LOAD_DOCUMENT', document: diffState.modified });
      setNeedsLayout(true);
    }
  }, [diffState]);

  // Called when React Flow is initialized and ready to render
  const handleReactFlowInit = useCallback(() => {
    reactFlowReadyRef.current = true;
    if (pendingFitViewRef.current) {
      pendingFitViewRef.current = false;
      // Small delay to let positioned nodes render
      setTimeout(() => fitView({ padding: 0.2, duration: 0 }), 50);
    }
  }, [fitView]);

  // Apply layout when needed
  useEffect(() => {
    if (!needsLayout) return;
    setNeedsLayout(false);

    const layout = computeLayout(state.document, state.collapsedNodeIds);
    dispatch({ type: 'UPDATE_POSITIONS', positions: layout.positions });

    if (!reactFlowReadyRef.current) {
      // React Flow hasn't initialized yet -- defer fitView until onInit fires
      pendingFitViewRef.current = true;
    } else {
      // React Flow is ready, fit after a short render delay
      const timer = setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
      return () => clearTimeout(timer);
    }
  }, [needsLayout, state.document, state.collapsedNodeIds, fitView]);

  // Edit overlay state (lives outside React Flow to avoid re-render issues)
  const [editOverlay, setEditOverlay] = useState<{
    nodeId: string;
    text: string;
    rect: { x: number; y: number; width: number; height: number };
    initialKey: string | null;
    isRoot: boolean;
  } | null>(null);
  const isEditingRef = useRef(false);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const startEditing = useCallback(
    (nodeId: string, initialKey: string | null = null) => {
      const wrapper = canvasWrapperRef.current;
      if (!wrapper) return;
      const nodeEl = wrapper.querySelector(`[data-id="${nodeId}"] .mindmap-node-text`) as HTMLElement;
      if (!nodeEl) return;

      const wrapperRect = wrapper.getBoundingClientRect();
      const nodeRect = nodeEl.getBoundingClientRect();
      const node = state.document.nodes[nodeId];
      if (!node) return;

      isEditingRef.current = true;
      setEditOverlay({
        nodeId,
        text: node.text,
        rect: {
          x: nodeRect.left - wrapperRect.left,
          y: nodeRect.top - wrapperRect.top,
          width: nodeRect.width,
          height: nodeRect.height,
        },
        initialKey,
        isRoot: nodeId === state.document.rootId,
      });
    },
    [state.document]
  );

  const handleEditCommit = useCallback(
    (nodeId: string, text: string) => {
      dispatch({ type: 'UPDATE_NODE', nodeId, updates: { text } });
      markDirty();
      isEditingRef.current = false;
      setEditOverlay(null);
    },
    [dispatch, markDirty]
  );

  const handleEditCancel = useCallback(() => {
    isEditingRef.current = false;
    setEditOverlay(null);
  }, []);

  const handleStartEditing = useCallback(
    (nodeId: string) => {
      startEditing(nodeId, null);
    },
    [startEditing]
  );

  const handleToggleCollapse = useCallback(
    (nodeId: string) => {
      dispatch({ type: 'TOGGLE_COLLAPSE', nodeId });
      setNeedsLayout(true);
    },
    [dispatch]
  );

  const handleSelect = useCallback(
    (nodeId: string) => {
      dispatch({ type: 'SET_SELECTED', nodeId });
    },
    [dispatch]
  );

  // Create child node
  const createChild = useCallback(
    (parentId: string) => {
      const parent = state.document.nodes[parentId];
      if (!parent) return;
      const newId = generateNodeId();
      const newNode: MindmapNode = {
        id: newId,
        text: '',
        note: '',
        parentId,
        childIds: [],
        position: { x: parent.position.x + 220, y: parent.position.y },
        tags: [],
        status: 'none',
        color: 'default',
      };
      dispatch({ type: 'CREATE_NODE', parentId, node: newNode });
      setNeedsLayout(true);
      markDirty();
    },
    [state.document.nodes, dispatch, markDirty]
  );

  // Create sibling node
  const createSibling = useCallback(
    (nodeId: string) => {
      const node = state.document.nodes[nodeId];
      if (!node || !node.parentId) return;
      const parent = state.document.nodes[node.parentId];
      if (!parent) return;
      const index = parent.childIds.indexOf(nodeId) + 1;
      const newId = generateNodeId();
      const newNode: MindmapNode = {
        id: newId,
        text: '',
        note: '',
        parentId: node.parentId,
        childIds: [],
        position: { x: node.position.x, y: node.position.y + 60 },
        tags: [],
        status: 'none',
        color: 'default',
      };
      dispatch({ type: 'CREATE_NODE', parentId: node.parentId, node: newNode, index });
      setNeedsLayout(true);
      markDirty();
    },
    [state.document.nodes, dispatch, markDirty]
  );

  // Keyboard shortcuts (scoped to mindmap editor only)
  const editorContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only handle keys when focus is inside the mindmap editor
      const container = editorContainerRef.current;
      if (!container) return;
      const active = document.activeElement;
      if (!active || !container.contains(active)) return;

      // Ignore when focus is in any editable element (input, textarea, contentEditable)
      if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable) return;
      // Use ref for always-current editing state (avoids stale closure)
      if (isEditingRef.current) return;

      const { selectedNodeId } = state;
      if (!selectedNodeId) return;
      const selectedNode = state.document.nodes[selectedNodeId];
      if (!selectedNode) return;

      // In read-only mode, only allow navigation and collapse/expand
      if (readOnly) {
        switch (e.key) {
          case ' ':
            e.preventDefault();
            dispatch({ type: 'TOGGLE_COLLAPSE', nodeId: selectedNodeId });
            setNeedsLayout(true);
            break;
          case 'ArrowUp':
          case 'ArrowDown':
          case 'ArrowLeft':
          case 'ArrowRight':
            e.preventDefault();
            navigateNode(e.key, selectedNode, state.document);
            break;
          case 'Escape':
            dispatch({ type: 'SET_SELECTED', nodeId: state.document.rootId });
            break;
        }
        return;
      }

      switch (e.key) {
        case 'Tab': {
          e.preventDefault();
          createChild(selectedNodeId);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (selectedNode.parentId) {
            createSibling(selectedNodeId);
          } else {
            createChild(selectedNodeId);
          }
          break;
        }
        case 'Delete':
        case 'Backspace': {
          if (selectedNodeId !== state.document.rootId) {
            e.preventDefault();
            dispatch({ type: 'DELETE_NODE', nodeId: selectedNodeId });
            setNeedsLayout(true);
            markDirty();
          }
          break;
        }
        case 'F2': {
          e.preventDefault();
          startEditing(selectedNodeId, null);
          break;
        }
        case ' ': {
          e.preventDefault();
          dispatch({ type: 'TOGGLE_COLLAPSE', nodeId: selectedNodeId });
          setNeedsLayout(true);
          break;
        }
        case 'z': {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) {
              dispatch({ type: 'REDO' });
            } else {
              dispatch({ type: 'UNDO' });
            }
            setNeedsLayout(true);
            markDirty();
          }
          break;
        }
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          navigateNode(e.key, selectedNode, state.document);
          break;
        }
        case 'Escape': {
          dispatch({ type: 'SET_SELECTED', nodeId: state.document.rootId });
          break;
        }
        default: {
          // Start editing on any single printable character (no modifier keys except shift)
          if (
            e.key.length === 1 &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey
          ) {
            e.preventDefault();
            startEditing(selectedNodeId, e.key);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, readOnly, createChild, createSibling, dispatch, startEditing, markDirty]);

  // Arrow key navigation
  const navigateNode = useCallback(
    (key: string, node: MindmapNode, doc: typeof state.document) => {
      switch (key) {
        case 'ArrowLeft': {
          if (node.parentId) {
            dispatch({ type: 'SET_SELECTED', nodeId: node.parentId });
          }
          break;
        }
        case 'ArrowRight': {
          if (node.childIds.length > 0) {
            dispatch({ type: 'SET_SELECTED', nodeId: node.childIds[0] });
          }
          break;
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!node.parentId) break;
          const parent = doc.nodes[node.parentId];
          if (!parent) break;
          const idx = parent.childIds.indexOf(node.id);
          const nextIdx = key === 'ArrowUp' ? idx - 1 : idx + 1;
          if (nextIdx >= 0 && nextIdx < parent.childIds.length) {
            dispatch({ type: 'SET_SELECTED', nodeId: parent.childIds[nextIdx] });
          }
          break;
        }
      }
    },
    [dispatch]
  );

  // Convert graph model to React Flow nodes and edges
  const { nodes, edges } = useMemo(() => {
    const rfNodes: Node[] = [];
    const rfEdges: Edge[] = [];
    const { document: doc, collapsedNodeIds, selectedNodeId } = state;

    // Determine which root children are on the left side
    const rootNode = doc.nodes[doc.rootId];
    const rootChildren = rootNode ? rootNode.childIds.filter((id) => doc.nodes[id]) : [];
    const midpoint = Math.ceil(rootChildren.length / 2);
    const leftChildIds = new Set(rootChildren.slice(midpoint));

    // Determine if a node is on the left side (descended from a left root child)
    function isOnLeftSide(nodeId: string): boolean {
      if (nodeId === doc.rootId) return false;
      let current = nodeId;
      while (current) {
        const node = doc.nodes[current];
        if (!node || !node.parentId) return false;
        if (node.parentId === doc.rootId) return leftChildIds.has(current);
        current = node.parentId;
      }
      return false;
    }

    // BFS to build visible nodes
    const visited = new Set<string>();
    const queue: string[] = [doc.rootId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = doc.nodes[nodeId];
      if (!node) continue;

      const isCollapsed = collapsedNodeIds.has(nodeId);
      const visibleChildIds = isCollapsed
        ? []
        : node.childIds.filter((id) => doc.nodes[id]);
      const leftSide = isOnLeftSide(nodeId);

      const nodeData: MindmapNodeData = {
        node,
        isRoot: nodeId === doc.rootId,
        isSelected: nodeId === selectedNodeId,
        isCollapsed,
        isLeftSide: leftSide,
        childCount: node.childIds.length,
        onStartEditing: readOnly ? undefined : handleStartEditing,
        onToggleCollapse: handleToggleCollapse,
        onSelect: handleSelect,
      };

      rfNodes.push({
        id: nodeId,
        type: 'mindmap',
        position: node.position,
        data: nodeData as Record<string, unknown>,
        selected: nodeId === selectedNodeId,
        // Explicit dimensions for MiniMap (getBoundingClientRect returns 0 in extension host)
        measured: {
          width: estimateNodeWidth(node, nodeId === doc.rootId),
          height: node.tags.length > 0 ? 68 : 48,
        },
      });

      for (const childId of visibleChildIds) {
        const childIsLeft = isOnLeftSide(childId);
        rfEdges.push({
          id: `${nodeId}-${childId}`,
          source: nodeId,
          target: childId,
          type: 'mindmap',
          sourceHandle: nodeId === doc.rootId && childIsLeft ? 'left' : undefined,
        });
        queue.push(childId);
      }
    }

    return { nodes: rfNodes, edges: rfEdges };
  }, [
    state,
    handleStartEditing,
    handleToggleCollapse,
    handleSelect,
  ]);

  // Handle node position changes from dragging
  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const positionChanges: Record<string, { x: number; y: number }> = {};
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          positionChanges[change.id] = change.position;
        }
        if (change.type === 'select' && change.selected) {
          dispatch({ type: 'SET_SELECTED', nodeId: change.id });
        }
      }
      if (Object.keys(positionChanges).length > 0) {
        dispatch({ type: 'UPDATE_POSITIONS', positions: positionChanges });
        markDirty();
      }
    },
    [dispatch, markDirty]
  );

  // Drag-to-reparent: when a node is dropped, check if it overlaps another node
  const REPARENT_DISTANCE = 120;
  const onNodeDragStop: NodeDragHandler = useCallback(
    (_event, draggedNode) => {
      const draggedId = draggedNode.id;
      if (draggedId === state.document.rootId) return;
      const draggedPos = draggedNode.position;

      let closestId: string | null = null;
      let closestDist = REPARENT_DISTANCE;

      const isDescendant = (ancestorId: string, nodeId: string): boolean => {
        let current = nodeId;
        while (current) {
          if (current === ancestorId) return true;
          current = state.document.nodes[current]?.parentId ?? '';
        }
        return false;
      };

      for (const node of Object.values(state.document.nodes)) {
        if (node.id === draggedId) continue;
        if (isDescendant(draggedId, node.id)) continue;
        if (node.id === state.document.nodes[draggedId]?.parentId) continue;

        const dx = node.position.x - draggedPos.x;
        const dy = node.position.y - draggedPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = node.id;
        }
      }

      if (closestId) {
        dispatch({ type: 'MOVE_NODE', nodeId: draggedId, newParentId: closestId });
        setNeedsLayout(true);
        markDirty();
      }
    },
    [state.document, dispatch, markDirty]
  );

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return Object.values(state.document.nodes).filter(
      (n) =>
        n.text.toLowerCase().includes(q) ||
        n.note.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [searchQuery, state.document.nodes]);

  // Focus search on Ctrl+F (scoped to mindmap editor)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const container = editorContainerRef.current;
      if (!container) return;
      const active = document.activeElement;
      if (!active || !container.contains(active)) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearch]);

  // Auto-layout button
  const handleAutoLayout = useCallback(() => {
    setNeedsLayout(true);
  }, []);

  // Selected node for inspector
  const selectedNode = state.selectedNodeId
    ? state.document.nodes[state.selectedNodeId] ?? null
    : null;

  // Empty state detection
  const isEmptyMap = useMemo(() => {
    const root = state.document.nodes[state.document.rootId];
    if (!root) return true;
    return root.childIds.length === 0 && (root.text === 'Central idea' || root.text === '');
  }, [state.document]);

  if (isLoading) {
    return (
      <div className="mindmap-loading">
        <span>Loading mindmap...</span>
      </div>
    );
  }

  return (
    <div className={`mindmap-editor ${theme?.includes('light') ? 'light-theme' : ''}`} ref={editorContainerRef} tabIndex={-1}>
      {/* Toolbar */}
      <div className="mindmap-toolbar">
        <div className="mindmap-toolbar-left">
          <span className="mindmap-toolbar-title">{state.document.title}</span>
          {showSearch && (
            <div className="mindmap-search">
              <input
                ref={searchInputRef}
                className="mindmap-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowSearch(false);
                    setSearchQuery('');
                  }
                  if (e.key === 'Enter' && searchResults.length > 0) {
                    dispatch({ type: 'SET_SELECTED', nodeId: searchResults[0].id });
                  }
                }}
                placeholder="Search nodes..."
              />
              {searchQuery && (
                <span className="mindmap-search-count">
                  {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="mindmap-toolbar-actions">
          <button
            className="mindmap-toolbar-btn"
            onClick={() => {
              setShowSearch(!showSearch);
              if (!showSearch) {
                requestAnimationFrame(() => searchInputRef.current?.focus());
              } else {
                setSearchQuery('');
              }
            }}
            title="Search (Ctrl+F)"
          >
            Search
          </button>
          {!readOnly && (
            <button
              className="mindmap-toolbar-btn"
              onClick={() => setShowOutline(!showOutline)}
              title="Toggle outline"
            >
              {showOutline ? 'Hide Outline' : 'Outline'}
            </button>
          )}
          {!readOnly && (
            <button
              className="mindmap-toolbar-btn"
              onClick={handleAutoLayout}
              title="Auto-layout all nodes"
            >
              Auto Layout
            </button>
          )}
          <button
            className="mindmap-toolbar-btn"
            onClick={() => fitView({ padding: 0.2, duration: 300 })}
            title="Fit to view"
          >
            Fit View
          </button>
        </div>
      </div>

      <div className="mindmap-body">
        {/* Outline panel */}
        {showOutline && !readOnly && (
          <OutlinePanel
            document={state.document}
            selectedNodeId={state.selectedNodeId}
            collapsedNodeIds={state.collapsedNodeIds}
            dispatch={dispatch}
            onNeedsLayout={() => setNeedsLayout(true)}
            onDirty={markDirty}
          />
        )}

        {/* Canvas */}
        <div className="mindmap-canvas-wrapper" ref={canvasWrapperRef} style={{ position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={readOnly ? undefined : onNodesChange}
            onNodeDragStop={readOnly ? undefined : onNodeDragStop}
            onInit={handleReactFlowInit}
            onPaneClick={() => dispatch({ type: 'SET_SELECTED', nodeId: null })}
            minZoom={0.1}
            maxZoom={3}
            defaultEdgeOptions={{ type: 'mindmap' }}
            proOptions={{ hideAttribution: true }}
            selectionOnDrag={false}
            panOnDrag
            selectNodesOnDrag={false}
            nodesDraggable={!readOnly}
            nodesConnectable={false}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="var(--nim-text-faint)"
              style={{ opacity: 0.3 }}
            />
            <MiniMap
              position="bottom-left"
              pannable
              zoomable
              nodeColor={() => '#6b8afd'}
              maskColor="rgba(0, 0, 0, 0.6)"
              style={{
                background: 'var(--nim-bg-secondary)',
                borderRadius: 6,
                border: '1px solid var(--nim-border)',
              }}
            />
          </ReactFlow>

          {/* Inline edit overlay -- lives outside React Flow to avoid re-render issues */}
          {!readOnly && (
            <EditOverlay
              editing={editOverlay}
              onCommit={handleEditCommit}
              onCancel={handleEditCancel}
            />
          )}

          {/* Empty state overlay */}
          {isEmptyMap && !readOnly && (
            <div className="mindmap-empty-overlay">
              <div className="mindmap-empty-content">
                <div className="mindmap-empty-title">Start your mindmap</div>
                <div className="mindmap-empty-hints">
                  <div className="mindmap-empty-hint">
                    <kbd>Tab</kbd> Add a child node
                  </div>
                  <div className="mindmap-empty-hint">
                    <kbd>Enter</kbd> Add a sibling node
                  </div>
                  <div className="mindmap-empty-hint">
                    <kbd>F2</kbd> Edit selected node
                  </div>
                  <div className="mindmap-empty-hint">
                    <kbd>Arrows</kbd> Navigate between nodes
                  </div>
                </div>
                <div className="mindmap-empty-tip">
                  Double-click the root node to rename it, then press Tab to start branching.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Inspector -- only shown when a node is selected (not in read-only mode) */}
        {selectedNode && !readOnly && (
          <Inspector node={selectedNode} dispatch={dispatch} onDirty={markDirty} />
        )}
      </div>
    </div>
  );
}

// Wrap with ReactFlowProvider
export function MindmapEditor(props: EditorHostProps) {
  return (
    <ReactFlowProvider>
      <MindmapCanvas {...props} />
    </ReactFlowProvider>
  );
}
