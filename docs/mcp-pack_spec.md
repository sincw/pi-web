# MCP Pack Specification

## Problem Statement

Pivot UI already lets users compose library skills into Skill Packs and apply them to a workspace. MCP server definitions need the same reusable Pack workflow without pretending that an MCP configuration is a copied skill directory.

Users need to save MCP definitions once, attach them to Packs, and apply the resulting capability set to a workspace. They must be able to see when a Pack is stale or conflicted, preserve manually maintained project configuration, and avoid overriding a team's shared `.mcp.json`. Applying, removing, or changing a Pack must not leave the workspace with only part of the requested capability set or let concurrent browser actions overwrite each other.

## Solution

Extend Pack definitions with immutable MCP server references. MCP server definitions live in the existing library root as individual metadata files. Applying a Pack computes the complete MCP server union for the target workspace and reconciles only pivot-ui-managed entries in the workspace Pi MCP configuration.

The workspace Pack operation is the single seam for previewing and committing Pack changes. It receives the desired Pack set and a workspace revision, validates all references, protects team configuration and manual edits, then either returns a blocked plan or commits skills, MCP configuration, and the workspace receipt atomically. The browser's preview is explanatory only; the server recomputes before it writes.

The first release covers library definitions, Pack references, adapter readiness, protected reconciliation, and the existing Apply/Remove workflow. Workspace MCP toggles, an effective-environment viewer, and current-session reload follow after that. OAuth, importers, connection testing, and templates remain later work.

## User Stories

1. As a Pivot UI user, I want to save an MCP server definition in my library, so that I can reuse it across Packs and workspaces.
2. As a Pack author, I want to add library MCP servers beside skills, so that one Pack can describe a complete task environment.
3. As a Pack author, I want MCP references to record the definition hash, so that a changed library server never silently changes a Pack.
4. As a workspace user, I want applying a Pack to show the combined skill and MCP changes before confirmation, so that I know what will be enabled.
5. As a workspace user, I want all applied Packs to contribute one MCP server union, so that removing one of two Packs does not disconnect a server still required by the other.
6. As a workspace user, I want a same-key, different-hash MCP reference to block the operation, so that Pivot UI never chooses a server version arbitrarily.
7. As a workspace user, I want a missing or stale library server to block the operation, so that the workspace cannot claim a configuration it cannot reproduce.
8. As a team repository contributor, I want a server defined in the team's `.mcp.json` to remain authoritative, so that a personal Pack cannot override the shared project configuration.
9. As a workspace user, I want a Pack server shadowed by team configuration to be shown as skipped, so that I can distinguish it from a successfully managed server.
10. As a workspace user, I want manually added entries in `.pi/mcp.json` to survive Pack operations, so that Pivot UI does not destroy configuration it does not own.
11. As a workspace user, I want a pivot-ui-managed server that I edit manually to become externally managed, so that later Pack removal does not delete my edits.
12. As a workspace user, I want removing a Pack to remove only MCP entries no remaining Pack requires and that pivot-ui still owns, so that shared and manually edited servers remain intact.
13. As a user with multiple browser tabs open, I want a stale Pack confirmation to be rejected, so that a later workspace change cannot be overwritten by an older preview.
14. As a user without the MCP adapter installed, I want to prepare library entries and Pack references, so that I can organize an environment before enabling it.
15. As a user without the MCP adapter installed, I want project application, removal, and toggling to be blocked with a clear action, so that Pivot UI never marks a non-running MCP configuration as applied.
16. As a user handling credentials, I want Pack definitions to use environment-variable references rather than secret values, so that library and workspace files do not disclose credentials.
17. As a user of direct tools, I want Pivot UI to explain that they are global adapter configuration, so that I do not expect a workspace Pack to register process-startup tools.
18. As a workspace user, I want MCP servers enabled by default after a successful apply, so that the Pack's declared capabilities are immediately available to new sessions.
19. As a workspace user, I want to disable a pivot-ui-managed MCP server without deleting its Pack membership, so that I can temporarily reduce the project capability set.
20. As a user with an active session, I want to explicitly reload the session after a workspace MCP change, so that I control when existing server connections are replaced.
21. As a user sharing a Pack, I want its library references to remain portable without copying credentials, so that another user can supply their own environment variables or authorization.
22. As a user whose Pack definition was deleted after application, I want the workspace receipt to preserve the last MCP reference snapshot, so that later reconciliation is predictable and visibly recoverable.

## Implementation Decisions

- The Pack model is upgraded to schema version 2. A Pack has existing skill references and MCP server references. Each MCP reference contains a case-insensitive `serverKey` and a hash of its server definition.
- The library stores each MCP server as one JSON metadata file under the configured library root. Metadata includes a stable name, description, and source information; only the validated server definition participates in the hash.
- MCP definition hashes are deterministic over recursively key-sorted JSON values. This extends the existing content-hash module instead of introducing a second hashing subsystem.
- The library accepts only the adapter's supported per-server fields needed for stdio and HTTP connections. Direct tool registration is rejected for Pack definitions. Literal bearer tokens, authorization headers, and OAuth credentials are rejected; environment-variable references are allowed.
- The workspace receipt is upgraded to schema version 2. It retains applied Pack labels, per-Pack skill and MCP reference snapshots, skipped conflicts, managed MCP baselines, disabled server keys, and a monotonically increasing workspace revision.
- Schema version describes the file shape. Workspace revision describes a particular state of that workspace and increments after every successful Pack mutation, including apply, removal, and MCP toggle.
- The workspace Pack operation is the only seam that decides MCP effects. Its interface accepts the target Pack set and expected workspace revision, and returns either a preview/blocked result or an applied result. It owns validation, union construction, team conflict detection, managed-entry protection, atomic commit, rollback, and receipt updates.
- The existing Pack preview, apply, and remove callers are extended to use that seam. Browser-supplied plans are never written directly; the server recomputes the plan after validating the expected revision.
- Reconciliation is serialized per workspace cwd in the Pivot UI process. Version conflicts return `409` rather than retrying or selecting a winner. This release assumes one Pivot UI process; introduce a cross-process lock only if multi-instance deployment becomes a real requirement.
- MCP reconciliation uses the complete desired Pack union, never just the Pack that triggered the action. Same key and same hash deduplicate; same key and different hash block.
- Before writing the Pi project configuration, reconciliation reads the team project configuration. The adapter loads the Pi project configuration after the team project configuration, so a same-key Pack entry would override team fields. Such entries are reported as `shadowed_by_team_config`, excluded from Pivot UI writes, and treated as skipped for Pack status.
- Reconciliation owns only explicitly recorded managed entries in the Pi project configuration. Unknown entries, modified managed entries, imports, settings, and unknown top-level fields are preserved. An entry whose current hash differs from its managed baseline becomes external and is never replaced or deleted automatically.
- The combined skill and MCP operation is atomic from the caller's perspective. New skill directories are staged before publication, the MCP file is replaced atomically, and the workspace receipt is written last. Failure restores the prior MCP content and removes only skill directories created by that attempt.
- Existing Skill Pack semantics are not changed by this work. A same-name project skill is skipped without comparing content hashes, and removal keeps the current union-based directory deletion behavior.
- MCP adapter readiness is required only for operations that change the workspace MCP result or reload a session. Library CRUD and Pack editing remain available when the adapter is missing or disabled.
- A missing or disabled adapter returns a precondition failure from server-side workspace MCP mutations. UI gating is informational and does not replace the server-side check.
- MCP servers introduced through a Pack are enabled by default. The follow-up toggle stores disabled server keys in the workspace receipt and invokes the same reconciliation seam; it only affects still-managed entries.
- Current-session MCP reload reuses the existing generic session reload command after the workspace change. No MCP-specific RPC command is added.
- New sessions read the resulting workspace configuration naturally through the adapter. Applying a Pack does not inject per-session configuration or create per-session temporary files.
- The UI remains within the existing Packs and Skills surfaces. The first release adds MCP references to the Pack editor and shows MCP changes in the existing workspace Apply/Remove confirmation. A separate MCP navigation surface is not introduced.

## Testing Decisions

- Tests exercise the workspace Pack operation at its public preview and apply/remove seam. A good test asserts observable workspace state: the project skill directories, Pi MCP configuration, workspace receipt, and returned result or error. It does not assert helper call order or temporary filenames.
- Extend the existing Node built-in test and Jiti-based Skill Pack test style. Existing skill Pack preview, apply, rollback, workspace-state, and content-hash tests are the prior art.
- Test deterministic MCP definition hashing for object key order, nested objects, and definition-only hashing.
- Test Pack schema migration from version 1 and workspace receipt migration without assigning ownership to pre-existing MCP entries.
- Test a successful mixed Pack apply writes the requested skill copies, managed MCP entries, receipt snapshots, and incremented revision.
- Test apply rollback when skill staging or MCP publication fails, leaving no new skill directory, no changed MCP configuration, and no new receipt state.
- Test two Packs sharing the same server key and hash produce one managed entry; removing one retains it; removing the last one removes it only when still managed.
- Test same-key MCP references with different hashes block before any workspace write.
- Test missing and stale library definitions block before any workspace write.
- Test an existing external Pi project entry is preserved for both same-hash and different-hash collisions.
- Test a managed entry modified outside Pivot UI is preserved after apply, remove, and toggle attempts.
- Test a team project `.mcp.json` collision produces `shadowed_by_team_config` and does not write the overlapping Pi project entry.
- Test settings, imports, and unknown top-level Pi project configuration fields survive reconciliation unchanged.
- Test an outdated workspace revision returns conflict and leaves the current workspace state untouched.
- Test adapter readiness at the route seam: workspace MCP mutations reject when unavailable, while library and Pack definition edits remain available.
- Test the follow-up toggle through the same operation seam: disable removes only an unmodified managed entry, enable restores it from the current library definition, and external/team entries cannot be toggled.
- Run TypeScript typechecking and the affected Node test files as part of implementation verification.

## Out of Scope

- OAuth authorization UI and OAuth callback handling.
- Importing MCP definitions from Cursor, Claude Code, Codex, Windsurf, or VS Code.
- Connection testing, server templates, and marketplace discovery.
- Dynamic Pack support for adapter direct tools.
- Field-level merging of conflicting MCP definitions.
- Per-session Pack selection, temporary MCP configuration files, or per-project default Pack mappings.
- A new MCP-specific session reload command.
- Changing existing Skill Pack collision or removal semantics.
- A standalone MCP modal or navigation section.
- Cross-process reconciliation locking for multi-instance Pivot UI deployments.

## Further Notes

- The adapter merges shared-global, Pi-global, shared-project, then Pi-project configuration. The Pi-project source is therefore not a safe location for a Pack entry sharing a team project server key.
- Existing sessions are not implicitly changed by an apply. The first release relies on new sessions; the explicit UI confirmation for the existing generic reload follows in the next release.
- Pack library definitions can be prepared without the adapter, but they do not become an applied workspace capability set until the adapter is ready.
- This specification is local project documentation by request; it is not published as an issue.
