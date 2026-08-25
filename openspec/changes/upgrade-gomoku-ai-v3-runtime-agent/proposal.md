# Change: 五子棋 AI 棋力 V3 与 Runtime Agent

## Why

当前五子棋叶子评价仍依赖候选排序分，强战术会被宽泛地直接短路；DeepSeek 只能一次性选择，无法安全调度本地搜索能力。需要先提升确定性棋力，再把已经验证的分析能力暴露为受限 Tool，最后提取棋种无关的 Agent 生命周期。

## What Changes

- 拆分候选攻防事实、位置分和排序分，并增加 Decision Trace。
- 增加独立 Position Evaluation、Threat Search、带 bound 的 TT、战术延伸、完整 PV 和时间优先迭代加深。
- 增加固定残局 Benchmark，验证黑白视角、强制路线、裁剪和超时一致性。
- 增加 Gomoku Strategy Tools、五部分 Strategy Skill 和 DeepSeek Tool Calling Agent。
- 增加 `/api/gomoku/agent` 安全传输端点，保留本地 Validator 与 Search fallback。
- 在五子棋通过后，只提取 Tool 协议、Agent Runner、预算、Abort、Trace 和 transport 等公共 Runtime 能力。

## Boundaries

- 不修改象棋棋力算法，不让象棋接入新 Runtime Agent。
- 不抽象公共 Board/Move/Evaluation/Search，不增加大型依赖或万能插件框架。
- 不改变五子棋15×15、黑先、五连及无禁手规则。
