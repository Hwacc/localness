# 14. 权限对照

前面各章按页面讲了能做什么，这一章只回答一个问题：**这件事谁能做。**

## 一张表

| 动作 | Team Member | Project Owner | Team Owner |
|---|---|---|---|
| 看本队全部项目 | 能 | 能 | 能（须已是 Team Member） |
| 建项目 | 能，建完自己就是它的 Project Owner | 能 | 能 |
| 上传截图、画框、改草稿、发布、撤回、删草稿 | 能 | 能 | 能 |
| 改**这一页**的设置（OCR、Prompt、覆盖命名规范） | 能 | 能 | 能 |
| 删页面 | 能 | 能 | 能 |
| 导出 | 能 | 能 | 能 |
| 跨项目 Copy / Move | 能（两个项目都得是 Team Member） | 能 | 能 |
| 上传 skill、改删自己传的 skill | 能 | 能 | 能 |
| 给页面或词条挂 Release | 能 | 能 | 能 |
| 排除某条词条的 Git 同步 | 能 | 能 | 能 |
| Pull / Push / 裁决冲突卡片 | 能 | 能 | 能 |
| 建自己的 API token | 能 | 能 | 能 |
| 吊销 API token | 只能吊销自己建的 | 项目里所有 | 只能吊销自己建的 |
| 改**项目**设置（OCR、源语言、key 命名规范、Prompt） | 不能 | 能 | 不能 |
| 建 / 改名 / 删 Release | 不能 | 能 | 不能 |
| 绑 Git（clone 地址、token、product） | 不能 | 能 | 不能 |
| 任命 / 卸任 Project Owner | 不能 | 能（互相委任） | 不能 |
| 硬删 API token | 不能 | 能 | 不能 |
| 生成邀请码、按人邀请 | 不能 | 不能 | 能 |
| 改成员角色（**Make owner** / **Make member**） | 不能 | 不能 | 能 |
| 移除成员、删团队 | 不能 | 不能 | 能 |
| 离开团队 | 能（最后一名 Team Owner 不行） | 同左 | 同左 |

**Team Owner 不是 Project Owner，Project Owner 也不是 Team Owner。** 这两列是独立的两件事：队长要改项目设置，得先被任命成那个项目的 Project Owner；管家要发邀请码，得先是这个队的 Team Owner。两者都做，就是两条都有。

## Admin 和调用方

[image 三个角色徽标并排的样子：Project Owner（盾牌）、Team Owner（皇冠）、Team Member，标出它们分别出现在哪里]

这两类不在上表里，因为它们**不是队伍角色**。

**Admin** 是账号级身份，在 **Teams** 页的队伍详情里和 Team Owner / Team Member 并排显示成一个徽标。

- **Admin 必须在这个团队里。** 不在队里的 Admin，对这个队的项目什么也做不了——不是「权限更大」，是根本没有权限。
- 建团队只有 Admin 能做。
- 任命和卸任 Project Owner，Admin 能做（项目没有 Project Owner、或者管家都不在的时候破局）。
- **Admin 不会因为是 Admin 就自动成为 Project Owner。** 改项目设置、建 Release、绑 Git、硬删 token 这些事，Admin 也得先有那个项目的一条 ProjectOwner 记录。

**调用方** 不进界面。它拿一枚只读 token，只能取已发布文案（第 12 章）。

## 被拒绝时界面长什么样

这一页的权限**大多数体现为「入口根本不出现」，而不是「点了弹错误」**。三个例子：

| 你想做的事 | 界面上是什么样 |
|---|---|
| 非 Project Owner 想改 Release 名 | **没有入口**：Project Settings 弹窗里连 **Releases** 标签页都不出现，发行下拉里也没有 **Manage releases…**（第 7 章） |
| 非 Team Owner 想发邀请 | **没有入口**：Teams 页的 **Invite codes** 卡片和 **Invite** 那一栏都不显示（第 5 章） |
| 最后一名 Team Owner 想离开 | 按钮**按不下去**，鼠标停上去写着原因：`Promote another member to Team Owner first`（第 5 章） |

少数几处是后端硬拦的（比如越过界面直接调接口），这时提示是 `Forbidden`——它不会告诉你差哪个权限。看到这两个字，回上面那张表对一下自己是什么角色就行。

## 做错了会怎样

| 你看到 | 原因 |
|---|---|
| 找不到 **Project settings** | 你不是这个项目的 Project Owner。Team Owner 身份不带这个权限 |
| Project Settings 里没有 **Releases** 标签页 | 同上 |
| 发行下拉里没有 **Manage releases…** | 同上 |
| Git 页只有一句「未配置」，没有表单 | 你不是这个项目的 Project Owner（第 11 章） |
| 已经吊销的 token 行上没有 **Delete** | 硬删只有 Project Owner 能做（第 12 章） |
| Teams 页看不到 **Invite codes** / **Invite** | 你不是这个队的 Team Owner |
| **Make owner** / **Make member** / **Remove** 按不下去 | 同上；按钮上的 tooltip 会写具体原因（第 5 章） |
| **Leave team** 按不下去 | 你是这个队最后一名 Team Owner，先把别人提上来 |
| 别人传的 skill 上没有 **Edit** / **Delete** | 只有维护人（上传它的人）能改删（第 13 章） |
| 提示 `Forbidden` | 后端拒绝了这次请求。回上面的表看这个动作需要什么角色 |
| Admin 却改不了项目设置 | Admin 不是 Project Owner 的代替品。让现任 Project Owner 把你加进 **Owners** 名册 |
