# Pivot UI

[English](./README.md)

Pivot UI 是 [pi 编程智能体](https://github.com/badlogic/pi-mono) 的响应式本地工作台。它把会话、Agent 对话、项目文件、Git 审查、终端和 Agent 配置放到同一个界面中，桌面和手机上都能高效使用。

<!-- 配图位置：在这里加入总览图，例如 `docs/images/overview-desktop.png`，建议 16:10。 -->

## 为持续的 Agent 工作而设计

- **接续真实会话**：按项目浏览本机 pi 会话，跟随实时输出，查看上下文和费用，并从上次停下的位置继续。
- **探索而不丢失路径**：把会话 Fork 成独立文件，或在同一会话内切换分支；需要分享时可以导出为独立 HTML。
- **项目始终在对话旁边**：浏览工作区、用 `@` 引用文件，并在不离开对话的情况下预览源码、Markdown、HTML、图片、音频、PDF 和 DOCX。
- **审查真实改动**：右侧面板提供工作区改动、分支对比和提交历史，可按文件查看统一或左右对照 Diff。

<!-- 配图位置：在这里加入项目文件和 Git Review 图，例如 `docs/images/review-panel.png`，建议 16:10。 -->

## 不只是聊天窗口

- **Worktree**：从工作区切换器创建、切换和删除 Git Worktree；关联 Worktree 的会话仍会归到同一个项目下。
- **项目终端**：为当前项目打开可持续使用的终端标签，带命令历史和收藏，在工作区内切换时仍可继续使用。
- **模型和认证**：选择已配置模型，在界面中管理 API key、OAuth/设备码登录，并测试模型连接。
- **Skills、插件和 MCP**：搜索和安装 Skills，管理包插件，把可复用 Skill 与 MCP server 存入库，并在写入前预览带版本快照的 Skill Pack 变更。
- **舒适阅读**：可在浅色、深色和护眼主题之间切换。

## 桌面和手机都适合使用

Pivot UI 在窄屏上会调整工作方式，而不只是缩小界面。

- 项目侧边栏会变成抽屉；选中会话或工作区后自动收起，让对话保持可见。
- 会话控制、分支导航、模型选择和配置面板会使用紧凑且受视口约束的布局。
- 右侧面板在移动端默认关闭，需要查看文件、审查或终端时再打开。
- 终端提供触控友好的快捷控制、修饰键、命令历史和 Visual Viewport 处理，软键盘不会遮住正在输入的内容。

<!-- 配图位置：在这里加入手机聊天或终端图，例如 `docs/images/mobile-terminal.png`，建议 9:16。 -->

## 快速开始

从源码运行：

```bash
git clone https://github.com/sincw/pivot-ui.git
cd pivot-ui
npm install
npm run dev
```

`@sincw/pivot-ui` 发布到 npm 后，也可以无需安装直接运行：

```bash
npx @sincw/pivot-ui@latest
```

或全局安装后使用：

```bash
npm install -g @sincw/pivot-ui
pivot-ui
```

启动后访问 [http://localhost:30141](http://localhost:30141)。除非禁用，CLI 会在服务就绪后自动打开浏览器。

```bash
pivot-ui --port 8080              # 自定义端口
pivot-ui --hostname 127.0.0.1     # 仅本机访问
pivot-ui --no-open                # 不自动打开浏览器

PORT=8080 pivot-ui                # 指定端口
PIVOT_UI_NO_OPEN=1 pivot-ui       # 适用于后台服务
```

## 本地数据与边界

- 会话历史仍保存在 pi 的本机 `~/.pi/agent/sessions` 目录。可通过 `PI_CODING_AGENT_DIR` 使用其他 pi agent 目录。
- 文件浏览仅面向当前选择的项目和会话中出现过的工作目录，不是通用文件系统浏览器。
- 默认 Skill Library 位于 `~/.pivot-ui/lib/skills`。pi 的 Skill Pack 配置中已明确设置的库路径不会被自动修改。

## 开发

```bash
npm install
npm run dev
```

本地开发服务地址为 [http://localhost:30141](http://localhost:30141)。

```bash
node --test lib/*.test.mjs components/*.test.mjs
node_modules/.bin/tsc --noEmit
npm run lint
```

本地开发时不要运行 `next build`。它会写入 `.next/` 并可能影响正在运行的开发服务器；生产构建仅在发布时执行。
