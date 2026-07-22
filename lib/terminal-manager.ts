import * as pty from "node-pty";

export const MAX_OUTPUT_CHARS = 512_000;
export const MAX_OUTPUT_LINES = 2_000;
export const MAX_TERMINAL_SESSIONS = 20;
const MAX_OUTPUT_LINE_BREAKS = MAX_OUTPUT_LINES - 1;
const MAX_INPUT_CHARS = 64 * 1024;
const MAX_COMMAND_HISTORY = 50;
const MAX_COMMAND_CHARS = 8_000;
const MIN_COLS = 20;
const MAX_COLS = 400;
const MIN_ROWS = 6;
const MAX_ROWS = 200;
const TERMINAL_ID_RE = /^tool:terminal:[A-Za-z0-9_-]{8,128}$/;
const CLOSED_ID_TTL_MS = 60_000;

type TerminalListener = (event: TerminalEvent) => void;

export type TerminalEvent =
  | { type: "snapshot"; output: string; running: boolean; exitCode: number | null }
  | { type: "data"; data: string }
  | { type: "exit"; exitCode: number | null };

export type TerminalInfo = {
  id: string;
  cwd: string;
  projectRoot: string;
  title: string;
  running: boolean;
};

type TerminalSession = {
  cwd: string;
  projectRoot: string;
  title: string;
  output: string;
  outputLineBreaks: number;
  history: string[];
  input: string;
  pty: pty.IPty;
  listeners: Set<TerminalListener>;
  running: boolean;
  exitCode: number | null;
};

declare global {
  var __piTerminalSessions: Map<string, TerminalSession> | undefined;
  var __piClosedTerminalIds: Map<string, number> | undefined;
}

function sessions() {
  if (!globalThis.__piTerminalSessions) globalThis.__piTerminalSessions = new Map();
  return globalThis.__piTerminalSessions;
}

function wasTerminalClosed(id: string) {
  if (!globalThis.__piClosedTerminalIds) return false;
  const closedAt = globalThis.__piClosedTerminalIds.get(id);
  if (closedAt === undefined) return false;
  if (closedAt + CLOSED_ID_TTL_MS > Date.now()) return true;
  globalThis.__piClosedTerminalIds.delete(id);
  return false;
}

function emit(session: TerminalSession, event: TerminalEvent) {
  for (const listener of session.listeners) listener(event);
}

function preferredShell() {
  if (process.platform === "win32") return process.env.COMSPEC || "cmd.exe";
  return process.env.SHELL || "/bin/bash";
}

export function isTerminalId(id: string) {
  return TERMINAL_ID_RE.test(id);
}

export function normalizeTerminalSize(cols: unknown, rows: unknown) {
  const clamp = (value: unknown, min: number, max: number, fallback: number) => {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
  };
  return {
    cols: clamp(cols, MIN_COLS, MAX_COLS, 80),
    rows: clamp(rows, MIN_ROWS, MAX_ROWS, 24),
  };
}

function countLineBreaks(value: string) {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) if (value.charCodeAt(index) === 10) count += 1;
  return count;
}

function appendOutput(output: string, outputLineBreaks: number, data: string) {
  let next = output + data;
  let nextLineBreaks = outputLineBreaks + countLineBreaks(data);
  if (nextLineBreaks > MAX_OUTPUT_LINE_BREAKS) {
    let remaining = nextLineBreaks - MAX_OUTPUT_LINE_BREAKS;
    let start = 0;
    while (remaining > 0) {
      start = next.indexOf("\n", start) + 1;
      remaining -= 1;
    }
    next = next.slice(start);
    nextLineBreaks = MAX_OUTPUT_LINE_BREAKS;
  }
  if (next.length > MAX_OUTPUT_CHARS) {
    const start = next.length - MAX_OUTPUT_CHARS;
    const firstLineEnd = nextLineBreaks ? next.indexOf("\n", start) : -1;
    next = next.slice(firstLineEnd < 0 ? start : firstLineEnd + 1);
    nextLineBreaks = countLineBreaks(next);
  }
  return { output: next, outputLineBreaks: nextLineBreaks };
}

export function appendTerminalOutput(output: string, data: string) {
  return appendOutput(output, countLineBreaks(output), data).output;
}

function recordTerminalInput(session: TerminalSession, data: string) {
  // ponytail: linear input only; use a line editor if cursor-aware history is needed.
  if (data.startsWith("\x1b")) return;
  for (const character of data) {
    if (character === "\r" || character === "\n") {
      const command = session.input.trim();
      if (command) session.history = [command, ...session.history.filter((item) => item !== command)].slice(0, MAX_COMMAND_HISTORY);
      session.input = "";
    } else if (character === "\x7f" || character === "\b") {
      session.input = session.input.slice(0, -1);
    } else if (character === "\x03" || character === "\x15") {
      session.input = "";
    } else if (character >= " ") {
      session.input = (session.input + character).slice(-MAX_COMMAND_CHARS);
    }
  }
}

export function startTerminal(id: string, cwd: string, projectRoot: string, title: string, cols?: unknown, rows?: unknown) {
  if (wasTerminalClosed(id)) return null;
  const existing = sessions().get(id);
  if (existing) return existing;
  if (sessions().size >= MAX_TERMINAL_SESSIONS) {
    const oldestId = sessions().keys().next().value as string | undefined;
    if (oldestId) closeTerminal(oldestId);
  }

  const size = normalizeTerminalSize(cols, rows);
  const ptyProcess = pty.spawn(preferredShell(), process.platform === "win32" ? [] : ["-l"], {
    name: "xterm-256color",
    cols: size.cols,
    rows: size.rows,
    cwd,
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
  });
  const session: TerminalSession = {
    cwd,
    projectRoot,
    title,
    output: "",
    outputLineBreaks: 0,
    history: [],
    input: "",
    pty: ptyProcess,
    listeners: new Set(),
    running: true,
    exitCode: null,
  };
  sessions().set(id, session);
  ptyProcess.onData((data) => {
    const output = appendOutput(session.output, session.outputLineBreaks, data);
    session.output = output.output;
    session.outputLineBreaks = output.outputLineBreaks;
    emit(session, { type: "data", data });
  });
  ptyProcess.onExit(({ exitCode }) => {
    session.running = false;
    session.exitCode = exitCode;
    emit(session, { type: "exit", exitCode });
  });
  return session;
}

export function listTerminals(projectRoot?: string): TerminalInfo[] {
  return [...sessions()].flatMap(([id, session]) => projectRoot && session.projectRoot !== projectRoot
    ? []
    : [{ id, cwd: session.cwd, projectRoot: session.projectRoot, title: session.title, running: session.running }]);
}

export function subscribeTerminal(id: string, listener: TerminalListener) {
  const session = sessions().get(id);
  if (!session) return null;
  listener({ type: "snapshot", output: session.output, running: session.running, exitCode: session.exitCode });
  session.listeners.add(listener);
  return () => session.listeners.delete(listener);
}

export function getTerminalHistory(id: string) {
  return sessions().get(id)?.history ?? [];
}

export function writeTerminal(id: string, data: unknown) {
  const session = sessions().get(id);
  if (!session) return "missing" as const;
  if (!session.running) return "closed" as const;
  if (typeof data !== "string" || !data || data.length > MAX_INPUT_CHARS) return "invalid" as const;
  recordTerminalInput(session, data);
  session.pty.write(data);
  return "ok" as const;
}

export function resizeTerminal(id: string, cols: unknown, rows: unknown) {
  const session = sessions().get(id);
  if (!session) return false;
  const size = normalizeTerminalSize(cols, rows);
  session.pty.resize(size.cols, size.rows);
  return true;
}

export function closeTerminal(id: string) {
  const session = sessions().get(id);
  if (!globalThis.__piClosedTerminalIds) globalThis.__piClosedTerminalIds = new Map();
  globalThis.__piClosedTerminalIds.set(id, Date.now());
  if (!session) return false;
  const wasRunning = session.running;
  sessions().delete(id);
  session.running = false;
  emit(session, { type: "exit", exitCode: session.exitCode });
  session.listeners.clear();
  if (wasRunning) session.pty.kill();
  return true;
}
