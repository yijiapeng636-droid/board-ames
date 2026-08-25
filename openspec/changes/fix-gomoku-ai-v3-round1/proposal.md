# Change: 修复五子棋 AI V3 第一轮证据链缺陷

## Why

当前固定候选 Tool 会把旧 baseline 分数和 PV 冒充为深搜结果，指定落点 Threat Tool 没有真正固定首手，Strategy Candidate Set 又被最终 Top 5 截断；Evaluation 与 Review 因此可能继续放大错误事实。

## What Changes

- 从现有 Alpha-Beta Core 提取固定候选 continuation 搜索，并保持原始 rootPlayer 视角。
- 实现指定首手 Threat Proof，区分 proven_win、not_proven 与 timeout。
- 建立受控 Strategy Candidate Set，让 Tool 和 Validator 使用同一候选边界。
- 增强断点战术、同一落点多威胁与 sideToMove 叶子事实。
- 用同量纲 fixed search 重建 Review 证据，统一 player、坐标和 keyMoment 白名单。
- 增强有限 AI Diagnostic 与固定回归/性能测试。

## Boundaries

- 不修改象棋、公共 Runtime、Gomoku Strategy Skill 或依赖。
- 不大幅提高默认深度，不复制第二套 Minimax。
- 第一盘真实棋谱若未提供，不伪造其快照或结论。
