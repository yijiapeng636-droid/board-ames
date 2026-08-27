# Issue tracker: GitHub

本仓库的任务与规格记录在 GitHub Issues 中，所有操作使用 `gh` CLI。

## 常用操作

- 创建：`gh issue create --title "..." --body "..."`
- 查看：`gh issue view <编号> --comments`
- 列出：`gh issue list --state open`
- 评论：`gh issue comment <编号> --body "..."`
- 添加标签：`gh issue edit <编号> --add-label "..."`
- 移除标签：`gh issue edit <编号> --remove-label "..."`
- 关闭：`gh issue close <编号> --comment "..."`

在当前 Git 仓库内执行命令，让 `gh` 根据远程地址自动识别仓库。

## 将 Pull Request 作为分诊入口

**PR 作为需求入口：否。**

如以后需要把外部 PR 纳入分诊，可将上面的设置改为“是”，并使用对应的 `gh pr` 命令。

GitHub Issue 和 PR 共用编号空间。遇到 `#42` 之类的编号时，可先执行 `gh pr view 42`，失败后再执行 `gh issue view 42`。

## 技能要求“发布到问题跟踪器”时

创建一个 GitHub Issue。

## 技能要求“读取相关任务”时

执行 `gh issue view <编号> --comments`。

## Wayfinder 操作

- 地图：使用带有 `wayfinder:map` 标签的单个 Issue。
- 子任务：优先使用 GitHub Sub-issues；不可用时，在地图正文中使用任务列表，并在子任务开头写明 `Part of #<地图编号>`。
- 子任务类型标签：`wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`。
- 阻塞关系：优先使用 GitHub 原生 Issue Dependencies；不可用时，在子任务顶部写明 `Blocked by: #<编号>`。
- 领取任务：`gh issue edit <编号> --add-assignee @me`。
- 完成任务：添加结论评论、关闭 Issue，并把上下文链接补充到地图的 Decisions-so-far 部分。
