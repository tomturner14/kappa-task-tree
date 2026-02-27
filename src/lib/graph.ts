import type { Task } from "../types";

type Node = { id: string; label: string; depth: number };
type Edge = { id: string; source: string; target: string };

// でかいタスク網で固まるのを避ける安全弁
const MAX_NODES = 200;

export function buildPrereqGraph(all: Task[], targetId: string) {
  const byId = new Map(all.map((t) => [t.id, t] as const));

  const edges: Edge[] = [];
  const nodes = new Map<string, Node>();

  const inStack = new Set<string>();

  function dfs(id: string) {
    if (nodes.size >= MAX_NODES) return;
    if (inStack.has(id)) throw new Error(`cycle detected at ${id}`);

    const t = byId.get(id);
    if (!t) return;

    if (!nodes.has(id)) {
      nodes.set(id, { id, label: t.name, depth: 0 });
    }

    inStack.add(id);

    for (const pre of t.prerequisites) {
      if (!byId.get(pre)) continue;

      // ノード作成
      if (!nodes.has(pre)) {
        const preTask = byId.get(pre);
        if (preTask) nodes.set(pre, { id: pre, label: preTask.name, depth: 0 });
      }

      // エッジ（pre -> id）
      edges.push({ id: `${pre}->${id}`, source: pre, target: id });

      // 再帰
      dfs(pre);
      if (nodes.size >= MAX_NODES) break;
    }

    inStack.delete(id);
  }

  dfs(targetId);

  // depthを「前提からの最長距離」で計算
  // depth(node) = max(depth(pre)+1)  / prereqが無い(or未知)なら0
  const memo = new Map<string, number>();

  function calcDepth(id: string): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;

    const t = byId.get(id);
    if (!t) {
      memo.set(id, 0);
      return 0;
    }

    // グラフ内に存在する前提だけ見る
    const pres = t.prerequisites.filter((p) => nodes.has(p));

    if (pres.length === 0) {
      memo.set(id, 0);
      return 0;
    }

    let best = 0;
    for (const p of pres) {
      best = Math.max(best, calcDepth(p) + 1);
    }
    memo.set(id, best);
    return best;
  }

  for (const id of nodes.keys()) {
    const d = calcDepth(id);
    const n = nodes.get(id)!;
    nodes.set(id, { ...n, depth: d });
  }

  // エッジ重複削除（同じのが入る可能性があるので）
  const uniqEdgesMap = new Map<string, Edge>();
  for (const e of edges) uniqEdgesMap.set(e.id, e);

  return { nodes: Array.from(nodes.values()), edges: Array.from(uniqEdgesMap.values()) };
}