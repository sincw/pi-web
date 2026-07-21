import { NextResponse } from "next/server";
import { runNpx } from "@/lib/npx";
import type { SkillSearchResult } from "@/lib/api-types";
import {
  MAX_SKILL_PAGES,
  SKILL_PAGE_SIZE,
  loadSkillRanking,
  paginateSkillResults,
  type SkillRankingView,
} from "@/lib/skills-ranking";

export const dynamic = "force-dynamic";

const ANSI_RE = /\x1B\[[0-9;]*m/g;
const DEFAULT_LIMIT = SKILL_PAGE_SIZE * MAX_SKILL_PAGES;
const MIN_LIMIT = 1;
const MAX_LIMIT = DEFAULT_LIMIT;
const SEARCH_API_BASE = process.env.SKILLS_API_URL || "https://skills.sh";

interface SkillsApiSkill {
  id?: string;
  name?: string;
  source?: string;
  installs?: number;
}

interface SkillsApiResponse {
  skills?: SkillsApiSkill[];
}

function parseLimit(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(num)));
}

function parsePage(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(MAX_SKILL_PAGES, Math.max(1, Math.floor(num)));
}

function isRankingView(value: unknown): value is SkillRankingView {
  return value === "all-time" || value === "trending" || value === "hot";
}

function formatInstalls(count?: number): string {
  if (!count || count <= 0) return "";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M installs`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K installs`;
  return `${count} install${count === 1 ? "" : "s"}`;
}

function parseSearchOutput(raw: string): SkillSearchResult[] {
  const clean = raw.replace(ANSI_RE, "");
  const results: SkillSearchResult[] = [];
  const lines = clean.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // package line: "owner/repo@skill  NNK installs"
    const pkgMatch = line.match(/^([\w.\-]+\/[\w.\-@:]+)\s+([\d.,]+[KMB]?\s+installs)$/);
    if (pkgMatch) {
      const urlLine = lines[i + 1]?.trim().replace(/^└\s*/, "");
      results.push({
        package: pkgMatch[1],
        installs: pkgMatch[2],
        url: urlLine?.startsWith("https://") ? urlLine : "",
      });
    }
  }
  return results;
}

async function searchSkillsApi(query: string, limit: number): Promise<SkillSearchResult[]> {
  const url = `${SEARCH_API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`skills.sh search failed: HTTP ${res.status}`);

  const data = (await res.json()) as SkillsApiResponse;
  return (data.skills ?? [])
    .map((skill) => {
      const name = skill.name?.trim();
      const source = skill.source?.trim();
      const slug = skill.id?.trim();
      if (!name || (!source && !slug)) return null;

      const pkg = `${source || slug}@${name}`;
      return {
        package: pkg,
        installs: formatInstalls(skill.installs),
        url: slug ? `${SEARCH_API_BASE}/${slug}` : "",
      };
    })
    .filter((skill): skill is SkillSearchResult => skill !== null);
}

// POST /api/skills/search  body: { query?: string, view?: "all-time" | "trending" | "hot", page?: number }
export async function POST(req: Request) {
  try {
    const { query, view, page: rawPage, limit: rawLimit } = await req.json() as {
      query?: string;
      view?: unknown;
      page?: unknown;
      limit?: unknown;
    };
    const page = parsePage(rawPage);

    if (view !== undefined) {
      if (!isRankingView(view)) return NextResponse.json({ error: "invalid ranking view" }, { status: 400 });
      return NextResponse.json(paginateSkillResults(await loadSkillRanking(view), page));
    }

    if (!query?.trim()) return NextResponse.json({ error: "query required" }, { status: 400 });
    const limit = parseLimit(rawLimit);

    try {
      const results = await searchSkillsApi(query.trim(), limit);
      return NextResponse.json(paginateSkillResults(results, page));
    } catch {
      const { stdout, stderr } = await runNpx(["skills", "find", query.trim()], {
        timeout: 20000,
        env: { ...process.env, FORCE_COLOR: "0" },
      });

      const results = parseSearchOutput(stdout + stderr).slice(0, limit);
      return NextResponse.json(paginateSkillResults(results, page));
    }
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const raw = (err.stdout ?? "") + (err.stderr ?? "");
    const results = raw ? parseSearchOutput(raw) : [];
    if (results.length > 0) return NextResponse.json(paginateSkillResults(results, 1));
    return NextResponse.json({ error: err.message ?? String(e) }, { status: 500 });
  }
}
