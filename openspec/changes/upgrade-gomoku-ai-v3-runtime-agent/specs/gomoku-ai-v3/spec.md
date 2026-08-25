## ADDED Requirements

### Requirement: 可解释的候选与局面评价
系统 MUST 分离攻防事实、位置分和排序分，且 Search 叶子 MUST 使用独立、黑白对称的 Position Evaluation。

#### Scenario: 排序分不充当局面价值
- **When** 两个候选排序相近但后续战术结果不同
- **Then** Search 依据局面评价和变化路线选择，而不是直接采用 orderingScore

### Requirement: 正确的时间预算搜索
系统 MUST 使用只发布完整深度的迭代加深、Alpha-Beta、带 bound 的 TT、有限战术延伸和可解释 PV。

#### Scenario: 深层搜索超时
- **When** 新一层只完成部分根候选时达到时限
- **Then** 返回上一完整深度结果并标记 timedOut

### Requirement: 可证明的威胁搜索
系统 MUST 只在覆盖对手最佳防守并证明获胜时返回 forcedWin。

#### Scenario: 强棋形存在反驳
- **When** 看似强制的候选存在至少一个防守分支避免失败
- **Then** Threat Search 返回 forcedWin=false

### Requirement: 受限的五子棋策略工具
系统 MUST 只允许 Agent 分析 allowedCandidates，并对所有 Tool 参数做运行时校验且保持真实状态不变。

#### Scenario: 模型请求候选外坐标
- **When** Tool arguments 包含 Candidate Set 外的坐标
- **Then** Tool 拒绝执行并返回可识别错误

### Requirement: 有预算的 Tool Calling Agent
系统 MUST 支持多轮 assistant tool_calls/tool messages，受 rounds、calls、timeout、Abort 和 stale-session 约束，失败时回退 baseline Search。

#### Scenario: 未知工具或预算耗尽
- **When** 模型请求未知工具或超过预算
- **Then** Runner 停止且 GomokuGame 使用合法 baseline candidate

### Requirement: 最小公共 Runtime
系统 MUST 只在 Gomoku Agent 验证后提取棋种无关的 Tool Protocol、Runner、Budget、Trace、Transport 与 Fallback。

#### Scenario: 公共层类型审计
- **When** 检查 `src/ai/runtime`
- **Then** 其中不包含 Gomoku/Xiangqi Board、Move、规则、Evaluation 或 Search
