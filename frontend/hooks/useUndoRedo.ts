import { useState, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

interface HistorySnapshot {
    nodes: Node[];
    edges: Edge[];
    selectedNodeId: string | null;
}

interface UseUndoRedoReturn {
    undo: (currentNodes: Node[], currentEdges: Edge[], currentSelectedNodeId: string | null) => void;
    redo: (currentNodes: Node[], currentEdges: Edge[], currentSelectedNodeId: string | null) => void;
    takeSnapshot: (nodes: Node[], edges: Edge[], selectedNodeId: string | null) => void;
    canUndo: boolean;
    canRedo: boolean;
}

export const useUndoRedo = (
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>
): UseUndoRedoReturn => {
    const [past, setPast] = useState<HistorySnapshot[]>([]);
    const [future, setFuture] = useState<HistorySnapshot[]>([]);

    const takeSnapshot = useCallback((nodes: Node[], edges: Edge[], selectedNodeId: string | null) => {
        setPast((oldPast) => {
            // Limit history size to 50
            const newPast = [...oldPast, { nodes, edges, selectedNodeId }];
            if (newPast.length > 50) newPast.shift();
            return newPast;
        });
        setFuture([]);
    }, []);

    const undo = useCallback((currentNodes: Node[], currentEdges: Edge[], currentSelectedNodeId: string | null) => {
        setPast((oldPast) => {
            if (oldPast.length === 0) return oldPast;

            const newPast = [...oldPast];
            const previousState = newPast.pop();

            if (previousState) {
                // Save current state to future
                setFuture((oldFuture) => [{ nodes: currentNodes, edges: currentEdges, selectedNodeId: currentSelectedNodeId }, ...oldFuture]);

                // Restore previous state
                setNodes(previousState.nodes);
                setEdges(previousState.edges);
                setSelectedNodeId(previousState.selectedNodeId);

                return newPast;
            }
            return oldPast;
        });
    }, [setNodes, setEdges, setSelectedNodeId]); // Dependencies: setters remain stable

    const redo = useCallback((currentNodes: Node[], currentEdges: Edge[], currentSelectedNodeId: string | null) => {
        setFuture((oldFuture) => {
            if (oldFuture.length === 0) return oldFuture;

            const newFuture = [...oldFuture];
            const nextState = newFuture.shift();

            if (nextState) {
                // Save current state to past
                setPast((oldPast) => [...oldPast, { nodes: currentNodes, edges: currentEdges, selectedNodeId: currentSelectedNodeId }]);

                // Restore next state
                setNodes(nextState.nodes);
                setEdges(nextState.edges);
                setSelectedNodeId(nextState.selectedNodeId);

                return newFuture;
            }
            return oldFuture;
        });
    }, [setNodes, setEdges, setSelectedNodeId]);

    return {
        undo,
        redo,
        takeSnapshot,
        canUndo: past.length > 0,
        canRedo: future.length > 0
    };
};
