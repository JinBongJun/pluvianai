import React, { useState } from 'react';
import {
    EdgeProps,
    getSmoothStepPath,
    EdgeLabelRenderer,
    BaseEdge
} from 'reactflow';
import clsx from 'clsx';

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

    const edgeType = data?.type || 'default';
    const isLoop = edgeType === 'loop';
    const isRequest = data?.sourceHandle === 'helper-request';
    const isResponse = data?.targetHandle === 'helper-response';

    const getEdgeColor = () => {
        if (isLoop) return '#ef4444'; // Red for loops/retries
        if (isRequest) return '#a78bfa'; // Purple for helper requests
        if (isResponse) return '#22d3ee'; // Cyan for helper responses
        return '#8b5cf6'; // Default violet
    };

    const edgeColor = getEdgeColor();

    return (
        <>
            <BaseEdge
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    ...style,
                    stroke: edgeColor,
                    strokeWidth: isLoop ? 2 : 2,
                    strokeDasharray: isLoop ? '5,5' : '0',
                    filter: `drop-shadow(0 0 8px ${edgeColor}44)`
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
                        className={clsx(
                            "min-w-6 h-6 px-1.5 rounded-full border bg-[#0a0a0c] flex items-center justify-center text-[10px] font-bold cursor-pointer hover:scale-110 transition-transform shadow-lg",
                            isLoop ? "border-red-500/50 text-red-400 shadow-red-500/20" :
                                isRequest ? "border-violet-500/50 text-violet-400 shadow-violet-500/20" :
                                    isResponse ? "border-cyan-500/50 text-cyan-400 shadow-cyan-500/20" :
                                        "border-violet-500/50 text-violet-400 shadow-violet-500/20",
                            isEditing && "ring-2 ring-violet-500"
                        )}
                    >
                        {isEditing ? (
                            <input
                                autoFocus
                                type="number"
                                value={order}
                                onChange={handleOrderChange}
                                onBlur={handleBlur}
                                className="w-8 bg-transparent text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        ) : (
                            <div className="flex items-center gap-1">
                                {isLoop && <span className="text-[8px] opacity-70">MAX:</span>}
                                {order}
                            </div>
                        )}
                    </div>
                </div>
            </EdgeLabelRenderer>
        </>
    );
};
