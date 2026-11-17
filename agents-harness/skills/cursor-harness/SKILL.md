---
name: cursor-harness
description: Maps the Cursor names in pstack and cursor-team-kit skills to Codex or Claude Code. Read it when another skill tells you to, once per session.
disable-model-invocation: true
---

# Cursor harness

The pstack and cursor-team-kit skills use Cursor names for tools, subagent fields, models, paths, and Cursor-only features. This skill maps each name to the agent that runs you.

## Find your agent

Run `printenv CLAUDECODE CODEX_THREAD_ID` in a shell.

- Only `CLAUDECODE=1` is set: you are in Claude Code. Read [claude-code.md](claude-code.md).
- Only `CODEX_THREAD_ID` is set: you are in Codex. Read [codex.md](codex.md).
- Both are set, or neither is set: one agent started the other, and the child inherits the parent's environment. Use the agent name from your system prompt.
- You still cannot tell: read both files, and use the rows of the agent whose tools you have.

Do not decide by an optional tool such as `spawn_agent` or `Agent`. A headless run can lack it.

## Use the map

Read the file for your agent once per session. Then, for each Cursor name in a skill, find the row whose first cell holds that name and do what the second cell says.

- A target that starts with `Skip:` means skip that step. Put one line in your reply: `Skipped in <agent>: <step>. <reason>.` Then go on.
- A target that starts with `Fallback:` means the agent cannot do the Cursor step as written. Do the fallback and say so in one line.
- If a Cursor name has no row, drop it and say so. Never pass a field or a value that the tool schema rejects.

`poteto-subagents.md` in this folder is the Subagents section of pstack's `poteto-mode` skill. Some skills point to it to pick each subagent's model and reasoning level.

## Model roles

Skills read model roles, such as `arena runners`, from a model file. Both agents read `~/.config/pstack/models.md`. Each line is `<role>: <model> <effort>`, such as `arena runners: gpt-6.1-sol high`. When the file or the role's line is missing, use the skill's default, mapped with the Models rows.
