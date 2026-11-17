#!/usr/bin/env node
// Builds agents-harness/skills/: the chosen pstack and cursor-team-kit skills as flat skill folders that install
// into ~/.agents/skills for Codex and Claude Code, plus the cursor-harness adapter skill that maps their Cursor names.
// Upstream files are only read, never changed, so upstream merges do not conflict with this folder.

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCES = { pstack: "pstack/skills", "cursor-team-kit": "cursor-team-kit/skills" };
const ADAPTER = "agents-harness/adapter";
const ADAPTER_FILES = ["codex.md", "claude-code.md"];
const LINK = /\]\(([^)\s]+)\)/g;

/** The adapter line that each skill with a Cursor name gets after its H1. */
export const LINE =
  "Before you follow this skill, read the `cursor-harness` skill (`~/.agents/skills/cursor-harness/SKILL.md`) once per session. " +
  "It maps the Cursor names in this skill to your agent.";

/** The adapter key for a reference to another chosen skill. */
export const ROUTE_KEY = "Run another pstack skill";

// A copy of TERMS in scripts/generate-pstack-harness-trees.mjs. A test fails when upstream adds a key that is not here.
export const TERMS = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "poteto-agent", re: /poteto-agent/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: '`environment: "cloud"`', re: /environment: "(cloud|local)"/ },
  { key: "cloud_base_branch", re: /cloud_base_branch/ },
  { key: "`run_in_background: true`", re: /run_in_background/ },
  { key: "`resume`", re: /`resume`/ },
  { key: "`file_attachments`", re: /file_attachments/ },
  { key: "claude-", re: /\bclaude-[a-z]+-\d/ },
  { key: "grok-", re: /\bgrok-\d/ },
  { key: "gpt-", re: /\bgpt-\d/ },
  { key: "inherit-parent", re: /inherit-parent/ },
  { key: "pstack-models.mdc", re: /pstack-models\.mdc/ },
  { key: ".cursor/skills/", re: /\.cursor\/skills/ },
  { key: "~/.cursor/plugins/", re: /\.cursor\/plugins|\.cursor-plugin/ },
  { key: ".cursor/rules/", re: /\.cursor\/rules|always-applied rule/ },
  { key: "agent-transcripts", re: /agent-transcripts|\.cursor\/projects/ },
  { key: "Cursor-only features", re: /Bugbot|Cursor [Aa]utomation|cursor\.(sh|com)\/automations|[Cc]loud [Aa]gent|built-in PR tool/ },
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Each Markdown table row's first cell (the Cursor key) and second cell (the target). Header separator rows are left out. */
export function adapterRows(markdown) {
  const rows = new Map();
  for (const line of markdown.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    if (cells.length < 2 || /^:?-+:?$/.test(cells[0])) continue;
    if (!rows.has(cells[0])) rows.set(cells[0], cells[1]);
  }
  return rows;
}

/** The target for a key: the first row whose Cursor cell contains the key. */
function target(rows, key) {
  for (const [cell, value] of rows) if (cell.includes(key)) return value;
  return undefined;
}

/** All upstream skill names, by name, with their folder relative to root. */
function upstreamSkills(root) {
  const all = new Map();
  for (const dir of Object.values(SOURCES)) {
    if (!existsSync(join(root, dir))) continue;
    for (const name of readdirSync(join(root, dir))) if (existsSync(join(root, dir, name, "SKILL.md"))) all.set(name, `${dir}/${name}`);
  }
  return all;
}

/** The "## Subagents" section of poteto-mode, which arena, recall, and show-me-your-work point to. */
function poteToSubagents(root) {
  const path = join(root, "pstack/skills/poteto-mode/SKILL.md");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const section = /^## Subagents\n[\s\S]*?(?=^## |(?![\s\S]))/m.exec(text)?.[0];
  if (!section) throw new Error("pstack/skills/poteto-mode/SKILL.md has no ## Subagents section for cursor-harness/poteto-subagents.md");
  return section.replace(/\n+$/, "\n");
}

/** A file's bytes and whether it is executable (mode 755 in git, else 644). */
function file(path) {
  return { bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}

/**
 * The generated tree, as paths relative to agents-harness/skills/ and their files ({bytes, executable}). root is the repository root;
 * chosen is [{name, from}], from "pstack" or "cursor-team-kit". Each problem throws an Error that names it.
 */
export function render(root, chosen) {
  if (!existsSync(join(root, ADAPTER, "SKILL.md"))) throw new Error(`${ADAPTER}/SKILL.md is missing: the adapter skill comes first`);
  const adapters = Object.fromEntries(ADAPTER_FILES.map((file) => {
    const path = join(root, ADAPTER, file);
    if (!existsSync(path)) throw new Error(`${ADAPTER}/${file} is missing`);
    return [file, adapterRows(readFileSync(path, "utf8"))];
  }));
  const mapped = (key) => ADAPTER_FILES.every((file) => target(adapters[file], key) !== undefined);

  const upstream = upstreamSkills(root);
  const names = new Set(chosen.map((item) => item.name));
  const others = [...upstream.keys()].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const route = others && new RegExp(`the \\*\\*(${others})\\*\\* skill|\`/(${others})\``, "g");
  // "the **x** principle skill" names the folder principle-x.
  const principle = /\*\*([a-z0-9-]+)\*\* principle skills?\b/g;
  const out = new Map();
  const used = new Map();
  const use = (key, skill) => used.set(key, [...(used.get(key) ?? []), skill]);

  for (const { name, from } of chosen) {
    const dir = SOURCES[from];
    if (!dir) throw new Error(`${name}: unknown source ${JSON.stringify(from)}`);
    const folder = join(root, dir, name);
    if (!existsSync(join(folder, "SKILL.md"))) throw new Error(`Chosen skill ${name} is not in ${dir}: upstream renamed or removed it`);
    let wrap = false;
    for (const path of walk(folder)) {
      const rel = relative(folder, path).split("\\").join("/");
      const copy = file(path);
      if (path.endsWith(".md")) {
        const text = copy.bytes.toString("utf8");
        for (const term of TERMS) if (term.re.test(text)) {wrap = true; use(term.key, name);}
        const named = [
          ...(route ? [...text.matchAll(route)].map((match) => match[1] ?? match[2]) : []),
          ...[...text.matchAll(principle)].map((match) => `principle-${match[1]}`),
        ];
        for (const other of named) {
          if (other === name) continue;
          wrap = true;
          if (names.has(other)) use(ROUTE_KEY, name);
          else if (mapped(other)) use(other, name);
          else if (!upstream.has(other)) throw new Error(`${name} names the ${other} skill, which is not upstream`);
          else throw new Error(`${name} names the ${other} skill, which is not chosen and has no adapter row`);
        }
        // A skill installs as one folder, so a relative link out of it breaks. No chosen skill has one; fail if one appears.
        for (const [, href] of text.matchAll(LINK)) {
          const target = href.replace(/[#?].*/, "");
          if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || href.startsWith("~")) continue;
          if (!posix.normalize(posix.join(posix.dirname(rel), target)).startsWith("../")) continue;
          throw new Error(`${name}/${rel} links to ${href}, which is outside the skill folder`);
        }
      }
      out.set(`${name}/${rel}`, copy);
    }
    const skill = out.get(`${name}/SKILL.md`).bytes.toString("utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1] ?? "";
    const declared = /^name:(.*)$/m.exec(frontmatter)?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (declared !== name) throw new Error(`${dir}/${name}/SKILL.md has name ${JSON.stringify(declared ?? "")}, not ${name}`);
    if (wrap) {
      if (!/^# /m.test(skill)) throw new Error(`${dir}/${name}/SKILL.md uses Cursor names but has no H1 for the adapter line`);
      out.get(`${name}/SKILL.md`).bytes = Buffer.from(skill.replace(/^(# .*)\n+/m, `$1\n\n${LINE}\n\n`));
    }
    if (/^disable-model-invocation:\s*true\s*$/m.test(frontmatter)) {
      out.set(`${name}/agents/openai.yaml`, { bytes: Buffer.from("policy:\n  allow_implicit_invocation: false\n"), executable: false });
    }
  }

  for (const [key, skills] of used) {
    for (const file of ADAPTER_FILES) {
      if (!target(adapters[file], key)) throw new Error(`${ADAPTER}/${file} has no mapping for ${key}, used by ${skills.join(", ")}`);
    }
  }
  for (const path of walk(join(root, ADAPTER))) out.set(`cursor-harness/${relative(join(root, ADAPTER), path).split("\\").join("/")}`, file(path));
  out.set("cursor-harness/poteto-subagents.md", { bytes: Buffer.from(poteToSubagents(root)), executable: false });
  return out;
}

function main(argv) {
  const root = join(HERE, "..");
  const chosen = JSON.parse(readFileSync(join(HERE, "skills.json"), "utf8")).skills;
  const tree = render(root, chosen);
  const outDir = join(HERE, "skills");
  if (argv.includes("--check")) {
    const existing = existsSync(outDir) ? walk(outDir).map((path) => relative(outDir, path).split("\\").join("/")) : [];
    const drifted = [...new Set([...existing, ...tree.keys()])].sort().filter((path) => {
      if (!tree.has(path) || !existsSync(join(outDir, path))) return true;
      const committed = file(join(outDir, path)), fresh = tree.get(path);
      return !committed.bytes.equals(fresh.bytes) || committed.executable !== fresh.executable;
    });
    for (const path of drifted) console.log(`agents-harness/skills/${path}`);
    if (drifted.length) {
      console.log("agents-harness/skills is out of date. Run `node agents-harness/generate.mjs` and commit the result.");
      return 1;
    }
    console.log("agents-harness/skills is up to date.");
    return 0;
  }
  rmSync(outDir, { recursive: true, force: true });
  for (const [path, { bytes, executable }] of tree) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    writeFileSync(join(outDir, path), bytes);
    chmodSync(join(outDir, path), executable ? 0o755 : 0o644);
  }
  console.log(`${chosen.length} skills and cursor-harness written to agents-harness/skills`);
  return 0;
}

if (import.meta.main) {
  try {process.exitCode = main(process.argv.slice(2));} catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  }
}
