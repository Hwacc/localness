# 12. 对外 API 与 MCP

## 这一章能做什么

- 给 CI、别的服务或 agent 发一枚**只读** token
- 用三个 HTTP 端点取这个项目的已发布文案
- 把同一枚 token 配进 MCP，让 agent 自己查，不用你写客户端

## 这一页在哪

左侧栏的 **API**。页头写着：

> Read-only access to this project's published copy. Drafts are never reachable with a token, and versioned by `release` only.

**文档和 token 抽屉对所有 Team Member 可见**——消费这个项目的人不一定管这个项目。页面从上到下是：**Manage tokens** 按钮、**Authentication**、**Endpoints**（四个可复制的例子）、**From the browser or Node**、**MCP**。

[image API 页整屏：页头和 Manage tokens 按钮、Authentication 卡片、Endpoints 的四张卡片（各带一个复制图标）]

## 能取到什么，取不到什么

| | |
|---|---|
| **只读** | 没有任何写接口。token 只能读 |
| **只有已发布** | 草稿一律取不到。某条词条在这个语言还没发布，它就**不出现**，而不是返回空字符串 |
| **不做回退** | 缺失的 key **不会**用源语言或别的语言补上。调用方要自己决定缺了怎么显示——直接把 key 名露在界面上是最糟的那种处理 |
| **只能按 release 收窄** | 没有别的筛选参数 |

**token 就是项目身份**：URL 里不写项目 id。好处是配置里少一份要对上的东西，代价是**贴错 token 不会报错，会静默读到另一个项目**。所以拿到的第一件事应该是调 `/api/v1/meta`，看它回的 `project` 名字是不是你要的那个——MCP 那边同理，`get_project_info` 就是干这个的。

## token 的四条规矩

| 动作 | 谁能做 |
|---|---|
| 建 | **任何 Team Member**。不限于 Project Owner |
| 看列表 | **非 Project Owner 只看得见自己建的**；Project Owner 看全项目，每行还多显示建的人 |
| 吊销 | **建的人**或 **Project Owner** |
| 硬删（Delete） | 只有 **Project Owner**，而且只对**已经吊销**的行。它会连「这枚凭证存在过」的记录一起抹掉，和「停掉一枚凭证」是两回事，所以 Confirm 框里写明了 |

**明文只出现一次。** 服务端只存哈希，建完弹窗里那一次没抄下来，就再也拿不回来了——只能吊销重发。

## 建一枚 token

1. 页面上点 **Manage tokens**，右侧滑出 **API tokens** 抽屉（`Read-only credentials for this project.`）。
2. 在输入框里写清楚它是干什么用的，占位文字就是建议：`What is it for, e.g. MCP`。名字是必填的。
3. 点 **Create token**。
4. 弹出的窗口标题是 **Copy this token now**，里面写着：`This is the only time <名字> is shown. The server keeps only a hash, so there is no way to display it again.` 点 **Copy**，然后 **Dismiss**。

**这个窗口点不掉**——只能按 **Dismiss**，所以不会手一滑把还没抄的 token 弄丢。

[image Copy this token now 弹窗：一行说明、下面是被截断的明文和 Copy 按钮、右下角 Dismiss；背景露出 API tokens 抽屉的列表]

列表里每行显示名字、`<前缀>…`、`Created <时间> · Last used <时间>`；已经吊销的带一个 **Revoked** 徽标。**Revoke 点了就生效，没有二次确认**，想清楚再点。

## 三个 HTTP 端点

| 端点 | 返回 |
|---|---|
| `GET /api/v1/meta` | 语言列表、`localeFallback`、可用的 release、以及**每个语言有多少条已发布** |
| `GET /api/v1/locales/:locale` | 一个语言的扁平 `{ key: text }` |
| `GET /api/v1/bundle` | 一次拿到全部语言：`{ locale: { key: text } }` |

页面上每个端点都有一张卡片，写着它的用途和一条能直接复制的 `curl`：

- **Project metadata** —— `Locales, fallback, the releases you can filter by, and how many keys are published per locale. A consumer that holds nothing but a token starts here — this is where it learns which project it serves.`
- **One locale** —— `Flat { key: text } map of published copy. Missing keys stay missing on purpose.`
- **Filtered to a release** —— `Narrow to the keys labelled with one release. Accepts the id or the name.`
- **Every locale in one bundle** —— `All locales in a single round trip. Same shape, keyed by locale.`

**按发行取**：在任何端点后面加 `?release=`，**id 和名字都收**（`?release=v1` 和 `?release=3` 等价）。名字写错不是退回全量，而是 `Unknown release: v1` 的 404——免得调用方以为自己在看一个发行，其实拿到的是全部。

**覆盖率**是给调用方看的：`meta` 按项目自己的语言列表逐个报数，一条都没发布的语言报 `0`，不会从列表里消失。

**bundle 的顺序是稳定的**：语言按项目自己的顺序，语言内部按 key 排序。想做缓存的话，自己 hash 这份 bundle 就行。

## 认证

```
Authorization: Bearer <token>
```

页面底部还有一段浏览器 / Node 的 `fetch` 例子，用环境变量放 token。

**实例必须挂在 HTTPS 后面**，页面上写着：`Requests need HTTPS in front of the instance — a token over plain HTTP is a credential on the wire.`

401 只有三种，含义很直白：`Missing API token`、`Invalid API token`、`API token revoked`。

## MCP

**同一枚 token、同一份数据**，换成 MCP 说给 agent 听。端点在 `/mcp`，页面底部给了一段可以直接粘进 Cursor / Claude Desktop / Claude Code 的配置：

```json
{
  "mcpServers": {
    "localness": {
      "url": "https://你的实例/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

**九个工具，全部只读，全都不收项目参数**——token 已经说了是哪个项目：

| 工具 | 干什么 |
|---|---|
| `get_project_info` | token 服务的是哪个项目、有哪些语言、回退是哪个、每个语言发布了多少条。**起点** |
| `get_translations` | 一个语言的已发布文案，形状和 `/locales/:locale` 一样 |
| `get_all_translations` | 全部语言一次拿到，形状和 `/bundle` 一样 |
| `get_translation` | 单语言、单 key。知道 key 之后用这个，比拉整个语言省 |
| `get_key` | 一个 key 的**全部语言**；未发布的语言**不省略**，明确回 `published: false` |
| `search_keys` | 按 key 名子串找，只返回名字 |
| `search_by_text` | 按某个语言的已发布正文反查 key 名（`exact` / `contains`）。同一句话可能对应多条，返回的是一个列表而不是一个答案 |
| `list_keys` | 官方目录的 key 名，分页。**拿它和业务仓的语言 JSON 做 diff** |
| `list_unpublished_keys` | 官方目录里某个语言**还没发布**的 key，分页 |

三条要点：

- **除了 `get_project_info`，每个工具都能带 `release`**，作用等同 `?release=`。这是一致的：agent 从一个工具学到「release 能收窄」，到下一个发现不行，只能猜是遗漏还是有意。
- **合法值从 `get_project_info` 拿**。它的工具描述里会直接列出这个项目现有的 release 名（没有 release 的项目会说明「不能收窄」）。别的工具的描述只讲「什么时候用」，指向它。
- **校对业务仓的语言文件时不要带 `release`**——那是拿全量官方目录去对，收窄了会漏。

「未发布」和「不存在」在 MCP 里是两件事：`get_translation` 遇到项目里根本没有的 key 会报错，遇到**有但没发布**的 key 回 `published: false`——后者是一个答案（这个语言待办），不是失败。

## 做错了会怎样

| 你看到 | 原因 |
|---|---|
| `Missing API token` | 请求里没带 `Authorization: Bearer <token>` |
| `Invalid API token` | token 抄错了，或者根本不是这个实例发出的 |
| `API token revoked` | 这枚 token 被吊销了。找建它的人或 Project Owner 重发一枚 |
| `Unknown release: v1` | `?release=` 的名字这个项目里没有。名字写错不会退回全量 |
| 调 `/meta` 返回的项目名不是你要的 | **token 贴错了**。URL 里没有项目 id，所以不会报错，只会读到另一个项目——这一页的 token 抽屉是按当前项目开的，确认一下 Workspace Bar 上是哪个项目再建 |
| 关掉弹窗后 token 找不到了 | 明文只有创建那一次。吊销重发 |
| 某条词条在接口里查不到 | 它在这个语言还没**发布**。草稿取不到 |
| 某个语言少了半截 key | 那些 key 在这个语言没发布，API **不会**拿别的语言补上 |
| **Revoke** 点错了 | 没有二次确认，撤不回来。重新建一枚，名字里带上用途 |
| 已经吊销的行点 **Delete** 没反应 | 只有 Project Owner 能硬删 |
| 配置里能读到 token，但浏览器里打不开那个地址 | 实例要挂在 HTTPS 后面；纯 HTTP 上跑 token 等于把凭证明文扔在线路上 |
| agent 说「没有这个 release」 | 它没先调 `get_project_info`。工具描述里写着 release 名从那里取 |
