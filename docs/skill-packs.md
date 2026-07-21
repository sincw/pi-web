# 技能包 / Skill Pack
Skill Pack 把技能库中的技能快照组合成可复用的包，并将它们复制到指定工作空间的 `.pi/skills/`。它不依赖 package plugin，也不会修改全局 Pi 技能目录。

## 概念和存储

| 概念 | 位置 | 说明 |
| --- | --- | --- |
| 全局配置 | `~/.pi/agent/skill-packs.json` | `libraryRoot` 和 pack 定义。首次需要库时默认根目录为 `~/.pi-web/lib/skills`。 |
| 技能库 | `<libraryRoot>/.pi/skills/<skillKey>/` | 每个包含 `SKILL.md` 的目录是一项库技能。`skillKey` 是目录名，匹配时不区分大小写。 |
| Pack | 全局配置的 `packs[]` | 名称、描述和 `{ skillKey, contentHash }` 引用；哈希是加入包时的内容快照。 |
| 工作空间状态 | `<cwd>/.pi/skill-packs.json` | 已应用 pack、每次应用的 receipt 及跳过记录。 |
| 实际项目技能 | `<cwd>/.pi/skills/<skillKey>/` | apply 复制的目标，也是 Pi runtime 发现工作空间技能的位置。 |

`contentHash` 是技能目录的确定性 SHA-256，覆盖所有文件并排除 `.DS_Store`、`Thumbs.db` 和 `~*` 备份文件。修改库技能后，现有 pack 引用会变 stale；必须显式保存 pack 的新哈希，不能静默升级。

## 用户路径

1. 在 Skills 弹窗的 `Library` / `Acquire` 标签设置库、从 skills.sh、本地技能目录或 Git 仓库导入技能。导入的副本始终写入库目录。
2. 通过左侧导航的 `Packs` 打开 `SkillPacksModal`，创建或编辑 pack，并从库中选择技能。
3. 在 Skills 弹窗的 `Workspace` 标签点击 `+ Apply pack`，选择一个或多个未应用 pack，先预览再确认应用。
4. 工作空间标签显示 full 或 partial；移除标签会执行 unapply，不只是隐藏标签，详见下文。

库中的单项技能也可通过 `POST /api/skills/install-from-library` 直接安装到工作空间。该路径不创建 pack receipt，因此不应把它当成 pack apply 的替代状态管理。

## Apply 与 Unapply 语义

`preview()` 先合并所选 pack 的引用，再产生不可变的 `ApplyPlan`：

- 相同 `skillKey + contentHash` 只复制一次；每个 pack 仍会取得自己的应用记录。
- 工作空间已有同名目录时不覆盖，记为 `same_name_exists`，该 pack 为 `partial`。
- 库技能缺失或当前哈希与引用哈希不一致时，整次 apply 被阻止。
- 所选 pack 对同一 `skillKey` 持有不同哈希时，整次 apply 被阻止。
- 复制先写入目标目录旁的临时目录再 rename；任一步失败会回滚这次新建的目录，状态文件不会写入。
- `applyPlan()` 在复制前再次校验库中技能及哈希，防止预览到应用之间的库内容变化。

应用成功后，工作空间状态记录每个 pack 的 `status`、时间和该 pack 计划安装的技能。`skippedConflicts` 只保存已有同名技能造成的跳过。

**Unapply 有文件删除副作用。** `DELETE /api/workspace-skill-packs?cwd=...&packId=...` 会删除该 pack 当前定义中的技能目录，除非另一个已应用 pack 仍引用相同 `skillKey`。当 pack 定义已被删除时，它才回退到 receipt。当前实现也会删除曾因 `same_name_exists` 而跳过的预存技能；不要把 unapply 当作无副作用的“移除标签”。

删除 pack 定义只更新全局配置，不会遍历或更新已有工作空间。删除库技能则会被仍引用该技能的 pack 拒绝。

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
| `app/api/skill-library/**` | 库根目录、库技能和 market/local/git 导入。 |
| `app/api/skill-packs/**` | Pack CRUD。 |
| `app/api/workspace-skill-packs/**` | 工作空间查询、预览、apply、unapply。 |
| `app/api/skills/install-from-library/route.ts` | 单个库技能直接安装。 |
| `components/SkillPacksModal.tsx` | Pack 定义管理。 |
| `components/SkillsConfig.tsx` | 工作空间标签、预览确认和库/导入 UI。 |
| `components/AppShell.tsx` | `packsRefreshKey` 的所有权与下传。 |
| `hooks/useAgentSession.ts` | session reload、slash command 刷新及 prompt 同步。 |

## 验证

```bash
node --test \
  lib/content-hash.test.mjs \
  lib/skill-library.test.mjs \
  lib/skill-packs-store.test.mjs \
  lib/workspace-packs.test.mjs \
  lib/skill-pack-apply.test.mjs \
  components/ChatWindow.test.mjs
```

`lib/*.test.mjs` 覆盖存储、冲突、复制回滚和 unapply；`components/ChatWindow.test.mjs` 覆盖运行中延迟 reload 与下一条 prompt 等待 reload 的约束。
