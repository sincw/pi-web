# Pi Agent Web - Development Notes

## Quick Start

```bash
npm run dev   # port 30141
```

Typecheck: `node_modules/.bin/tsc --noEmit`  
Lint: `npm run lint`  
**Never run `next build` during dev** — pollutes `.next/` and breaks `npm run dev`.

---

## Architecture

```
Browser                Next.js Server              AgentSession (in-process)
  │                        │                               │
  ├─ GET /api/sessions ────▶ reads ~/.pi/agent/sessions/   │
  ├─ GET /api/sessions/[id] reads .jsonl file directly     │
  ├─ GET /api/agent/running/events ───▶ running id SSE     │
  │                        │                               │
  ├─ send message ─────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ session.prompt()
  │                        │                               │
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events    │
  │                        │   session.onEvent() ◀─────────│ session.subscribe()
  │◀── data: {...} ─────────│                               │
```

**Session browsing** (read-only): reads `.jsonl` files through SDK `SessionManager` helpers and `lib/session-reader.ts` — no AgentSession created.  
**Sending a message**: `startRpcSession()` in `lib/rpc-manager.ts` creates an AgentSession in-process.

---

## File Map

```
app/api/
  sessions/route.ts               GET  list all sessions
  sessions/[id]/route.ts          GET/PATCH/DELETE session
  sessions/[id]/context/route.ts  GET ?leafId= — context for a specific leaf
  sessions/[id]/export/route.ts   GET exported HTML for a session
  agent/new/route.ts              POST { cwd, message, toolNames?, provider?, modelId? }
  agent/[id]/route.ts             GET state | POST any command
  agent/[id]/events/route.ts      GET SSE stream
  agent/running/events/route.ts   GET SSE stream of currently-running session ids
  auth/all-providers/route.ts     GET API-key provider list
  auth/api-key/[provider]/route.ts GET/POST/DELETE provider API key status/storage
  auth/login/[provider]/route.ts  GET OAuth/device-code SSE | POST manual code
  auth/logout/[provider]/route.ts POST OAuth logout
  auth/providers/route.ts         GET OAuth provider list
  cwd/validate/route.ts           POST validate/select a cwd
  default-cwd/route.ts            POST create ~/pi-cwd-YYYYMMDD
  files/[...path]/route.ts        GET file contents for viewer
  git/route.ts                    GET repository/branch/remote data; POST Git working-tree actions
  git-history/route.ts            GET commit list, commit files, and one-file before/after content
  home/route.ts                   GET user home directory
  models/route.ts                 GET { models, modelList, defaultModel }
  models-config/route.ts          GET/PUT — read/write ~/.pi/agent/models.json
  models-config/test/route.ts     POST test a configured model/provider
  plugins/route.ts                GET/POST package plugin management
  skills/route.ts                 GET/PATCH loaded skills and disable-model-invocation
  skills/install/route.ts         POST install skills through npx skills add
  skills/install-from-library/route.ts POST copy one library skill into a workspace
  skills/search/route.ts          GET/POST skills.sh search
  skill-library/route.ts          GET/PUT global skill library root and contents
  skill-library/import/route.ts   POST import market, local, or Git skills into library
  skill-library/skills/route.ts   GET library skills
  skill-library/skills/[skillKey]/route.ts GET/DELETE one library skill
  skill-library/mcp-servers/route.ts GET/POST library MCP servers
  skill-library/mcp-servers/[serverKey]/route.ts GET/PATCH/DELETE one library MCP server
  skill-packs/route.ts            GET/POST global skill pack list/create
  skill-packs/[id]/route.ts       GET/PATCH/DELETE one skill pack
  workspace-skill-packs/route.ts  GET/DELETE workspace pack state/unapply
  workspace-skill-packs/preview/route.ts POST compute apply plan
  workspace-skill-packs/apply/route.ts POST apply confirmed plan
  mcp/servers/route.ts            GET workspace MCP servers
  mcp/status/route.ts             GET MCP adapter readiness
  worktrees/route.ts              GET/POST/DELETE git worktrees
  workspace-files/route.ts        POST workspace-scoped create/rename/delete operations

lib/
  agent-client.ts      typed fetch helper for /api/agent commands
  agent-run-state.ts   run identity, reconciliation, and Pack reload coordination
  draft-store.ts       local draft persistence helpers
  file-access.ts       allowed file roots for /api/files and worktrees
  file-paths.ts        client/server path encoding helpers
  git-branches.ts      parse local/remote refs for the chat worktree switcher
  git-diff-parse.ts    parse Git status/name-status/numstat into changed-file records
  git-graph.ts         calculate lane graph rows for commit history
  markdown.ts          shared markdown helpers
  npx.ts               npx runner used by skill install
  content-hash.ts       deterministic hash for a library skill directory
  mcp-library.ts        library MCP validation and CRUD
  mcp-pack-apply.ts     protected MCP reconciliation for workspace pack changes
  mcp-adapter.ts        MCP adapter discovery and readiness checks
  pi-types.ts          local structural types for pi SDK objects
  rpc-manager.ts      AgentSessionWrapper + registry + startRpcSession
  session-reader.ts   SessionManager wrappers + path cache + buildSessionContext adapter
  skill-library.ts     library scan/import/delete primitives
  skill-packs-store.ts global skill-pack config and pack CRUD
  skill-pack-apply.ts  preview, atomic apply/rollback, and unapply
  tool-presets.ts     PRESET_NONE/DEFAULT/FULL + getPresetFromTools()
  text-diff.ts        line diff and A/B row pairing for review diffs
  types.ts            shared TypeScript types
  normalize.ts        normalizeToolCalls() — field name mismatch between file format and our types
  workspace-packs.ts   workspace pack state and dependency calculation
  worktree.ts         project/worktree resolution and git worktree operations

components/
  AppShell.tsx        layout + URL state + right-panel delegate
  SessionSidebar.tsx  workspace picker + session tree
  ChatWindow.tsx      chat composition + completion sound wrapper
  ChatInput.tsx       input bar + model/thinking/tools/compact controls
  MessageView.tsx     renders one message (user/assistant/toolCall/toolResult)
  BranchNavigator.tsx in-session branch switcher
  ChatMinimap.tsx     scroll minimap alongside the message list
  MarkdownBody.tsx    markdown renderer
  ModelsConfig.tsx    modal for editing models.json (opened from sidebar bottom)
  PluginsConfig.tsx   modal for installed package plugins
  SkillsConfig.tsx    modal for loaded/search/installable skills
  WorkspacePacks.tsx  workspace Pack preview, apply, and unapply flow
  McpConfig.tsx       modal for workspace, library, and editable MCP definitions
  SkillPacksModal.tsx global skill-pack definition management
  WorkspaceFileTree.tsx reusable project file tree
  InlineDiff.tsx      unified and side-by-side review diff renderers
  FileIcons.tsx       file icon helpers
  FileViewer.tsx      file content preview
  TabBar.tsx          generic closable tab row
  useChatViewport.ts  chat scrolling, paging, and completion positioning
  right-panel/
    RightPanel.tsx    owns right-panel tabs, workspace reset, and panel controls
    tool-registry.ts  registered right-panel tools; drives launcher/menu/tab icons
    FileTreeTool.tsx  file-tree tool definition + content
    ReviewTool.tsx    review tool definition + content
    FileTab.tsx       file-preview tab adapter
    types.ts          right-panel tab, tool, and imperative-handle contracts

hooks/
  useAgentSession.ts  messages + streaming + SSE + fork/navigate/reconciliation + pack reload
  useAudio.ts         completion sound + browser AudioContext unlock
  useDragDrop.ts      shared drag/drop state
  useIsMobile.ts      responsive breakpoint hook
  useTheme.ts         theme state
```

---

## Key Design Decisions & Traps

### AgentSession lifecycle (`lib/rpc-manager.ts`)
- One `AgentSessionWrapper` per session id, keyed in `globalThis.__piSessions`
- `globalThis` survives Next.js hot-reload; plain module-level Map does not
- Idle timeout: 10 minutes. Concurrent `startRpcSession()` calls share a single start Promise (`globalThis.__piStartLocks`)

### Fork must destroy the wrapper immediately
`AgentSession.fork()` **mutates the wrapper's inner state in-place** — after fork, `inner.sessionId` is the *new* session's id. If the wrapper stays alive in the registry under the old id, the next request gets the already-forked state and subsequent forks produce a corrupt `parentSession` chain.

**Fix**: `send("fork")` captures `newSessionId`, then calls `this.destroy()` before returning. The next request for the original session reloads a clean AgentSession from the original file.

### Two kinds of branching — don't confuse them
- **Fork** (Fork button on user message): creates a new independent `.jsonl` file. Shown as a child in the sidebar tree via `parentSession` header field.
- **In-session branch** (Continue button / BranchNavigator): calls `navigate_tree` within the same file. Multiple entries share the same `parentId`. Switching between them calls `/api/sessions/[id]/context?leafId=`.

### Session files can be fully rewritten
`parentSession` in the header is **display metadata only** — has zero effect on chat content. Safe to `writeFileSync` the entire file (pi does this itself during migrations). Used when cascade-reparenting children on delete.

### ToolCall field normalization
Pi stores toolCall blocks as `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses `{toolCallId, toolName, input}`. `normalizeToolCalls()` in `lib/normalize.ts` handles this — called in both `session-reader.ts` (file load) and `ChatWindow.handleAgentEvent()` (streaming).

### New session tool preset
Tool names are passed at session creation (`POST /api/agent/new` → `toolNames[]`). For existing sessions, the active preset is inferred on mount via `get_tools` → `getPresetFromTools()`. When tools are fully disabled (`toolNames = []`), `rpc-manager.ts` passes an empty tool allow-list and forces `agent.state.systemPrompt = ""` after startup/reload/resource discovery.

### Model defaults for new sessions
`GET /api/models` returns `defaultModel` read from `~/.pi/agent/settings.json`. `ChatWindow` pre-selects this on mount for new sessions.

### SSE reconnect on page refresh mid-stream
On `ChatWindow` mount, `GET /api/agent/[id]` is called. If `state.isStreaming === true`, SSE is reconnected automatically. `thinkingLevel` and `isCompacting` are also synced from this response.

### Compaction SSE events
Newer pi emits `compaction_start` / `compaction_end`; older versions emitted `auto_compaction_start` / `auto_compaction_end`. `handleAgentEvent` accepts both sets to keep `isCompacting` in sync. Manual compact is a blocking POST — the button stays disabled until the response returns.

### Running state SSE + reconciliation
- The sidebar listens to `/api/agent/running/events`, backed by `subscribeRunningSessions()` in `lib/rpc-manager.ts`, so running badges update without polling.
- `useAgentSession` still treats per-session SSE as primary for chat events, but while a run is active it periodically calls `GET /api/agent/[id]` and also reconciles on `visibilitychange`/`online`. This fixes missed `agent_end` events from background tabs or half-open connections.
- Prompt runs use a monotonic run id; late SSE or slow reconciliation responses from an old run must be ignored so they cannot resurrect stale streaming bubbles.

### Chat and Pack ownership
- `ChatWindow` composes `useAgentSession` with `useChatViewport`. Keep DOM refs, scrolling, history paging, and completion positioning in the viewport hook; the session hook must not manipulate DOM.
- `AgentRunState` is the synchronous source of truth for run identity, reconciliation decisions, and deferred Pack reload. Keep SSE connection, event projection, and commands co-located in `useAgentSession` until they can move together behind a smaller interface.
- `WorkspacePacks` owns workspace Pack preview, apply, and unapply. `SkillsConfig` renders it and refreshes skills through `onApplied`; do not duplicate Pack mutation state there.

### Worktrees and project grouping
- `lib/worktree.ts` resolves linked worktree top-levels back to the main repo `projectRoot`; `listAllSessions()` attaches that to each `SessionInfo` so all worktrees for one repo are grouped together in the sidebar.
- Worktree operations are served by `/api/worktrees` and guarded by the same allowed-root rules as `/api/files`.
- New worktrees are created under `<repoRoot>-worktrees/<sanitized-branch>`. Existing branches are reused; otherwise `git worktree add -b` creates the branch.
- Removing a dirty worktree returns `409` with `{ dirty: true }` so the UI can ask before retrying with `force`.
- Sessions whose cwd points at a removed worktree are inferred back into the main project instead of becoming a phantom project row.

### Right-panel tools
- `RightPanel` owns its tool and file tabs. It persists `{ fileTabs, toolTabs, activeTabId, panelOpen }` in `localStorage` under `pi-right-panel:<projectRoot>`; changing worktrees in the same project updates tab cwd values, while changing projects restores that project's saved tabs.
- Add a same-level tool by creating one `right-panel/*Tool.tsx` feature definition (`id`, label, description, icon, component) and adding it to `right-panel/tool-registry.ts`. The registry drives the launcher, creation menu, and tool-tab icon; do not add tool-specific branches or unions to `AppShell` or `TabBar`.
- File previews are core tabs, not registered tools. `AppShell` opens chat-linked files through `RightPanelHandle`; tool components receive file and reveal callbacks through `RightPanelToolProps`.
- `right-panel-fullscreen` is application-local CSS (`fixed; inset: 0`), not browser fullscreen; the toolbar button toggles it and `Escape` exits. In fullscreen, review lists cap at 300px; Changes and History share the same non-fullscreen list width.

### Git review and workspace files
- `ReviewTool` owns Changes, branch comparison, and History. It fetches file status/diffs from `/api/git-diff`, commit summaries and one-file commit content from `/api/git-history`, and Git actions/branch data from `/api/git`.
- History's left side contains only the commit graph and subject. Selecting a commit loads its files, then selecting one file renders that file's parent-to-commit diff. Keep unified mode as the default; `InlineDiff` also supplies A/B mode.
- A/B diffs are two equal-width panes with a 160px minimum. Each pane owns horizontal overflow; do not reintroduce one shared, full-width horizontal scrollbar.
- `WorkspaceFileTree` is shared by the sidebar and File Tree tool. It supports optional mutations via `/api/workspace-files`; `revealRequest` must expand each path ancestor before selecting the file. `loadDirectory()` updates `nodesRef` when the request resolves so deep reveal traversal does not use stale tree data.
- `/api/files` remains read-only. Its `hideHidden=1` query parameter lets the workspace tree omit dotfiles; write operations belong only in `/api/workspace-files` and must remain workspace-root and symlink constrained.

### File access allow-list
- `/api/files` is intentionally not a general filesystem browser. Allowed roots come from session cwds, their resolved project roots, `~/pi-cwd-*`, and roots explicitly added with `allowFileRoot()`.
- `/api/cwd/validate`, `/api/default-cwd`, and `/api/worktrees` call `allowFileRoot()` when they make a new location browsable.

### Plugins and skills
- `/api/plugins` uses pi's `SettingsManager` + `DefaultPackageManager` for global/project package install, remove, update, enable, and disable. Disabling writes empty `extensions/skills/prompts/themes` arrays for that package entry.
- `/api/skills` uses `DefaultResourceLoader` so settings paths, package skills, and project `.agents/skills` are listed the same way the runtime sees them.
- Skill toggling edits only the `disable-model-invocation` frontmatter key on the target `SKILL.md`; keep that surgical so user formatting survives.
- `/api/skills/install` shells through `npx skills add ... --agent pi`; project installs run with the selected cwd.

### Skill packs
- The global configuration is `~/.pi/agent/skill-packs.json`; its default `libraryRoot` is `~/.pi-web/lib/skills`. Library skills live under `<libraryRoot>/.pi/skills/<skillKey>`, while MCP metadata lives under `<libraryRoot>/.pi/mcp-servers/<serverKey>.mcp.json`. Workspace state is `<cwd>/.pi/skill-packs.json`; Pack-managed MCP entries live in `<cwd>/.pi/mcp.json`.
- A Pack holds `{ skillKey, contentHash }` and `{ serverKey, configHash }` snapshots. `previewWorkspacePackChange()` computes the full Pack union, blocks missing/stale entries and same-key/different-hash conflicts, then `applyWorkspacePackChange()` atomically applies skills, MCP changes, and the receipt. Keep MCP reconciliation in `lib/mcp-pack-apply.ts`, combined transaction logic in `lib/skill-pack-apply.ts`, and state-only operations in `lib/workspace-packs.ts`.
- MCP reconciliation never overwrites a team `.mcp.json`, unowned `.pi/mcp.json` entry, or a Pack-managed entry changed outside Pi-web. Unapply removes only entries no remaining Pack needs and that Pi-web still owns; skill removal retains the existing union-based behavior and can remove a pre-existing same-name skill that was skipped during apply.
- Library MCP CRUD and Pack editing do not require the MCP adapter. Any workspace mutation with an MCP effect does; routes must enforce readiness, not only the UI.
- Applying or removing a pack calls `SkillsConfig.onPacksChanged`, which increments `AppShell.packsRefreshKey`. `useAgentSession` owns the resulting reload: defer it while the agent runs, refresh `get_commands` after reload, and await the same Promise before the next prompt. Do not add competing reload effects in `ChatWindow`.
- Tests: `lib/content-hash.test.mjs`, `lib/skill-library.test.mjs`, `lib/mcp-library.test.mjs`, `lib/skill-packs-store.test.mjs`, `lib/workspace-packs.test.mjs`, `lib/skill-pack-apply.test.mjs`, `lib/mcp-pack-apply.test.mjs`, and `components/ChatWindow.test.mjs`. See `docs/skill-packs.md` for the implementation-level behavior.

### Auth and model config
- `ModelsConfig` combines models from `~/.pi/agent/models.json` with provider auth status from pi's `AuthStorage`/`ModelRegistry`.
- OAuth/device-code/manual-code flows are streamed by `GET /api/auth/login/[provider]`; manual code responses POST back with a short-lived token stored in `globalThis.__piLoginCallbacks`.
- API-key routes store and remove keys through `AuthStorage`. Status endpoints must never return the raw key.
- The model test route is `app/api/models-config/test/route.ts`; `app/api/models/test/` is not a real route.

### Completion sound
- `hooks/useAudio.ts` stores the toggle in `localStorage` as `pi-sound-enabled` and reuses one `AudioContext`.
- Browser autoplay policy means sound must be unlocked from a user gesture; `ChatInput` calls the unlock hook from interactive controls, and `ChatWindow` plays the tone from `onAgentEnd`.

### Exported session HTML
- `/api/sessions/[id]/export` delegates to pi's export helper, then patches recursive tree helpers in the generated HTML to iterative versions so very deep linear sessions do not overflow the browser call stack.

## Pi Session File Format

Location: `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"zenmux","modelId":"claude-sonnet-4-6","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"user-defined name"}
```

`entryIds[]` in `SessionContext` is a parallel array to `messages[]` — maps each displayed message back to its `.jsonl` entry id, used for fork and navigate_tree calls.

---

## CSS Variables (`app/globals.css`)

```
--bg --bg-panel --bg-hover --bg-selected --border
--text --text-muted --text-dim
--accent --user-bg --tool-bg
--font-mono
```

## Agent skills

### Issue tracker

Issues are tracked as GitHub issues in `sincw/pi-web`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles using their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

---

## Agent File Writing Rules

When creating or rewriting large files:

- Prefer **chunked writes**: never emit more than **~2000 characters** in a single write call.
- Build the file in order — scaffold first, then append or edit remaining sections.
- For existing files, prefer surgical `edit` patches over full rewrites.
- Keep each chunk self-contained and valid at the point of writing (no half-open strings/blocks left dangling across chunks unless immediately closed by the next edit).
