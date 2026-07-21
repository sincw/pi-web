export interface SkillSearchResult {
  package: string;
  installs: string;
  url: string;
}

export type SkillInstallScope = "global" | "project";

export interface SkillInstallInfo {
  package: string;
  scope: SkillInstallScope;
  source: string;
  sourceType?: string;
  skillsShUrl?: string;
  skillPath?: string;
  ref?: string;
  versionHash?: string;
  canCheckForUpdates: boolean;
}

export type SkillUpdateState =
  | "up-to-date"
  | "update-available"
  | "unsupported"
  | "error";

export interface SkillUpdateResult {
  package: string;
  scope: SkillInstallScope;
  state: SkillUpdateState;
  currentVersion?: string;
  latestVersion?: string;
  message?: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  disableModelInvocation: boolean;
  sourceInfo: {
    source?: string;
    scope?: string;
  };
  install?: SkillInstallInfo;
}

// --- Skill Pack / Skill Library types ---

export interface LibrarySkillInfo {
  skillKey: string;
  name: string;
  description: string;
  baseDir: string;
  filePath: string;
  contentHash: string;
}

export interface SkillPackInfo {
  id: string;
  name: string;
  description: string;
  skillCount: number;
}

export interface SkillPackDetail {
  id: string;
  name: string;
  description: string;
  skills: LibrarySkillInfo[];
}

export interface SkillLibraryResponse {
  libraryRoot: string | null;
  skills: LibrarySkillInfo[];
}

export type PackStatus = "full" | "partial";

export interface AppliedPackInfo {
  packId: string;
  packName?: string;
  status: PackStatus;
  receipt: {
    appliedAt: string;
    installed: { skillKey: string; contentHash: string }[];
  };
}

export interface SkippedConflictInfo {
  packId: string;
  skillKey: string;
  reason: string;
}

export interface WorkspaceSkillPacksResponse {
  appliedPacks: AppliedPackInfo[];
  skippedConflicts: SkippedConflictInfo[];
}

export interface ApplyPreviewEntry {
  skillKey: string;
  contentHash: string;
}

export interface SkippedPreviewEntry {
  skillKey: string;
  reason: string;
}

export interface BlockedPreviewEntry {
  skillKey: string;
  reason: string;
}

export interface VersionConflictInfo {
  skillKey: string;
  contentHashes: string[];
  packIds: string[];
}

export interface PackPlanInfo {
  packId: string;
  packName: string;
  status: PackStatus;
  toInstall: ApplyPreviewEntry[];
  skipped: SkippedPreviewEntry[];
}

export interface ApplyPreviewResponse {
  canApply: boolean;
  toInstall: ApplyPreviewEntry[];
  skipped: SkippedPreviewEntry[];
  blocked: BlockedPreviewEntry[];
  versionConflicts: VersionConflictInfo[];
  packs: PackPlanInfo[];
}

export type PluginScope = "global" | "project";
export type PluginResourceKind = "extension" | "skill" | "prompt" | "theme";

export interface PluginResourceCounts {
  extensions: number;
  skills: number;
  prompts: number;
  themes: number;
}

export interface PluginDiagnostic {
  type: "warning" | "error";
  message: string;
  source?: string;
  path?: string;
}

export interface PluginResourceInfo {
  kind: PluginResourceKind;
  name: string;
  path: string;
  relativePath: string;
}

export interface PluginPackageInfo {
  source: string;
  scope: PluginScope;
  filtered: boolean;
  disabled: boolean;
  installedPath?: string;
  packageName?: string;
  version?: string;
  configuredVersion?: string;
  counts: PluginResourceCounts;
  resources: PluginResourceInfo[];
  status: "loaded" | "installed" | "missing" | "disabled";
}

export interface PluginsResponse {
  packages: PluginPackageInfo[];
  totals: PluginResourceCounts;
  diagnostics: PluginDiagnostic[];
}
