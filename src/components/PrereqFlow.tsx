import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import type { Task } from "../types";
import { buildPrereqGraph } from "../lib/graph";

export function PrereqFlow({
  all,
  targetId,
}: {
  all: Task[];
  targetId: string;
}) {
  const { nodes, edges } = useMemo(
    () => buildPrereqGraph(all, targetId),
    [all, targetId]
  );

  // 常に縦並び
  // - depth昇順（前提が上、目的が下）
  // - depth同じなら label で安定ソート
  const ordered = useMemo(() => {
    return [...nodes].sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.label.localeCompare(b.label);
    });
  }, [nodes]);

  const rfNodes: Node[] = ordered.map((n, idx) => {
    return {
      id: n.id,
      position: {
        x: 0,
        y: idx * 90,
      },
      data: { label: n.label },
      style: { borderRadius: 10, padding: 6, border: "1px solid #ddd" },
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));

  return (
    <div style={{ width: "100%", height: 420, border: "1px solid #eee", borderRadius: 8 }}>
      <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}