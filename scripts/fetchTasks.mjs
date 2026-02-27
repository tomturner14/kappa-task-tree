// scripts/fetchTasks.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENDPOINT = "https://api.tarkov.dev/graphql";

/**
 * 目的:
 * - prerequisites をちゃんと埋めてツリーが出るようにする
 * 方針:
 * - status で絞るとズレて空になる可能性があるので、まずは全部拾う
 */
const QUERY = `
query TasksForKappaTree {
  tasks {
    id
    name
    kappaRequired
    wikiLink
    minPlayerLevel
    trader { name }
    taskRequirements { status task { id } }
    objectives {
      type
      maps { normalizedName }
      ... on TaskObjectiveShoot { targetNames count }
    }
  }
}
`;

function uniq(arr) {
  return [...new Set((arr ?? []).filter(Boolean))];
}

function extractMaps(objectives) {
  const maps =
    objectives?.flatMap((o) => o?.maps?.map((m) => m?.normalizedName) ?? []) ?? [];
  return uniq(maps);
}

function extractTargets(objectives) {
  const targets = objectives?.flatMap((o) => o?.targetNames ?? []) ?? [];
  return uniq(targets);
}

function extractPrereqIds(taskRequirements) {
  const reqs = taskRequirements ?? [];
  // まずはstatus無視で全部拾う
  const ids = reqs.map((r) => r?.task?.id).filter(Boolean);
  return uniq(ids);

  // 精密化したくなったらここで status で絞る
  // const filtered = reqs.filter(r => String(r?.status).toLowerCase() === "required");
  // return uniq(filtered.map(r => r?.task?.id).filter(Boolean));
}

function buildTags({ kappaRequired, targets }) {
  const tags = [];
  if (kappaRequired) tags.push("kappa");
  if (targets.length) tags.push("kills");
  for (const t of targets) tags.push(`target:${t}`);
  return tags;
}

async function main() {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("HTTP error", res.status, res.statusText);
    console.error(text.slice(0, 2000));
    process.exit(1);
  }

  const json = await res.json();

  if (json.errors?.length) {
    console.error("GraphQL errors:");
    console.error(JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  const tasks = json.data?.tasks ?? [];

  const out = tasks.map((t) => {
    const objectives = t.objectives ?? [];
    const maps = extractMaps(objectives);
    const targets = extractTargets(objectives);
    const prerequisites = extractPrereqIds(t.taskRequirements);

    return {
      id: t.id,
      name: t.name,
      trader: t.trader?.name ?? "Unknown",
      maps,
      prerequisites,
      tags: buildTags({ kappaRequired: !!t.kappaRequired, targets }),
      kappaRequired: !!t.kappaRequired,
      wikiLink: t.wikiLink ?? null,
      minPlayerLevel: t.minPlayerLevel ?? null,
      targets,
    };
  });

  const withPrereq = out.filter((x) => (x.prerequisites?.length ?? 0) > 0).length;
  console.log(`tasks total=${out.length}, withPrereq=${withPrereq}`);

  const dest = path.resolve(__dirname, "../src/data/tasks.json");
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, JSON.stringify(out, null, 2), "utf-8");

  console.log(`wrote ${dest} (${out.length} tasks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});