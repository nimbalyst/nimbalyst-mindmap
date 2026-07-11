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
  type OnNodeDrag,
  BackgroundVariant,
} from '@xyflow/react';
import {
  useEditorLifecycle,
  useCollaborativeEditor,
  type EditorHostProps,
} from '@nimbalyst/extension-sdk';
import type { MindmapNode, MindmapEditorAPI, EditorAction, MindmapOperation } from './types';
import {
  parseDocument,
  serializeDocument,
  createEmptyDocument,
  editorReducer,
  createInitialState,
  computeLayout,
  generateNodeId,
  estimateNodeWidth,
  estimateNodeHeight,
  applyMindmapOperations,
} from './model';
import { MindmapNodeComponent, type MindmapNodeData } from './MindmapNode';
import { MindmapEdge } from './MindmapEdge';
import { EditOverlay } from './EditOverlay';
import { Inspector } from './Inspector';
import { OutlinePanel } from './OutlinePanel';
import { MindmapBinding } from './collab/mindmapBinding';
import { mindmapCodec } from './collab/codec';

import '@xyflow/react/dist/style.css';

const nodeTypes = { mindmap: MindmapNodeComponent };
const edgeTypes = { mindmap: MindmapEdge };

function MindmapCanvas({
  host,
}: EditorHostProps) {
  const [state, dispatch] = useReducer(editorReducer, createInitialState(createEmptyDocument()));
  const [showOutline, setShowOutline] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [needsLayout, setNeedsLayout] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const { fitView, setCenter, getZoom } = useReactFlow();
  const pendingFitViewRef = useRef(false);
  const reactFlowReadyRef = useRef(false);
  const fitRequestRef = useRef(0);

  // Use the SDK lifecycle hook for load/save/dirty/echo detection
  const stateRef = useRef(state);
  stateRef.current = state;

  const readOnly = host.readOnly ?? false;

  const { markDirty, isLoading, theme, diffState } = useEditorLifecycle(host, {
    applyContent: (doc) => {
      // Collab mode: the Y.Doc is authoritative and there is no local file --
      // the host's loadContent returns '' which parses to the DEFAULT document.
      // Applying that into the reducer AFTER the binding's REPLACE_DOCUMENT
      // forwards a default doc with a CURRENT collabEpoch and mass-deletes the
      // shared room (the "shows content for a moment, then empty" clobber).
      if (host.collaboration) return;
      dispatch({ type: 'LOAD_DOCUMENT', document: doc });
      pendingFitViewRef.current = true;
      setNeedsLayout(true);
    },
    getCurrentContent: () => stateRef.current.document,
    parse: parseDocument,
    serialize: serializeDocument,
    onExternalChange: () => {
      pendingFitViewRef.current = true;
      setNeedsLayout(true);
    },
  });

  // ---- Collaborative wiring (no-op when host.collaboration is undefined) ---
  // The binding wraps the Y.Doc, forwards every local document state to the
  // shared Y.Doc as a minimal diff, and dispatches REPLACE_DOCUMENT for
  // remote changes. The hook creates the binding once after sync (and
  // seeding, if this client is first); we stash it in a ref so the rest of
  // the editor (awareness fields, local-document forwarding) can read it.
  const bindingRef = useRef<MindmapBinding | null>(null);
  // Bump on every remote state change so a re-render picks up the badges.
  const [awarenessRevision, forceRender] = useReducer((x) => x + 1, 0);
  const { isCollaborative } = useCollaborativeEditor(host, {
    // Delegate emptiness + seeding to the single pure codec so the live seed
    // and the host's headless seed are provably the same code.
    isEmpty: (yDoc) => mindmapCodec.isEmpty(yDoc),
    initializeFromContent: (yDoc, content) =>
      mindmapCodec.seedFromFile(
        yDoc,
        typeof content === 'string' ? content : new Uint8Array(content),
      ),
    createBinding: ({ yDoc, awareness }) => {
      const binding = new MindmapBinding(
        yDoc,
        stateRef.current.document,
        {
          onRemoteDocument: (doc, epoch) => {
            dispatch({ type: 'REPLACE_DOCUMENT', document: doc, collabEpoch: epoch });
            if (!reactFlowReadyRef.current) pendingFitViewRef.current = true;
            setNeedsLayout(true);
          },
          onRemoteAwareness: () => forceRender(),
        },
        awareness,
      );
      bindingRef.current = binding;
      return {
        destroy: () => {
          binding.destroy();
          bindingRef.current = null;
        },
      };
    },
  });

  // Forward local document states to the Y.Doc when collab is active. The
  // epoch check is the anti-clobber invariant (NIM-1521): a state is only
  // forwarded when it has absorbed the binding's latest remote snapshot
  // (state.collabEpoch === binding.getEpoch()). A stale state -- e.g. the
  // initial default document plus an auto-layout commit that lands before
  // REPLACE_DOCUMENT is processed -- would otherwise diff against the newer
  // baseline and mass-delete every remote node (observed live: a re-uploaded
  // mindmap reverted to an empty "Untitled map" within seconds). This also
  // subsumes echo suppression: forwarding the REPLACE state itself is a no-op
  // diff against the identical baseline.
  useEffect(() => {
    const binding = bindingRef.current;
    if (!binding) return;
    if (state.collabEpoch !== binding.getEpoch()) return;
    binding.applyLocalDocument(state.document);
  }, [state.document, state.collabEpoch]);

  // Publish selection / editing to awareness when in collab mode.
  useEffect(() => {
    const binding = bindingRef.current;
    if (!binding) return;
    binding.setLocalAwareness({
      selectedNodeId: state.selectedNodeId,
      editingNodeId: state.editingNodeId,
    });
  }, [state.selectedNodeId, state.editingNodeId]);

  // Make the current branch first-class chat context. This surfaces a context
  // chip in Nimbalyst and lets ordinary prompts such as "expand this branch"
  // resolve without the user copying node ids.
  useEffect(() => {
    const nodeId = state.selectedNodeId;
    const node = nodeId ? state.document.nodes[nodeId] : undefined;
    if (!node) {
      host.setEditorContext(null);
      return;
    }
    const path: string[] = [];
    let current: MindmapNode | undefined = node;
    while (current) {
      path.unshift(current.text);
      current = current.parentId ? state.document.nodes[current.parentId] : undefined;
    }
    host.setEditorContext({
      label: `Mindmap: ${node.text || 'Untitled'}`,
      description: [
        `Selected mindmap node id: ${node.id}.`,
        `Path: ${path.join(' > ')}.`,
        `It has ${node.childIds.length} direct children.`,
        node.note ? `Note: ${node.note}` : '',
        'Use mindmap.get_context for the branch and mindmap.apply_operations for atomic edits.',
      ].filter(Boolean).join(' '),
    });
    return () => host.setEditorContext(null);
  }, [host, state.selectedNodeId, state.document.nodes]);

  // Future: pipe `bindingRef.current?.getRemoteEditingByUser()` into the
  // node renderer to draw "X is editing this node" badges. The awareness
  // wire is in place; the UI integration belongs to a follow-up touch on
  // MindmapNode.tsx (out of scope for the initial collab landing).
  void isCollaborative;

  // Register imperative API for AI tools
  useEffect(() => {
    const api: MindmapEditorAPI = {
      getDocument: () => stateRef.current.document,
      getContext: (requestedNodeId, depth = 3) => {
        const current = stateRef.current;
        const nodeId = requestedNodeId ?? current.selectedNodeId ?? current.document.rootId;
        const node = current.document.nodes[nodeId];
        if (!node) throw new Error(`Node ${nodeId} not found`);
        const path: Array<{ id: string; text: string }> = [];
        let pathNode: MindmapNode | undefined = node;
        while (pathNode) {
          path.unshift({ id: pathNode.id, text: pathNode.text });
          pathNode = pathNode.parentId ? current.document.nodes[pathNode.parentId] : undefined;
        }
        const subtree: MindmapNode[] = [];
        const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];
        while (queue.length > 0) {
          const item = queue.shift()!;
          const child = current.document.nodes[item.id];
          if (!child) continue;
          subtree.push(child);
          if (item.depth < Math.max(0, Math.min(depth, 10))) {
            queue.push(...child.childIds.map((id) => ({ id, depth: item.depth + 1 })));
          }
        }
        return { selectedNodeId: current.selectedNodeId, rootId: current.document.rootId, node, path, subtree };
      },
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
          link: options?.link ?? '',
          pinned: false,
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
      applyOperations: (operations: MindmapOperation[]) => {
        const result = applyMindmapOperations(stateRef.current.document, operations);
        dispatch({ type: 'APPLY_DOCUMENT', document: result.document });
        setNeedsLayout(true);
        markDirty();
        return { createdNodeIds: result.createdNodeIds, operationCount: operations.length };
      },
    };
    host.registerEditorAPI(api);
    return () => host.registerEditorAPI(null);
  }, [host, dispatch, markDirty]);

  // When AI edits trigger diff mode, apply the modified content so it renders
  useEffect(() => {
    if (diffState) {
      dispatch({ type: 'LOAD_DOCUMENT', document: diffState.modified });
      pendingFitViewRef.current = true;
      setNeedsLayout(true);
    }
  }, [diffState]);

  // Called when React Flow is initialized and ready to render
  const handleReactFlowInit = useCallback(() => {
    reactFlowReadyRef.current = true;
    if (pendingFitViewRef.current) {
      pendingFitViewRef.current = false;
      const request = ++fitRequestRef.current;
      // Wait for the layout dispatch and two browser paints. Unlike the old
      // effect cleanup, this is not cancelled by the position state update.
      setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        if (request === fitRequestRef.current) fitView({ padding: 0.22, duration: 0 });
      })), 60);
    }
  }, [fitView]);

  // Apply layout when needed
  useEffect(() => {
    if (!needsLayout) return;
    setNeedsLayout(false);

    const layout = computeLayout(state.document, state.collapsedNodeIds);
    const positions = { ...layout.positions };
    for (const node of Object.values(state.document.nodes)) {
      if (node.pinned) positions[node.id] = node.position;
    }
    dispatch({ type: 'UPDATE_POSITIONS', positions });

    if (!reactFlowReadyRef.current) {
      // React Flow hasn't initialized yet -- defer fitView until onInit fires
      pendingFitViewRef.current = true;
    } else if (pendingFitViewRef.current) {
      pendingFitViewRef.current = false;
      const request = ++fitRequestRef.current;
      setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        if (request === fitRequestRef.current) fitView({ padding: 0.22, duration: 220 });
      })), 60);
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
  const createChildRef = useRef<(nodeId: string) => void>(() => undefined);
  const createSiblingRef = useRef<(nodeId: string, before?: boolean) => void>(() => undefined);
  const navigateNodeRef = useRef<(key: string, node: MindmapNode, doc: typeof state.document) => void>(() => undefined);
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
      dispatch({ type: 'SET_EDITING', nodeId });
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
    [state.document, dispatch]
  );

  const handleEditCommit = useCallback(
    (nodeId: string, text: string, intent: 'done' | 'sibling' | 'child') => {
      dispatch({ type: 'UPDATE_NODE', nodeId, updates: { text } });
      dispatch({ type: 'SET_EDITING', nodeId: null });
      markDirty();
      isEditingRef.current = false;
      setEditOverlay(null);
      if (intent !== 'done') {
        setTimeout(() => {
          if (intent === 'child') createChildRef.current(nodeId);
          else createSiblingRef.current(nodeId);
        }, 0);
      }
    },
    [dispatch, markDirty]
  );

  const handleEditCancel = useCallback(() => {
    const nodeId = editOverlay?.nodeId;
    const node = nodeId ? stateRef.current.document.nodes[nodeId] : undefined;
    if (node && !node.text && node.id !== stateRef.current.document.rootId) {
      dispatch({ type: 'DELETE_NODE', nodeId: node.id });
      setNeedsLayout(true);
      markDirty();
    }
    dispatch({ type: 'SET_EDITING', nodeId: null });
    isEditingRef.current = false;
    setEditOverlay(null);
  }, [editOverlay, dispatch, markDirty]);

  const handleStartEditing = useCallback(
    (nodeId: string, before = false) => {
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
      const parent = stateRef.current.document.nodes[parentId];
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
        link: '',
        pinned: false,
      };
      dispatch({ type: 'CREATE_NODE', parentId, node: newNode });
      setNeedsLayout(true);
      markDirty();
    },
    [dispatch, markDirty]
  );

  // Create sibling node
  const createSibling = useCallback(
    (nodeId: string, before = false) => {
      const node = stateRef.current.document.nodes[nodeId];
      if (!node || !node.parentId) return;
      const parent = stateRef.current.document.nodes[node.parentId];
      if (!parent) return;
      const index = parent.childIds.indexOf(nodeId) + (before ? 0 : 1);
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
        link: '',
        pinned: false,
      };
      dispatch({ type: 'CREATE_NODE', parentId: node.parentId, node: newNode, index });
      setNeedsLayout(true);
      markDirty();
    },
    [dispatch, markDirty]
  );
  createChildRef.current = createChild;
  createSiblingRef.current = createSibling;

  const moveAmongSiblings = useCallback((nodeId: string, delta: number) => {
    const doc = stateRef.current.document;
    const node = doc.nodes[nodeId];
    if (!node?.parentId) return;
    const parent = doc.nodes[node.parentId];
    if (!parent) return;
    const index = parent.childIds.indexOf(nodeId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= parent.childIds.length) return;
    const childIds = [...parent.childIds];
    [childIds[index], childIds[target]] = [childIds[target], childIds[index]];
    dispatch({ type: 'REORDER_CHILDREN', parentId: parent.id, childIds });
    setNeedsLayout(true);
    markDirty();
  }, [dispatch, markDirty]);

  const indentNode = useCallback((nodeId: string) => {
    const doc = stateRef.current.document;
    const node = doc.nodes[nodeId];
    if (!node?.parentId) return;
    const parent = doc.nodes[node.parentId];
    const index = parent?.childIds.indexOf(nodeId) ?? -1;
    if (!parent || index <= 0) return;
    dispatch({ type: 'MOVE_NODE', nodeId, newParentId: parent.childIds[index - 1] });
    setNeedsLayout(true);
    markDirty();
  }, [dispatch, markDirty]);

  const outdentNode = useCallback((nodeId: string) => {
    const doc = stateRef.current.document;
    const node = doc.nodes[nodeId];
    const parent = node?.parentId ? doc.nodes[node.parentId] : undefined;
    if (!node || !parent?.parentId) return;
    const grandparent = doc.nodes[parent.parentId];
    if (!grandparent) return;
    dispatch({
      type: 'MOVE_NODE',
      nodeId,
      newParentId: grandparent.id,
      index: grandparent.childIds.indexOf(parent.id) + 1,
    });
    setNeedsLayout(true);
    markDirty();
  }, [dispatch, markDirty]);

  // CREATE_NODE records the editing target before its DOM exists. Open the
  // overlay after layout/render so keyboard-created nodes are immediately writable.
  useEffect(() => {
    if (!state.editingNodeId || editOverlay) return;
    const timer = setTimeout(() => startEditing(state.editingNodeId!), 60);
    return () => clearTimeout(timer);
  }, [state.editingNodeId, state.document.nodes, editOverlay, startEditing]);

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

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        fitView({ padding: 0.2, duration: 250 });
        return;
      }

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
            navigateNodeRef.current(e.key, selectedNode, state.document);
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
          if (e.shiftKey) outdentNode(selectedNodeId);
          else if (e.altKey) indentNode(selectedNodeId);
          else createChild(selectedNodeId);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (selectedNode.parentId) {
            createSibling(selectedNodeId, e.shiftKey);
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
        case '.': {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            setFocusNodeId((current) => current ? null : selectedNodeId);
          }
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
          if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            moveAmongSiblings(selectedNodeId, e.key === 'ArrowUp' ? -1 : 1);
          } else {
            navigateNodeRef.current(e.key, selectedNode, state.document);
          }
          break;
        }
        case 'Escape': {
          if (focusNodeId) setFocusNodeId(null);
          else dispatch({ type: 'SET_SELECTED', nodeId: state.document.rootId });
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
  }, [state, readOnly, createChild, createSibling, dispatch, startEditing, markDirty, moveAmongSiblings, indentNode, outdentNode, fitView, focusNodeId]);

  // Arrow key navigation
  const navigateNode = useCallback(
    (key: string, node: MindmapNode, doc: typeof state.document) => {
      const direction = key === 'ArrowLeft'
        ? { x: -1, y: 0 }
        : key === 'ArrowRight'
          ? { x: 1, y: 0 }
          : key === 'ArrowUp'
            ? { x: 0, y: -1 }
            : { x: 0, y: 1 };
      const isVisible = (candidate: MindmapNode): boolean => {
        let current: MindmapNode | undefined = candidate;
        let insideFocus = focusNodeId === null;
        while (current) {
          if (current.id === focusNodeId) insideFocus = true;
          if (current.id !== candidate.id && state.collapsedNodeIds.has(current.id)) return false;
          current = current.parentId ? doc.nodes[current.parentId] : undefined;
        }
        return insideFocus;
      };
      let best: { candidate: MindmapNode; score: number } | null = null;
      for (const candidate of Object.values(doc.nodes)) {
        if (candidate.id === node.id || !isVisible(candidate)) continue;
        const dx = candidate.position.x - node.position.x;
        const dy = candidate.position.y - node.position.y;
        const forward = dx * direction.x + dy * direction.y;
        if (forward <= 4) continue;
        const perpendicular = Math.abs(dx * direction.y - dy * direction.x);
        const score = Math.hypot(dx, dy) + perpendicular * 1.5;
        if (!best || score < best.score) best = { candidate, score };
      }
      if (best) {
        dispatch({ type: 'SET_SELECTED', nodeId: best.candidate.id });
        setCenter(
          best.candidate.position.x + estimateNodeWidth(best.candidate, best.candidate.id === doc.rootId) / 2,
          best.candidate.position.y + 28,
          { zoom: getZoom(), duration: 180 },
        );
      }
    },
    [dispatch, focusNodeId, state.collapsedNodeIds, setCenter, getZoom]
  );
  navigateNodeRef.current = navigateNode;

  // Convert graph model to React Flow nodes and edges
  const { nodes, edges } = useMemo(() => {
    const rfNodes: Node[] = [];
    const rfEdges: Edge[] = [];
    const { document: doc, collapsedNodeIds, selectedNodeId } = state;
    const remoteEditorsByNode = new Map<string, string[]>();
    for (const [userId, nodeId] of bindingRef.current?.getRemoteEditingByUser() ?? []) {
      if (!nodeId) continue;
      remoteEditorsByNode.set(nodeId, [...(remoteEditorsByNode.get(nodeId) ?? []), userId]);
    }

    // Determine which root children are on the left side
    const rootNode = doc.nodes[doc.rootId];
    const rootChildren = rootNode ? rootNode.childIds.filter((id) => doc.nodes[id]) : [];
    const midpoint = Math.ceil(rootChildren.length / 2);
    const leftChildIds = new Set(state.document.metadata.layout === 'balanced' ? rootChildren.slice(midpoint) : []);

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
    const queue: string[] = [focusNodeId && doc.nodes[focusNodeId] ? focusNodeId : doc.rootId];

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
        remoteEditors: remoteEditorsByNode.get(nodeId) ?? [],
        onStartEditing: readOnly ? undefined : handleStartEditing,
        onToggleCollapse: handleToggleCollapse,
        onSelect: handleSelect,
      };

      rfNodes.push({
        id: nodeId,
        type: 'mindmap',
        position: node.position,
        data: nodeData as unknown as Record<string, unknown>,
        selected: nodeId === selectedNodeId,
        // Explicit dimensions for MiniMap (getBoundingClientRect returns 0 in extension host)
        measured: {
          width: estimateNodeWidth(node, nodeId === doc.rootId),
          height: estimateNodeHeight(node),
        },
        style: { width: estimateNodeWidth(node, nodeId === doc.rootId) },
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
    focusNodeId,
    awarenessRevision,
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
        dispatch({ type: 'UPDATE_POSITIONS', positions: positionChanges, pin: true });
        markDirty();
      }
    },
    [dispatch, markDirty]
  );

  // Drag-to-reparent: when a node is dropped, check if it overlaps another node
  const REPARENT_DISTANCE = 120;
  const onNodeDragStop: OnNodeDrag = useCallback(
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
  const [searchIndex, setSearchIndex] = useState(-1);
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

  useEffect(() => setSearchIndex(-1), [searchQuery]);

  const selectSearchResult = useCallback((index: number) => {
    if (searchResults.length === 0) return;
    const normalized = (index + searchResults.length) % searchResults.length;
    const result = searchResults[normalized];
    setSearchIndex(normalized);
    setFocusNodeId(null);
    dispatch({ type: 'EXPAND_PATH', nodeId: result.id });
    dispatch({ type: 'SET_SELECTED', nodeId: result.id });
    setCenter(
      result.position.x + estimateNodeWidth(result, result.id === state.document.rootId) / 2,
      result.position.y + 28,
      { zoom: Math.max(getZoom(), 0.8), duration: 250 },
    );
  }, [searchResults, dispatch, setCenter, getZoom, state.document.rootId]);

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
    const nodes = Object.fromEntries(
      Object.entries(stateRef.current.document.nodes).map(([id, node]) => [id, { ...node, pinned: false }]),
    );
    dispatch({
      type: 'APPLY_DOCUMENT',
      document: { ...stateRef.current.document, nodes },
    });
    pendingFitViewRef.current = true;
    setNeedsLayout(true);
    markDirty();
  }, [dispatch, markDirty]);

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
                    e.preventDefault();
                    selectSearchResult(searchIndex < 0 ? (e.shiftKey ? -1 : 0) : searchIndex + (e.shiftKey ? -1 : 1));
                  }
                }}
                placeholder="Search nodes..."
              />
              {searchQuery && (
                <span className="mindmap-search-count">
                  {searchResults.length === 0 ? 'No matches' : `${Math.max(0, searchIndex + 1)}/${searchResults.length}`}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="mindmap-toolbar-actions">
          {!readOnly && (
            <select
              className="mindmap-toolbar-select"
              value={state.document.metadata.layout}
              onChange={(event) => {
                dispatch({
                  type: 'APPLY_DOCUMENT',
                  document: {
                    ...state.document,
                    metadata: { ...state.document.metadata, layout: event.target.value as 'balanced' | 'right' },
                  },
                });
                pendingFitViewRef.current = true;
                setNeedsLayout(true);
                markDirty();
              }}
              title="Map layout"
            >
              <option value="balanced">Balanced</option>
              <option value="right">Right logical</option>
            </select>
          )}
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
          {selectedNode && selectedNode.id !== state.document.rootId && (
            <button
              className={`mindmap-toolbar-btn ${focusNodeId ? 'active' : ''}`}
              onClick={() => setFocusNodeId(focusNodeId ? null : selectedNode.id)}
              title="Focus selected branch (Ctrl/Cmd+.)"
            >
              {focusNodeId ? 'Exit Focus' : 'Focus'}
            </button>
          )}
          {!readOnly && (
            <button
              className="mindmap-toolbar-btn"
              onClick={handleAutoLayout}
              title="Tidy all nodes and clear manual position pins"
            >
              Tidy Map
            </button>
          )}
          <button
            className="mindmap-toolbar-btn"
            onClick={() => fitView({ padding: 0.2, duration: 300 })}
            title="Fit to view"
          >
            Fit View
          </button>
          <button
            className="mindmap-toolbar-btn"
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts (?)"
          >
            ?
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
            onPaneClick={() => { dispatch({ type: 'SET_SELECTED', nodeId: null }); setOnboardingDismissed(true); }}
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
      {showShortcuts && (
        <div className="mindmap-modal-backdrop" onMouseDown={() => setShowShortcuts(false)}>
          <div className="mindmap-shortcuts" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Mindmap keyboard shortcuts">
            <div className="mindmap-shortcuts-header">
              <strong>Keyboard shortcuts</strong>
              <button onClick={() => setShowShortcuts(false)} aria-label="Close">×</button>
            </div>
            <div className="mindmap-shortcuts-grid">
              <kbd>Tab</kbd><span>Create child</span>
              <kbd>Enter</kbd><span>Create sibling</span>
              <kbd>Shift+Enter</kbd><span>Create sibling above</span>
              <kbd>Shift+Tab</kbd><span>Outdent</span>
              <kbd>Alt+Tab</kbd><span>Indent under previous sibling</span>
              <kbd>Cmd/Ctrl+↑↓</kbd><span>Reorder siblings</span>
              <kbd>Arrows</kbd><span>Navigate spatially</span>
              <kbd>F2 / type</kbd><span>Edit title</span>
              <kbd>Space</kbd><span>Collapse or expand</span>
              <kbd>Cmd/Ctrl+F</kbd><span>Search</span>
              <kbd>Cmd/Ctrl+.</kbd><span>Focus branch</span>
              <kbd>Cmd/Ctrl+0</kbd><span>Fit map</span>
            </div>
          </div>
        </div>
      )}
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
