"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { WorkspacePacks } from "./WorkspacePacks";
import type {
  SkillInfo as Skill,
  SkillSearchResult,
  SkillUpdateResult,
  SkillPackInfo,
  SkillPackDetail,
  AppliedPackInfo,
  LibrarySkillInfo,
} from "@/lib/api-types";

function shortenPath(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

function shortHash(hash?: string): string {
  return hash ? hash.slice(0, 8) : "";
}

function sourceLabel(skill: Skill): string {
  const src = skill.sourceInfo?.source;
  const scope = skill.sourceInfo?.scope;
  if (scope === "user" || src === "user") return "global";
  if (scope === "project" || src === "project") return "project";
  return "path";
}

function skillKeyFromSkill(skill: Skill): string {
  return skill.baseDir.replace(/\\/g, "/").split("/").pop() ?? "";
}

function updateKey(skill: Skill): string | null {
  return skill.install ? `${skill.install.scope}\0${skill.install.package}` : null;
}

function shortVersion(version?: string): string {
  return version ? version.slice(0, 8) : "unknown";
}

function splitMarketPackage(pkg: string): { source: string; name: string } {
  const separator = pkg.lastIndexOf("@");
  if (separator <= 0) return { source: "skills.sh", name: pkg };
  return { source: pkg.slice(0, separator), name: pkg.slice(separator + 1) };
}

type MarketplaceListing =
  | { kind: "ranking"; view: "all-time" | "trending" | "hot" }
  | { kind: "search"; query: string };

function SourceAvatar({ source }: { source: string }) {
  const owner = source.split("/")[0];
  return (
    <span className="skill-source-mark" aria-hidden="true">
      <span className="skill-source-avatar-fallback">{source.slice(0, 1).toUpperCase()}</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic GitHub avatar with a local fallback */}
      <img
        src={`https://github.com/${owner}.png?size=64`}
        alt=""
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </span>
  );
}

function Toggle({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      title={
        enabled
          ? "Visible in model prompt — click to disable"
          : "Hidden from model prompt — click to enable"
      }
      style={{
        flexShrink: 0,
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        padding: 0,
        cursor: loading ? "wait" : "pointer",
        background: enabled ? "var(--accent)" : "var(--border)",
        position: "relative",
        transition: "background 0.18s",
        outline: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: enabled ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "var(--bg)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
          transition: "left 0.18s cubic-bezier(.4,0,.2,1)",
        }}
      />
    </button>
  );
}

function SkillDetail({
  skill,
  cwd,
  onToggle,
  toggling,
  saveError,
  updateStatus,
  checkingUpdate,
  updating,
  updateError,
  onCheckUpdate,
  onUpdate,
}: {
  skill: Skill;
  cwd: string;
  onToggle: (skill: Skill) => void;
  toggling: boolean;
  saveError: string | null;
  updateStatus?: SkillUpdateResult;
  checkingUpdate: boolean;
  updating: boolean;
  updateError: string | null;
  onCheckUpdate: () => void;
  onUpdate: () => void;
}) {
  const label = sourceLabel(skill);
  const enabled = !skill.disableModelInvocation;

  function displayPath(p: string): string {
    if (label === "project" && p.startsWith(cwd)) {
      const rel = p.slice(cwd.length).replace(/^[/\\]/, "");
      return `./${rel}`;
    }
    return shortenPath(p);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{
            fontSize: 10,
            padding: "1px 5px",
            borderRadius: 3,
            flexShrink: 0,
            background: label === "project" ? "rgba(99,102,241,0.12)" : "rgba(120,120,120,0.12)",
            color: label === "project" ? "rgba(99,102,241,0.8)" : "var(--text-dim)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-dim)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayPath(skill.filePath)}
        </span>
        <Toggle enabled={enabled} loading={toggling} onToggle={() => onToggle(skill)} />
        {saveError && <span style={{ fontSize: 12, color: "#f87171", flexShrink: 0 }}>{saveError}</span>}
      </div>

      {skill.install?.skillsShUrl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Source</span>
          <a
            href={skill.install.skillsShUrl}
            target="_blank"
            rel="noreferrer"
            title={skill.install.skillsShUrl}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "fit-content",
              maxWidth: "100%",
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {skill.install.skillsShUrl.replace(/^https?:\/\//, "")} ↗
            </span>
          </a>
        </div>
      )}

      {skill.install && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Version</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
              {shortVersion(updateStatus?.currentVersion ?? skill.install.versionHash)}
            </span>
            {skill.install.canCheckForUpdates && (
              <button
                onClick={onCheckUpdate}
                disabled={checkingUpdate || updating}
                style={{
                  padding: "4px 9px",
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  background: "none",
                  color: "var(--text-muted)",
                  cursor: checkingUpdate || updating ? "not-allowed" : "pointer",
                  opacity: checkingUpdate || updating ? 0.5 : 1,
                  fontSize: 11,
                }}
              >
                Check
              </button>
            )}
            {updateStatus?.state === "update-available" && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#d97706" }}>
                {shortVersion(updateStatus.latestVersion)}
              </span>
            )}
            {(checkingUpdate || (updateStatus && updateStatus.state !== "update-available")) && (
              <span
                style={{
                  fontSize: 12,
                  color: checkingUpdate
                    ? "var(--accent)"
                    : updateStatus?.state === "up-to-date"
                      ? "#16a34a"
                      : updateStatus?.state === "error"
                        ? "#ef4444"
                        : "var(--text-dim)",
                }}
              >
                {checkingUpdate
                  ? "Checking..."
                  : updateStatus?.state === "up-to-date"
                    ? "Up to date"
                    : updateStatus?.state === "unsupported"
                      ? "Automatic checks unavailable"
                      : updateStatus?.message || "Check failed"}
              </span>
            )}
            {updateStatus?.state === "update-available" && (
              <button
                onClick={onUpdate}
                disabled={updating || checkingUpdate}
                style={{
                  padding: "4px 10px",
                  border: "none",
                  borderRadius: 5,
                  background: "var(--accent)",
                  color: "#fff",
                  cursor: updating || checkingUpdate ? "not-allowed" : "pointer",
                  opacity: updating || checkingUpdate ? 0.5 : 1,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {updating ? "Updating..." : "Update"}
              </button>
            )}
          </div>
          {updateError && <span style={{ fontSize: 12, color: "#ef4444" }}>{updateError}</span>}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Name</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text)" }}>{skill.name}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Description</span>
        <span style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}>{skill.description}</span>
      </div>
    </div>
  );
}

function LibrarySkillPicker({
  cwd,
  onInstalled,
}: {
  cwd: string;
  onInstalled: () => void;
}) {
  const [skills, setSkills] = useState<LibrarySkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/skill-library")
      .then((res) => res.json() as Promise<{ skills?: LibrarySkillInfo[]; error?: string }>)
      .then((data) => {
        if (data.error) setError(data.error);
        else setSkills(data.skills ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const install = async (skillKey: string) => {
    setInstalling(skillKey);
    setError(null);
    try {
      const res = await fetch("/api/skills/install-from-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, skillKey }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      onInstalled();
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>Add Skill from Library</div>
      {error && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 10 }}>{error}</div>}
      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Loading…</div>
      ) : skills.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No skills in the library. Add skills in the Acquire tab first.</div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {skills.map((s) => {
              const isExpanded = expanded === s.skillKey;
              return (
                <div
                  key={s.skillKey}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-panel)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.name}</span>
                    <button
                      onClick={() => void install(s.skillKey)}
                      disabled={installing === s.skillKey}
                      style={{
                        background: "none",
                        border: "none",
                        color: installing === s.skillKey ? "var(--accent)" : "var(--accent)",
                        cursor: installing === s.skillKey ? "not-allowed" : "pointer",
                        fontSize: 12,
                        padding: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {installing === s.skillKey ? "Adding…" : "Add"}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {s.skillKey} · {shortHash(s.contentHash)}
                  </div>
                  {isExpanded && s.description && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{s.description}</div>
                  )}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : s.skillKey)}
                    style={{
                      alignSelf: "flex-start",
                      fontSize: 10,
                      color: "var(--accent)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {isExpanded ? "Hide details" : "Details"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LibraryImportPanel({ onImported }: { onImported: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [librarySkillKeys, setLibrarySkillKeys] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState("all");
  const [listing, setListing] = useState<MarketplaceListing>({ kind: "ranking", view: "all-time" });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [mode, setMode] = useState<"market" | "local" | "git">("market");
  const [localPath, setLocalPath] = useState("");
  const [importingLocal, setImportingLocal] = useState(false);
  const [gitUrl, setGitUrl] = useState("");
  const [importingGit, setImportingGit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fetchLibrarySkillKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/skill-library");
      if (!res.ok) return new Set<string>();
      const data = (await res.json()) as { skills?: LibrarySkillInfo[] };
      return new Set((data.skills ?? []).flatMap((skill) => [skill.skillKey, skill.name].map((value) => value.toLowerCase())));
    } catch {
      return new Set<string>();
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    void fetchLibrarySkillKeys().then((keys) => {
      if (!ignore) setLibrarySkillKeys(keys);
    });
    return () => {
      ignore = true;
    };
  }, [fetchLibrarySkillKeys]);

  const loadResults = useCallback(async (nextListing: MarketplaceListing, nextPage: number) => {
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const res = await fetch("/api/skills/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextListing.kind === "search"
          ? { query: nextListing.query, page: nextPage }
          : { view: nextListing.view, page: nextPage }),
      });
      const d = (await res.json()) as { results?: SkillSearchResult[]; error?: string; page?: number; totalPages?: number };
      if (!res.ok || d.error) {
        setSearchError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setResults(d.results ?? []);
      setPage(d.page ?? nextPage);
      setTotalPages(d.totalPages ?? 0);
      if ((d.results ?? []).length === 0) setSearchError("No skills found");
    } catch (e) {
      setSearchError(String(e));
    } finally {
      setSearching(false);
    }
  }, []);

  const search = useCallback((q: string) => {
    if (!q.trim()) return;
    const nextListing: MarketplaceListing = { kind: "search", query: q.trim() };
    setListing(nextListing);
    void loadResults(nextListing, 1);
  }, [loadResults]);

  const loadRanking = useCallback((view: Extract<MarketplaceListing, { kind: "ranking" }>["view"]) => {
    const nextListing: MarketplaceListing = { kind: "ranking", view };
    setListing(nextListing);
    void loadResults(nextListing, 1);
  }, [loadResults]);

  useEffect(() => {
    void loadResults({ kind: "ranking", view: "all-time" }, 1);
  }, [loadResults]);

  useEffect(() => {
    setSourceFilter("all");
  }, [results]);

  const marketInstall = useCallback(async (pkg: string) => {
    setInstalling(pkg);
    setInstallError(null);
    try {
      const res = await fetch("/api/skill-library/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "market", package: pkg }),
      });
      const d = (await res.json()) as { added?: { skillKey: string }[]; error?: string };
      if (!res.ok || d.error) {
        setInstallError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setInstalled((current) => new Set(current).add(pkg));
      setLibrarySkillKeys(await fetchLibrarySkillKeys());
      onImported();
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(null);
    }
  }, [fetchLibrarySkillKeys, onImported]);

  const localImport = async () => {
    if (!localPath.trim()) return;
    setImportingLocal(true);
    setInstallError(null);
    try {
      const res = await fetch("/api/skill-library/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "local", path: localPath.trim() }),
      });
      const d = (await res.json()) as { skill?: { skillKey: string }; error?: string };
      if (!res.ok || d.error) {
        setInstallError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setLocalPath("");
      onImported();
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setImportingLocal(false);
    }
  };

  const gitImport = async () => {
    if (!gitUrl.trim()) return;
    setImportingGit(true);
    setInstallError(null);
    try {
      const res = await fetch("/api/skill-library/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "git", url: gitUrl.trim() }),
      });
      const d = (await res.json()) as { imported?: { skillKey: string }[]; error?: string };
      if (!res.ok || d.error) {
        setInstallError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setGitUrl("");
      onImported();
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setImportingGit(false);
    }
  };

  const sources = useMemo(
    () => Array.from(new Set(results.map((result) => splitMarketPackage(result.package).source))).slice(0, 8),
    [results],
  );
  const visibleResults = useMemo(
    () => results.filter((result) => sourceFilter === "all" || splitMarketPackage(result.package).source === sourceFilter),
    [results, sourceFilter],
  );

  return (
    <div className="skills-market">
      <div className="skills-market-title-row">
        <div>
          <h2>Install skills</h2>
        </div>
      </div>

      <div className="skills-market-tabs" role="tablist" aria-label="Skill import method">
        {[
          ["market", "Browse marketplace"],
          ["local", "Local install"],
          ["git", "Git install"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            className={mode === key ? "active" : undefined}
            onClick={() => setMode(key as typeof mode)}
          >
            {label}
          </button>
        ))}
      </div>

      {installError && <div className="skills-market-error">{installError}</div>}

      {mode === "market" && (
        <>
          <form
            className="skills-market-search"
            onSubmit={(event) => {
              event.preventDefault();
              search(query);
            }}
          >
            <div className="skills-market-view-switcher" role="tablist" aria-label="Marketplace result order">
              {[
                ["all-time", "All time"],
                ["trending", "Trending"],
                ["hot", "Hot"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={listing.kind === "ranking" && listing.view === key}
                  className={listing.kind === "ranking" && listing.view === key ? "active" : undefined}
                  onClick={() => loadRanking(key as Extract<MarketplaceListing, { kind: "ranking" }>["view"])}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the skills.sh marketplace"
              aria-label="Search skills marketplace"
            />
            <button type="submit" disabled={searching || !query.trim()}>
              {searching ? "Searching..." : "Search"}
            </button>
          </form>

          {sources.length > 1 && (
            <div className="skills-source-filters" aria-label="Filter results by source">
              <span>Source</span>
              <button
                type="button"
                className={sourceFilter === "all" ? "active" : undefined}
                onClick={() => setSourceFilter("all")}
              >
                All sources
              </button>
              {sources.map((source) => (
                <button
                  key={source}
                  type="button"
                  className={sourceFilter === source ? "active" : undefined}
                  onClick={() => setSourceFilter(source)}
                >
                  @{source}
                </button>
              ))}
            </div>
          )}

          {searchError ? (
            <div className="skills-market-empty">{searchError}</div>
          ) : searching && results.length === 0 ? (
            <div className="skills-market-empty">Searching marketplace...</div>
          ) : (
            <div className="skill-card-grid">
              {visibleResults.map((result) => {
                const { source, name } = splitMarketPackage(result.package);
                const isInstalling = installing === result.package;
                const isInstalled = installed.has(result.package) || librarySkillKeys.has(name.toLowerCase());
                return (
                  <article className="skill-market-card" key={result.package}>
                    <div className="skill-market-card-heading">
                      <SourceAvatar source={source} />
                      <strong title={name}>{name}</strong>
                      {result.url && (
                        <a href={result.url} target="_blank" rel="noreferrer" title={`Open ${name} on skills.sh`} aria-label={`Open ${name} on skills.sh`}>
                          {"\u2197"}
                        </a>
                      )}
                      <button
                        type="button"
                        className={`skill-market-install${isInstalled ? " is-installed" : ""}`}
                        onClick={() => void marketInstall(result.package)}
                        disabled={isInstalled || isInstalling || installing !== null}
                        title={isInstalled ? `${name} is already in the library` : `Add ${name} to library`}
                        aria-label={isInstalled ? `${name} is already in the library` : `Add ${name} to library`}
                      >
                        {isInstalled ? "\u2713" : isInstalling ? "..." : "+"}
                      </button>
                    </div>
                    <div className="skill-card-meta">
                      <span>@{source}</span>
                      {result.installs && <span>{result.installs}</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="skills-market-pagination" aria-label="Marketplace pages">
              <button type="button" onClick={() => void loadResults(listing, page - 1)} disabled={searching || page === 1}>
                Previous
              </button>
              <span>{page} / {totalPages}</span>
              <button type="button" onClick={() => void loadResults(listing, page + 1)} disabled={searching || page === totalPages}>
                Next
              </button>
            </nav>
          )}
        </>
      )}

      {mode === "local" && (
        <form
          className="skills-import-form"
          onSubmit={(event) => {
            event.preventDefault();
            void localImport();
          }}
        >
          <label htmlFor="library-local-path">Skill directory</label>
          <div>
            <input
              id="library-local-path"
              value={localPath}
              onChange={(event) => setLocalPath(event.target.value)}
              placeholder="/path/to/skill-directory containing SKILL.md"
            />
            <button type="submit" disabled={importingLocal || !localPath.trim()}>
              {importingLocal ? "Importing..." : "Import"}
            </button>
          </div>
        </form>
      )}

      {mode === "git" && (
        <form
          className="skills-import-form"
          onSubmit={(event) => {
            event.preventDefault();
            void gitImport();
          }}
        >
          <label htmlFor="library-git-url">Git repository</label>
          <div>
            <input
              id="library-git-url"
              value={gitUrl}
              onChange={(event) => setGitUrl(event.target.value)}
              placeholder="https://github.com/owner/repo.git"
            />
            <button type="submit" disabled={importingGit || !gitUrl.trim()}>
              {importingGit ? "Importing..." : "Import all"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function LibraryTab() {
  const [libraryRoot, setLibraryRoot] = useState("");
  const [configuredRoot, setConfiguredRoot] = useState<string | null>(null);
  const [skills, setSkills] = useState<LibrarySkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/skill-library");
      const d = (await res.json()) as { libraryRoot?: string | null; skills?: LibrarySkillInfo[]; error?: string };
      if (d.error) throw new Error(d.error);
      setConfiguredRoot(d.libraryRoot ?? null);
      setLibraryRoot(d.libraryRoot ?? "");
      setSkills(d.skills ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRoot = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/skill-library", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryRoot: libraryRoot.trim() }),
      });
      const d = (await res.json()) as { libraryRoot?: string; error?: string };
      if (d.error) throw new Error(d.error);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const visibleSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return skills;
    return skills.filter((skill) =>
      [skill.name, skill.skillKey, skill.description].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [query, skills]);

  const removeSkill = async (skill: LibrarySkillInfo) => {
    if (!confirm(`Remove "${skill.name}" from the library?`)) return;
    setRemoving(skill.skillKey);
    setError(null);
    try {
      const response = await fetch(`/api/skill-library/skills/${encodeURIComponent(skill.skillKey)}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setSkills((items) => items.filter((item) => item.skillKey.toLowerCase() !== skill.skillKey.toLowerCase()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="skills-library">
      <div className="skills-library-heading">
        <div>
          <h2>Library skills</h2>
        </div>
        <label className="skills-library-search">
          <span className="sr-only">Search library skills</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search library skills"
          />
        </label>
      </div>

      <form
        className="skills-library-directory"
        onSubmit={(event) => {
          event.preventDefault();
          void saveRoot();
        }}
      >
        <label htmlFor="skill-library-root">Library directory</label>
        <input
          id="skill-library-root"
          value={libraryRoot}
          onChange={(event) => setLibraryRoot(event.target.value)}
          placeholder="/path/to/skill-library"
        />
        <button type="submit" disabled={saving || !libraryRoot.trim()}>
          {saving ? "Saving..." : "Save"}
        </button>
      </form>

      {!configuredRoot && <div className="skills-library-note">Choose a local directory as your shared skill library.</div>}
      {error && <div className="skills-market-error">{error}</div>}

      {loading ? (
        <div className="skills-market-empty">Loading library...</div>
      ) : skills.length === 0 ? (
        <div className="skills-market-empty">No skills in the library yet. Add one from Acquire.</div>
      ) : visibleSkills.length === 0 ? (
        <div className="skills-market-empty">No library skills match this search.</div>
      ) : (
        <div className="skill-card-grid">
          {visibleSkills.map((skill) => (
            <article className="skill-library-card" key={skill.skillKey}>
              <div className="skill-market-card-heading">
                <span className="skill-source-mark" aria-hidden="true">{skill.name.slice(0, 1).toUpperCase()}</span>
                <strong title={skill.name}>{skill.name}</strong>
                <span className="skill-library-card-hash" title={`Content hash ${skill.contentHash}`}>{shortHash(skill.contentHash)}</span>
                <button type="button" className="skill-library-remove" onClick={() => void removeSkill(skill)} disabled={removing === skill.skillKey} title={`Remove ${skill.name} from library`} aria-label={`Remove ${skill.name} from library`}>×</button>
              </div>
              {skill.description && <p>{skill.description}</p>}
              <div className="skill-card-meta">
                <span>{skill.skillKey}</span>
                <span>Library</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function SkillsConfig({
  cwd,
  onClose,
  onPacksChanged,
  packsRefreshKey,
}: {
  cwd: string;
  onClose: () => void;
  onPacksChanged?: () => void;
  packsRefreshKey?: number;
}) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<"workspace" | "library" | "acquire">("workspace");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [updateStatuses, setUpdateStatuses] = useState<Record<string, SkillUpdateResult>>({});
  const [checkingUpdates, setCheckingUpdates] = useState<Set<string>>(new Set());
  const [checkingAll, setCheckingAll] = useState(false);
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [appliedPacks, setAppliedPacks] = useState<AppliedPackInfo[]>([]);
  const [packDefinitions, setPackDefinitions] = useState<SkillPackDetail[]>([]);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills?cwd=${encodeURIComponent(cwd)}`);
      const d = (await res.json()) as { skills?: Skill[]; error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      const list = d.skills ?? [];
      setSkills(list);
      if (list.length > 0 && !selected) setSelected(list[0].filePath);
      return list;
    } catch (e) {
      setError(String(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, [cwd, selected]);

  useEffect(() => {
    setUpdateStatuses({});
    setUpdateError(null);
    void loadSkills();
  }, [cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [wsRes, packsRes] = await Promise.all([
          fetch(`/api/workspace-skill-packs?cwd=${encodeURIComponent(cwd)}`),
          fetch("/api/skill-packs"),
        ]);
        const ws = (await wsRes.json()) as { appliedPacks?: AppliedPackInfo[]; error?: string };
        const p = (await packsRes.json()) as { packs?: SkillPackInfo[]; error?: string };
        if (cancelled) return;
        if (ws.error) console.error(ws.error);
        if (p.error) console.error(p.error);
        const applied = ws.appliedPacks ?? [];
        const infos = p.packs ?? [];
        const details = (await Promise.all(
          applied.map((a) =>
            fetch(`/api/skill-packs/${encodeURIComponent(a.packId)}`).then((r) => r.json() as Promise<SkillPackDetail>),
          ),
        )).filter((d): d is SkillPackDetail => Boolean(d?.id));
        setAppliedPacks(applied);
        setPackDefinitions(
          infos.map((info) => {
            const detail = details.find((d) => d.id === info.id);
            return detail ?? { ...info, skills: [], mcpServers: [] };
          }),
        );
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, packsRefreshKey]);

  const checkForUpdates = useCallback(
    async (skill?: Skill) => {
      const targets = skill ? [skill] : skills.filter((item) => Boolean(item.install));
      const keys = targets.map(updateKey).filter((key): key is string => Boolean(key));
      if (keys.length === 0) return;
      setUpdateError(null);
      setCheckingUpdates((current) => new Set([...current, ...keys]));
      if (!skill) setCheckingAll(true);
      try {
        const res = await fetch("/api/skills/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cwd,
            package: skill?.install?.package,
            scope: skill?.install?.scope,
          }),
        });
        const data = (await res.json()) as { updates?: SkillUpdateResult[]; error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setUpdateStatuses((current) => {
          const next = { ...current };
          for (const update of data.updates ?? []) {
            next[`${update.scope}\0${update.package}`] = update;
          }
          return next;
        });
      } catch (e) {
        setUpdateError(e instanceof Error ? e.message : String(e));
      } finally {
        setCheckingUpdates((current) => {
          const next = new Set(current);
          for (const key of keys) next.delete(key);
          return next;
        });
        if (!skill) setCheckingAll(false);
      }
    },
    [cwd, skills],
  );

  const updateInstalledSkill = useCallback(
    async (skill: Skill) => {
      if (!skill.install) return;
      const key = updateKey(skill)!;
      setUpdatingSkill(key);
      setUpdateError(null);
      try {
        const res = await fetch("/api/skills/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cwd,
            package: skill.install.package,
            scope: skill.install.scope,
          }),
        });
        const data = (await res.json()) as { success?: boolean; skill?: Skill; error?: string };
        if (!res.ok || data.error || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`);
        await loadSkills();
        const versionHash = data.skill?.install?.versionHash;
        setUpdateStatuses((current) => ({
          ...current,
          [key]: {
            package: skill.install!.package,
            scope: skill.install!.scope,
            state: "up-to-date",
            currentVersion: versionHash,
            latestVersion: versionHash,
          },
        }));
      } catch (e) {
        setUpdateError(e instanceof Error ? e.message : String(e));
      } finally {
        setUpdatingSkill(null);
      }
    },
    [cwd, loadSkills],
  );

  const toggle = useCallback(async (skill: Skill) => {
    const next = !skill.disableModelInvocation;
    setToggling((s) => new Set(s).add(skill.filePath));
    setSaveError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: skill.filePath, disableModelInvocation: next }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setSaveError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setSkills((prev) => prev.map((s) => (s.filePath === skill.filePath ? { ...s, disableModelInvocation: next } : s)));
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setToggling((s) => {
        const n = new Set(s);
        n.delete(skill.filePath);
        return n;
      });
    }
  }, []);

  const selectedSkill = skills.find((s) => s.filePath === selected) ?? null;

  const tabs: { key: "workspace" | "library" | "acquire"; label: string }[] = [
    { key: "workspace", label: "Workspace" },
    { key: "library", label: "Library" },
    { key: "acquire", label: "Acquire" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-surface"
        style={{
          width: isMobile ? "calc(100vw - 16px)" : 860,
          maxWidth: "calc(100vw - 16px)",
          height: isMobile ? "calc(100dvh - 16px)" : "78vh",
          maxHeight: "calc(100dvh - 16px)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Skills</span>
            <code
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                maxWidth: 320,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {shortenPath(cwd)}
            </code>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            padding: "8px 18px 0",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
            background: "var(--bg-panel)",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                border: "none",
                borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                background: "none",
                color: tab === t.key ? "var(--text)" : "var(--text-dim)",
                cursor: "pointer",
                fontWeight: tab === t.key ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {tab === "workspace" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ padding: "14px 18px 0", flexShrink: 0 }}>
                <WorkspacePacks
                  cwd={cwd}
                  refreshKey={packsRefreshKey}
                  onApplied={() => {
                    void loadSkills();
                    onPacksChanged?.();
                  }}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  overflow: "hidden",
                  padding: "0 18px 14px",
                }}
              >
                {/* Left: skill list */}
                <div
                  style={{
                    width: isMobile ? "100%" : 210,
                    maxHeight: isMobile ? "40vh" : undefined,
                    borderRight: isMobile ? "none" : "1px solid var(--border)",
                    borderBottom: isMobile ? "1px solid var(--border)" : "none",
                    display: "flex",
                    flexDirection: "column",
                    flexShrink: 0,
                    background: "var(--bg-panel)",
                    borderRadius: 6,
                    marginRight: isMobile ? 0 : 14,
                    marginBottom: isMobile ? 14 : 0,
                  }}
                >
                  <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
                    {loading ? (
                      <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
                    ) : error ? (
                      <div style={{ padding: "10px 8px", fontSize: 11, color: "#f87171" }}>{error}</div>
                    ) : skills.length === 0 ? (
                      <div style={{ padding: "10px 8px", fontSize: 11, color: "var(--text-dim)" }}>No skills found</div>
                    ) : (
                      (() => {
                        const groups: { label: string; skills: typeof skills }[] = [];
                        const used = new Set<string>();

                        // One section per applied pack, showing the skills it brought.
                        for (const applied of appliedPacks) {
                          const def = packDefinitions.find((p) => p.id === applied.packId);
                          const packKeys = new Set((def?.skills ?? []).map((s) => s.skillKey.toLowerCase()));
                          const grpSkills = skills.filter((s) => {
                            const key = skillKeyFromSkill(s).toLowerCase();
                            return packKeys.has(key) && !used.has(s.filePath);
                          });
                          grpSkills.forEach((s) => used.add(s.filePath));
                          if (grpSkills.length > 0) {
                            groups.push({ label: def?.name ?? applied.packName ?? applied.packId, skills: grpSkills });
                          }
                        }

                        const groupDefinitions = [
                          { label: "project / skills.sh", matches: (skill: Skill) => sourceLabel(skill) === "project" && Boolean(skill.install?.skillsShUrl) },
                          { label: "project", matches: (skill: Skill) => sourceLabel(skill) === "project" && !skill.install?.skillsShUrl },
                          { label: "global / skills.sh", matches: (skill: Skill) => sourceLabel(skill) === "global" && Boolean(skill.install?.skillsShUrl) },
                          { label: "global", matches: (skill: Skill) => sourceLabel(skill) === "global" && !skill.install?.skillsShUrl },
                          { label: "path", matches: (skill: Skill) => sourceLabel(skill) === "path" },
                        ];
                        for (const { label, matches } of groupDefinitions) {
                          const grpSkills = skills.filter((s) => matches(s) && !used.has(s.filePath));
                          grpSkills.forEach((s) => used.add(s.filePath));
                          if (grpSkills.length > 0) groups.push({ label, skills: grpSkills });
                        }
                        return groups.map(({ label: grpLabel, skills: grpSkills }) => (
                          <div key={grpLabel} style={{ marginBottom: 6 }}>
                            <div
                              style={{
                                padding: "4px 8px 3px",
                                fontSize: 10,
                                fontWeight: 600,
                                color: "var(--text-dim)",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                              }}
                            >
                              {grpLabel}
                            </div>
                            {grpSkills.map((skill) => {
                              const isSelected = !addMode && selected === skill.filePath;
                              const disabled = skill.disableModelInvocation;
                              return (
                                <div
                                  key={skill.filePath}
                                  onClick={() => {
                                    setSelected(skill.filePath);
                                    setAddMode(false);
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 7,
                                    padding: "8px 8px",
                                    borderRadius: 5,
                                    cursor: "pointer",
                                    background: isSelected ? "var(--bg-selected)" : "none",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = "none";
                                  }}
                                >
                                  <span
                                    style={{
                                      flexShrink: 0,
                                      width: 7,
                                      height: 7,
                                      borderRadius: "50%",
                                      background: disabled ? "var(--border)" : "var(--accent)",
                                      boxShadow: disabled ? "none" : "0 0 4px var(--accent)",
                                      transition: "background 0.15s, box-shadow 0.15s",
                                    }}
                                  />
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: isSelected ? 600 : 400,
                                      color: disabled ? "var(--text-dim)" : "var(--text)",
                                      fontFamily: "var(--font-mono)",
                                      flex: 1,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {skill.name}
                                  </span>
                                  {(() => {
                                    const key = updateKey(skill);
                                    const status = key ? updateStatuses[key] : undefined;
                                    if (status?.state !== "update-available") return null;
                                    return (
                                      <span
                                        title="Update available"
                                        style={{ color: "#d97706", fontSize: 13, lineHeight: 1, flexShrink: 0 }}
                                      >
                                        ↑
                                      </span>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        ));
                      })()
                    )}
                  </div>
                  <div style={{ padding: "8px 6px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
                    <div
                      onClick={() => {
                        setAddMode(true);
                        setSelected(null);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 8px",
                        borderRadius: 5,
                        cursor: "pointer",
                        background: "none",
                        color: "var(--text-dim)",
                        fontSize: 12,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add skill
                    </div>
                  </div>
                </div>

                {/* Right: detail */}
                <div style={{ flex: 1, overflowY: "auto", padding: "0 0 0 4px" }}>
                  {loading ? null : addMode ? (
                    <LibrarySkillPicker
                      cwd={cwd}
                      onInstalled={() => {
                        setAddMode(false);
                        void loadSkills();
                      }}
                    />
                  ) : selectedSkill ? (
                    <SkillDetail
                      key={selectedSkill.filePath}
                      skill={selectedSkill}
                      cwd={cwd}
                      onToggle={toggle}
                      toggling={toggling.has(selectedSkill.filePath)}
                      saveError={saveError}
                      updateStatus={updateKey(selectedSkill) ? updateStatuses[updateKey(selectedSkill)!] : undefined}
                      checkingUpdate={updateKey(selectedSkill) ? checkingUpdates.has(updateKey(selectedSkill)!) : false}
                      updating={updatingSkill === updateKey(selectedSkill)}
                      updateError={updateError}
                      onCheckUpdate={() => void checkForUpdates(selectedSkill)}
                      onUpdate={() => void updateInstalledSkill(selectedSkill)}
                    />
                  ) : (
                    <div
                      style={{
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-dim)",
                        fontSize: 13,
                      }}
                    >
                      Select a skill
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 18px",
                  borderTop: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {skills.some((skill) => Boolean(skill.install)) && (
                    <button
                      onClick={() => void checkForUpdates()}
                      disabled={checkingAll || updatingSkill !== null}
                      style={{
                        padding: "6px 12px",
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        color: "var(--text-muted)",
                        cursor: checkingAll || updatingSkill !== null ? "not-allowed" : "pointer",
                        opacity: checkingAll || updatingSkill !== null ? 0.5 : 1,
                        fontSize: 12,
                      }}
                    >
                      {checkingAll ? "Checking..." : "Check updates"}
                    </button>
                  )}
                  {Object.values(updateStatuses).filter((status) => status.state === "update-available").length > 0 && (
                    <span style={{ fontSize: 12, color: "#d97706" }}>
                      {Object.values(updateStatuses).filter((status) => status.state === "update-available").length}{" "}
                      {Object.values(updateStatuses).filter((status) => status.state === "update-available").length === 1 ? "update" : "updates"}
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  style={{
                    padding: "6px 14px",
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {tab === "library" && (
            <div style={{ height: "100%", overflow: "hidden" }}>
              <LibraryTab />
            </div>
          )}

          {tab === "acquire" && (
            <div style={{ height: "100%", overflow: "hidden" }}>
              <LibraryImportPanel onImported={() => void loadSkills()} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
