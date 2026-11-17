# pstack in Claude Code

Map each Cursor name in a skill with these tables. Based on upstream `pstack/docs/harness/claude-code.md`, changed for skills installed one folder each in `~/.agents/skills` (linked into `~/.claude/skills`), not as the pstack plugin.

## Tools

| Cursor | Claude Code |
| --- | --- |
| `Task` | `Agent`. Fallback: without `Agent`, follow the brief yourself in this session, one brief at a time, and say so. |
| `AskQuestion` | `AskUserQuestion`. Fallback: in `-p` mode it is absent; make the choice that the skill gives as its default, or ask in plain text when a user can answer. |
| Open a todolist, or copy steps into the todolist tool | `TodoWrite` if the session offers it. Fallback: keep the list in your reply and update it at each phase. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `~/.agents/skills/<name>/SKILL.md` and follow it. For "the **x** principle skill", the folder is `principle-x`. When you tell the user to run it, write `/<name>`. |
| `poteto-mode` | Read `poteto-subagents.md` in the cursor-harness folder. The rest of `poteto-mode` is not installed. |
| `Grep`, `Glob` | `Bash` with `rg` when the session has no `Grep` or `Glob`. |

## Subagent fields

| Cursor | Claude Code |
| --- | --- |
| `subagent_type: generalPurpose` | `subagent_type: "general-purpose"` |
| `poteto-agent` | `subagent_type: "general-purpose"`, with `model` and `effort` from the Models rows. The pstack plugin agents are not installed. |
| `comment-sicko` | Skip: the comment-sicko agent is not installed. |
| `readonly: true` | `subagent_type: "Explore"`. It keeps `Bash`, so the brief also says "do not edit files", and you check `git status` afterward. |
| `environment: "cloud"` | `isolation: "worktree"`. Name the branch or commit the worker checks out. |
| `cloud_base_branch: <b>` | Tell the worker to check out `<b>` first. |
| `run_in_background: true` | Omit. Subagents run in the background by default and notify you when they finish. |
| `resume` | Fallback: spawn a new agent and paste the earlier result into its brief. |
| `file_attachments` | List the paths in the brief. |

## Models

| Cursor | Claude Code |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | `model: "opus"` and `effort: "xhigh"`. `model` takes only `opus`, `sonnet`, `haiku`, `fable`. Drop `-fast`. |
| `gpt-`, `gemini-*`, or `grok-` slugs | Fallback: Claude Code runs only Claude models. Omit `model` so the agent runs on the session model, and say so. |
| `auto` or `inherit-parent` | Omit `model`. |
| `/setup-pstack` | Skip: setup-pstack is not installed. Use the skill's default slugs, mapped with these rows. |
| `pstack-models.mdc`, `~/.cursor/rules/pstack-models.mdc` | Fallback: there is no model file. Use the skill's default slug for each role, mapped with these rows. |

## Paths

| Cursor | Claude Code |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `~/.agents/skills/` (linked into `~/.claude/skills/`) |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | Skip: these skills are not installed as a plugin. |
| `.cursor/rules/*.mdc`, always-applied rules | `CLAUDE.md`, or `AGENTS.md` when no `CLAUDE.md` exists. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.claude/projects/<slug>/<session>.jsonl`. The slug is the workspace path with each `/` and `.` changed to `-`. The newest `.jsonl` directly in that folder is the current session. Its `<session>/subagents/` folder holds subagent transcripts. Read only this workspace's folder. |

## Cursor-only features

| Cursor | Claude Code |
| --- | --- |
| Cursor-only features: Automations, `update_state` routine calls, automation webhooks, routine wakes, and `SendToUser` secret requests | Skip: Claude Code has no Cursor Automations. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with `gh`. Skip: a step that starts, waits for, or configures Bugbot. |
| Cursor cloud agents | Use the `environment: "cloud"` row. Skip: a step that needs the cloud agent's own dashboard or machine. |
| A built-in PR tool | Use the forge command that the step gives, such as `gh pr create`. |
