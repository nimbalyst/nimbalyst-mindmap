import React from 'react';
import { type EdgeProps } from '@xyflow/react';

export function MindmapEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) {
  // Custom smooth bezier curve
  const dx = targetX - sourceX;
  const controlOffset = Math.max(Math.abs(dx) * 0.5, 40);

  const path = `M ${sourceX} ${sourceY} C ${sourceX + Math.sign(dx) * controlOffset} ${sourceY}, ${targetX - Math.sign(dx) * controlOffset} ${targetY}, ${targetX} ${targetY}`;

  return (
    <path
      id={id}
      className="mindmap-edge"
      d={path}
      fill="none"
    />
  );
}
