# Pivot UI

[中文文档](./README.zh-CN.md)

Pivot UI is a responsive local workspace for the [pi coding agent](https://github.com/badlogic/pi-mono). It brings sessions, agent chat, project files, Git review, terminals, and agent configuration into one interface that works well on desktop and phone.

<!-- Screenshot slot: add an overview image here, for example `docs/images/overview-desktop.png` (16:10 recommended). -->

## Built for active agent work

- **Resume real sessions**: browse local pi sessions by project, follow live streaming output, inspect context and cost, then continue from where you left off.
- **Explore without losing a path**: fork a session into a new file or switch between in-session branches. Export a conversation as standalone HTML when you need to share it.
- **Keep the project beside the chat**: browse the workspace, mention files with `@`, and preview source, Markdown, HTML, images, audio, PDF, and DOCX without leaving the conversation.
- **Review the actual change**: open Changes, branch comparisons, and commit history in the right panel, with unified or side-by-side diffs for an individual file.

<!-- Screenshot slot: add a project and Git review image here, for example `docs/images/review-panel.png` (16:10 recommended). -->

## One workspace, not just a chat window

- **Worktrees**: create, switch, and remove Git worktrees from the workspace switcher. Sessions from linked worktrees stay grouped with their parent project.
- **Project terminals**: open persistent terminal tabs for the selected project, with command history and favorites. They remain available while you move through the workspace.
- **Models and authentication**: choose configured models, manage API keys and OAuth/device-code login, and test model connections from the UI.
- **Skills, plugins, and MCP**: search and install skills, manage package plugins, keep reusable skills and MCP server definitions in a library, and apply versioned Skill Packs to a workspace with a preview before changes are written.
- **Comfortable viewing**: switch among light, dark, and eye-comfort themes.

## Made for desktop and mobile

Pivot UI changes its layout rather than only shrinking it on a narrow screen.

- The project sidebar becomes a drawer and closes after a session or workspace is selected, leaving the chat visible.
- Session controls, branch navigation, model selection, and configuration panels use compact, viewport-bounded layouts.
- The right panel is closed by default on mobile and can be opened only when a file, review, or terminal needs attention.
- The terminal includes touch-friendly controls, modifier keys, command history, and visual-viewport handling so the software keyboard does not cover the active prompt.

<!-- Screenshot slot: add a phone-sized chat or terminal image here, for example `docs/images/mobile-terminal.png` (9:16 recommended). -->

## Quick start

Run from source:

```bash
git clone https://github.com/sincw/pivot-ui.git
cd pivot-ui
npm install
npm run dev
```

After `@sincw/pivot-ui` is published to npm, you can also run it without installing:

```bash
npx @sincw/pivot-ui@latest
```

Or install it globally:

```bash
npm install -g @sincw/pivot-ui
pivot-ui
```

Open [http://localhost:30141](http://localhost:30141). The CLI opens a browser after the server is ready unless disabled.

```bash
pivot-ui --port 8080              # custom port
pivot-ui --hostname 127.0.0.1     # local access only
pivot-ui --no-open                # do not open a browser

PORT=8080 pivot-ui                # choose a port
PIVOT_UI_NO_OPEN=1 pivot-ui       # useful for a background service
```

## Local data and safety

- Session history remains in pi's local `~/.pi/agent/sessions` directory. Set `PI_CODING_AGENT_DIR` to use another pi agent directory.
- File browsing is scoped to selected projects and session-known working directories; it is not a general filesystem browser.
- The default Skill Library is `~/.pivot-ui/lib/skills`. An existing explicit library path in pi's Skill Pack configuration is left unchanged.

## Development

```bash
npm install
npm run dev
```

The development server runs at [http://localhost:30141](http://localhost:30141).

```bash
node --test lib/*.test.mjs components/*.test.mjs
node_modules/.bin/tsc --noEmit
npm run lint
```

Do not run `next build` during local development. It writes to `.next/` and can interfere with the development server; reserve production builds for releases.
