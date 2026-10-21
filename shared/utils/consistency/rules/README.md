# Consistency rules

每条规则 `{ id, defaultSeverity, category, granularity, detect(ctx) }`（`granularity`：只看单个 key 及其复数族的写 `key`，抽屉改完能立刻单 key 复查；跨 key 比较的写 `group`，只能等全量扫描），纯函数、零 IO：端点负责加载数据，这里只做判定。每个规则一个文件、各带单测（`test/unit/consistency/`）。

## 铁律

**改任何规则的归一化/提取逻辑 = 该规则的白名单全部失配。**

白名单的 `groupId` 是归一化文本（或 文本 hash）的产物：duplicate 规则用 `fpTranslation(near 文本)`，单 key 规则用 `singleKeyGroupId(ruleId, keyId, 文本 hash)`——hash 取**规则实际检查的文本**（published 规则用 `publishedSnapshotText`：全部语言的已发布文本；orphan 用源文）。任何被查文本一变旧行即失效，忽略 ja 的发现不会顺带藏掉后来 fr 的新错。逻辑一变，旧 groupId 不再匹配任何 finding——已忽略的会全部重新浮出。这是**预期行为**（新逻辑下的"同一发现"本来就未被审过），不是 bug；但要在改之前知道代价。

白名单的成员快照 `keyIds` 由**服务端**按当前扫描结果写入，不信任客户端。

## 新增规则的落点

1. `rules/<name>.ts` 导出 `ConsistencyRule`；n≥2 分组型复用文本桶逻辑，n=1 单 key 型用 `singleKeyGroupId`
2. 注册进 `rules/index.ts` 的 `allRules`（数组顺序 = 报告顺序）
3. 分区标题/描述在 `categorySections`（页面与锁定预览共用）
4. lint 类规则走 `_lint.ts` 助手（自动获得 `ctx.lintRules` 开关）；源↔译 token 类走 `_mismatch.ts`
5. 单测放 `test/unit/consistency/`

## 文本口径（2026-10-19 拍板）

检查**只看 publishedText**（与 Outdated「只标已发布」一致）。duplicate / orphan 用的 `sourceText` 是 key 的**线上原文**（`scanSourceText`，2026-10-20 改）：发布过的 key 取源语言 publishedText，从未发布的（含 `__draft_` 占位，永不发布）退回 draftText——所以占位 key 仍参与查重。已发布 key 上未发布的源文修改记为 `pendingSourceText`，**只在卡片上展示、不参与判定**，改草稿不会让分组漂移。空文本一律跳过。
