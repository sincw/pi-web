export type TerminalModifier = "ctrl" | "alt";

export function applyTerminalModifier(modifier: TerminalModifier, data: string) {
  if (modifier === "alt") return `\x1b${data}`;
  const [first, ...rest] = Array.from(data);
  if (!first) return data;
  if (first === " ") return `\x00${rest.join("")}`;
  if (first === "?") return `\x7f${rest.join("")}`;
  const uppercase = first.toUpperCase();
  const code = uppercase.length === 1 ? uppercase.charCodeAt(0) : 0;
  return `${code >= 64 && code <= 95 ? String.fromCharCode(code & 0x1f) : first}${rest.join("")}`;
}
