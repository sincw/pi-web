import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const GATEWAY_SESSION_COOKIE = "pivot-ui-gateway";
export const GATEWAY_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

interface GatewayAuthOptions {
  tokenPath?: string;
  log?: (message: string) => void;
}

export function getGatewayTokenPath(home = homedir()): string {
  return join(home, ".pivot-ui", "gateway-token");
}

function readToken(tokenPath: string): string | null {
  try {
    return readFileSync(tokenPath, "utf8").trim() || null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function getGatewayToken({ tokenPath = getGatewayTokenPath(), log = console.log }: GatewayAuthOptions = {}): string {
  const existing = readToken(tokenPath);
  if (existing) return existing;

  mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString("base64url");
  try {
    writeFileSync(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    log(`\nPivot UI gateway token created:\n${token}\nSaved to ${tokenPath}\n`);
    return token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const concurrent = readToken(tokenPath);
    if (concurrent) return concurrent;
    throw new Error(`Gateway token file is empty: ${tokenPath}`);
  }
}

function matches(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function matchesGatewayToken(value: string, options?: GatewayAuthOptions): boolean {
  return matches(value, getGatewayToken(options));
}

function signSession(expiresAt: string, token: string): string {
  return createHmac("sha256", token).update(expiresAt).digest("base64url");
}

export function createGatewaySession(options?: GatewayAuthOptions): string {
  const expiresAt = String(Date.now() + GATEWAY_SESSION_MAX_AGE * 1000);
  return `${expiresAt}.${signSession(expiresAt, getGatewayToken(options))}`;
}

export function isGatewaySessionValid(session: string | undefined, options?: GatewayAuthOptions): boolean {
  if (!session) return false;
  const [expiresAt, signature, extra] = session.split(".");
  if (!expiresAt || !signature || extra || !/^\d+$/.test(expiresAt) || Number(expiresAt) <= Date.now()) return false;
  return matches(signature, signSession(expiresAt, getGatewayToken(options)));
}
