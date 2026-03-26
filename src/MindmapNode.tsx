import React, { useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { MindmapNode as MindmapNodeType, NodeColor } from './types';

export interface MindmapNodeData {
  node: MindmapNodeType;
  isRoot: boolean;
  isSelected: boolean;
  isCollapsed: boolean;
  isLeftSide: boolean;
  childCount: number;
  onStartEditing?: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
}

const COLOR_MAP: Record<NodeColor, string> = {
  default: 'var(--nim-bg-secondary)',
  red: 'var(--mindmap-red)',
  orange: 'var(--mindmap-orange)',
  yellow: 'var(--mindmap-yellow)',
  green: 'var(--mindmap-green)',
  blue: 'var(--mindmap-blue)',
  purple: 'var(--mindmap-purple)',
  pink: 'var(--mindmap-pink)',
};

const COLOR_BORDER_MAP: Record<NodeColor, string> = {
  default: 'var(--nim-border)',
  red: 'var(--mindmap-red-border)',
  orange: 'var(--mindmap-orange-border)',
  yellow: 'var(--mindmap-yellow-border)',
  green: 'var(--mindmap-green-border)',
  blue: 'var(--mindmap-blue-border)',
  purple: 'var(--mindmap-purple-border)',
  pink: 'var(--mindmap-pink-border)',
};

const STATUS_ICONS: Record<string, string> = {
  idea: '\u2728',
  question: '?',
  todo: '\u25CB',
  'in-progress': '\u25D4',
  done: '\u2713',
};

export function MindmapNodeComponent({ data, id }: NodeProps) {
  const d = data as unknown as MindmapNodeData;

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      d.onStartEditing?.(id);
    },
    [d, id]
  );

  const bgColor = COLOR_MAP[d.node.color] || COLOR_MAP.default;
  const borderColor = COLOR_BORDER_MAP[d.node.color] || COLOR_BORDER_MAP.default;
  const statusIcon = d.node.status !== 'none' ? STATUS_ICONS[d.node.status] : null;

  const sourcePos = d.isRoot ? Position.Right : d.isLeftSide ? Position.Left : Position.Right;
  const targetPos = d.isRoot ? Position.Left : d.isLeftSide ? Position.Right : Position.Left;

  return (
    <div
      className={`mindmap-node ${d.isRoot ? 'mindmap-node-root' : ''} ${d.isSelected ? 'mindmap-node-selected' : ''}`}
      style={{
        background: bgColor,
        borderColor: d.isSelected ? 'var(--nim-primary)' : borderColor,
      }}
      onDoubleClick={handleDoubleClick}
    >
      <Handle type="target" position={targetPos} className="mindmap-handle" />

      <div className="mindmap-node-content">
        {statusIcon && (
          <span className="mindmap-node-status">{statusIcon}</span>
        )}

        <span className="mindmap-node-text">
          {d.node.text || 'Untitled'}
        </span>

        {d.childCount > 0 && (
          <button
            className="mindmap-node-collapse"
            onClick={(e) => {
              e.stopPropagation();
              d.onToggleCollapse(id);
            }}
          >
            {d.isCollapsed ? `+${d.childCount}` : '\u2212'}
          </button>
        )}
      </div>

      {d.node.tags.length > 0 && (
        <div className="mindmap-node-tags">
          {d.node.tags.map((tag) => (
            <span key={tag} className="mindmap-node-tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      <Handle type="source" position={sourcePos} className="mindmap-handle" />
      {d.isRoot && (
        <>
          <Handle type="source" position={Position.Left} id="left" className="mindmap-handle" />
        </>
      )}
    </div>
  );
}
