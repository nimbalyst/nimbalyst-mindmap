import React, { useCallback, useState } from 'react';
import type { MindmapDocument, EditorAction } from './types';

interface OutlinePanelProps {
  document: MindmapDocument;
  selectedNodeId: string | null;
  collapsedNodeIds: Set<string>;
  dispatch: React.Dispatch<EditorAction>;
  onNeedsLayout: () => void;
  onDirty: () => void;
}

interface OutlineItemProps {
  nodeId: string;
  document: MindmapDocument;
  selectedNodeId: string | null;
  collapsedNodeIds: Set<string>;
  depth: number;
  dispatch: React.Dispatch<EditorAction>;
  onNeedsLayout: () => void;
  onDirty: () => void;
}

function OutlineItem({
  nodeId,
  document,
  selectedNodeId,
  collapsedNodeIds,
  depth,
  dispatch,
  onNeedsLayout,
  onDirty,
}: OutlineItemProps) {
  const node = document.nodes[nodeId];
  if (!node) return null;

  const isSelected = nodeId === selectedNodeId;
  const isCollapsed = collapsedNodeIds.has(nodeId);
  const hasChildren = node.childIds.length > 0;
  const isRoot = nodeId === document.rootId;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(node.text);

  const commitTitle = useCallback(() => {
    const text = draft.trim();
    if (text && text !== node.text) {
      dispatch({ type: 'UPDATE_NODE', nodeId, updates: { text } });
      onDirty();
    }
    setIsEditing(false);
  }, [draft, node.text, dispatch, nodeId, onDirty]);

  const handleClick = useCallback(() => {
    dispatch({ type: 'SET_SELECTED', nodeId });
  }, [dispatch, nodeId]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch({ type: 'TOGGLE_COLLAPSE', nodeId });
      onNeedsLayout();
    },
    [dispatch, nodeId, onNeedsLayout]
  );

  // Move up/down among siblings
  const handleMoveUp = useCallback(() => {
    if (!node.parentId) return;
    const parent = document.nodes[node.parentId];
    if (!parent) return;
    const idx = parent.childIds.indexOf(nodeId);
    if (idx <= 0) return;
    const newOrder = [...parent.childIds];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    dispatch({ type: 'REORDER_CHILDREN', parentId: node.parentId, childIds: newOrder });
    onNeedsLayout();
    onDirty();
  }, [node, nodeId, document.nodes, dispatch, onNeedsLayout, onDirty]);

  const handleMoveDown = useCallback(() => {
    if (!node.parentId) return;
    const parent = document.nodes[node.parentId];
    if (!parent) return;
    const idx = parent.childIds.indexOf(nodeId);
    if (idx < 0 || idx >= parent.childIds.length - 1) return;
    const newOrder = [...parent.childIds];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    dispatch({ type: 'REORDER_CHILDREN', parentId: node.parentId, childIds: newOrder });
    onNeedsLayout();
    onDirty();
  }, [node, nodeId, document.nodes, dispatch, onNeedsLayout, onDirty]);

  // Indent: make this node a child of its previous sibling
  const handleIndent = useCallback(() => {
    if (!node.parentId) return;
    const parent = document.nodes[node.parentId];
    if (!parent) return;
    const idx = parent.childIds.indexOf(nodeId);
    if (idx <= 0) return;
    const newParentId = parent.childIds[idx - 1];
    dispatch({ type: 'MOVE_NODE', nodeId, newParentId });
    onNeedsLayout();
    onDirty();
  }, [node, nodeId, document.nodes, dispatch, onNeedsLayout, onDirty]);

  // Outdent: make this node a sibling of its parent
  const handleOutdent = useCallback(() => {
    if (!node.parentId) return;
    const parent = document.nodes[node.parentId];
    if (!parent || !parent.parentId) return;
    const grandparent = document.nodes[parent.parentId];
    if (!grandparent) return;
    const parentIdx = grandparent.childIds.indexOf(parent.id);
    dispatch({ type: 'MOVE_NODE', nodeId, newParentId: parent.parentId, index: parentIdx + 1 });
    onNeedsLayout();
    onDirty();
  }, [node, nodeId, document.nodes, dispatch, onNeedsLayout, onDirty]);

  // Keyboard handling for outline items
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isRoot) return;
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        handleMoveUp();
      } else if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        handleMoveDown();
      } else if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        handleIndent();
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        handleOutdent();
      }
    },
    [isRoot, handleMoveUp, handleMoveDown, handleIndent, handleOutdent]
  );

  return (
    <div className="outline-item-wrapper">
      <div
        className={`outline-item ${isSelected ? 'outline-item-selected' : ''}`}
        style={{ paddingLeft: depth * 20 + 8 }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {hasChildren ? (
          <button className="outline-toggle" onClick={handleToggle}>
            {isCollapsed ? '\u25B6' : '\u25BC'}
          </button>
        ) : (
          <span className="outline-toggle-spacer" />
        )}
        {isEditing ? (
          <input
            className="outline-edit-input"
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitTitle}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') commitTitle();
              if (event.key === 'Escape') {
                setDraft(node.text);
                setIsEditing(false);
              }
            }}
          />
        ) : (
          <span
            className="outline-text"
            title={node.note || node.text}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setDraft(node.text);
              setIsEditing(true);
            }}
          >
            {node.text || 'Untitled'}
            {node.note && <span className="outline-note-indicator"> ···</span>}
          </span>
        )}
        {isSelected && !isRoot && (
          <div className="outline-actions">
            <button
              className="outline-action-btn"
              onClick={(e) => { e.stopPropagation(); handleMoveUp(); }}
              title="Move up (Alt+Up)"
            >
              &#x25B2;
            </button>
            <button
              className="outline-action-btn"
              onClick={(e) => { e.stopPropagation(); handleMoveDown(); }}
              title="Move down (Alt+Down)"
            >
              &#x25BC;
            </button>
            <button
              className="outline-action-btn"
              onClick={(e) => { e.stopPropagation(); handleIndent(); }}
              title="Indent (Tab)"
            >
              &#x21E5;
            </button>
            <button
              className="outline-action-btn"
              onClick={(e) => { e.stopPropagation(); handleOutdent(); }}
              title="Outdent (Shift+Tab)"
            >
              &#x21E4;
            </button>
          </div>
        )}
        {!isSelected && node.childIds.length > 0 && (
          <span className="outline-count">{node.childIds.length}</span>
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <div className="outline-children">
          {node.childIds.map((childId) => (
            <OutlineItem
              key={childId}
              nodeId={childId}
              document={document}
              selectedNodeId={selectedNodeId}
              collapsedNodeIds={collapsedNodeIds}
              depth={depth + 1}
              dispatch={dispatch}
              onNeedsLayout={onNeedsLayout}
              onDirty={onDirty}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OutlinePanel({
  document,
  selectedNodeId,
  collapsedNodeIds,
  dispatch,
  onNeedsLayout,
  onDirty,
}: OutlinePanelProps) {
  return (
    <div className="outline-panel">
      <div className="outline-header">
        <span className="outline-header-text">Outline</span>
        <span className="outline-header-hint">Tab/Shift+Tab to indent, Alt+Arrows to reorder</span>
      </div>
      <div className="outline-content">
        <OutlineItem
          nodeId={document.rootId}
          document={document}
          selectedNodeId={selectedNodeId}
          collapsedNodeIds={collapsedNodeIds}
          depth={0}
          dispatch={dispatch}
          onNeedsLayout={onNeedsLayout}
          onDirty={onDirty}
        />
      </div>
    </div>
  );
}
