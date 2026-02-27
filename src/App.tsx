import { useEffect, useMemo, useRef, useState } from "react";
import tasks from "./data/tasks.json";
import type { Task } from "./types";
import { scoreTaskForNext, scoreTaskForStarter } from "./lib/priority";
import {
  loadDone,
  saveDone,
  loadSelectedId,
  saveSelectedId,
  loadQuery,
  saveQuery,
  loadPinned,
  savePinned,
} from "./lib/storage";
import { PrereqFlow } from "./components/PrereqFlow";

function toRank(score: number, max: number) {
  if (max <= 0) return "D";
  const r = score / max;
  if (r >= 0.85) return "S";
  if (r >= 0.7) return "A";
  if (r >= 0.55) return "B";
  if (r >= 0.4) return "C";
  return "D";
}

type StatusFilter = "all" | "todo" | "done";
type ReadyFilter = "all" | "ready" | "locked";
type TraderFilter = "all" | string;

const KEY_STATUS_FILTER = "kappa-task-tree.statusFilter";
const KEY_READY_FILTER = "kappa-task-tree.readyFilter";
const KEY_TRADER_FILTER = "kappa-task-tree.traderFilter";

function loadStatusFilter(): StatusFilter {
  try {
    const v = localStorage.getItem(KEY_STATUS_FILTER);
    if (v === "all" || v === "todo" || v === "done") return v;
    return "all";
  } catch {
    return "all";
  }
}
function saveStatusFilter(v: StatusFilter) {
  try {
    localStorage.setItem(KEY_STATUS_FILTER, v);
  } catch {
    // no-op
  }
}

function loadReadyFilter(): ReadyFilter {
  try {
    const v = localStorage.getItem(KEY_READY_FILTER);
    if (v === "all" || v === "ready" || v === "locked") return v;
    return "all";
  } catch {
    return "all";
  }
}
function saveReadyFilter(v: ReadyFilter) {
  try {
    localStorage.setItem(KEY_READY_FILTER, v);
  } catch {
    // no-op
  }
}

function loadTraderFilter(): TraderFilter {
  try {
    const v = localStorage.getItem(KEY_TRADER_FILTER);
    if (!v) return "all";
    return v;
  } catch {
    return "all";
  }
}
function saveTraderFilter(v: TraderFilter) {
  try {
    localStorage.setItem(KEY_TRADER_FILTER, v);
  } catch {
    // no-op
  }
}

export default function App() {
  const allTasks = tasks as Task[];

  const [done, setDone] = useState<Set<string>>(() => loadDone());
  const [query, setQuery] = useState(() => loadQuery());
  const [selectedId, setSelectedId] = useState<string | null>(() => loadSelectedId());

  // 右一覧用：フィルタ
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => loadStatusFilter());
  const [readyFilter, setReadyFilter] = useState<ReadyFilter>(() => loadReadyFilter());
  const [traderFilter, setTraderFilter] = useState<TraderFilter>(() => loadTraderFilter());

  // ピン止め
  const [pinned, setPinned] = useState<string[]>(() => loadPinned());

  // 選択中パネルに自動スクロール
  const selectedPanelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    selectedPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  const selectTask = (id: string | null) => {
    setSelectedId(id);
    saveSelectedId(id);
  };

  const toggleDone = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveDone(next);
      return next;
    });
  };

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      savePinned(next);
      return next;
    });
  };

  const isAvailable = (t: Task) => t.prerequisites.every((p) => done.has(p));

  // Kappa必須タスク（kappaRequired or tags:kappa）＋その前提タスクだけを表示対象にする
  const relevantIds = useMemo(() => {
    const byId = new Map(allTasks.map((t) => [t.id, t] as const));
    const roots = allTasks
      .filter((t) => t.kappaRequired || t.tags.includes("kappa"))
      .map((t) => t.id);

    const set = new Set<string>();
    const stack = [...roots];

    while (stack.length) {
      const id = stack.pop()!;
      if (set.has(id)) continue;
      set.add(id);

      const t = byId.get(id);
      if (!t) continue;

      for (const pre of t.prerequisites) {
        if (byId.has(pre) && !set.has(pre)) stack.push(pre);
      }
    }
    return set;
  }, [allTasks]);

  const displayTasks = useMemo(() => {
    return allTasks.filter((t) => relevantIds.has(t.id));
  }, [allTasks, relevantIds]);

  // トレーダー一覧（表示対象から作る）
  const traderOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of displayTasks) set.add(t.trader);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [displayTasks]);

  // traderFilter の整合性
  useEffect(() => {
    if (traderFilter === "all") return;
    if (traderOptions.includes(traderFilter)) return;
    setTraderFilter("all");
    saveTraderFilter("all");
  }, [traderFilter, traderOptions]);

  const resetFilters = () => {
    setQuery("");
    saveQuery("");

    setStatusFilter("all");
    saveStatusFilter("all");

    setReadyFilter("all");
    saveReadyFilter("all");

    setTraderFilter("all");
    saveTraderFilter("all");
  };

  const resetProgress = () => {
    const ok = window.confirm("完了状況（進捗）をすべてリセットします。よろしいですか？");
    if (!ok) return;
    const empty = new Set<string>();
    setDone(empty);
    saveDone(empty);
  };

  // JP Wiki 直リンク（例：Therapist/First in Line）
  const buildJpWikiUrl = (t: Task) => {
    const trader = encodeURIComponent(t.trader);
    const name = encodeURIComponent(t.name);
    return `https://wikiwiki.jp/eft/${trader}/${name}`;
  };

  // 右一覧用：状態 → 着手可 → トレーダー → 検索
  const filtered = useMemo(() => {
    let base = displayTasks;

    if (statusFilter === "todo") {
      base = base.filter((t) => !done.has(t.id));
    } else if (statusFilter === "done") {
      base = base.filter((t) => done.has(t.id));
    }

    if (statusFilter !== "done") {
      if (readyFilter === "ready") {
        base = base.filter((t) => isAvailable(t));
      } else if (readyFilter === "locked") {
        base = base.filter((t) => !isAvailable(t));
      }
    }

    if (traderFilter !== "all") {
      base = base.filter((t) => t.trader === traderFilter);
    }

    const q = query.trim().toLowerCase();
    if (!q) return base;

    return base.filter((t) => {
      const hay = `${t.name} ${t.trader} ${t.maps.join(" ")} ${t.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [displayTasks, statusFilter, readyFilter, traderFilter, done, query]);

  const shown = useMemo(() => filtered, [filtered]);

  // ピン止め表示用
  const pinnedTasks = useMemo(() => {
    const byId = new Map(allTasks.map((t) => [t.id, t] as const));
    return pinned.map((id) => byId.get(id)).filter(Boolean) as Task[];
  }, [displayTasks, pinned]);

  // “まずやる（導線）”
  const starterTop3 = useMemo(() => {
    return displayTasks
      .filter((t) => !done.has(t.id))
      .filter((t) => t.name.trim().toLowerCase() !== "collector")
      .map((t) => {
        const r = scoreTaskForStarter(t, displayTasks, done);
        return { t, ...r };
      })
      .filter((x) => x.isAvailable)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [displayTasks, done]);

  // “次にやる（効率）”
  const nextTop10 = useMemo(() => {
    return displayTasks
      .filter((t) => !done.has(t.id))
      .filter((t) => t.name.trim().toLowerCase() !== "collector")
      .map((t) => {
        const r = scoreTaskForNext(t, displayTasks, done);
        return { t, ...r };
      })
      .filter((x) => x.isAvailable)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [displayTasks, done]);

  const starterMax = starterTop3[0]?.score ?? 0;
  const nextMax = nextTop10[0]?.score ?? 0;

  const selected = useMemo(
    () => allTasks.find((t) => t.id === selectedId) ?? null,
    [allTasks, selectedId]
  );

  const linkButtonStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 8px",
    border: "1px solid #ccc",
    borderRadius: 6,
    textDecoration: "none",
    color: "inherit",
    fontSize: 12,
    height: 28,
    lineHeight: "28px",
  };

  const selectStyle: React.CSSProperties = {
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #ccc",
    height: 32,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.8,
    whiteSpace: "nowrap",
  };

  const dangerButtonStyle: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #a33",
    background: "#c33",
    color: "white",
    fontWeight: 600,
  };

  const badgeReadyStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid #2a8a50",
    background: "#e7f6ee",
    color: "#1b5e37",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };

  const badgeLockedStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid #bbb",
    background: "#f2f2f2",
    color: "#555",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };

  // 追加：タスク名横のJPリンク（小さめ）
  const miniJpLinkStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 8px",
    height: 20,
    borderRadius: 999,
    border: "1px solid #ccc",
    textDecoration: "none",
    color: "inherit",
    fontSize: 11,
    lineHeight: "20px",
    whiteSpace: "nowrap",
    opacity: 0.85,
  };

  // 並行枠（長期/先出し）判定用
  const bossTargets = new Set([
    "Killa",
    "Tagilla",
    "Sanitar",
    "Reshala",
    "Glukhar",
    "Shturman",
    "Zryachiy",
    "Kaban",
    "Kollontay",
    "Knight",
    "Big Pipe",
    "Birdeye",
  ]);

  function getParallelKind(t: Task): { kind: string; priority: number } | null {
    const name = t.name.toLowerCase();
    const targets = (t.targets ?? []).map((x) => String(x));

    // 1) 代表的な長期シリーズ（名前で判定）
    if (name.includes("test drive")) return { kind: "シリーズ: Test Drive", priority: 90 };
    if (name.includes("punisher")) return { kind: "シリーズ: Punisher", priority: 85 };
    if (name.includes("tarkov shooter")) return { kind: "シリーズ: Tarkov Shooter", priority: 80 };
    if (name.includes("shooter born")) return { kind: "長期: Shooter Born", priority: 78 };

    // 2) ボス/Goons系（targets or 名前で判定）
    const hitBoss = targets.find((x) => bossTargets.has(x));
    if (t.tags.includes("kills") && hitBoss) return { kind: `ボス: ${hitBoss}`, priority: 95 };

    // targetsに入ってない場合の保険（名前にボス名が入るケース）
    for (const b of bossTargets) {
      if (name.includes(b.toLowerCase())) return { kind: `ボス: ${b}`, priority: 92 };
    }

    // 3) Jaegerの狩猟系など（広めに拾いたい場合だけ）
    if (name.includes("huntsman path")) return { kind: "長期: Huntsman Path", priority: 70 };
    if (name.includes("stray dogs")) return { kind: "長期: Stray Dogs", priority: 75 };

    return null;
  }

  // 並行枠：未完了の長期タスクを上位表示（着手可を上に）
  const parallelFocus = useMemo(() => {
    return displayTasks
      .filter((t) => !done.has(t.id))
      .map((t) => {
        const k = getParallelKind(t);
        if (!k) return null;

        const available = isAvailable(t);
        const minLv = t.minPlayerLevel ?? 999;

        // 追加で絞りたいならここ（例：キル系/シリーズだけ）
        // if (!t.tags.includes("kills") && !t.name.toLowerCase().includes("test drive") && !t.name.toLowerCase().includes("punisher")) return null;

        return { t, kind: k.kind, p: k.priority, available, minLv };
      })
      .filter(Boolean) as { t: Task; kind: string; p: number; available: boolean; minLv: number }[];
  }, [displayTasks, done]);

  const parallelTop = useMemo(() => {
    return parallelFocus
      .sort((a, b) => {
        // 1) 重要度（ボス>シリーズ）
        if (b.p !== a.p) return b.p - a.p;
        // 2) 着手可を上
        if (Number(b.available) !== Number(a.available)) return Number(b.available) - Number(a.available);
        // 3) 低レベルを上
        if (a.minLv !== b.minLv) return a.minLv - b.minLv;
        // 4) 名前
        return a.t.name.localeCompare(b.t.name);
      })
      .slice(0, 10);
  }, [parallelFocus]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ margin: "0 0 12px" }}>Kappa Task Tree</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        {/* 左 */}
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Pinned（固定）</h2>

          {pinnedTasks.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
              ☆ を押すとここに固定されます
            </div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18, marginBottom: 12 }}>
              {pinnedTasks.map((t) => {
                const doneFlag = done.has(t.id);
                return (
                  <li key={t.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={() => togglePin(t.id)}>{pinned.includes(t.id) ? "★" : "☆"}</button>
                      <button onClick={() => selectTask(t.id)}>見る</button>
                      <button onClick={() => toggleDone(t.id)}>{doneFlag ? "未完了に戻す" : "完了"}</button>

                      <div style={{ minWidth: 0, opacity: doneFlag ? 0.5 : 1 }}>
                        {/* タスク名 + JP */}
                        <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {t.name}
                          </div>
                          <a
                            href={buildJpWikiUrl(t)}
                            target="_blank"
                            rel="noreferrer"
                            style={miniJpLinkStyle}
                            title="JP Wiki"
                          >
                            JP Wiki
                          </a>
                        </div>

                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {t.trader} / {t.maps.join(", ")} / {isAvailable(t) ? "着手可" : "未解放"}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <h2 style={{ margin: "12px 0 8px", fontSize: 16 }}>まずやる（導線Top3）</h2>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            対象：未完了かつ着手可能。基準：前提0・低Lv・導入導線を優先。
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, marginBottom: 12 }}>
            {starterTop3.map(({ t, score, unlockCount }) => (
              <li key={t.id} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => togglePin(t.id)}>{pinned.includes(t.id) ? "★" : "☆"}</button>
                  <button onClick={() => selectTask(t.id)}>見る</button>
                  <button onClick={() => toggleDone(t.id)}>完了</button>

                  <div style={{ minWidth: 0 }}>
                    {/* タスク名 + JP */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.name}
                      </div>
                      <a
                        href={buildJpWikiUrl(t)}
                        target="_blank"
                        rel="noreferrer"
                        style={miniJpLinkStyle}
                        title="JP Wiki"
                      >
                        JP Wiki
                      </a>
                    </div>

                    <div
                      style={{ fontSize: 12, opacity: 0.7 }}
                      title={`導線の優先度（ランク化）: rank=${toRank(score, starterMax)} / score=${score} / max=${starterMax}`}
                    >
                      前提:{t.prerequisites.length} / 最低Lv:{t.minPlayerLevel ?? "-"} / 解放:+{unlockCount} / 優先度:
                      {toRank(score, starterMax)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <h2 style={{ margin: "12px 0 8px", fontSize: 16 }}>次にやる（効率Top10）</h2>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            対象：未完了かつ着手可能。基準：完了で解放されるタスク数（解放）を優先。
          </div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {nextTop10.map(({ t, score, unlockCount }) => (
              <li key={t.id} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => togglePin(t.id)}>{pinned.includes(t.id) ? "★" : "☆"}</button>
                  <button onClick={() => selectTask(t.id)}>見る</button>
                  <button onClick={() => toggleDone(t.id)}>完了</button>

                  <div style={{ minWidth: 0 }}>
                    {/* タスク名 + JP */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.name}
                      </div>
                      <a
                        href={buildJpWikiUrl(t)}
                        target="_blank"
                        rel="noreferrer"
                        style={miniJpLinkStyle}
                        title="JP Wiki"
                      >
                        JP Wiki
                      </a>
                    </div>

                    <div
                      style={{ fontSize: 12, opacity: 0.7 }}
                      title={`効率の優先度（ランク化）: rank=${toRank(score, nextMax)} / score=${score} / max=${nextMax}`}
                    >
                      解放:+{unlockCount} / 優先度:{toRank(score, nextMax)} / {t.trader} / {t.maps.join(", ")}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <h2 style={{ margin: "12px 0 8px", fontSize: 16 }}>並行枠（長期/先出し）</h2>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            ボスキルや長期シリーズは早めに出して、設置/回収タスクと並行推奨。
          </div>
          <div
            style={{
              maxHeight: 260,         // 好みで調整（例：220〜340）
              overflowY: "auto",
              paddingRight: 6,        // スクロールバー分の逃げ
              scrollbarGutter: "stable",
              border: "1px solid rgba(255,255,255,0.08)", // なくてもOK
              borderRadius: 8,
              padding: "8px 8px 8px 0",
            }}
          >
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {parallelTop.map(({ t, kind, available, minLv }) => (
                <li key={t.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => togglePin(t.id)}>{pinned.includes(t.id) ? "★" : "☆"}</button>
                    <button onClick={() => selectTask(t.id)}>見る</button>
                    <button onClick={() => toggleDone(t.id)}>{done.has(t.id) ? "未完了に戻す" : "完了"}</button>

                    <div style={{ minWidth: 0 }}>
                      {/* タスク名 + JP */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {t.name}
                        </div>
                        <a
                          href={buildJpWikiUrl(t)}
                          target="_blank"
                          rel="noreferrer"
                          style={miniJpLinkStyle}
                          title="JP Wiki"
                        >
                          JP Wiki
                        </a>
                      </div>

                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {kind} / minLv={minLv === 999 ? "-" : minLv} / {t.trader} / {available ? "着手可" : "未解放"}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 右 */}
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 12,
            height: "calc(100vh - 100px)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>タスク一覧</h2>

            <span style={labelStyle}>状態</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                const v = e.target.value as StatusFilter;
                setStatusFilter(v);
                saveStatusFilter(v);
              }}
              style={selectStyle}
            >
              <option value="all">すべて</option>
              <option value="todo">未完</option>
              <option value="done">完了</option>
            </select>

            <span style={labelStyle}>着手</span>
            <select
              value={readyFilter}
              onChange={(e) => {
                const v = e.target.value as ReadyFilter;
                setReadyFilter(v);
                saveReadyFilter(v);
              }}
              style={selectStyle}
              title="完了表示中は実質無視"
            >
              <option value="all">すべて</option>
              <option value="ready">可</option>
              <option value="locked">不可</option>
            </select>

            <span style={labelStyle}>トレーダー</span>
            <select
              value={traderFilter}
              onChange={(e) => {
                const v = e.target.value;
                setTraderFilter(v);
                saveTraderFilter(v);
              }}
              style={selectStyle}
            >
              <option value="all">すべて</option>
              {traderOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <input
              value={query}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                saveQuery(v);
              }}
              placeholder="検索（名前/トレーダー/マップ/タグ）"
              style={{ flex: 1, padding: 6 }}
            />

            <button
              onClick={() => {
                setQuery("");
                saveQuery("");
              }}
              title="検索だけクリア"
            >
              クリア
            </button>

            <button onClick={resetFilters} title="検索・状態・着手・トレーダーをリセット">
              フィルタリセット
            </button>

            <button onClick={resetProgress} style={dangerButtonStyle} title="完了状況（進捗）を全消去">
              進捗リセット
            </button>

            <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: "nowrap" }}>表示 {shown.length}</div>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gap: 8,
              overflowY: "auto",
              flex: 1,
              minHeight: 0,
              paddingRight: 6,
              alignContent: "start",
              scrollbarGutter: "stable",
            }}
          >
            {shown.map((t) => {
              const isDone = done.has(t.id);
              const available = isAvailable(t);

              return (
                <div
                  key={t.id}
                  style={{
                    padding: 10,
                    border: "1px solid #eee",
                    borderRadius: 8,
                    background: selectedId === t.id ? "#f7f7f7" : "white",
                    opacity: isDone ? 0.5 : 1,
                    color: "#111",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => togglePin(t.id)}>{pinned.includes(t.id) ? "★" : "☆"}</button>
                    <button onClick={() => selectTask(t.id)}>選択</button>
                    <button onClick={() => toggleDone(t.id)}>{isDone ? "未完了に戻す" : "完了"}</button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* タスク名（JPは右端へ移動） */}
                      <div
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.name}
                      </div>

                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {t.trader} / {t.maps.join(", ")} / 前提:{t.prerequisites.length}
                      </div>
                    </div>

                    {/* 右端：JP + 状態バッジを同じ箱にして縦位置を揃える */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <a
                        href={buildJpWikiUrl(t)}
                        target="_blank"
                        rel="noreferrer"
                        style={miniJpLinkStyle}
                        title="JP Wiki"
                      >
                        JP Wiki
                      </a>

                      {available ? (
                        <span style={badgeReadyStyle} title="前提タスクが全て完了しています">
                          着手可
                        </span>
                      ) : (
                        <span style={badgeLockedStyle} title="前提タスクが未完了です">
                          未解放
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selected && (
            <div
              ref={selectedPanelRef}
              style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 14 }}>選択中</h3>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {selected.wikiLink ? (
                    <a href={selected.wikiLink} target="_blank" rel="noreferrer" style={linkButtonStyle}>
                      Wiki
                    </a>
                  ) : null}

                  <a href={buildJpWikiUrl(selected)} target="_blank" rel="noreferrer" style={linkButtonStyle}>
                    JP Wiki
                  </a>

                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent("EFT " + selected.name + " task")}`}
                    target="_blank"
                    rel="noreferrer"
                    style={linkButtonStyle}
                  >
                    検索
                  </a>

                  <button onClick={() => selectTask(null)}>閉じる</button>
                </div>
              </div>

              <div style={{ marginTop: 6 }}>{selected.name}</div>

              <div style={{ marginTop: 10 }}>
                <PrereqFlow all={allTasks} targetId={selected.id} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}