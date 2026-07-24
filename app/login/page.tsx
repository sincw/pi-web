"use client";

import { ArrowRight, FolderGit2, KeyRound, LockKeyhole, MessageSquareText, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function GatewayLoginPage() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[var(--app-canvas)] px-3 py-3 text-[var(--text)] sm:px-4 sm:py-6">
      <div className="grid w-full max-w-[1080px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] shadow-[var(--shadow-window)] md:grid-cols-2">
        <GatewayIntro />
        <GatewayLoginForm />
      </div>
    </main>
  );
}

function GatewayIntro() {
  return (
    <section className="border-b border-[var(--border)] p-5 sm:p-10 md:border-r md:border-b-0 md:px-14 md:py-16">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-[#0f172a] text-white shadow-sm sm:size-12"><ShieldCheck size={23} aria-hidden="true" /></span>
        <h2 className="m-0 text-[26px] font-semibold sm:text-[30px]">Pivot UI</h2>
      </div>
      <p className="mt-3 max-w-md text-[15px] leading-6 text-[var(--text-muted)] sm:mt-5 sm:text-[17px] sm:leading-7">连接本地 Agent 会话，访问完整工作区。</p>
      <div className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)] sm:mt-10">
        <div className="flex gap-3 py-3 sm:gap-4 sm:py-5"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--bg-selected)] text-[var(--accent)] sm:size-10"><MessageSquareText size={18} aria-hidden="true" /></span><div><strong className="block text-[15px] sm:text-base">受保护的会话</strong><span className="mt-0.5 block text-[13px] leading-5 text-[var(--text-muted)] sm:mt-1 sm:text-sm sm:leading-6">继续现有对话并查看实时 Agent 进度。</span></div></div>
        <div className="flex gap-3 py-3 sm:gap-4 sm:py-5"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[rgba(139,92,246,0.12)] text-[#7c3aed] sm:size-10"><FolderGit2 size={18} aria-hidden="true" /></span><div><strong className="block text-[15px] sm:text-base">本机工作区</strong><span className="mt-0.5 block text-[13px] leading-5 text-[var(--text-muted)] sm:mt-1 sm:text-sm sm:leading-6">在同一界面浏览文件、Git 变更和终端。</span></div></div>

      </div>
    </section>
  );
}

function GatewayLoginForm() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/gateway/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to verify access token");
      window.location.assign(nextPath());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to verify access token");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="p-5 sm:p-10 md:col-start-2 md:row-start-1 md:px-16 md:py-20">
      <div className="mb-5 flex items-center gap-3 sm:mb-10">
        <span className="grid size-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] text-[var(--accent)] sm:size-11"><LockKeyhole size={20} aria-hidden="true" /></span>
        <div><h1 className="m-0 text-[23px] font-semibold sm:text-[25px]">访问验证</h1><p className="mt-1 text-[13px] leading-5 text-[var(--text-muted)] sm:text-sm">输入 Access Token 以验证身份</p></div>
      </div>
      <form onSubmit={submit} className="space-y-3 sm:space-y-5">
        <label className="block rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 sm:px-4 sm:py-3">
          <span className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] sm:mb-3"><KeyRound size={14} aria-hidden="true" />ACCESS TOKEN</span>
          <input autoFocus className="h-11 w-full rounded border border-[var(--border)] bg-white px-3 font-mono text-sm text-[var(--text)] outline-none focus:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300" style={{ outline: "none" }} type="password" value={token} onChange={(event) => setToken(event.target.value)} aria-describedby={error ? "gateway-token-error" : undefined} />
        </label>
        {error && <p id="gateway-token-error" role="alert" className="m-0 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={!token.trim() || submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border-0 bg-[var(--accent)] px-4 text-sm font-semibold text-white enabled:hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:text-base">{submitting ? "验证中..." : "进入 Pivot UI"}<ArrowRight size={18} aria-hidden="true" /></button>
      </form>
      <p className="mt-4 text-center text-xs text-[var(--text-dim)] sm:mt-6 sm:text-sm">验证成功后会保留本机登录状态</p>
    </section>
  );
}
