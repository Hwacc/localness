# 6. 项目

## 这一章能做什么

- 建项目，并知道自己会自动成为它的 Project Owner
- 任命和卸任 Project Owner
- 改项目设置：OCR、源语言、key 命名规范、AI 提示词、发行标签
- 让某一页沿用项目设置，或者单独覆盖

## 项目与 Project Owner

项目属于一个团队，进了队就能看见队里的全部项目。

**Team Member 都能建项目，建的人自动成为这个项目的 Project Owner。** Team Owner 不会因为是 Team Owner 就成了 Project Owner——要用 Project Owner 权限，得被任命。

Project Owner 管的是这一个项目：项目设置、发行标签的增删改名、Git 绑定、删 API token。一个项目可以有多个 Project Owner，但**不能一个都没有**。

能改 Project Owner 名册的人是**现任 Project Owner**（互相委任）或 **Admin**（项目没有 Project Owner、或 Project Owner 不在的时候破局）。Admin 也必须在这个团队里，不在队里的 Admin 什么也做不了。

## 建项目

三个入口，打开的是同一个 **New Project** 弹窗：

- Dashboard 上每个团队块的 **New Project**
- Workspace Bar 项目条最右边的 **+**
- **Teams** 页 → **Projects** 卡片 → **New Project**

弹窗里有 **Basic** / **Prompt** / **Settings** 三个标签页（**Releases** 只在编辑已有项目时出现）：

- **Basic**：**Name**、**Description**、**Team**（下拉，只在新建时出现）。一个团队都没有时这里会有一条警告，标题 **No team**，正文 `You need to be in a team to create a project. Ask an Admin to create a team, or join with an invite code.`
- **Settings**：OCR、源语言、key 命名规范，见下面「项目设置」。
- **Prompt**：给 AI 命名 key 的项目级提示词。

填完点 **Submit**。

做完应看到：项目出现在 Dashboard 卡片和 Workspace Bar 的项目条上，而你已经是它的 Project Owner——在 **Teams** 页该项目行的 **Owners** 里能看到自己。

## 任命和卸任 Project Owner

**Teams** 页 → 选中团队 → **Projects** 卡片 → 项目行上的 **Owners**，弹出 **Project Owners** 名册：

- 任命：在 **Add Team Member** 里选人，点 **Add**，弹 **Project Owner added**。
- 卸任：点名字旁边的移除，弹 **Project Owner removed**。

只能从**本队成员**里选。被拦下来时会告诉你原因：

| 你看到 | 意思 |
|---|---|
| `Only a Project Owner or Admin can change Project Owners` | 你既不是这个项目的 Project Owner，也不是 Admin |
| `User is not a member of this team` | 那个人不在这个团队里 |
| `User is already a Project Owner` | 他已经是 Project Owner 了 |
| `User is not a Project Owner` | 卸任一个本来就不在名册上的人 |
| `A project must keep at least one Project Owner` | 最后一名 Project Owner 不能卸任，先任命别人 |

名册为空时显示 `No Project Owners. Ask an Admin to appoint one.`

## 项目设置

入口：Workspace Bar 的 **Project settings**（只有 Project Owner 看得到），或者 Dashboard 项目卡片、**Teams** 页项目行上的设置图标。

[image 项目设置弹窗的 Settings 标签页，标出 OCR、Languages、AI key naming 三段，以及 Source language 下拉]

### OCR

**OCR Language** 和 **OCR Engine**（**Engine1** / **Engine2**）。语言选 **Auto** 的时候，引擎会被强制成 Engine 2 并且变灰，同时弹出一条 **Warning**：`Auto language detection is only supported by Engine 2.`

这里填的是项目默认值，每个页面还能自己设，见下面「页面级设置」。

### 源语言

**Source language** 是原文存在哪个语言下。界面上的说明写得很清楚：`Each key keeps its original text in this language; Git pushes and exports read that copy.`

它只能从这个项目的语言集合里选。语言集合是建项目时定好的一组，默认 10 种：`en`、`zh_cn`、`zh_tw`、`ja`、`ko`、`ru`、`fr`、`de`、`es`、`pt`——词条表里一列一个语言，就是这组。**界面上目前没有改这个集合的入口**，要加语言得找管理员。

### key 命名规范

四个字段：**Key Prefix**、**Key Separator**、**Key Style**（`snake_case` / `camelCase`）、**Key Max Depth**（1–10）。下面那行说明是 `Used when the AI names a key: what the generated key must look like. Leave the prefix empty for none.`

- 新建项目时，**Key Prefix** 框里会有一个灰色的提示值，那是从项目名推出来的 slug；不填就用它。前缀留空表示不加前缀。
- 改项目名**不会**改已经定下的前缀，它是建项目那一刻存下来的。
- 这套规范管的是 AI 生成的 key 长什么样、以及生成后的合规检查。手写的 key 不会被它挡住，编辑器里会实时提示哪里不合规，但仍然能保存（第 8 章）。
- 改了规范只影响之后生成的 key，不会回头改已有的。

### Prompt

项目级的 AI 命名提示词（Markdown，2000 字上限）。它和页面、标签两层的提示词一起决定 AI 给出的 key 长什么样。

**三层不是处处生效。** 在编辑器里给一个框生成 key 时，项目、页面、标签三层都会用上；在词条表里生成时（新建词条、改草稿 key）只有项目这一层生效——一条词条不属于某一个页面，它的框可能散在好几页上，所以页面和标签的提示词无从取起。

### Releases

发行标签的增删改名在这里，第 7 章细讲。这一章只需要知道一句界面上的话：`Renaming or deleting a release never touches the pages and translations on it.`——改名和删除都不会动到挂在上面的内容。

## 页面级设置：继承还是覆盖

编辑器左侧页面列表，某一页的 ⋮ → **Page Settings**；新建页面时是同一个弹窗（标题 **New Page**），标签页是 **Basic** / **Prompt** / **Settings**。

[image PageModal 的 Settings 标签页，Custom key convention 关着和打开两种状态并排：关着时四个字段是灰的、显示项目的值；打开后可以填本页的值]

两类设置的继承行为**不一样**，这是最容易误会的地方：

- **OCR Language / OCR Engine**：建页面时从项目**抄一份**过来，之后各改各的。项目后来改了 OCR，已经建好的页面不会跟着变。
- **key 命名规范**：这里是一个开关 **Custom key convention**。关着的时候四个字段是灰的，显示的是项目当前的值，说明写着 `Off, this page follows the project's key naming rules.`——这种继承是**活的**，项目改了规范，这一页立刻跟着变。打开开关之后填这一页自己的值（四个字段要一起填），从此这一页就固定用自己的，不再跟项目走。

页面也有自己的 **Prompt** 标签页，作用同项目那层，只对这一页的框生效。

## 做错了会怎样

| 你看到 | 原因 |
|---|---|
| 建项目时 **Team** 下拉是空的，或弹出 **No team** | 你还没进任何团队（第 3、5 章） |
| 找不到 **Project settings** | 你不是这个项目的 Project Owner；Team Owner 身份不带 Project Owner 权限 |
| **Owners** 里选不到某个人 | 只能从本队成员里选 |
| 页面上 key 规范的四个字段是灰的 | **Custom key convention** 关着，这一页在继承项目 |
| 选了 OCR 语言 **Auto**，引擎自己变成 Engine 2 还变灰 | 正常，自动识别语言只有 Engine 2 支持 |
| 改了项目前缀，老的 key 没变 | 命名规范只影响之后生成的 key |
| 找不到改语言集合的地方 | 目前没有这个入口，找管理员 |
