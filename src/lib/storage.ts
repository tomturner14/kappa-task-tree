const KEY_DONE = "kappa-task-tree.done";
const KEY_SELECTED = "kappa-task-tree.selected";
const KEY_QUERY = "kappa-task-tree.query";
const KEY_PINNED = "kappa-task-tree.pinned";

export function loadDone(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY_DONE);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function saveDone(done: Set<string>) {
  const arr = Array.from(done);
  localStorage.setItem(KEY_DONE, JSON.stringify(arr));
}

export function loadSelectedId(): string | null {
  try {
    return localStorage.getItem(KEY_SELECTED);
  } catch {
    return null;
  }
}

export function saveSelectedId(id: string | null) {
  try {
    if (!id) localStorage.removeItem(KEY_SELECTED);
    else localStorage.setItem(KEY_SELECTED, id);
  } catch {
    // no-op
  }
}

export function loadQuery(): string {
  try {
    return localStorage.getItem(KEY_QUERY) ?? "";
  } catch {
    return "";
  }
}

export function saveQuery(q: string) {
  try {
    localStorage.setItem(KEY_QUERY, q);
  } catch {
    // no-op
  }
}

export function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(KEY_PINNED);
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}

export function savePinned(ids: string[]) {
  try {
    localStorage.setItem(KEY_PINNED, JSON.stringify(ids));
  } catch {
    // no-op
  }
}