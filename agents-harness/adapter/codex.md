# pstack in Codex

Map each Cursor name in a skill with these tables. Facts checked on Codex CLI 0.169.0. In `codex exec` (headless), `update_plan`, `send_input`, and `close_agent` are absent, and no one answers `request_user_input`.

## Tools

| Cursor | Codex |
| --- | --- |
| `Task` | `spawn_agent` with `message` (the brief) and `task_name` (lowercase letters, digits, and underscores), then `wait_agent` (`timeout_ms` up to 3600000). Use `close_agent` when you have it. Fallback: without `spawn_agent`, follow the brief yourself in this session, one brief at a time, and say so. |
| `AskQuestion` | `request_user_input` in an interactive session. Fallback: in `codex exec` or any run without a user, do not call it. Make the choice that the skill gives as its default, or the safest choice, and say which. |
| Open a todolist, or copy steps into the todolist tool | `update_plan`. Fallback: without it, keep the list in your reply and update it at each phase. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `~/.agents/skills/<name>/SKILL.md` and follow it. When you tell the user to run it, write `$<name>`. |
| `poteto-mode` | Read `poteto-subagents.md` in the cursor-harness folder. The rest of `poteto-mode` is not installed. |

## Subagent fields

| Cursor | Codex |
| --- | --- |
| `subagent_type: generalPurpose` | Omit. `spawn_agent` has no type field. |
| `poteto-agent` | Omit the type. Give the model and effort from the Models rows on the `spawn_agent` call. |
| `comment-sicko` | Skip: the comment-sicko agent is not installed. |
| `readonly: true` | Fallback: `spawn_agent` has no read-only field. Put "Do not edit files" in `message`, and run `git status` after the agent finishes. |
| `environment: "cloud"` | Make a worktree with `git worktree add` under `$TMPDIR`, check out the named branch or commit, and give its path in `message`. Remove the worktree when the work is done. |
| `cloud_base_branch: <b>` | Tell the agent in `message` to check out `<b>` first. |
| `run_in_background: true` | Omit. Spawned agents run while you work; collect them with `wait_agent`. |
| `resume` | Fallback: spawn a new agent with `fork_turns: "none"` and paste the earlier result into its `message`. |
| `file_attachments` | List the paths in `message`. |

## Models

| Cursor | Codex |
| --- | --- |
| `gpt-<version>-<effort>`, such as a `gpt-` slug | `model: "gpt-<version>"` and `reasoning_effort: "<effort>"` on `spawn_agent`. |
| `claude-<family>-<version>-<effort>[-fast]` | Fallback: Codex runs only OpenAI models. Omit `model`, keep `reasoning_effort`, and say that the seat runs on the session model. |
| `gemini-*` or `grok-` slugs | Fallback: omit `model` and say so. |
| `auto` or `inherit-parent` | Omit `model`. |
| `pstack-models.mdc`, `~/.cursor/rules/pstack-models.mdc` | Read `~/.config/pstack/models.md`. If the file or the role's line is missing, use the skill's default slug, mapped with these rows. |

## Paths

| Cursor | Codex |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `~/.agents/skills/` |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | Skip: Codex plugins are not used for these skills. |
| `.cursor/rules/*.mdc`, always-applied rules | `AGENTS.md` in the repository, or `~/.codex/AGENTS.md` for user rules. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Each line is one JSON event. The current session's ID is `$CODEX_SESSION_ID`. Read only sessions whose working folder is this workspace. |

## Cursor-only features

| Cursor | Codex |
| --- | --- |
| Cursor-only features: Automations, `update_state` routine calls, automation webhooks, routine wakes, and `SendToUser` secret requests | Skip: Codex has no Cursor Automations. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with `gh`. Skip: a step that starts, waits for, or configures Bugbot. |
| Cursor cloud agents | Use the `environment: "cloud"` row. Skip: a step that needs the cloud agent's own dashboard or machine. |
| A built-in PR tool | Use the forge command that the step gives, such as `gh pr create`. |
