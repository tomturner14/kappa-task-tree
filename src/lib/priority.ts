import type { Task } from "../types";

export type TaskScore = {
  score: number;
  unlockCount: number;
  isAvailable: boolean;
};

function isCollector(t: Task) {
  return t.name.trim().toLowerCase() === "collector";
}

/**
 * “次にやる（効率）”用スコア
 * - 対象は基本「未完了」想定
 * - isAvailable: 今すぐ着手可能（前提が全部done）
 * - unlockCount: このタスクを完了したら、新たに着手可能になる未完了タスク数
 */
export function scoreTaskForNext(
  t: Task,
  all: Task[],
  done: Set<string>
): TaskScore {
  const isAvailable = t.prerequisites.every((p) => done.has(p));

  // このタスクを完了した場合のdone集合
  const doneIf = new Set(done);
  doneIf.add(t.id);

  // 完了前に着手不可だったが、完了後に着手可能になる数
  let unlockCount = 0;
  for (const u of all) {
    if (u.id === t.id) continue;
    if (done.has(u.id)) continue;

    const canNow = u.prerequisites.every((p) => done.has(p));
    if (canNow) continue;

    const canAfter = u.prerequisites.every((p) => doneIf.has(p));
    if (canAfter) unlockCount += 1;
  }

  let score = 0;

  // 重要：解放数が最優先（効率）
  score += unlockCount * 100;

  // 補助：Kappa必須を上げる
  if (t.kappaRequired || t.tags.includes("kappa")) score += 30;

  // 補助：ボス/キル系を少し上げる
  if (t.tags.some((x) => x.startsWith("boss:"))) score += 15;
  if (t.tags.includes("kills")) score += 5;

  // 例外：Collectorはランキング対象にしない
  if (isCollector(t)) score -= 10_000;

  // まだ着手不可なら、強く落とす（“次にやる”に出したくない）
  if (!isAvailable) score -= 10_000;

  return { score, unlockCount, isAvailable };
}

/**
 * “まずやる（導線）”用スコア
 * - 解放効率(unlock)より、導線としての自然さを優先
 * - prereq=0 を最優先
 * - 低レベル開始の導入を優先（minPlayerLevelが低いほど上）
 */
export function scoreTaskForStarter(
  t: Task,
  all: Task[],
  done: Set<string>
): TaskScore {
  const base = scoreTaskForNext(t, all, done);
  if (!base.isAvailable) return { ...base, score: base.score - 10_000 };

  let score = 0;

  // prereq=0 を強く優遇（最初の導線）
  if (t.prerequisites.length === 0) score += 1000;

  // minPlayerLevel が低いほど優遇（nullは大きめ扱い）
  const ml = t.minPlayerLevel ?? 999;
  score += Math.max(0, 200 - ml * 10);

  // 初期導線の体感：Therapistを少し優遇（好みで調整）
  if (t.trader === "Therapist") score += 80;

  // 進行の詰まりを減らすため、unlockも少しだけ見る（効率より弱い）
  score += base.unlockCount * 10;

  // Collectorは除外
  if (isCollector(t)) score -= 10_000;

  // いま完了できる/しやすいものを上に寄せる（killsは少し下げる）
  if (t.tags.includes("kills")) score -= 10;

  return { ...base, score };
}