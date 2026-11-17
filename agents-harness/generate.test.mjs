import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { adapterRows, LINE, render, TERMS } from "./generate.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const SUBAGENTS = "# Poteto mode\n\n## Subagents\n\nPick a `Task` model per role.\n\n## Writing the reply\n\nEnd.\n";
const ADAPTER_ROWS = [
  "| `Task` | spawn |",
  "| Run another pstack skill | Read `~/.agents/skills/<name>/SKILL.md`. |",
  "| `poteto-mode` | Read `poteto-subagents.md` in this folder. |",
];

/** A fake repository root with the given files, removed after the test. */
function fixture(t, files, { adapter = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "agents-harness-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const all = {
    "pstack/skills/poteto-mode/SKILL.md": "---\nname: poteto-mode\n---\n" + SUBAGENTS,
    ...(adapter && {
      "agents-harness/adapter/SKILL.md": "---\nname: cursor-harness\n---\n# Cursor harness\n\nRun `printenv CLAUDECODE CODEX_THREAD_ID`.\n",
      "agents-harness/adapter/codex.md": `# Codex\n\n| Cursor | Codex |\n| --- | --- |\n${ADAPTER_ROWS.join("\n")}\n`,
      "agents-harness/adapter/claude-code.md": `# Claude Code\n\n| Cursor | Claude Code |\n| --- | --- |\n${ADAPTER_ROWS.join("\n")}\n`,
    }),
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const skill = (name, body, extra = "") => `---\nname: ${name}\ndescription: test\n${extra}---\n${body}`;
const text = (out, path) => out.get(path)?.bytes.toString("utf8");

test("adds the adapter line after the H1 of a skill that uses a Cursor name", (t) => {
  const root = fixture(t, { "pstack/skills/arena/SKILL.md": skill("arena", "# Arena\n\nSpawn with the `Task` tool.\n") });
  const out = render(root, [{ name: "arena", from: "pstack" }]);
  assert.match(text(out, "arena/SKILL.md"), new RegExp(`# Arena\\n\\n${LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n\\nSpawn`));
});

test("leaves a skill with no Cursor names unchanged", (t) => {
  const source = skill("why", "# Why\n\nRead the history.\n");
  const root = fixture(t, { "pstack/skills/why/SKILL.md": source });
  assert.equal(text(render(root, [{ name: "why", from: "pstack" }]), "why/SKILL.md"), source);
});

test("copies every file of a skill folder", (t) => {
  const root = fixture(t, {
    "cursor-team-kit/skills/fix-ci/SKILL.md": skill("fix-ci", "# Fix CI\n"),
    "cursor-team-kit/skills/fix-ci/references/logs.md": "logs\n",
  });
  assert.equal(text(render(root, [{ name: "fix-ci", from: "cursor-team-kit" }]), "fix-ci/references/logs.md"), "logs\n");
});

test("fails with the name when a chosen skill is missing upstream", (t) => {
  const root = fixture(t, {});
  assert.throws(() => render(root, [{ name: "gone", from: "pstack" }]), /gone/);
});

test("fails when the frontmatter name is not the folder name", (t) => {
  const root = fixture(t, { "pstack/skills/how/SKILL.md": skill("not-how", "# How\n") });
  assert.throws(() => render(root, [{ name: "how", from: "pstack" }]), /not-how/);
});

test("fails on a link that leaves the skill folder", (t) => {
  const root = fixture(t, { "pstack/skills/how/SKILL.md": skill("how", "# How\n\nSee [x](../../nowhere.md).\n") });
  assert.throws(() => render(root, [{ name: "how", from: "pstack" }]), /nowhere\.md/);
});

test("fails when a skill names an unchosen skill that no adapter row maps", (t) => {
  const root = fixture(t, {
    "pstack/skills/swarm/SKILL.md": skill("swarm", "# Swarm\n"),
    "pstack/skills/arena/SKILL.md": skill("arena", "# Arena\n\nRun the **swarm** skill.\n"),
  });
  assert.throws(() => render(root, [{ name: "arena", from: "pstack" }]), /swarm/);
});

test("allows an unchosen skill that an adapter row maps, and copies the poteto-mode Subagents section", (t) => {
  const root = fixture(t, { "pstack/skills/arena/SKILL.md": skill("arena", "# Arena\n\nPer the Subagents section of the **poteto-mode** skill.\n") });
  const out = render(root, [{ name: "arena", from: "pstack" }]);
  assert.equal(text(out, "cursor-harness/poteto-subagents.md"), "## Subagents\n\nPick a `Task` model per role.\n");
  assert.match(text(out, "arena/SKILL.md"), /cursor-harness/);
});

test("fails when the poteto-mode Subagents section is gone", (t) => {
  const root = fixture(t, { "pstack/skills/poteto-mode/SKILL.md": "---\nname: poteto-mode\n---\n# Poteto mode\n" });
  assert.throws(() => render(root, []), /Subagents/);
});

test("keeps the execute bit of a copied script", (t) => {
  const root = fixture(t, {
    "pstack/skills/show-me-your-work/SKILL.md": skill("show-me-your-work", "# Show\n"),
    "pstack/skills/show-me-your-work/scripts/log.sh": "#!/bin/sh\n",
  });
  chmodSync(join(root, "pstack/skills/show-me-your-work/scripts/log.sh"), 0o755);
  const out = render(root, [{ name: "show-me-your-work", from: "pstack" }]);
  assert.equal(out.get("show-me-your-work/scripts/log.sh").executable, true);
  assert.equal(out.get("show-me-your-work/SKILL.md").executable, false);
});

test("fails when a skill names an unchosen principle skill", (t) => {
  const root = fixture(t, {
    "pstack/skills/principle-prove-it-works/SKILL.md": skill("principle-prove-it-works", "# Prove it works\n"),
    "pstack/skills/arena/SKILL.md": skill("arena", "# Arena\n\nApply the **prove-it-works** principle skill.\n"),
  });
  assert.throws(() => render(root, [{ name: "arena", from: "pstack" }]), /principle-prove-it-works/);
});

test("allows a chosen principle skill named in the principle form", (t) => {
  const root = fixture(t, {
    "pstack/skills/principle-prove-it-works/SKILL.md": skill("principle-prove-it-works", "# Prove it works\n"),
    "pstack/skills/arena/SKILL.md": skill("arena", "# Arena\n\nApply the **prove-it-works** principle skill.\n"),
  });
  const out = render(root, [{ name: "arena", from: "pstack" }, { name: "principle-prove-it-works", from: "pstack" }]);
  assert.match(text(out, "arena/SKILL.md"), /cursor-harness/);
});

test("the real chosen skills name no skill outside the tree", () => {
  const chosen = JSON.parse(real("skills.json")).skills;
  const names = new Set(chosen.map((item) => item.name));
  for (const required of ["principle-type-system-discipline", "principle-boundary-discipline", "principle-encode-lessons-in-structure",
    "principle-prove-it-works", "principle-redesign-from-first-principles", "principle-separate-before-serializing-shared-state"]) {
    assert.ok(names.has(required), required);
  }
});

test("keeps a link inside the skill folder", (t) => {
  const source = skill("how", "# How\n\nSee [the reference](references/a.md) and [the web](https://example.com).\n");
  const root = fixture(t, { "pstack/skills/how/SKILL.md": source, "pstack/skills/how/references/a.md": "a\n" });
  assert.equal(text(render(root, [{ name: "how", from: "pstack" }]), "how/SKILL.md"), source);
});

test("writes agents/openai.yaml for disable-model-invocation: true", (t) => {
  const root = fixture(t, { "pstack/skills/why/SKILL.md": skill("why", "# Why\n", "disable-model-invocation: true\n") });
  assert.equal(text(render(root, [{ name: "why", from: "pstack" }]), "why/agents/openai.yaml"), "policy:\n  allow_implicit_invocation: false\n");
});

test("fails when agents-harness/adapter/ is missing", (t) => {
  const root = fixture(t, {}, { adapter: false });
  assert.throws(() => render(root, []), /adapter/);
});

test("copies the adapter into cursor-harness", (t) => {
  const out = render(fixture(t, {}), []);
  assert.match(text(out, "cursor-harness/SKILL.md"), /name: cursor-harness/);
  assert.ok(out.has("cursor-harness/codex.md") && out.has("cursor-harness/claude-code.md"));
});

test("adapterRows reads the first two cells of each table row", () => {
  const rows = adapterRows("| Cursor | Codex |\n| --- | --- |\n| `Task` | `spawn_agent` |\n| `AskQuestion` |  |\n");
  assert.equal(rows.get("`Task`"), "`spawn_agent`");
  assert.equal(rows.get("`AskQuestion`"), "");
  assert.equal(rows.has("---"), false);
});

test("a used key with an empty target fails", (t) => {
  const root = fixture(t, {
    "agents-harness/adapter/codex.md": "| Cursor | Codex |\n| --- | --- |\n| `Task` |  |\n| Run another pstack skill | x |\n| `poteto-mode` | x |\n",
    "pstack/skills/arena/SKILL.md": skill("arena", "# Arena\n\nUse the `Task` tool.\n"),
  });
  assert.throws(() => render(root, [{ name: "arena", from: "pstack" }]), /codex\.md.*`Task`/);
});

const real = (path) => readFileSync(join(REPO, "agents-harness", path), "utf8");
const KEYS = [...TERMS.map((term) => term.key), "Run another pstack skill", "poteto-mode"];

for (const file of ["codex.md", "claude-code.md"]) {
  test(`${file} maps every Cursor term with a non-empty target`, () => {
    const rows = adapterRows(real(`adapter/${file}`));
    const missing = KEYS.filter((key) => ![...rows].some(([cell, value]) => cell.includes(key) && value));
    assert.deepEqual(missing, []);
  });
}

test("codex.md has a fallback for spawn_agent and request_user_input", () => {
  const rows = adapterRows(real("adapter/codex.md"));
  assert.match(rows.get("`Task`"), /Fallback:/);
  assert.match(rows.get("`AskQuestion`"), /Fallback:/);
});

test("SKILL.md selects the agent without a tool check", () => {
  const skill = real("adapter/SKILL.md");
  assert.match(skill, /CLAUDECODE/);
  assert.match(skill, /CODEX_THREAD_ID/);
  assert.doesNotMatch(skill, /If your tools include/);
});

test("the real skill list renders", () => {
  const chosen = JSON.parse(real("skills.json")).skills;
  const out = render(REPO, chosen);
  for (const { name } of chosen) assert.ok(out.has(`${name}/SKILL.md`), name);
});

test("the committed tree matches a fresh render", () => {
  const chosen = JSON.parse(real("skills.json")).skills;
  const out = render(REPO, chosen);
  const dir = join(REPO, "agents-harness/skills");
  const committed = existsSync(dir) ? walkFiles(dir).map((path) => relative(dir, path)) : [];
  assert.deepEqual(committed.sort(), [...out.keys()].sort());
  for (const [path, { bytes, executable }] of out) {
    assert.ok(readFileSync(join(dir, path)).equals(bytes), path);
    assert.equal((statSync(join(dir, path)).mode & 0o111) !== 0, executable, `${path} execute bit`);
  }
});

function walkFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}

test("TERMS has every key in the upstream generator", () => {
  const upstream = readFileSync(join(REPO, "scripts/generate-pstack-harness-trees.mjs"), "utf8");
  const keys = [...upstream.matchAll(/\{ key: ("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1]));
  assert.ok(keys.length > 10, "parsed the upstream TERMS");
  const ours = new Set(TERMS.map((term) => term.key));
  assert.deepEqual(keys.filter((key) => !ours.has(key)), []);
});
