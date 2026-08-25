# Design

## Search reuse

`searchFixedCandidate` 在 clone 上固定 rootPlayer 首手，然后直接进入现有 `minimax` continuation。它不调用 root shortcut；每个完整迭代层才发布 score/PV，PV 第一手固定且 Evaluation 始终保持 rootPlayer 视角。

## Threat proof

Threat Core 接受初始 sideToMove。`searchForcedWinFromMove` 固定攻击方首手，随后从 defender 节点继续 AND/OR proof；超时或预算耗尽永不返回 proven win。

## Candidate boundary

Strategy Candidate Set 合并确定性动作、forcing/多威胁候选、baseline 结果与有限高价值攻击候选。初始上限是工程安全配置，不代表最优棋力参数。Tool 与最终 Validator 共用该集合。

## Evaluation and review

叶子战术复用 Candidate Pattern Analyzer，从具体补点识别断点四和同点多方向威胁，并显式接收 sideToMove。Review 对实战点和推荐点调用相同 fixed search，再按同量纲差值筛选；模型只能解释本地白名单节点。
