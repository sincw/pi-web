# Pivot UI

Local web UI for the pi coding agent: session browsing, live chat, model/skill configuration, and workspace tools.

## Language

### Live agent session

**AgentRun**:
One client-side run from optimistic `start` (usually at send) until either `finish` or `cancelStart`. Identified by a monotonic run id; late transport events for a prior id must not affect the current run.
_Avoid_: PromptRun (slash commands share the same live flag), streaming session, turn (ambiguous with multi-message turns)

**finish**:
The terminal path for a run that entered live work: reload session messages, clear live state, notify the UI. All completion signals converge here (`agent_end`, `prompt_done`, reconcile-idle, slash settlement).
_Avoid_: end handler, complete prompt, settle (settle is only the poll that may decide to finish)

**cancelStart**:
The terminal path when a run never successfully began server work (e.g. event stream connect failure before prompt). Clears live/optimistic UI without reloading the session and without the completion sound / end callback.
_Avoid_: abort (abort is a user command to the agent; cancelStart is client-side start rollback), finish

**LiveSession**:
The client-side runtime for one attached or newly created chat session: transport to the agent, composition with AgentRun, event-to-transcript projection, and session actions (send, abort, steer, follow-up, fork, navigate, compact, and later model/thinking/tools/extension responses). Callers consume a read-only view plus commands, not EventSource or wire command maps. Distinct from the server-side pi AgentSession process.
_Avoid_: useAgentSession (implementation name), agent client, AgentSession (server/SDK object), session runtime (vague)

**LiveSession view**:
The read-only projection a LiveSession publishes (messages, leaf, stream, run liveness/phase, queue, compacting, current model selection, context usage, extension requests/statuses, and related session fields). UI shells subscribe to it; they do not own transport or finish policy.
_Avoid_: hook state, session snapshot (ambiguous with file/header snapshots)

### Skill packs

**Library**:
The global store of skill directories and MCP server definitions under a library root, each with a content or config hash.
_Avoid_: marketplace (install source), package plugin

**Pack**:
A named snapshot of library skill and MCP refs as `{ key, hash }` pairs that can be applied to a workspace.
_Avoid_: skill set, bundle, profile

**desired-set apply**:
The only production apply path: compute the full union of Packs that should be on a workspace, then install skills and reconcile managed MCP entries to match, writing a receipt.
_Avoid_: applyPlan (legacy skill-only surface), unapply as a separate skill-only path
