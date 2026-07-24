# 技能包 / Skill Pack
Skill Pack 将技能快照和 MCP 服务器定义组合成可复用的工作环境。apply 会把技能复制到工作空间的 `.pi/skills/`，并只管理 Pack 拥有的 `.pi/mcp.json` 条目；它不依赖 package plugin，也不会修改全局 Pi 技能目录。

## 概念和存储

| 概念 | 位置 | 说明 |
| --- | --- | --- |
| 全局配置 | `~/.pi/agent/skill-packs.json` | `libraryRoot` 和 pack 定义。首次需要库时默认根目录为 `~/.pivot-ui/lib/skills`。 |
| 技能库 | `<libraryRoot>/.pi/skills/<skillKey>/` | 每个包含 `SKILL.md` 的目录是一项库技能。`skillKey` 是目录名，匹配时不区分大小写。 |
| MCP 库 | `<libraryRoot>/.pi/mcp-servers/<serverKey>.mcp.json` | 包含名称、描述和经验证的服务器定义；`configHash` 只覆盖服务器定义。 |
| Pack | 全局配置的 `packs[]` | 名称、描述、技能 `{ skillKey, contentHash }` 和 MCP `{ serverKey, configHash }` 引用；哈希是加入包时的快照。 |
| 工作空间状态 | `<cwd>/.pi/skill-packs.json` | 已应用 pack、每次应用的 receipt、跳过记录、MCP 所有权基线和 revision。 |
| 实际项目技能 | `<cwd>/.pi/skills/<skillKey>/` | apply 复制的目标，也是 Pi runtime 发现工作空间技能的位置。 |
| 实际项目 MCP | `<cwd>/.pi/mcp.json` | Pack 只新增、更新或删除它明确拥有且未被手工修改的 `mcpServers` 条目。 |

`contentHash` 是技能目录的确定性 SHA-256，覆盖所有文件并排除 `.DS_Store`、`Thumbs.db` 和 `~*` 备份文件。`configHash` 是 MCP 定义的确定性哈希。修改任一库项后，现有 Pack 引用会变 stale；必须显式保存新哈希，不能静默升级。

## 用户路径

1. 在 Skills 弹窗的 `Library` / `Acquire` 标签管理库技能；在左侧导航的 `MCP` 弹窗中管理库 MCP 服务器。两者都写入同一个库根目录。
2. 通过左侧导航的 `Packs` 打开 `SkillPacksModal`，创建或编辑 Pack，并从库中选择技能和 MCP 服务器。
3. 在 Skills 弹窗的 `Workspace` 标签点击 `+ Apply pack`，选择一个或多个未应用 Pack，先预览再确认应用。
4. 工作空间标签显示 full 或 partial；移除标签会执行 unapply，不只是隐藏标签，详见下文。

库中的单项技能也可通过 `POST /api/skills/install-from-library` 直接安装到工作空间。该路径不创建 pack receipt，因此不应把它当成 pack apply 的替代状态管理。

## Apply 与 Unapply 语义

`preview()` 先合并所选 pack 的引用，再产生不可变的 `ApplyPlan`：

- 相同 `skillKey + contentHash` 只复制一次；每个 pack 仍会取得自己的应用记录。
- 相同 `serverKey + configHash` 只配置一次；同 key 不同 hash 的 MCP 引用会阻止整次 apply。
- 工作空间已有同名目录时不覆盖，记为 `same_name_exists`，该 pack 为 `partial`。
- 库技能或 MCP 定义缺失，或当前哈希与引用哈希不一致时，整次 apply 被阻止。
- 所选 pack 对同一 `skillKey` 持有不同哈希时，整次 apply 被阻止。
- Pack 不会覆盖团队 `.mcp.json` 的同名服务器，也不会接管已有或被手工修改的 `.pi/mcp.json` 条目。
- 技能复制、MCP 配置和状态文件作为一个操作提交；任一步失败会回滚这次新建的目录和 MCP 文件。
- `applyPlan()` 在提交前再次校验库内容与哈希，防止预览到应用之间的变化。

应用成功后，工作空间状态记录每个 Pack 的 `status`、时间和该 Pack 计划安装的技能及 MCP 引用。`skippedConflicts` 记录被保护的技能或 MCP 条目。

**Unapply 有文件删除副作用。** `DELETE /api/workspace-skill-packs?cwd=...&packId=...` 会删除该 Pack 当前定义中不再被其他已应用 Pack 引用的技能目录和 MCP 服务器。MCP 仅在 Pivot UI 仍拥有该条目时才会删除；团队配置、预存条目及手工修改过的条目会保留。当 Pack 定义已被删除时，它才回退到 receipt。当前实现也会删除曾因 `same_name_exists` 而跳过的预存技能；不要把 unapply 当作无副作用的“移除标签”。

删除 Pack 定义只更新全局配置，不会遍历或更新已有工作空间。删除库技能或 MCP 服务器会被仍引用它的 Pack 拒绝。

## Runtime 刷新

Pi 在创建或 reload `AgentSession` 时发现技能。因此 pack apply 或 unapply 后，`SkillsConfig` 通过 `onPacksChanged` 递增 `AppShell` 的 `packsRefreshKey`，并传给 `ChatWindow` / `useAgentSession`。

- 空闲 session 会发送 `{ type: "reload" }`，随后重新请求 `get_commands`，使 `/skill:<name>` 立即可用。
- 正在运行的 session 只标记待刷新；`agent_end` 后再 reload，不能在本轮执行中重载 session。
- `handleSend` 会等待同一个刷新 Promise，避免新 prompt 与 reload 并发而遗漏 slash command。

这套协调逻辑必须留在 `useAgentSession`。不要在 `ChatWindow` 或 UI 回调中各自发送 reload，否则会重新引入 reload 与 prompt 的竞态。

## 代码导航

| 文件 | 职责 |
| --- | --- |
| `lib/content-hash.ts` | 技能目录哈希。 |
| `lib/skill-library.ts` | 库扫描、导入发现、复制和删除保护。 |
| `lib/skill-packs-store.ts` | 全局配置和 pack CRUD。 |
| `lib/workspace-packs.ts` | 工作空间状态、引用并集和剩余依赖计算。 |
| `lib/skill-pack-apply.ts` | `preview`、原子 apply、rollback、unapply。 |
| `lib/mcp-library.ts` | MCP 库扫描、验证、CRUD 和引用保护。 |
| `lib/mcp-pack-apply.ts` | MCP 引用并集、预览、受保护的 `.pi/mcp.json` 合并与回滚。 |
| `app/api/skill-library/**` | 库根目录、库技能和 market/local/git 导入。 |
| `app/api/skill-library/mcp-servers/**` | MCP 库 CRUD。 |
| `app/api/mcp/**` | 工作空间 MCP 列表和 adapter 状态。 |
| `app/api/skill-packs/**` | Pack CRUD。 |
| `app/api/workspace-skill-packs/**` | 工作空间查询、预览、apply、unapply。 |
| `app/api/skills/install-from-library/route.ts` | 单个库技能直接安装。 |
| `components/SkillPacksModal.tsx` | Pack 定义管理。 |
| `components/SkillsConfig.tsx` | 工作空间标签、预览确认和库/导入 UI。 |
| `components/McpConfig.tsx` | MCP 工作空间、库与创建/编辑 UI。 |
| `components/AppShell.tsx` | `packsRefreshKey` 的所有权与下传。 |
| `hooks/useAgentSession.ts` | session reload、slash command 刷新及 prompt 同步。 |

## 验证

```bash
node --test \
  lib/content-hash.test.mjs \
  lib/skill-library.test.mjs \
  lib/mcp-library.test.mjs \
  lib/skill-packs-store.test.mjs \
  lib/workspace-packs.test.mjs \
  lib/skill-pack-apply.test.mjs \
  lib/mcp-pack-apply.test.mjs \
  components/ChatWindow.test.mjs
```

`lib/*.test.mjs` 覆盖存储、哈希、冲突、受保护的 MCP 合并、复制回滚和 unapply；`components/ChatWindow.test.mjs` 覆盖运行中延迟 reload 与下一条 prompt 等待 reload 的约束。
