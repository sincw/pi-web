import type { SkillSearchResult } from "./api-types";

export const SKILL_PAGE_SIZE = 15;
export const MAX_SKILL_PAGES = 8;

export type SkillRankingView = "all-time" | "trending" | "hot";

interface RankingCacheEntry {
  expiresAt: number;
  results: SkillSearchResult[];
}

declare global {
  var __piSkillsRankingCache: Map<SkillRankingView, RankingCacheEntry> | undefined;
}

const CACHE_TTL_MS = 5 * 60_000;
const SKILLS_WEB_BASE = process.env.SKILLS_WEB_URL || "https://skills.sh";
const RANKING_PATHS: Record<SkillRankingView, string> = {
  "all-time": "/",
  trending: "/trending",
  hot: "/hot",
};
const EMBEDDED_SKILL_RE = /\{\\"source\\":\\"((?:[^"\\]|\\(?!"))*)\\",\\"skillId\\":\\"((?:[^"\\]|\\(?!"))*)\\",\\"name\\":\\"((?:[^"\\]|\\(?!"))*)\\",\\"installs\\":(\d+)/g;

function formatInstalls(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M installs`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K installs`;
  return `${count} install${count === 1 ? "" : "s"}`;
}

function asRankingResult(value: unknown): SkillSearchResult | null {
  if (!value || typeof value !== "object") return null;
  const skill = value as Record<string, unknown>;
  const source = typeof skill.source === "string" ? skill.source : "";
  const skillId = typeof skill.skillId === "string" ? skill.skillId : typeof skill.name === "string" ? skill.name : "";
  const installs = typeof skill.installs === "number" ? skill.installs : 0;
  if (!source || !skillId || installs < 0) return null;
  return {
    package: `${source}@${skillId}`,
    installs: formatInstalls(installs),
    url: `${SKILLS_WEB_BASE}/${source}/${skillId}`,
  };
}

function findSkills(value: unknown): unknown[] | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const skills = findSkills(child);
      if (skills) return skills;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.skills)) return record.skills;
  for (const child of Object.values(record)) {
    const skills = findSkills(child);
    if (skills) return skills;
  }
  return null;
}

function extractNextDataSkills(html: string): SkillSearchResult[] {
  const match = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return [];
  try {
    return (findSkills(JSON.parse(match[1])) ?? []).map(asRankingResult).filter((skill): skill is SkillSearchResult => skill !== null);
  } catch {
    return [];
  }
}

function decodeEscapedJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function extractEmbeddedSkills(html: string): SkillSearchResult[] {
  const results: SkillSearchResult[] = [];
  for (const match of html.matchAll(EMBEDDED_SKILL_RE)) {
    const result = asRankingResult({
      source: decodeEscapedJsonString(match[1]),
      skillId: decodeEscapedJsonString(match[2]),
      name: decodeEscapedJsonString(match[3]),
      installs: Number(match[4]),
    });
    if (result) results.push(result);
  }
  return results;
}

export function extractRankedSkills(html: string): SkillSearchResult[] {
  const results = extractNextDataSkills(html);
  const source = results.length > 0 ? results : extractEmbeddedSkills(html);
  return Array.from(new Map(source.map((skill) => [skill.package, skill])).values());
}

function rankingCache(): Map<SkillRankingView, RankingCacheEntry> {
  if (!globalThis.__piSkillsRankingCache) globalThis.__piSkillsRankingCache = new Map();
  return globalThis.__piSkillsRankingCache;
}

export async function loadSkillRanking(view: SkillRankingView): Promise<SkillSearchResult[]> {
  const cached = rankingCache().get(view);
  if (
    cached
    && cached.expiresAt > Date.now()
    && cached.results.every((skill) => skill.package.length < 300 && skill.url.length < 500)
  ) return cached.results;

  const res = await fetch(`${SKILLS_WEB_BASE}${RANKING_PATHS[view]}`, {
    cache: "no-store",
    headers: { Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`skills.sh ${view} ranking failed: HTTP ${res.status}`);
  const results = extractRankedSkills(await res.text());
  if (results.length === 0) throw new Error("skills.sh ranking data was not found");

  rankingCache().set(view, { results, expiresAt: Date.now() + CACHE_TTL_MS });
  return results;
}

export function paginateSkillResults(results: SkillSearchResult[], requestedPage: number) {
  const totalPages = Math.min(MAX_SKILL_PAGES, Math.ceil(results.length / SKILL_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), Math.max(1, totalPages));
  const start = (page - 1) * SKILL_PAGE_SIZE;
  return { results: results.slice(start, start + SKILL_PAGE_SIZE), page, totalPages };
}
