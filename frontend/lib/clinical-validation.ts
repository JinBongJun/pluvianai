import { Connection, Node } from 'reactflow';

/**
 * Clinical Validation Rules for Node Connections
 */
export const checkClinicalConnection = (
    connection: Connection,
    sourceNode?: Node,
    targetNode?: Node
): boolean => {
    if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) return false;

    const sourceType = sourceNode.type;
    const targetType = targetNode.type;

    // Clinical Rules:
    // 1. Input (Start) -> Agent, Router, Approval
    if (sourceType === 'inputNode') {
        return ['agentCard', 'routerNode', 'approvalNode'].includes(targetType || '');
    }

    // 2. Agent -> Everything except Input
    if (sourceType === 'agentCard') {
        return targetType !== 'inputNode';
    }

    // 3. Evaluator -> Agent, Router, Approval
    if (sourceType === 'evalNode') {
        return ['agentCard', 'routerNode', 'approvalNode'].includes(targetType || '');
    }

    // 4. Router -> Agent, Eval, Approval
    if (sourceType === 'routerNode') {
        return ['agentCard', 'evalNode', 'approvalNode'].includes(targetType || '');
    }

    // 5. Approval Gate -> Agent, Eval, Router
    if (sourceType === 'approvalNode') {
        return ['agentCard', 'evalNode', 'routerNode'].includes(targetType || '');
    }

    return true;
};
