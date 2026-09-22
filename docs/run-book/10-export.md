# 10. 导出

## 这一章能做什么

- 把这个项目的**已发布**文案导成 xlsx 或 JSON
- 自己决定带哪些页面、哪些词条、哪些语言
- 导之前就知道会跳过什么

## 三个入口

| 入口 | 导哪个项目 |
|---|---|
| Workspace Bar 上的 **Export** | 当前项目 |
| Dashboard 项目卡片上的导出 | 那张卡片对应的项目 |
| **Teams** 页项目行上的导出 | 那一行对应的项目 |

后两个入口会**先把那个项目切成当前项目**，再打开导出弹窗——导出完你会留在切过去的那个项目上。

弹窗标题是 **Export Project**，四步：**Pages & images** → **Keys & locales** → **File format** → **Export**。上面的步骤条不能直接点，只能一步步 **Next**。

[image 导出弹窗的四步步骤条，以及第 1 步的页面勾选列表（含 Select All 和右边那个 Use all of “v1”）]

## 第 1 步：Pages & images

勾选要截图的页面，**默认全选**。每一条写着页面名和 `Updated at …`。表头的 **Select All** 全勾或全不勾。

**正筛着某个发行时**，打开弹窗会自动把范围收窄到那个发行下的页面，并且右上角出现一个 **Use all of “v1”** 按钮——改乱了可以一键恢复成"这个发行的全部"。

这一页只管截图：**不选页面也能继续**，已发布的文案照样导得出来。

- 项目一张页面都没有时写着：`This project has no pages. Continue to pick keys — published text still exports. XLSX will skip screenshots.`
- 有页面但一个都没勾时，下面会提醒：`No pages selected — the sheet will have no screenshots.`

## 第 2 步：Keys & locales

**语言列**：一排徽标，点一下选中或取消。默认全选。右边有个 **Always include `<源语言>`** 的勾选框（默认勾上）——源语言那一列是原文所在，不管你有没有点它都会排在最前面。

**词条**：下面是一张带勾选的词条表，筛选方式和词条表那一页一样（`Search key or origin`、状态、日期、**Show __draft_ keys**）。两个标记值得认：

| 标记 | 意思 |
|---|---|
| **In selected img** | 这条词条在第 1 步选中的页面上有框，导出的截图里会画出它 |
| **No published text** | 这条词条一条已发布文案都没有，**导不出任何东西**（鼠标停上去写着 `Export ships published text, so this key produces no row`） |

底部一行是 `N of M key(s) selected`，加 **Select all M matching**（把当前筛选命中的**全部**选上，不只这一页）和 **Clear selection**。

[image 第 2 步：上面一排语言列徽标加 Always include en 勾选框，中间词条勾选表（标出 In selected img 和 No published text 两个徽标），底下统计行]

再下面是这次导出的统计：

- 选了 XLSX 时：`12 row(s) · 9 tag(s) on 3 page(s) · 10 locale column(s)`
- 只选了 JSON 时：`12 key(s) across up to 10 locale file(s)`
- 有跳过的：`2 selected key(s) have no published text — they are skipped.`
- 有选了词条但页面上没框的：`3 key(s) have no tag on these pages — exported with an empty pic.`
- 还没选词条时：`Pick at least one key. Export ships published text only.`

**统计里的 `row(s)` 是 0 的时候导不出去**，**Export** 按钮是灰的。

## 第 3 步：File format

两个大图标，点一下选中或取消，**两个可以一起选**：

| 格式 | 界面上的说明 |
|---|---|
| **XLSX** | `A sheet with one row per tag, plus one annotated screenshot per page` |
| **JSON** | `Flat { key: text } per locale, published text only, no screenshots` |

底下那句把关系说清了：`XLSX carries the screenshots; JSON is text only, one flat file per locale, and both ship published text. Picking both puts them in one zip.`

## 第 4 步：Export

先写着这次的文件名，点 **Export** 开始，下面逐条列进度（收集数据、逐页生成截图、生成 xlsx / JSON、打包、下载）。**导出过程中弹窗关不掉**，走完变成 **Done**。

文件会自动下载下来。

## 导出来的到底是什么

**只有已发布文案。** 草稿一律不进文件；一条词条在所有语言里都没有已发布文案时，它整条不出现。

文件名：`<项目名> - <发行名>.zip`；没筛发行时就只有项目名。项目名或发行名里的斜杠之类的字符会换成空格。

zip 里是：

| 内容 | 说明 |
|---|---|
| `<同一个名字>.xlsx` | 只有选了 XLSX 才有 |
| `<语言>.json` | 每个语言一个文件，只有选了 JSON 才有 |
| `<页面名>.jpg` | 每个选中的页面一张**带标注的**截图 |

**xlsx 是一张叫 `translations` 的表**，一行一个**框**：

| 列 | 内容 |
|---|---|
| `id` | 框的 id；没有框的那种行留空 |
| `key_id` | 词条 id |
| `pic` | 截图文件名；这一行没有框时留空 |
| `key` | 词条的 key |
| 各语言列 | 源语言排在最前面，后面按项目自己的语言顺序 |

**没有单独的 origin 列**——源语言那一列就是原文，不重复放一遍。一条词条在同一页上有几个框，就有几行，文案相同。

**JSON 是扁平结构**，一个语言一个文件，里面就是 `{ "key": "文案" }`：

- 某个 key 在这个语言下没有已发布文案时，这个 key **不写进去**——留空反而会盖掉调用方自己的回退。
- 一个语言一条已发布文案都没有时，**这个语言的 json 文件根本不生成**，而不是给一个空文件。

**截图是这个页面的标注图**，上面只画**你选中的那些 key** 的框——和表里的行对得上，页面上其它框不会画上去。

## 做错了会怎样

| 你看到 | 原因 |
|---|---|
| 导出的文件里没有某条词条 | 它还没有已发布文案。回词条表发布一次再导 |
| 导出的 xlsx 里某条词条的 `pic` 是空的 | 这条词条的框不在你选中的页面里，或者它本来就没框 |
| 截图上一个框都没有 | 这张页面上没有你选中的那些 key 的框 |
| 某个语言没有 json 文件 | 那个语言一条已发布文案都没有 |
| 某条词条的某个语言格是空的 | 那个语言没有已发布文案，**不会用源语言补上** |
| **Export** 是灰的 | 统计里 `row(s)` 是 0：选中的词条没有一条有已发布文案；也可能是一个语言列都没选 |
| **Next** 在第 2 步点不动 | 至少要选一条词条和一个语言 |
| 第 1 步的页面少了一大半 | 当前发行筛选把它收窄了。点 **Use all of “…”**，或者把 Workspace Bar 的发行切回 **All releases** |
| 在 Dashboard 上导完，界面停在了另一个项目 | 从卡片导出会先把那个项目切成当前项目 |
| 导出中途关掉弹窗 | 关不掉。导出是按页逐张生成截图的，页面多就要等一会儿 |
| 导出的词条比勾选的多/少 | 行数是**框**的数量，一条词条有几个框就有几行；没有已发布文案的则一行都没有 |
