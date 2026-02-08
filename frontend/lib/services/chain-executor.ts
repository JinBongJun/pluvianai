import { Edge, Node } from 'reactflow';
import { TestLabBoxNodeData } from '@/components/test-lab/TestLabBoxNode';
import { InputNodeData } from '@/components/test-lab/InputNode';
import { ContentBlock } from '@/types/test-lab/content-blocks';

type ChainNode = Node<TestLabBoxNodeData | InputNodeData | any>;

export class ChainExecutor {
    private nodes: ChainNode[];
    private edges: Edge[];
    private executionLog: string[] = [];
    private onStatusChange?: (nodeId: string, status: 'idle' | 'running' | 'completed' | 'error') => void;

    constructor(
        nodes: ChainNode[],
        edges: Edge[],
        onStatusChange?: (nodeId: string, status: 'idle' | 'running' | 'completed' | 'error') => void
    ) {
        this.nodes = nodes;
        this.edges = edges;
        this.onStatusChange = onStatusChange;
    }

    // Topological Sort to determine execution order
    public getExecutionOrder(): ChainNode[] {
        const adj: Record<string, string[]> = {};
        const inDegree: Record<string, number> = {};

        this.nodes.forEach(n => {
            adj[n.id] = [];
            inDegree[n.id] = 0;
        });

        this.edges.forEach(e => {
            if (adj[e.source]) adj[e.source].push(e.target);
            inDegree[e.target] = (inDegree[e.target] || 0) + 1;
        });

        const queue: string[] = [];
        this.nodes.forEach(n => {
            if (inDegree[n.id] === 0) {
                queue.push(n.id);
            }
        });

        const sorted: ChainNode[] = [];
        while (queue.length > 0) {
            const u = queue.shift()!;
            const node = this.nodes.find(n => n.id === u);
            if (node) sorted.push(node);

            adj[u]?.forEach(v => {
                inDegree[v]--;
                if (inDegree[v] === 0) {
                    queue.push(v);
                }
            });
        }

        if (sorted.length !== this.nodes.length) {
            const remainingIds = this.nodes.map(n => n.id).filter(id => !sorted.find(s => s.id === id));
            // Simple cycle detection fallback log
            console.warn('Cycle or disconnected components detected. Remaining nodes:', remainingIds);
            // We might return what we have or throw. For now, strict:
            if (sorted.length === 0 && this.nodes.length > 0) {
                throw new Error('Cycle detected or no start node found!');
            }
            // If purely disconnected islands, topological sort should still work if we iterate all nodes logic in getExecutionOrder.
            // My current logic only starts from inDegree 0. Cycles will result in running out of queue.
            if (sorted.length !== this.nodes.length) {
                throw new Error('Cycle detected in chain! Cannot execute.');
            }
        }

        return sorted;
    }

    public async executeStep(nodeId: string, inputs: ContentBlock[]): Promise<ContentBlock[]> {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) throw new Error(`Node ${nodeId} not found`);

        this.log(`Executing node: ${node.data.label} (${node.type})`);
        this.onStatusChange?.(nodeId, 'running');

        // Mock Execution Logic
        return new Promise((resolve) => {
            setTimeout(() => {
                if (node.type === 'inputNode') {
                    // Input Node just passes its configured inputs
                    const data = node.data as InputNodeData;

                    // Support for new Test Cases (Variables)
                    if (data.testCases && data.testCases.length > 0) {
                        // MVP: Use the first test case
                        const testCase = data.testCases[0];
                        // Look for standard keys or stringify
                        const content = testCase['input'] || testCase['query'] || JSON.stringify(testCase);

                        const result = [{
                            type: 'text',
                            id: `input-${Date.now()}`,
                            text: String(content)
                        }];

                        this.log(`-> Input (TestCase #1): "${String(content).slice(0, 50)}..."`);
                        this.onStatusChange?.(nodeId, 'completed');
                        resolve(result as any);
                        return;
                    }

                    // Legacy support
                    this.log(`-> Input passed: ${data.inputs?.length || 0} blocks`);
                    this.onStatusChange?.(nodeId, 'completed');
                    resolve(data.inputs || []);
                } else if (node.type === 'testLabBox') {
                    // Agent Box "processes" inputs (Mock)
                    this.log(`-> Agent ${node.data.label} processing...`);
                    // Helper to stringify inputs for mock response
                    const inputSummary = inputs.map(b => b.type).join(', ');
                    const result = [
                        {
                            type: 'text',
                            id: 'res-' + Date.now(),
                            text: `Output from ${node.data.label} (processed ${inputs.length} inputs: ${inputSummary})`
                        }
                    ];
                    this.onStatusChange?.(nodeId, 'completed');
                    resolve(result as any);
                } else if (node.type === 'outputNode') {
                    // Output Node records result
                    this.log(`-> Evaluation recorded.`);
                    this.onStatusChange?.(nodeId, 'completed');
                    resolve(inputs);
                } else {
                    this.onStatusChange?.(nodeId, 'completed');
                    resolve([]);
                }
            }, 1000); // Simulate 1s latency
        });
    }

    private log(message: string) {
        console.log(`[ChainExecutor] ${message}`);
        this.executionLog.push(message);
    }

    public getLogs() {
        return this.executionLog;
    }
}
