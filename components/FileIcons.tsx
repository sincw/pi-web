import {
  Box,
  Database,
  File,
  FileCode2,
  FileCog,
  FileJson2,
  FileKey2,
  FileLock2,
  FileText,
  Folder,
  FolderOpen,
  GitFork,
} from "lucide-react";

interface IconProps {
  size?: number;
}

const iconProps = { color: "var(--text-dim)", strokeWidth: 1.6, "aria-hidden": true } as const;

export function FolderIcon({ size = 14, open = false }: IconProps & { open?: boolean }) {
  return open ? <FolderOpen size={size} {...iconProps} /> : <Folder size={size} {...iconProps} />;
}

export function getFileIcon(name: string, size = 14): React.ReactNode {
  const lower = name.toLowerCase();
  const ext = lower.split(".").pop() ?? "";
  const props = { size, ...iconProps };

  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return <Box {...props} />;
  if (lower === ".env" || lower.startsWith(".env.")) return <FileKey2 {...props} />;
  if ([".gitignore", ".gitattributes", ".gitmodules"].includes(lower)) return <GitFork {...props} />;
  if (["package-lock.json", "yarn.lock", "bun.lock", "pnpm-lock.yaml", "cargo.lock"].includes(lower) || ext === "lock") return <FileLock2 {...props} />;
  if (lower.includes(".config.") || [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.mjs", "eslint.config.js"].includes(lower)) return <FileCog {...props} />;

  if (["json", "jsonl"].includes(ext)) return <FileJson2 {...props} />;
  if (["sql", "graphql", "gql"].includes(ext)) return <Database {...props} />;
  if (["md", "mdx", "docx", "pdf"].includes(ext)) return <FileText {...props} />;
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "css", "less", "scss", "html", "htm", "yaml", "yml", "toml", "sh", "bash", "zsh", "fish", "rs", "go", "tf", "hcl"].includes(ext)) return <FileCode2 {...props} />;
  return <File {...props} />;
}
