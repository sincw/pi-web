import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { MarkdownBody } = await jiti.import("./MarkdownBody.tsx");

function renderMarkdown(markdown) {
  return renderToStaticMarkup(
    React.createElement(MarkdownBody, {
      cwd: "/home/me/project",
      onOpenFile() {},
    }, markdown),
  );
}

test("opens non-file markdown links in a safe new tab", () => {
  const html = renderMarkdown("[docs](https://example.com/docs)");

  assert.match(
    html,
    /<a (?=[^>]*href="https:\/\/example\.com\/docs")(?=[^>]*target="_blank")(?=[^>]*rel="noopener noreferrer")[^>]*>docs<\/a>/,
  );
  assert.doesNotMatch(html, /\snode=/);
});

test("keeps local file markdown links in the app", () => {
  const html = renderMarkdown("[file](components/MarkdownBody.tsx)");

  assert.match(html, /<a href="components\/MarkdownBody\.tsx">file<\/a>/);
  assert.doesNotMatch(html, /target=|rel=|\snode=/);
});

test("opens inline local file paths in the right panel", () => {
  const html = renderMarkdown("Open `/tmp/architecture-review.html`");

  assert.match(html, /<button (?=[^>]*class="markdown-inline-code markdown-inline-file")(?=[^>]*title="Open \/tmp\/architecture-review\.html")[^>]*>\/tmp\/architecture-review\.html<\/button>/);
  assert.doesNotMatch(html, /\snode=/);
});

test("defaults HTML files to preview mode", async () => {
  const fileViewer = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");

  assert.match(fileViewer, /d\?\.language === "markdown" \|\| d\?\.language === "html"/);
});
