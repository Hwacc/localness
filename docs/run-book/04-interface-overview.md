# 4. 界面总览

## 这一章能做什么

- 认识侧栏八个入口分别去哪
- 知道「当前项目」在哪切、切了之后哪些页面跟着变
- 会调 Dashboard 上项目卡片的顺序

## 侧栏

[image 侧栏整条截图，从上到下标出八个入口的名字，以及底部头像、铃铛、齿轮三件]

| 入口 | 去哪 | 什么时候用 |
|---|---|---|
| **Dashboard** | 团队和项目总览 | 找项目、换项目、看最近改动 |
| **Editor** | 截图、画框、填译文 | 日常标注 |
| **Translations** | 当前项目的全部词条 | 改草稿、发布、批量操作 |
| **LILT Git** | 和公司 Git 仓对账 | Pull、Push、处理冲突 |
| **Agent** | 未开放 | — |
| **API** | 对外只读接口和 token | 给 CI、MCP 或 agent 取文案 |
| **Skills** | 当前项目下给 agent 用的 skill 文件 | 上传、维护 skill |
| **Teams** | 队伍、成员、邀请码 | 邀请人、改角色、建项目 |

> **未开放**：**Agent** 页点进去只有一个动画和一句 `Building...`，没有任何功能。

侧栏底部三件不是页面入口：

- **头像**：打开个人资料，里面能改昵称头像、绑 Atlassian、设密码，以及 **Logout**。
- **铃铛（Inbox）**：站内消息。队伍邀请要在这里 **Accept** / **Decline**（第 5 章）。红点是未读条数，超过 9 条显示 `9+`。
- **齿轮（Settings）**：外观主题，**Light** / **Dark** / **System**（第 3 章）。

## 当前项目：Workspace Bar

除 Dashboard 之外的每个页面顶部都有一条 Workspace Bar。**Dashboard 上没有这条**，因为它同时显示你所有的团队和项目。

[image Workspace Bar 截图，从左到右标出 Team 下拉、项目条、加号、发行筛选下拉、Export、Project settings]

从左到右：

- **Team** 下拉：换团队，换完会自动选中那个团队里的一个项目。下拉旁边如果有 Team Owner 徽标，说明你是这个队的 Team Owner。
- **项目条**：一格一个项目，点一下就切当前项目。这个团队还没有项目时显示 `No project in this team`。最右边的 **+** 是新建项目——Team Member 都能建，建完你就是它的 Project Owner（第 6 章）。
- **发行筛选**下拉：**All releases** / 某个发行 / **Unassigned**；Project Owner 还会多一项 **Manage releases…**，直接跳到项目设置的 Releases 那一栏。这个筛选同时作用于编辑器侧栏、词条表和导出（第 7 章）。项目还没有发行标签时，非 Project Owner 看不到这个下拉。
- **Export**：导出当前项目（第 10 章）。
- **Project settings**：只有 Project Owner 看得到（第 6 章）。

**切项目不会换页面。** 你在 `/editor` 里切项目，人还留在编辑器，只是画布和页面列表换成了另一个项目的；词条表、Git、API、Skills 同样都跟着当前项目走。上次打开的团队和项目会被记住，下次登录直接回到它。

## Dashboard

顶部四个数字：**Teams** / **Projects** / **Pages** / **Current project**。下面按团队分块，每块里是这个团队的项目卡片：

- 卡片上有 **Editor** 和 **Translations** 两个按钮直接进去，另有导出和设置两个图标。
- 没写描述的项目，卡片上显示 `No description`。
- 每块右上角有 **New Project**；团队里没有项目时显示 `No projects in this team.`。
- 一个团队都没有时，这里是一张兑邀请码的卡片（第 3 章）。
- 顶部还有一段 **Recently updated**，列最近改动过的项目。

### 拖卡片排序

卡片可以在**同一个团队内**拖动排序，Dashboard 顶部那句 `...or drag it to reorder within its team.` 说的就是这个。排好的顺序会同时用在 Workspace Bar 的项目条上——项目条本身不能拖，它跟着 Dashboard 的顺序走。

两点要知道：

- 这个顺序是**你个人的**，只存在这台电脑的这个浏览器里。别人看到的顺序不受影响；换浏览器、换电脑、清缓存都会回到默认顺序。
- 不能把卡片拖进另一个团队。

## 做错了会怎样

| 你看到 | 原因 |
|---|---|
| Dashboard 上找不到发行筛选和当前项目 | Dashboard 没有 Workspace Bar，那些在工作页顶部；导出在每张项目卡片上 |
| 看不到 **Project settings**，发行下拉里也没有 **Manage releases…** | 你不是这个项目的 Project Owner（第 14 章） |
| 项目条上找不到某个项目 | 它属于另一个团队，先在 **Team** 下拉里换过去 |
| **Agent** 页点进去什么都没有 | 未开放 |
| 铃铛有红点却找不到消息在哪 | 红点是未读条数，点开 Inbox 抽屉看；队伍邀请要在那里 Accept 或 Decline |
| 拖卡片没反应 | 只能在同一个团队内拖；顺序只存本地，换浏览器不会跟过来 |
