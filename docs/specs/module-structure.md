# Module Structure Plan

## Goal

Keep every product capability while making ownership and change paths clear.
The target is smaller coordinating modules with deep feature modules behind
them. This is a behavior-preserving refactor, not a line-count or file-count
reduction project.

## Non-Goals

- Do not remove Terminal, Git review, worktrees, the chat minimap, skills,
  skill packs, MCP, plugins, or any existing user flow.
- Do not merge Next.js resource routes merely to reduce file count.
- Do not introduce generic component frameworks, repositories, factories, or
  transport interfaces with only one implementation.
- Preserve `useAgentSession` behavior at its only call site, `ChatWindow`.
  Its return shape may lose DOM and viewport refs when `ChatWindow` takes
  ownership of them.

## Design Rules

- A top-level module coordinates; feature modules own behavior.
- A caller crosses one small interface rather than coordinating a feature's
  internal state, transport, and rendering itself.
- Keep pure helpers where they already concentrate real logic. Do not merge
  `right-panel` tool registration, file access, or small tested helpers into
  larger files.
- The chat viewport owns DOM refs, scrolling, and history paging. The agent
  session owns data, runtime state, and commands; it must not manipulate DOM.
- Preserve one interaction loop as one module. In particular, draft text,
  attachments, completion, IME handling, keyboard dispatch, and send behavior
  are one ChatInput concern unless a smaller interface is demonstrated.
- Pack definition editing and workspace Pack application follow their existing
  user paths; shared library data does not make them one module.
- Move code only when the destination owns the behavior. Directory moves by
  themselves are not a deliverable.

## Target Shape

```text
AppShell
|- workspace navigation: selected session, cwd, URL, project switches
|- top bar: branch, system prompt, session stats, session actions
|  `- remains here until it can own its state and reset semantics without a
|     large prop interface
|- ChatWindow
|  |- agent session: session data, runtime/SSE, commands, notices; no DOM refs
|  |- chat viewport: scrolling, history paging, completion positioning, minimap
|  `- ChatInput: composer, completion, keyboard dispatch, and run controls
|- SkillsConfig: workspace skills, workspace Pack application, library work
|- SkillPacksModal: Pack definitions
`- MCP: workspace and library configuration
```

The shape describes ownership, not a mandatory one-file-per-box directory
layout. The `RightPanel` and its tool registry remain their own feature seam.

## Migration Plan

### 1. Agent Session

First move all viewport DOM refs and effects from `useAgentSession` into a
private ChatWindow viewport module. It owns scrolling, history paging,
completion positioning, and minimap coordination. `useAgentSession` returns
session data and runtime state, never element refs.

Then extract only a complete agent-run state machine. It owns prompt run ids,
SSE connection, reconciliation, completion, agent commands, and deferred Pack
reload. Do not split those operations into separate transport or reconciliation
modules: they share stale-run protection and must remain atomic. Session
loading, context navigation, and fork stay in `useAgentSession` until their
interface to that state machine is small. Notice and extension projection also
stay with the runtime until they have a single independent caller.

`agent-run.md` remains a separate reliability change; it may inform the
agent-run module when approved, but is not required to begin this structural
work.

### 2. Chat Input

Keep `ChatInput` as the interface used by `ChatWindow`. Keep the composer,
attachments, slash and `@` completion, IME handling, keyboard dispatch, queue
submission, and focus in one module because they share text selection and the
same key events. Do not extract a standalone command menu.

Extract run controls only when they have a compact value-and-callback
interface and own no draft state. The top-level input assembles layout but must
not become a second session-state owner or forward its full prop list through
new children.

### 3. Configuration Ownership

Keep configuration on its existing screens while giving each user flow one
owner:

- `SkillsConfig` owns installed skills, search, and library skills.
- A workspace-Packs module owns preview, apply, and unapply, and is rendered by
  `SkillsConfig` in the existing Workspace tab.
- `SkillPacksModal` owns Pack definitions only.
- `McpConfig` owns workspace and library MCP configuration.

Shared pack refresh remains one explicit callback at the app-shell seam. Do
not create a global configuration store.

### 4. Application Shell

Keep the top bar in `AppShell` for this migration. Its branch, prompt, and
session-stat state is reset by workspace transitions, so extracting it now
would create a prop-forwarding wrapper. Extract it only when it can own both
its local interaction state and its reset behavior through a smaller
interface.

Likewise, extract workspace navigation only after its session, cwd, URL, and
project-switch transitions form one cohesive module. `ChatWindow` continues to
publish branch, system-prompt, and session-stat values through its current
callbacks until a smaller shared interface is demonstrated.

### 5. Consolidate Only Real Duplication

- Keep Next.js route files resource-oriented; route count is not a problem.
- Keep the `RightPanel` registry and its focused tool definitions.
- Consolidate duplicated pack ownership only after steps 1-3 identify it.
- Replace Tailwind only as a separate, behavior-preserving dependency cleanup;
  it is not coupled to the module migration.

## Delivery Order

1. Add characterization tests for stale runs, missed SSE completion, deferred
   Pack reload, and waiting for that reload before the next prompt.
2. Move viewport DOM behavior from `useAgentSession` to ChatWindow without
   changing scroll, paging, minimap, or completion behavior.
3. Extract an agent-run module only if it owns the full asynchronous state
   machine and has a smaller interface than the code it replaces.
4. Extract the existing workspace-Packs behavior by ownership, without moving
   its screen or changing apply/unapply semantics.
5. Extract ChatInput run controls only if they avoid draft and keyboard state;
   defer the top bar and workspace navigation until their interfaces are real.
6. Remove obsolete glue only after callers have moved.

Each delivery is independently releasable. Do not combine formatting, visual
redesign, dependency upgrades, or product changes with it.

## Acceptance Criteria

- All existing product flows remain available from the same screens.
- Each extracted module has one clear owner and a smaller interface than the
  behavior it hides.
- `useAgentSession` owns no DOM refs; ChatWindow owns all viewport behavior.
- The agent-run module keeps run identity, SSE, reconciliation, and Pack reload
  in one state machine, so an old run cannot alter a newer run.
- ChatInput keeps its coupled composer interaction loop; extracted controls do
  not duplicate draft, focus, or keyboard state.
- Pack definitions and workspace application remain on their current screens
  with one owner each.
- No new global client store, generic modal system, or one-implementation
  adapter is added.
- Typecheck and lint pass. Focused behavior tests cover stale run completion,
  missed SSE reconciliation, deferred Pack reload, and next-prompt waiting;
  source-text assertions alone are not sufficient for these guarantees.
