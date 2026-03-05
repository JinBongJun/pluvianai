import { Connection, Node } from "reactflow";

/**
 * Clinical Validation Rules for Node Connections
 * Enforces strict directional data flow based on node types and specific handle IDs.
 */
export const checkClinicalConnection = (
  connection: Connection,
  sourceNode?: Node,
  targetNode?: Node
): boolean => {
  if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) return false;

  const sourceType = sourceNode.type;
  const targetType = targetNode.type;
  const sourceHandle = connection.sourceHandle;
  const targetHandle = connection.targetHandle;

  // --- 1. Input (Start) Node Rules ---
  if (sourceType === "inputNode") {
    // Must use the standardized start-egress handle
    if (sourceHandle !== "start-egress") return false;

    return (
      (targetType === "agentCard" && targetHandle === "logic-ingress") ||
      (targetType === "routerNode" && targetHandle === "router-ingress") ||
      (targetType === "approvalNode" && targetHandle === "approval-ingress")
    );
  }

  // --- 2. Agent (Box) Node Rules ---
  if (sourceType === "agentCard") {
    // Main Output -> Anything structural except Start
    if (sourceHandle === "relay-result") {
      return (
        (targetType === "agentCard" && targetHandle === "logic-ingress") ||
        (targetType === "evalNode" && targetHandle === "specimen-target") ||
        (targetType === "routerNode" && targetHandle === "router-ingress") ||
        (targetType === "approvalNode" && targetHandle === "approval-ingress")
      );
    }
    // External Call -> Router Ingress, Helper Response
    if (sourceHandle === "helper-request") {
      return (
        (targetType === "routerNode" && targetHandle === "router-ingress") ||
        (targetType === "agentCard" && targetHandle === "helper-response")
      );
    }
  }

  // --- 3. Evaluator Node Rules ---
  if (sourceType === "evalNode") {
    // Only flows into logic or decision gates
    if (sourceHandle === "scoring-feed") {
      return (
        (targetType === "agentCard" && targetHandle === "logic-ingress") ||
        (targetType === "routerNode" && targetHandle === "router-ingress") ||
        (targetType === "approvalNode" && targetHandle === "approval-ingress")
      );
    }
  }

  // --- 4. Router Node Rules ---
  if (sourceType === "routerNode") {
    return (
      (sourceHandle?.startsWith("router-output-") || false) &&
      ((targetType === "agentCard" &&
        (targetHandle === "logic-ingress" || targetHandle === "helper-response")) ||
        (targetType === "evalNode" && targetHandle === "specimen-target") ||
        (targetType === "routerNode" && targetHandle === "router-ingress") ||
        (targetType === "approvalNode" && targetHandle === "approval-ingress"))
    );
  }

  // --- 5. Approval Gate Rules ---
  if (sourceType === "approvalNode") {
    if (sourceHandle !== "approval-egress") return false;

    return (
      (targetType === "agentCard" && targetHandle === "logic-ingress") ||
      (targetType === "evalNode" && targetHandle === "specimen-target") ||
      (targetType === "routerNode" && targetHandle === "router-ingress")
    );
  }

  return false; // Default to blocked if no rule matches
};
