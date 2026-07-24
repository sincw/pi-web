# MCP Pack / MCP 包 — 产品方案

> 对外产品名：**MCP 包 / MCP Pack**。与 **Skill Pack（技能包）** 同一套库 + 包 + 应用模型，统一管理两类能力：技能文件与 MCP server 连接定义。
> 本文档取代 `docs/specs/mcp-management.md`（已废弃的 Profile 方案）与 `docs/mcp-pack-unification.md`（前一版讨论稿），作为统一的产品与实现参考。
> 技术约束来自对 `pi-mcp-adapter@2.11.0` 源码的确认（见 §13）。

---

## 1. 目标

把 MCP 管理从独立产品（已废弃的 Profile 概念）并进已落地的技能包产品，让用户在一个入口、一套心智里管理「这个项目要用哪些技能 + 哪些 MCP server」。

红利：
- 复用已有的库 / 包 / 应用 / 收据 / 冲突检测 / 漂移提醒整套基础设施。
- 一个包能同时描述「配套技能 + 配套 MCP」，一次应用到位。
- 取消独立 Profile 数据层，少一套概念与 UI。

代价：
- skill 与 MCP 的**本质差异**会让"统一"在某些环节变成"同屏不同行"，强行对称会反而难用。本文的取舍就是围绕这一差异。

---

## 2. 中心张力：Skill 与 MCP 不是一种东西

| 维度 | Skill | MCP server |
|---|---|---|
| 形态 | 文件集合（SKILL.md + 脚本/配置） | 一份连接定义 JSON（command/url + 凭据） |
| 应用目标位置 | `<cwd>/.pi/skills/<key>/` 复制文件 | 把 Pack 托管条目重整到 `<cwd>/.pi/mcp.json` 的 `mcpServers` |
| 原件 vs 副本 | **有**：库是原件，项目是副本 | **没有**：定义本身即全部，复制一份没意义 |
| 编辑副本的代价 | 用户可能改过项目副本（高代价） | 改项目副本 = 改一行 JSON（低代价） |
| 同名冲突策略 | 当前实现为同名目录跳过，不比较项目副本哈希 | 以工作空间收据识别 pivot-ui 写入的条目；未知或已手改的条目绝不自动覆盖 |
| 撤销"应用" | 当前实现按剩余 Pack 并集删除不再需要的目录，可能删除同名预存目录 | 重新计算剩余 Pack 的并集，仅移除不再需要且仍由 Pack 托管的条目 |
| 团队共享 | `.pi/skills/` 进 git 共享 | `.mcp.json`（团队）/ `.pi/mcp.json`（pi 专属）进 git 共享 |
| 个人临时试用 | 不适用 | 靠 apply + 撤销；secret 靠 `bearerTokenEnv`；多会话隔离靠不同 cwd |

**结论**：统一入口和概念模型，**不强行统一应用动作**。Skill 保持当前的复制与并集卸载行为；MCP 是由受管条目保护的双向重整。产品文案必须讲清这个区别。本提案不顺带改变既有 Skill Pack 的撤销语义。

---

## 3. User Stories

1. 作为一个有多个任务类型的用户，我希望创建「前端调试」和「数据库运维」两个 Pack，前者带 chrome-devtools 技能 + playwright MCP server，后者带 postgres MCP server；把 Pack 应用到项目后，这个项目的所有会话都跑这套 MCP 组合。

2. 作为一个不想在终端里改 JSON 的用户，我希望在 Web UI 里填表单新增一个 npx 类型的 MCP server（命令、参数、环境变量），保存到库，再引用到 Pack，最终应用到项目即生效。

3. 作为一个已有 `.mcp.json` 文件的项目的用户，我希望看到当前 cwd 合并后的**有效 MCP 环境**预览（shared-global + pi-global + project 各来源的明细），知道同名 server 被谁覆盖。

4. 作为一个从其它 AI 编辑器迁移的用户，我希望一键把 Cursor / Claude Code / Codex / Windsurf / VS Code 的 MCP 配置导入到库中，再被 Pack 引用，不必手抄。

5. 作为一个要接 OAuth 型 MCP server（如 Linear、Figma）的用户，我希望在 pivot-ui 里发起授权流程：点「连接」→ 拿到授权 URL → 在我本地浏览器授权 → 把回调 URL 粘回 pivot-ui → 完成。pi 进程跑在服务器上无法自动开我的浏览器，所以这一步必须是复制粘贴式。

6. 作为一个管理项目 MCP 的用户，我希望应用 Pack 后，能一键禁用/启用某个 MCP server，不重新安装 Pack，只控制当前项目是否连接它。

7. 作为一个会话进行中的用户，我希望知道 Pack 变更已写入项目配置，并明确它会在新建会话时生效；后续版本可在确认后支持重载当前会话。

8. 作为一个想确认 server 配置对的用户，我希望在保存前点「测试连接」，看到「连上了 / 工具数 N / 首条错误」，而不是保存后到会话里才发现报错。

9. 作为一个想给某 server 把个别工具提到 Pi 一等工具（direct tools）的用户，我希望看到它只能配置在全局 `~/.pi/agent/mcp.json` 并重启 pivot-ui，避免误以为 Pack 已让它生效。

10. 作为一个想分享环境的用户，我希望导出 Pack 为 JSON 分享给同事，对方粘贴/上传一键导入。

11. 作为一个团队仓库协作者，我希望项目里的 `.mcp.json`（团队共享）始终生效，不被我的 Pack 覆盖。

12. 作为一个刚装好 pi 的用户，我希望 pivot-ui 提示我「adapter 已装、全局默认 MCP 在 `~/.pi/agent/mcp.json`、还没有自定义 Pack 里的 MCP server」，第一次打开管理有引导。

---

## 4. 概念与术语

| 术语 | 含义 |
|---|---|
| **Pack（预设包）** | 命名的一组能力引用，可同时包含 skill 引用和 MCP server 引用 |
| **Library（中心库）** | 本地技能库存放目录，包含 `skills/<skillKey>/` 与 `mcp-servers/<serverKey>.mcp.json` 两类原件 |
| **MCP server 库条目** | `mcp-servers/<serverKey>.mcp.json` 单文件，含 server 定义 + 元数据 |
| **全局默认** | `~/.pi/agent/mcp.json` —— adapter 原生 pi-global 槽；进程级 direct tools 注册源 |
| **项目级配置** | `<cwd>/.mcp.json`（团队共享）与 `<cwd>/.pi/mcp.json`（pi 专属） |
| **server 定义** | `{ command/args/env/cwd }`（stdio）或 `{ url/headers/auth }`（http）+ 生命周期 / 超时等单 server 字段 |
| **托管条目** | pivot-ui 写入 `.pi/mcp.json` 后，在项目收据中记录了基线哈希的 `mcpServers` 条目；只有它可被后续重整替换或移除。 |
| **外来条目** | `.pi/mcp.json` 中不在收据内，或与收据基线不同的条目；它可能来自用户、其他工具或一次手动编辑，pivot-ui 始终原样保留。 |
| **重整（reconcile）** | 从当前已应用 Pack 的完整并集重建托管条目，并与外来条目合成最终 `mcp.json` 的唯一写入流程。 |
| **direct tools 模式** | adapter 把某 server 的工具注册为 Pi 一等工具（而非仅靠 `mcp` proxy 工具访问） |
| **proxy 模式** | 默认；所有 MCP 工具通过单个 `mcp` 根工具按需搜索调用 |

---

## 5. 统一模型 —— 仓库型

**核心思想**：库与 skill 同构，应用时拼装成品。库里每个 MCP server 是一份独立文件 `mcp-servers/<serverKey>.mcp.json`，与 skill 目录 `<skillKey>/` 同构；应用时把所有已应用 Pack 引用的 server 文件取完整并集，再通过一次重整生成项目配置。

MCP Pack **不是**任意 JSON 的通用合并器。MVP 仅管理 `mcpServers` 中由 Pack 写入的条目；项目既有的 `mcpServers` 条目和所有顶层字段都属于用户配置并保留。

### 5.0 与 skill 的同构对照

| 维度 | Skill | MCP server |
|---|---|---|
| 库原件形态 | `skills/<skillKey>/` 目录 | `mcp-servers/<serverKey>.mcp.json` 单文件 |
| 可单独分享/VCS | ✓ 目录进 git | ✓ 单文件进 git |
| 漂移检测 | `computeSkillHash(skillDir)` | `computeConfigHash(serverFile)`（复用 `lib/content-hash.ts`） |
| 包引用 | `{ skillKey, contentHash }` | `{ serverKey, configHash }` |
| 应用动作 | 把库目录复制到 `<cwd>/.pi/skills/<key>/` | 对**所有已应用 Pack 的完整并集**执行重整，将托管条目写入 `<cwd>/.pi/mcp.json` |
| 多包协作 | 并集去重 | 并集去重 |
| 撤销 | 保持当前的并集卸载 | 移除标签后重整；仅删除不再属于任何 Pack 且未被用户修改的托管 key |

**唯一不对称点**：skill 成品是一堆文件散在目录里 pi 自动扫；MCP 成品必须是**合并后的单份** `mcp.json`，因为 adapter 读的是单文件的 `mcpServers` 对象，不会扫目录里的散文件。UI/文案必须讲清这一步。

### 5.1 库目录结构

```
<libraryRoot>/
  .pi/
    skills/                  # 已有
      <skillKey>/
    mcp-servers/             # 新增
      <serverKey>.mcp.json
```

**单文件内容**（`<serverKey>.mcp.json`）：

```json
{
  "name": "chrome-devtools",
  "description": "Chrome DevTools MCP",
  "source": "market|git|manual|import-cursor",
  "sourceRef": "@org/repo",
  "definition": {
    "command": "npx",
    "args": ["-y", "chrome-devtools-mcp@latest"],
    "env": { "...": "${ENV_VAR}" },
    "lifecycle": "lazy"
  }
}
```

- `configHash` 不写进文件，运行时由 `lib/content-hash.ts` 对 `definition` 规范序列化算出。
- `serverKey` 即文件名，库内天然唯一，自动解决 OAuth 凭据撞库问题。
- `definition` 仅允许 adapter 的单 server 字段：command/url、args、env、headers、auth、lifecycle、idleTimeout、requestTimeoutMs、excludeTools、exposeResources。MVP 禁止 `directTools`。
- 凭据只能使用环境变量引用；表单与 JSON 导入拒绝明文 bearer token、Authorization header 与 OAuth 凭据。
- `serverKey` 必须是安全文件名，禁止路径分隔符、`..` 与大小写冲突。

`settings` 和 `imports` 都不是库条目或 Pack 字段。它们的优先级和冲突无法按并集可靠处理，MVP 视为项目配置，原样保留。

### 5.2 Pack 定义

`~/.pi/agent/skill-packs.json` 升级到 v2（向后兼容迁移）：

```json
{
  "version": 2,
  "libraryRoot": "/...",
  "packs": [
    {
      "id": "...",
      "name": "前端调试",
      "description": "...",
      "skills": [{ "skillKey": "...", "contentHash": "..." }],
      "mcpServers": [{ "serverKey": "...", "configHash": "..." }]
    }
  ]
}
```

- `skills` / `mcpServers` 两类引用并列，都带哈希做漂移检测。
- `mcpServers` 只能表达独立 server 的引用；不承担顶层 `settings` 或 `imports` 的配置职责。
- 一个 Pack 可同时含 skills 和 mcpServers（混合包），也可只含其一。

### 5.3 工作空间收据（v2）

仍使用 `<cwd>/.pi/skill-packs.json`，但升级为 v2。`appliedPacks` 是用户选择的标签，也是每次重整的唯一输入；**不再按某一个 Pack 的收据直接删除 MCP**。

```json
{
  "version": 2,
  "revision": 7,
  "appliedPacks": [
    {
      "packId": "frontend-pack",
      "status": "full",
      "receipt": {
        "appliedAt": "2026-07-21T00:00:00Z",
        "installed": [{ "skillKey": "slides", "contentHash": "sha256..." }],
        "mcpServers": [{ "serverKey": "chrome-devtools", "configHash": "sha256..." }]
      }
    }
  ],
  "skippedConflicts": [],
  "mcp": {
    "disabledServerKeys": ["postgres"],
    "managedServers": {
      "chrome-devtools": { "configHash": "sha256..." }
    }
  }
}
```

- `receipt.mcpServers` 是该标签最近一次成功重整时使用的引用快照。Pack 后来被删除时可作为回退，避免一次全局配置编辑意外改变项目环境；UI 标为“来源 Pack 已删除”。
- `managedServers` 是**项目文件中的基线**，不是第二份配置。重整前重新计算当前条目的哈希：相同才仍可由 pivot-ui 管理；不同即降级为外来条目并保留。
- `disabledServerKeys` 仅对当前 Pack 并集中的 pivot-ui 托管 server 有效。某 key 不再在并集中时自动清理。
- v1 收据迁移时不猜测 `.pi/mcp.json` 的归属：已有 JSON 的所有条目都按外来条目处理，只有迁移后的首次成功写入才进入 `managedServers`。
- `revision` 是工作空间状态的单调版本号，每次成功 apply、移除或 toggle 后递增；它与固定的 schema `version` 无关。预览返回该值，提交时必须带回。服务端在同一 cwd 内串行化重整、重新计算计划，并在 `revision` 不一致时返回 `409`；浏览器传回的 plan 只用于展示，绝不作为写入依据。

### 5.4 取消 Profile 概念

不再使用独立的 `~/.pi/agent/mcp-profiles/<id>.json` 与 `mcp-profile-state.json`。Pack 的 `mcpServers` 引用经重整后写入 `<cwd>/.pi/mcp.json`，并在 `<cwd>/.pi/skill-packs.json` 中记录托管状态。**不使用 `setFlagValue` 注入**，无需 per-session 临时文件。

---

## 6. 库与安装

### 6.1 Skill 库（不变）

照 `docs/skill-pro.md`：浏览市场 / 本地安装 / Git 安装 / 扫描导入。

### 6.2 MCP server "安装" = 录入到库

MCP 不需要"下载二进制"，录入一份连接定义到库即可。三种入口：

- **表单录入**（主流）：填 command/args/env 或 url/headers/auth；可选 lifecycle 与凭据环境变量引用。MVP 不提供 `directTools`。
- **JSON 粘贴**：贴一份 server 定义或整份 `mcpServers` 对象，校验后入库。
- **从其它 host 导入**（v2）：读取 Cursor、Claude Code、Codex、Windsurf、VS Code 的配置，解析为独立库条目。不会在 Pack 中写 adapter `imports`，也不会修改源文件。

> 凭据：`bearerTokenEnv` 优先于硬编码 token；OAuth 见 §8。库条目存的是**引用**，不是明文。

### 6.3 装 adapter vs 装 MCP server（文案必须分清）

- `pi install npm:pi-mcp-adapter` = 装**扩展**（一次性，已在 `settings.json.packages`）。
- 本功能 = 录 MCP server **连接定义**入包，不下载二进制（npx/url 在会话拉起进程时才下载）。

### 6.4 Adapter 前置条件与功能 Guard

`pi-mcp-adapter` 是 MCP Pack 的运行时前置条件。没有它，写入的 `.pi/mcp.json` 不会被 Pi 加载；因此不能让用户以为 MCP Pack 已经生效。

后端通过现有 package 配置读取 adapter 状态，而非由浏览器猜测，统一返回：

```json
{ "state": "ready", "package": "npm:pi-mcp-adapter", "version": "2.11.0" }
```

- `version` 仅在已发现 package 元数据时返回；`missing` 状态不伪造版本号。
- `ready`：adapter 已安装且启用，开放所有 MCP 功能。
- `missing`：未安装；显示“安装 MCP adapter”主操作，调用现有 package 安装能力安装 `npm:pi-mcp-adapter`。
- `disabled`：已安装但在 pi 配置中禁用；显示“启用 MCP adapter”主操作，不重新安装。
- 安装或启用成功后立即刷新状态；已有会话不会自动加载扩展，提示用户新建会话或在 v1.1 使用“重载当前会话 MCP”。

adapter 是写入项目 MCP 成品和重载会话的前置条件；库与 Pack 编辑只是保存定义，不应被它阻塞。所有会改动项目 MCP 状态的路由仍必须二次检查；未就绪时返回 `412 MCP_ADAPTER_REQUIRED`，避免绕过 UI 写出无效的“已应用”收据。

| 位置 / 动作 | adapter 未就绪时的行为 |
|---|---|
| `Packs` 入口和纯 Skill Pack | 保持可用，避免 MCP 扩展阻塞既有技能管理 |
| Pack 编辑器的 MCP servers 区 | 可编辑引用；Apply 前显示 adapter 前置条件 |
| MCP 库录入、导入、编辑、删除 | 可用；保存定义不会影响项目 runtime |
| 包含 MCP 引用的 Apply / 移除标签 / Toggle | 禁用；纯 Skill Pack 的 Apply / 移除不受影响 |
| `SkillsConfig` 的 MCP 区与项目有效环境预览 | 不显示 Pack 管理状态，显示未就绪状态和 CTA；保留 `.mcp.json` / `.pi/mcp.json` 的只读文件查看 |
| 当前会话 MCP 重载 | 禁用 |

这不是权限模型。用户仍可自行编辑 JSON；Guard 的目的只是保证 pivot-ui 不会把一个未被 adapter 消费的配置标成“已应用”。

### 6.5 MCP server 类型

- **npx 型（多数）**：`command:"npx"`, `args:["-y","@org/server-pkg"]`。adapter 的 `npx-resolver` 会解析为直连二进制路径。
- **URL / StreamableHTTP 型**：`url` + 可选 `headers`、`auth`（`bearer` / `oauth`）。
- **本地二进制型**：`command` 路径 + `args` + `env` + `cwd`。

环境变量支持 `${VAR}` 与 `$env:VAR` 插值（adapter 原生）。

---

## 7. 应用语义

### 7.1 Skill 应用（不变）

- 预览 → 原子复制 → 写 `<cwd>/.pi/skill-packs.json` 收据。
- 项目已有同名目录时一律跳过；当前实现不比较项目副本哈希，并记 `skippedConflicts`。
- 移除标签沿用当前的并集卸载：删除不再被其它已应用 Pack 引用的技能目录。它也可能删除曾因同名冲突而跳过的预存目录，详见 `docs/skill-packs.md`；本提案不改变此行为。

### 7.2 MCP 应用 —— 并集拼装写入项目（单一模式）

一次 apply、移除 Pack 标签、启用或禁用 MCP，都是同一件事：先算出**变更后全部已应用 Pack 的 serverKey 并集**，再重整一次 `<cwd>/.pi/mcp.json` 的托管部分。它不是“给刚操作的 Pack 增删几条”。

这条规则解决多 Pack 的核心问题：A 与 B 都引用 `postgres` 时，只安装一份；移除 A 后，因为 B 仍在并集中，`postgres` 继续保留。只有从**所有**仍应用的 Pack 中消失、且条目未被手改的 server，才会被移除。

`settings`、`imports` 和其它顶层字段不属于 Pack。重整读取并原样保留它们，只改 `.pi/mcp.json` 的 `mcpServers` 中被 `managedServers` 明确标记的条目。

> **取消会话级临时模式**。理由：同一 cwd 并行多会话用不同 MCP 是低频；secret 不入 repo 靠 `bearerTokenEnv`；临时试用 = 应用 Pack → 用完撤销；多会话隔离 = 用不同 cwd（worktree）。砍掉后免掉 `setFlagValue` 注入路径、`mcp-runtime/` 临时文件、优先级 pitfall 解释。

#### 写哪

`.pi/mcp.json` 而非团队共享的 `.mcp.json`：pi 专属、随仓库走、优先级最高，不污染团队共享文件；pi 字段（`lifecycle` / `directTools` 等）不进共享文件妨碍其它 host。写的是**单份合并文件**。

#### 重整算法（唯一写入路径）

1. 在每个 cwd 的重整锁内读取工作空间收据，验证提交携带的 `revision`；将“当前标签 + 本次增删后的标签”解析为 Pack 列表。对于已删除的 Pack 使用其 `receipt.mcpServers` 回退，并提示用户清理无效标签。
2. 对全部引用按不区分大小写的 `serverKey` 去重。相同 key + 相同 `configHash` 只保留一份；同 key + 不同 hash 是版本冲突，**阻止本次 MCP 重整**，不随机选择一个版本。
3. 校验每个库文件仍存在且其 `definition` 哈希与引用一致。缺失或漂移同样阻止 MCP 重整，要求先更新该 Pack 的引用。
4. 读取团队 `.mcp.json`。若其有同名 `serverKey`，该 server 标为 `shadowed_by_team_config` 并从 Pack 写入集合排除：`.pi/mcp.json` 在 adapter 中优先级更高，写入会反过来覆盖团队定义。全局来源仍按 adapter 的正常优先级展示。
5. 从期望并集中排除 `disabledServerKeys`，得到需要启用的 server 集合。
6. 读取现有 `.pi/mcp.json`，对每个收据中的托管 key 校验当前哈希。哈希不同则降级为外来条目，保留原样，不再替换或删除它。
7. 在仍受托管的 key 中：期望集合内的写入库中定义；不在期望集合内的删除。新 key 仅在目标位置不存在时写入并记录基线哈希。
8. 外来 key、已降级 key、`settings`、`imports` 和未知顶层字段一律原样保留；最后以临时文件 + 原子 rename 写回，成功后更新收据与 `revision`。执行前始终从目标 Pack 集合重算计划，不接受浏览器提交的 plan。

只要 MCP 预览被阻止，`.pi/mcp.json`、技能目录与工作空间收据均不改变。混合 Pack 的执行以同一个计划提交：MCP 重整必须全成或全不成，任一执行失败都回滚本次新建的技能与 MCP 文件，避免留下只有半个 Pack 的状态。

#### 本地冲突与手动编辑

| 情况 | 默认行为 | 用户可选动作 |
|---|---|---|
| 两个 Pack 同 key、同 hash | 去重，只安装一份 | 无需处理 |
| 两个 Pack 同 key、不同 hash | 阻止重整，列出两个 Pack | 更新/统一其中一个 Pack 的引用或改 serverKey |
| 未托管本地条目同 key、同 hash | 复用本地条目，不取得其所有权 | 无需处理；该条目仍不可由 Toggle 管理 |
| 未托管本地条目同 key、不同 hash | 默认阻止该 server 写入，保留本地定义 | “保留本地并跳过此 server”（Pack 显示有跳过）或在单独确认中“用库版本替换” |
| 团队 `.mcp.json` 有同 key | 不写 `.pi/mcp.json`，避免 Pack 覆盖团队定义 | 保留团队定义，或改 Pack 的 `serverKey` |
| 已托管条目被手改 | 变为外来条目，保留手改 | “恢复库版本”是显式覆盖动作；移除 Pack 不删它 |

MVP 不做字段级 JSON 合并。连接定义里的 `command`、`url`、`env`、`headers` 相互依赖，自动逐字段合并既难解释也可能产生不可用或泄密的配置。冲突时保留完整的一侧，用户可在库中另建不同 `serverKey` 后同时使用。

#### 撤销

移除标签触发上述重整，而不是依据“被移除 Pack 当时安装了什么”直接删除。只有不再属于完整并集且仍与 `managedServers` 基线一致的条目会被删；被其它 Pack 共用、来自用户或被用户修改过的条目都会留下。

#### 位置决定语义

- **项目视图**（`SkillsConfig` Workspace 标签）应用 / 撤销 / toggle = 改项目 `.pi/mcp.json`，持久。
- **会话内“重载 MCP”** = 先在项目视图完成 Pack 变更，再复用现有 `reload` 命令执行 `inner.reload()`，带确认对话框。
- **新建会话对话框**：不选 Pack，仅显示"该项目当前 MCP：N 个 server"作为信息；换环境请先在项目视图应用。

#### 会话内应用后重载

会话进行中调整 Pack 后，用户可执行“重载当前会话 MCP”。它调用 `inner.reload()`，chat 历史不变，server 会优雅关闭并按项目的最新配置重连。确认对话框必须明示：①改的是**项目文件**，同一 cwd 其它并行会话在下次加载时也会看到新环境；②reload 会中断 server 连接并重连。

### 7.3 项目工作空间 MCP 的启用/禁用（与 skill 同样体验）

与 skill 的 `disable-model-invocation` 同体验：每个安装到项目的 MCP server 默认启用，可在 Skills 界面里一键禁用/启用，不重装。

**关键约束**：adapter 的 `ServerEntry`（`pi-mcp-adapter@2.11.0` `types.ts:284`）**没有 `disabled` 字段** —— 进了 `mcpServers` 就是激活。pivot-ui 不能靠给条目加 flag，只能**从工作空间成品文件移除条目 + 自己记一份禁用清单**。

**机制**：
- 状态存在 workspace pack 收据 `<cwd>/.pi/skill-packs.json` 的 `mcp.disabledServerKeys: string[]`。
- **禁用**：把 key 加入禁用集合后执行完整并集重整；若它仍由任一 Pack 需要，重整会从 `.pi/mcp.json` 移除该**未被修改的托管条目**。adapter 因读不到而自然不连。
- **启用**：从禁用集合移除后执行完整并集重整，库定义重新写入 `.pi/mcp.json`。
- **默认**：新加入并集的 server 一律启用。禁用状态按 `serverKey` 作用于所有引用它的 Pack，不会出现 A 启用、B 禁用同一个实际 server 的假象。

**适用范围**：只对 pivot-ui 自己写入 `.pi/mcp.json` 的 server 生效。来自团队 `.mcp.json`、`~/.config/mcp/mcp.json`、`~/.pi/agent/mcp.json` 的 server 只读展示，Toggle 锁状 + tooltip 指路编辑哪个文件。

### 7.4 与 Tool Preset 的关系

- Tool Preset（none/default/full）= 给 agent 看到哪些 pi 内置/扩展工具。
- Pack = 这些工具背后的能力来源。
- 两者正交。`mcp` 这个 proxy 根工具始终在 `withExtensionTools` 里保留（见 `rpc-manager.ts`）。

---

## 8. 凭据与 OAuth

- adapter 把 OAuth/bearer 凭据存 `~/.pi/agent/`，**按 serverName 索引，跨所有会话/包共享**。
- 库里强制 `serverKey` 全局唯一（文件名即 key），从源头避免凭据撞库。
- OAuth headless 流程（服务器上 pi 无法开本地浏览器）：
  1. UI 点 server「连接」→ SSE `auth-start` → 返回 `authorizationUrl`。
  2. 用户本地浏览器授权 → 复制回调 URL。
  3. pivot-ui 粘回 → `auth-complete`。
  4. 凭据入库，跨会话复用。
- UI 警示：授权 URL 与 code 敏感。

---

## 9. UI 集成

现有入口：`AppShell` 侧边栏 `Packs` 按钮 → `SkillPacksModal`；项目工作空间视图在 `SkillsConfig`。

### 9.1 侧边栏

- `Packs` 保持单项不变。
- `Skills` 导航项现有 `SkillsConfig` 弹窗**直接扩展**，不新建独立 MCP 导航项。
- adapter 未就绪时不隐藏整个入口：Pack 和 MCP 库仍可编辑；项目应用、toggle 和当前会话 reload 按 §6.4 禁用并在原位置给出安装/启用动作。

### 9.2 Pack 编辑器

- 现有 `skills` 列表区下加 **MCP servers** 区，行结构：[serverKey | 类型徽标 | configHash 漂移指示 | 详情/编辑 | 移除]；连接测试是 v2 能力。
- 添加 server：从库引用 / 新建库条目（一步糖）。

### 9.3 应用动作

- `Workspace` 标签的 `+ Apply pack`：先把新选择加入现有标签集合，走 `preview` → `apply` 路径。预览和执行都针对完整集合，既写 skill 又重整 `.pi/mcp.json`，收据同存；不弹模式选择。

### 9.4 已应用标签

- workspace 已应用 Pack 标签上点 `×` 移除：从完整标签集合中移除后重整。skills 采用已落地的并集卸载规则；MCP 仅删除不再在并集中且仍由 pivot-ui 托管的条目。
- 标签徽标：`3 skills · 2 MCP`，冲突时 `有跳过`。

### 9.5 Skills 工作空间视图加 MCP 区（启用/禁用主入口）

`SkillsConfig` 的 `Workspace` 标签内、技能列表下方加 MCP servers 区，复用同一个 Toggle 手势。

行结构示例：

```
☁ chrome-devtools    stdio · lazy       [Toggle ✓]
  来源: 前端调试包（pack applied）
☁ postgres           url · keep-alive  [Toggle ✗]
  来源: 前端调试包（已禁用）
☁ team-shared-git    stdio · lazy      [Toggle 锁]
  来源: team · .mcp.json （不归 pivot-ui 管，请编辑该文件）
```

- Toggle = 启用/禁用（§7.3 机制）。
- 来源徽标：pack applied / team / global / adapter-global。
- 不归 pivot-ui 管的：Toggle 锁状 + tooltip。
- 排序：启用在上、禁用在中、外来只读末尾。
- 应用默认启用。

### 9.6 项目 MCP 视图（右面板）

- 只读展示 `.mcp.json` / `.pi/mcp.json` + "合并后有效环境"预览 + 覆盖关系徽标。
- 修改入口指向 `Skills` 导航项的 MCP 区。
- 不需要单独的 MCP 大 modal。

---

## 10. API

| 路由 | 说明 |
|---|---|
| `/api/skill-packs*` | 现有 Pack CRUD，扩展支持 `mcpServers` |
| `/api/mcp/status` | 新增，读取 `pi-mcp-adapter` 的安装/启用状态，供所有 MCP UI 共用 |
| `/api/skill-library/mcp-servers*` | 新增 MCP server 库条目的 CRUD（对应 skill-library） |
| `/api/mcp/project?cwd=` | 保留（合并预览，读 adapter 四源） |
| `/api/workspace-skill-packs/preview` | 扩展为针对“现有标签 + 本次增删”生成 skill + MCP 的完整并集计划，并返回 `workspaceRevision` |
| `/api/workspace-skill-packs/apply` | 接受目标 Pack 集合与 `workspaceRevision`；在服务端重算并提交，revision 不一致则拒绝，避免并发覆盖 |
| `/api/workspace-mcp/toggle` | PATCH `{ cwd, serverKey, enabled }`：启用/禁用项目工作空间 MCP |
| `/api/agent/[id]` | 复用既有 `type: "reload"`：在项目配置已变更后重载当前会话；不接收单个 `packId` |

OAuth 的 `auth-start` / `auth-complete` 路由留到 v2，与 OAuth UI 一并加入；不阻塞 npx、URL 和环境变量引用的 MCP 管理。

**不需要**：`mcpProfileId`、`mcpApplyMode`、per-project 默认 Pack 映射、`mcpSettings`、`setFlagValue` 注入路径。

`/api/workspace-mcp/toggle`、包含 MCP 引用的 workspace preview/apply，以及既有 `reload` 都先检查 `/api/mcp/status` 等价的服务端 guard；未就绪统一返回 `412 MCP_ADAPTER_REQUIRED`。MCP library CRUD 和 Pack 编辑不受该 guard 限制；`/api/skill-packs*` 对纯 skill 字段仍可正常工作。

`lib/mcp-pack-apply.ts` 负责：写 `.pi/mcp.json`、撤销、冲突、toggle。

`lib/rpc-manager.ts` 的 `startRpcSession` **不改** —— adapter 启动时自然从项目 `.pi/mcp.json` 读到。当前会话重载复用既有 `reload` 路径。

---

## 11. 边界与已知限制

1. **adapter 是硬前置**：缺失或禁用 adapter 时，Pi 不会加载 Pack 生成的 MCP 配置。UI 和 API 必须共同执行 §6.4 的 Guard；不能只做一个失效的前端灰显。

2. **direct tools 不随 Pack 动态注册**：direct tools 在 pivot-ui 进程启动时按全局 `~/.pi/agent/mcp.json` 注册一次。Pack 的 MCP 引用**不会动态注册 direct tools**，只影响 proxy 工具背后的 server 集合 + 实际连接。
   → 库表单和 JSON 导入拒绝 `directTools`；需要它时必须编辑全局 `mcp.json` 并重启 pivot-ui。

3. **Pack 不能覆盖团队 `.mcp.json`**：adapter 按 shared-global、pi-global、shared-project、pi-project 的顺序浅合并，`.pi/mcp.json` 同名字段优先级最高。重整因此把团队 `.mcp.json` 同名项标为 `shadowed_by_team_config` 并不写入；项目视图显式提示该关系。

4. **per-session server 进程开销**：每个会话独立启动 MCP server 进程（README 限制：cross-session sharing 未实现）。lazy 模式 + 默认 idle timeout 缓解。

5. **OAuth 凭据全局共享**：adapter 按 `serverName` 索引存 `~/.pi/agent/`，跨所有会话/包共享。库内 `serverKey` 唯一可防撞库。

6. **argv 全局默认的设置途径**：pivot-ui 部署时不走 pi CLI argv，全局 direct tools 基线只能是 `~/.pi/agent/mcp.json`。pivot-ui 仅提供只读 + 文件查看器编辑入口。

7. **`~` 不展开**：adapter `resolve()` 不展开 `~`；`lib/mcp-pack-apply.ts` 传入的路径一律绝对路径。

---

## 12. 实施约束

1. **手改后的删除保护**：只要当前定义哈希不等于收据基线，就降级为外来条目。移除任意 Pack 或禁用 server 都不会删它；用户只能显式选择“恢复库版本”或自行编辑 JSON。

2. **混合 Pack 的执行原子性与并发**：预览先完成 skill 与 MCP 的全部校验；任何预览冲突均不写文件。执行阶段在 cwd 重整锁内重新读取 state 并校验 `revision`，将新技能先写入临时目录、`.pi/mcp.json` 以原子 rename 替换，项目收据最后提交；任一步失败要还原旧 MCP 文件并删除本次新建技能。这样不会留下“标签已应用但只有半个 Pack”，也不会让两个网页标签互相覆盖。

3. **会话内重载影响并行会话**：重载前已改项目 `.pi/mcp.json`，同一 cwd 的其它并行会话会在下次 reload 时看到新环境。确认对话框明示；要隔离需用不同 cwd（worktree）。这是砍临时模式的已知代价。

4. **库条目 `serverKey` 唯一性强制**：新建/改名/import 撞库时报错并提示“改名”或“显式替换并更新引用”。MVP 不提供静默覆盖；替换前列出受影响的 Pack。

---

## 13. 技术约束确认（来自 `pi-mcp-adapter@2.11.0` 源码）

- `utils.ts` `getConfigPathFromArgv()` 读 `process.argv` 的 `--mcp-config <path>`；模块加载期（`index.ts`）调用一次，决定进程级 direct tools。
- `index.ts` 注册 flag `pi.registerFlag("mcp-config", { type: "string" })`。
- `init.ts` `initializeMcp` 在每个 `session_start` 中 `pi.getFlag("mcp-config")` 取值 → `loadMcpConfig(path, cwd)`。
- `config.ts` `loadMcpConfig(overridePath, cwd)`：`overridePath` 经 `getPiGlobalConfigPath` 仅替换 pi-global 槽；`getConfigSources` 仍合并 shared-global + pi-global + shared-project + pi-project 四源（后者覆盖前者同名 server）。`expandImports` 展开 `imports`。
- `types.ts` `ServerEntry`（line 284）无 `disabled` 字段，进了 `mcpServers` 就是激活。
- OAuth headless 流：`mcp({ action:"auth-start", server })` → `authorizationUrl`；`mcp({ action:"auth-complete", server, args:{ redirectUrl | code } })`。
- per-session server 进程：README "Limitations" 明确 cross-session sharing 未实现。

---

## 14. 与现有文档的关系

- **`docs/skill-packs.md`**：不动。本文提案落地后，可追加 "## MCP 扩展" 一节登记已落地功能。
- **`docs/skill-pack-mvp.md` / `docs/specs/skill-pack-mvp.md`**：不受影响，仍是 skill 单一类型的 MVP 文档；本提案在其上做泛化（version 2）。
- **`docs/specs/mcp-management.md`**：被本文取代，删除。
- **`docs/mcp-pack-unification.md`**：被本文取代，删除。

---

## 15. 建议落地顺序（v1 → v2）

**v1.0（MCP 包 MVP）**
1. adapter status API + 仅作用于项目写入的前后端 Guard；复用现有 package 安装/启用操作。
2. 库扩展 MCP server 文件 `mcp-servers/<key>.mcp.json`（CRUD + 校验 + `configHash`），并让 Pack 编辑器可引用它。
3. Pack 和工作空间收据升级到 v2（`mcpServers` 引用、`managedServers`、`revision`），向后兼容迁移。
4. `lib/mcp-pack-apply.ts` 作为唯一重整模块：服务端重算、同 cwd 串行、完整 Pack 并集、团队 `.mcp.json` 冲突保护、原子提交与撤销；为这些分支添加最小测试。
5. 扩展现有 Workspace Apply/Remove 流程以展示并确认 MCP 变更。

**v1.1**
6. SkillsConfig Workspace MCP 列表与 Toggle（`PATCH /api/workspace-mcp/toggle`）。
7. 项目 MCP 只读预览，以及复用现有 `reload` 的当前会话确认动作。

**v2**
8. OAuth 完整 UI（auth-start/complete SSE）。
9. 从其它 host 导入到库。
10. 连接测试、模板库、侧边栏徽标。
