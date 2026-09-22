# 3. 登录与第一次进入

## 这一章能做什么

- 用本地账号或 Atlassian 账号登进 Localness
- 第一次进来时把自己接到一个团队上
- 知道在哪改主题、在哪设密码、怎么登出

## 账号从哪来

**没有公开注册**，注册入口不存在。账号只有两个来源：

- 用 **Continue with Atlassian** 第一次登录，系统自动开户（邮箱域名要在允许名单里）
- 管理员离线开好的本地账号，交给你一个用户名和密码

## 登录

[image 登录表单：Get Start 之后的样子，标出 Username、Password、Login 按钮、or 分隔线、Continue with Atlassian 按钮]

### 本地账号

点首页的 **Get Start**，展开登录表单，填 **Username** 和 **Password**，点 **Login**。密码框右边那只眼睛可以切明文。

登录成功后会先看到一个写着 **Loading...** 的初始化页，几秒后落到 Dashboard。这几秒是正常的，它在拉你的账号和项目。

### Atlassian

点 **Get Start** 展开表单，再点 **Continue with Atlassian**，在 Atlassian 的页面里授权，回到 Localness 后同样经 **Loading...** 进 Dashboard。第一次这样登录会自动开户，不需要先找管理员。

如果这个按钮是灰的，下面会有一行 `Atlassian login is not configured. Contact an admin.`——说明这个实例没接 Atlassian，只能用本地账号。

## 第一次进来：兑邀请码

项目都挂在团队下，**不在任何团队里就一个项目也看不见**。所以第一次进 Dashboard，如果你还没有团队，会弹出一个 **Join a team** 对话框：

- 有邀请码：填进 **Invite code**，点 **Join team**。成功会弹 **Joined team**，描述是队伍名。
- 暂时没有码：点 **Skip**，先去别处看看。这个「跳过」只在本次会话里记住，下次登录还会再问。

跳过之后 Dashboard 上会留一张卡片，写着 `You are not in a team yet. Join with an invite code, or ask an Admin to create one.`，下面随时可以补填邀请码。码要找 Team Owner 要（第 5 章）。

兑码时如果弹 **Already in this team**，说明你已经在这个队里了，不是出错。

## 给已有的本地账号绑 Atlassian

绑定入口不在 **Settings** 抽屉里，在个人资料里：

1. 点侧栏底部的**头像**（在铃铛和齿轮上方），选 **Profile**。
2. 切到 **Account** 标签页。
3. 在 **Atlassian** 卡片上点 **Connect Atlassian**，去授权。

绑成功后弹 **Atlassian connected**，卡片变成 **Connected** 并显示 Atlassian 那边的名字和邮箱。

[image Profile 弹窗的 Account 标签页，标出 Atlassian 卡片和 Connect Atlassian 按钮的位置]

同一个 **Account** 标签页还能设密码：Atlassian 自动开的账号本来没有密码，填 **New password** 和 **Confirm password** 点 **Set password**，之后就能用用户名密码登录。**设完或改完都会被登出**，需要重新登录一次，界面上那句 `You will be logged out after saving.` 说的就是这件事。

## 主题和登出

- **主题**：侧栏底部的齿轮 **Settings** → **Appearance**，三个选项 **Light** / **Dark** / **System**（跟随系统）。
- **登出**：侧栏底部的头像 → **Logout**，回到首页。

## 做错了会怎样

| 你看到 | 原因 |
|---|---|
| `Please enter your username` / `Username needs at least 3 characters` | 用户名没填，或少于 3 个字符 |
| **Continue with Atlassian** 是灰的，下面一行 `Atlassian login is not configured. Contact an admin.` | 这个实例没接 Atlassian，改用本地账号 |
| `That Atlassian email is not allowed to sign in here.` | 邮箱域名不在允许名单里，找管理员 |
| `Atlassian did not return an account. Try again.` | Atlassian 那边没返回账号，重试，或改用用户名密码 |
| `This account already has an Atlassian login.` | 这个本地账号已经绑过了，不用再绑 |
| `That Atlassian account is linked to another user.` | 那个 Atlassian 账号绑在别的用户名下，找管理员处理 |
| 初始化页报 **Failed to initialize** | 刷新重试；还不行找管理员 |
| 登进来了，但 Dashboard 上一个项目都没有 | 你还没进任何团队，看上面「兑邀请码」那节 |
