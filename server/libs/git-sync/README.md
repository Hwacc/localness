# Git sync

Localness 与 Git 仓库之间的双向同步：**Push** 把 source locale 写进仓库，**Pull** 把仓库里的译文拉回 Localness。

本目录写给自部署源码、想把 Localness 接到自己 TMS 的开发者。日常使用说明见 `docs/run-book/11-git-sync.md`。

## 先确认：你要写的是「Git 布局」adapter

Localness 不直接调用任何 TMS 的 API。它只读写 Git 仓库，TMS 通过自己的 Git 集成读写同一个仓库：

```
 Localness ──push source──▶  Git 仓库  ◀──TMS 的 Git 连接器──▶  TMS
 Localness ◀──pull 译文────  (分支 + 目录)
```

所以「接入一个 TMS」实际上是在描述：**这个 TMS 在仓库里期望的文件长什么样**。
每种文件约定实现为一个 layout，存进 `GitSyncBinding.adapter`。

- 你的 TMS 能读写 Git（Crowdin、Lokalise、Phrase、LILT、Transifex 等大多可以）：照本文写一个 layout。
- 文件是「每个 locale 一个 JSON、原地覆盖」：直接用内置的 `locale-files`，不需要写代码。
- 你的 TMS 只能走 HTTP API、不经过 Git：本接口不适用。这种情况需要另写一个同步通道，不在 `GitSyncLayout` 的范围里。

## 目录结构

```
git-sync/
  sync.ts                 引擎入口：预览、apply、冲突、base 记账。API 路由只 import 这里
  engine/
    three-way.ts          base / ours / theirs 三方决策
    filters.ts            文件分类 classifyFile、push/pull 资格判断
    seen-files.ts         GitSyncBinding.seenFiles 的解析，blobSha
    log.ts                GitSyncLog 写入
  remote/
    git-remote.ts         clone（sparse）、commit、push、按 trailer 找提交
    credentials.ts        HTTPS 认证 URL
  layouts/
    types.ts              GitSyncLayout 接口与共享类型   ← 你要实现的契约
    index.ts              注册表 gitSyncLayout(adapter)  ← 你要登记的地方
    lilt-swbu/            LILT：追加式批次文件
    locale-files/         每个 locale 一个 JSON，原地改写
```

依赖方向是单向的：`sync.ts → layouts → engine`，`sync.ts → remote`。layout 不碰数据库、不做 git 操作、不做三方合并。

## 职责划分

引擎（`sync.ts`）负责，layout **不要**重做：

- clone / sparse checkout、commit、push、提交信息与 trailer
- 三方合并、冲突卡片、`GitSyncBase`、预览的保存与过期
- 哪些 key 可以推送、哪些需要先解决冲突
- 记录 `seenFiles`

引擎自己要守住的几条规则（`test/unit/git-sync-flow.test.ts` 用真实 SQLite 和裸仓库覆盖）：

- Pull apply 只信预览里 Git 的一侧；平台一侧在事务里重读并重新三方判定，预览后被改过的 key 保留不动，返回在 `changed` 里。
- 「使用平台」（`ours`）只把 base 设为 Git 文本并关卡，不写草稿、发布文案或过期状态。
- 预览会把重新检查过、已不再冲突的未解决卡片关为 `obsolete`。
- 绑定的 adapter、remote、branch、目录或文件规则变了，`resetGitSyncState` 清掉 base、`seenFiles`、未解决卡片和待应用预览。
- Pull 只处理项目已配置的 locale，其余放进 `ignoredLocales`。
- 补记已推送的批次时，base 取那个提交里的实际文本。
- Pull 预览记下绑定目录的 tree id（`scopeTree`）。apply 时分支 head 变了但目录 tree 没变（别的 product 有提交），快照照常可用。
- Pull apply 只跳过「同 key 有 open 卡」的行（任一 locale），返回在 `blocked` 里；其余照常应用。全部被挡才 409。
- Push 三方判定里，远端没有的 key 视为「Git 没意见」（theirs = base），不会因为远端删除或换目录而判成冲突。Git 一侧为空的卡不能选 `theirs`。

多人并发的流程规则（预览到确认横跨两次请求，数据库事务管不到，靠下面这些保证）：

- **快照只证明 Git 一侧**。平台一侧在写入事务里重读、重新判定；新加写入路径照此办理。
- **项目租约**（`engine/lease.ts`，`GitSyncBinding.leaseId / leaseOwner / leaseUntil`）：apply pull、apply push、改绑定位置的 PUT 串行执行，拿不到返回 409 `sync_busy`。TTL 到期可接手。预览不拿租约，但租约被持有时拒绝（开始时、clone 后取消旧预览前各查一次），否则会取消正在落地的那份预览。
- **预览状态只做条件迁移**（`claimPreview`）：`pending → pushing` 在 `commitAndPush` 前、`pending → applied` 在 Pull 写事务内，都带「仍是原状态」条件；被新预览取消的预览在推送前停下 / 整个事务回滚，返回 `preview_replaced`。推送已落地后的 `applied` 记账不设条件。
- **绑定代际**（`GitSyncBinding.generation`）：改位置时 +1，预览快照记下它；apply 的写事务第一步用 `liveBinding` 重读比对，并用重读到的 `seenFiles` 合并。
- **Push 意图**：`commitAndPush` 前把预览标为 `pushing` 并记下 key；中断后，下次 Push 预览按 trailer 补记（找不到则 cancelled），重试同一预览也能补记。
- **卡片读时校验**：`listOpenConflicts` 会把平台文案已经变了的卡关为 `obsolete`；所有读取 open 卡的地方都走它。「使用 Git」/「合并」遇到这种卡返回 409 `conflict_stale`。
- **错误码**：拒绝统一用 `gitSyncError`，`data.code` 取自 `GitSyncErrorCode`。`/git` 页据此清掉预览、刷新；预览打开时每 30 秒查一次状态里的 `pendingPreviews`，被替换就关闭。

layout 只负责一件事：**在已经 clone 好的目录里，按自己的约定列文件、读文件、写 source 文件。**

## 契约：`GitSyncLayout`

定义在 `layouts/types.ts`。每个方法都会拿到 `GitSyncLayoutContext`：

| 字段              | 含义                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------- |
| `repoRoot`      | 本次 clone 的根目录，绝对路径                                                         |
| `scope`         | `GitSyncBinding.product`。同时是 sparse checkout 的路径，所以你的文件必须都在它下面 |
| `options`       | `GitSyncBinding.options` 原始 JSON。layout 自己解析，不要信任它的形状               |
| `localeMap`     | 用户填的 locale 改名表（`zh_cn → zh-Hans`），可能为 null                           |
| `loadLocales()` | 项目的 locale 列表。按需调用，会查数据库                                              |

方法：

- **`scopeError(scope, options)`**：保存绑定和每次同步前都会调用。返回错误文案或 null。这里要挡住 `..`、绝对路径等越出仓库的输入。
- **`discover`**：能从仓库里列出可选 scope 时提供（LILT 列出 product 目录），否则为 `null`，UI 会改成手填。它拿到的是完整 clone，不是 sparse。
- **`listFiles(ctx, seen)`**：列出所有 locale 文件，**按合并顺序**返回（后面的覆盖前面的同名 key）。每项的 `reason` 用 `classifyFile(relPath, sha, seen)` 算，`sha` 用 `blobSha(abs)` 算。`relPath` 用正斜杠、相对仓库根目录。认不出 locale 的文件，`locale` 设为 `null`。
- **`readLocales(ctx, files)`**：把文件读成 `locale → key → text`，同时返回 `origin`（`` `${locale}\0${key}` `` → 来源 `relPath`），用于冲突卡片显示来源。坏文件跳过，不要抛错。
- **`readSource(ctx, sourceLocale)`**：仓库里当前的 source 文本，即 Push 三方合并的 theirs。source 文件本身格式错误时抛 422，并在信息里带上路径，避免覆盖用户手写的文件。
- **`sourceTextFor(ctx, files, sourceLocale)`**：如果你的布局能知道某个译文是基于哪一版 source 翻译的（LILT 靠批次 id 配对），返回查询函数，否则返回 `() => null`。返回 null 只会让 UI 不显示「Older source」提示，其他功能不受影响。
- **`unwritableKeys(ctx, sourceLocale, keys)`**：文件格式装不下的 key（比如 nested JSON 里 `a` 已是字符串，又要写 `a.b`）。这些 key 在预览中标为 `UNWRITABLE`，不会推送。
- **`writeSource(ctx, sourceLocale, entries)`**：把 `entries`（只含本次要推送的 key）写进工作区，返回：
  - `relPath`：写入的文件
  - `sha`：写入后的 blob sha，会记进 `seenFiles`，下一次 Pull 就不会把自己写的文件当成新文件。返回 `''` 表示「已见过，内容不追踪」，适合每次都新建文件的追加式布局
  - `summary`：放进提交标题 `localness: <summary> (by …)`

## 不变量

- Push 只写 source locale。译文永远由 TMS 写、由 Pull 读回。
- 同步不表达删除。Localness 删掉的 key 不会从仓库删除，仓库里消失的 key 也不会删掉 Localness 里的 key。
- `[adapter, remoteUrl, product]` 唯一：同一个仓库目录只能绑定一个项目。
- 不要在 layout 里缓存跨请求的状态。每次同步都是全新 clone。

## 新增一个 layout：步骤

以 `my-tms` 为例。

1. **枚举值**：在 `shared/constants/index.ts` 的 `GitSyncAdapter` 里加 `MY_TMS = 'my-tms'`。zod 的 `adapter` 字段由该枚举推导，不用改。
2. **实现**：新建 `layouts/my-tms/index.ts`，导出 `export const myTms: GitSyncLayout = { … }`。文件读写放在同目录的其他文件里，参考 `locale-files/`。
   - 需要 locale 改名时，参考 `locale-files/files.ts` 的 `localeFileName`：`localeMap` 中的显式映射优先。
3. **登记**：在 `layouts/index.ts` 的 `parseAdapter` 和 `gitSyncLayout` 两个 `switch` 里各加一个 case。漏了会编译失败（`default: never`）。
4. **选项**（可选）：需要额外配置时，
   - 在 `shared/utils/schemas.ts` 的 `zGitSyncBindingPut.options` 里加字段；
   - 在 layout 里自己解析 `ctx.options`，缺省值写在 layout 里（参考 `parseLocaleFilesOptions`）。
5. **UI**：
   - `app/components/GitSyncLayoutFields.vue`：在 `adapterItems` 加一项，并为新的 adapter 加一个 `v-else-if` 分支，放 scope 和选项字段；
   - `app/pages/git.vue`：`saveBinding` 里按 adapter 组装 `options`，`bindingTitle` 决定列表里怎么显示这个绑定。
6. **测试**：
   - 单元测试：在临时目录里造文件，直接测你的读写函数。参考 `test/unit/locale-files.test.ts`。
   - 端到端：`test/unit/push-flow.test.ts` 用真实临时目录模拟远端（`remote.repoDir`），可以照着加一个 `adapter: 'my-tms'` 的用例。
7. **文档**：在 `docs/run-book/11-git-sync.md` 补上这个布局的用法。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm exec eslint server/libs/git-sync test/unit
```

不需要新的数据库迁移：`adapter` 是字符串列，`options` 是 JSON 列。
