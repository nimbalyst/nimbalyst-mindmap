import React, { useCallback } from 'react';
import type { MindmapNode, NodeColor, NodeStatus, EditorAction } from './types';

interface InspectorProps {
  node: MindmapNode | null;
  dispatch: React.Dispatch<EditorAction>;
  onDirty: () => void;
}

const COLORS: { value: NodeColor; label: string; swatch: string }[] = [
  { value: 'default', label: 'Default', swatch: 'var(--nim-bg-secondary)' },
  { value: 'red', label: 'Red', swatch: 'var(--mindmap-red-border)' },
  { value: 'orange', label: 'Orange', swatch: 'var(--mindmap-orange-border)' },
  { value: 'yellow', label: 'Yellow', swatch: 'var(--mindmap-yellow-border)' },
  { value: 'green', label: 'Green', swatch: 'var(--mindmap-green-border)' },
  { value: 'blue', label: 'Blue', swatch: 'var(--mindmap-blue-border)' },
  { value: 'purple', label: 'Purple', swatch: 'var(--mindmap-purple-border)' },
  { value: 'pink', label: 'Pink', swatch: 'var(--mindmap-pink-border)' },
];

const STATUSES: { value: NodeStatus; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'idea', label: 'Idea' },
  { value: 'question', label: 'Question' },
  { value: 'todo', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

export function Inspector({ node, dispatch, onDirty }: InspectorProps) {
  const updateNode = useCallback(
    (updates: Partial<MindmapNode>) => {
      if (!node) return;
      dispatch({ type: 'UPDATE_NODE', nodeId: node.id, updates });
      onDirty();
    },
    [node, dispatch, onDirty]
  );

  if (!node) {
    return (
      <div className="inspector">
        <div className="inspector-empty">
          <span className="inspector-empty-text">Select a node to edit</span>
        </div>
      </div>
    );
  }

  return (
    <div className="inspector">
      <div className="inspector-section">
        <label className="inspector-label">Title</label>
        <input
          className="inspector-input"
          value={node.text}
          onChange={(e) => updateNode({ text: e.target.value })}
          placeholder="Node title"
        />
      </div>

      <div className="inspector-section">
        <label className="inspector-label">Notes</label>
        <textarea
          className="inspector-textarea"
          value={node.note}
          onChange={(e) => updateNode({ note: e.target.value })}
          placeholder="Add notes..."
          rows={4}
        />
      </div>

      <div className="inspector-section">
        <label className="inspector-label">Status</label>
        <select
          className="inspector-select"
          value={node.status}
          onChange={(e) => updateNode({ status: e.target.value as NodeStatus })}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="inspector-section">
        <label className="inspector-label">Color</label>
        <div className="inspector-colors">
          {COLORS.map((c) => (
            <button
              key={c.value}
              className={`inspector-color-swatch ${node.color === c.value ? 'active' : ''}`}
              style={{ background: c.swatch }}
              onClick={() => updateNode({ color: c.value })}
              title={c.label}
            />
          ))}
        </div>
      </div>

      <div className="inspector-section">
        <label className="inspector-label">Tags</label>
        <input
          className="inspector-input"
          value={node.tags.join(', ')}
          onChange={(e) => {
            const tags = e.target.value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
            updateNode({ tags });
          }}
          placeholder="tag1, tag2, ..."
        />
      </div>

      <div className="inspector-section">
        <label className="inspector-label">Related link or workspace path</label>
        <input
          className="inspector-input"
          value={node.link}
          onChange={(e) => updateNode({ link: e.target.value })}
          placeholder="https://… or path/to/file.md"
        />
      </div>

      <div className="inspector-section inspector-position-row">
        <label className="inspector-checkbox">
          <input
            type="checkbox"
            checked={node.pinned}
            onChange={(event) => updateNode({ pinned: event.target.checked })}
          />
          Preserve manual position
        </label>
      </div>

      <div className="inspector-section inspector-meta">
        <span className="inspector-meta-text">ID: {node.id}</span>
        <span className="inspector-meta-text">
          Children: {node.childIds.length}
        </span>
      </div>
    </div>
  );
}
