# Issue tracker: Local Markdown

本仓库的任务与规格存放在 `.scratch/` 下的 Markdown 文件中。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`
- 规格文件：`.scratch/<feature-slug>/spec.md`
- 实施工单：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号，每个工单一个文件
- 分诊状态记录为文件顶部附近的 `Status:` 行，角色字符串见 `triage-labels.md`
- 评论与对话历史追加到文件底部的 `## Comments` 标题下

## 技能要求“发布到问题跟踪器”时

在 `.scratch/<feature-slug>/` 下创建对应 Markdown 文件，必要时创建目录。

## 技能要求“读取相关任务”时

读取用户给出的任务路径或编号对应文件。

## Wayfinder 操作

- 地图：`.scratch/<effort>/map.md`，正文包含 Notes、Decisions-so-far 和 Fog。
- 子任务：`.scratch/<effort>/issues/NN-<slug>.md`，每个工单一个文件。
- 类型：通过 `Type:` 记录 `research`、`prototype`、`grilling` 或 `task`。
- 状态：通过 `Status:` 记录 `claimed` 或 `resolved`。
- 阻塞：在文件顶部附近通过 `Blocked by: NN, NN` 记录；所有对应工单为 `resolved` 后解除阻塞。
- 前沿：扫描 `issues/` 中未解决、未阻塞且未领取的文件，按编号优先。
- 领取：将状态改为 `claimed` 并先保存。
- 完成：追加 `## Answer`，将状态改为 `resolved`，并将上下文指针追加到 `map.md` 的 Decisions-so-far。
