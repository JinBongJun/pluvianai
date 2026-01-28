'use client';

import { useMemo } from 'react';
import { clsx } from 'clsx';

interface MiniMapProps {
  nodes: Array<{ id: string; position: { x: number; y: number } }>;
  viewport: { x: number; y: number; zoom: number };
  className?: string;
}

export default function MiniMap({ nodes, viewport, className }: MiniMapProps) {
  // Calculate bounds
  const bounds = useMemo(() => {
    if (nodes.length === 0) return null;

    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [nodes]);

  if (!bounds || nodes.length === 0) {
    return null;
  }

  // Calculate viewport rectangle
  const viewportRect = {
    x: (viewport.x - bounds.minX) / bounds.width,
    y: (viewport.y - bounds.minY) / bounds.height,
    width: 1 / viewport.zoom,
    height: 1 / viewport.zoom,
  };

  return (
    <div
      className={clsx(
        'absolute bottom-4 right-4 bg-ag-surface border border-white/10 rounded-lg shadow-2xl p-2',
        className
      )}
      style={{ width: '200px', height: '150px' }}
    >
      <div className="relative w-full h-full">
        {/* Nodes */}
        {nodes.map((node) => {
          const x = ((node.position.x - bounds.minX) / bounds.width) * 100;
          const y = ((node.position.y - bounds.minY) / bounds.height) * 100;
          return (
            <div
              key={node.id}
              className="absolute w-2 h-2 bg-blue-500 rounded-full"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          );
        })}

        {/* Viewport indicator */}
        <div
          className="absolute border-2 border-blue-500 bg-blue-500 bg-opacity-20"
          style={{
            left: `${viewportRect.x * 100}%`,
            top: `${viewportRect.y * 100}%`,
            width: `${viewportRect.width * 100}%`,
            height: `${viewportRect.height * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
