import React, { useState } from 'react';
import {
    EdgeProps,
    getSmoothStepPath,
    EdgeLabelRenderer,
    BaseEdge
} from 'reactflow';

export const TestLabEdge: React.FC<EdgeProps> = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data
}) => {
    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const [order, setOrder] = useState(data?.order || 1);
    const [isEditing, setIsEditing] = useState(false);

    const handleBadgeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
    };

    const handleOrderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val)) setOrder(val);
    };

    const handleBlur = () => setIsEditing(false);

    return (
        <>
            <BaseEdge
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    ...style,
                    stroke: '#8b5cf6', // Indigo/Purple theme matching Agent edges
                    strokeWidth: 2,
                    filter: 'drop-shadow(0 0 5px rgba(139,92,246,0.2))'
                }}
            />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan"
                >
                    <div
                        onClick={handleBadgeClick}
                        className={`w-6 h-6 rounded-full border border-violet-500/50 bg-[#0a0a0c] flex items-center justify-center text-[10px] font-bold text-violet-400 cursor-pointer hover:scale-110 transition-transform shadow-[0_0_10px_rgba(139,92,246,0.3)] ${isEditing ? 'ring-2 ring-violet-500' : ''}`}
                    >
                        {isEditing ? (
                            <input
                                autoFocus
                                type="number"
                                value={order}
                                onChange={handleOrderChange}
                                onBlur={handleBlur}
                                className="w-full bg-transparent text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        ) : (
                            order
                        )}
                    </div>
                </div>
            </EdgeLabelRenderer>
        </>
    );
};
