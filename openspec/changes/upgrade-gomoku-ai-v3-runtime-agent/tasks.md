# Tasks

## 1. Evidence and candidate facts
- [x] 1.1 建立不改变棋力行为的 Decision Trace 并通过基线回归
- [x] 1.2 拆分 Candidate attack/defense/positional/ordering 与可靠战术事实
- [x] 1.3 验证 protected candidate 与 pureDefense 规则

## 2. Local evaluation and search
- [x] 2.1 实现独立 evaluatePosition 与黑白对称固定局面测试
- [x] 2.2 收紧 immediate/mandatory/confirmed/strong tactical 分类
- [x] 2.3 实现 TT exact/lower/upper 与正确性测试
- [x] 2.4 增强时间优先 Iterative Deepening、Move Ordering 和完整 PV
- [x] 2.5 实现 Threat Search、false-positive 防护和 plyToWin
- [x] 2.6 实现有时间/层数/节点上限的 Tactical Extension
- [x] 2.7 建立固定残局 Benchmark 并记录旧/新结果、节点、深度、PV、TT、cutoff、耗时

## 3. Gomoku strategy capability
- [x] 3.1 实现只读 GomokuAgentContext 和 positionKey
- [x] 3.2 实现 inspect_position/search_forced_win/search_candidate/compare_candidates 及参数校验
- [x] 3.3 编写严格五部分的 Gomoku Strategy SKILL.md
- [x] 3.4 验证 Tool 不修改状态、拒绝越界候选并复用同一 Search Core/Worker

## 4. Tool-calling agent
- [x] 4.1 实现 `/api/gomoku/agent` 安全消息/tool_calls 转发，不让服务端执行 Tool
- [x] 4.2 实现多轮 Agent、round/call/timeout/Abort/stale 限制和 Trace
- [x] 4.3 接入 GomokuGame 确定性门禁、Agent、本地 Validator 和 baseline fallback
- [x] 4.4 验证未知 Tool、非法参数、无效最终落点、超时、旧会话和 DeepSeek 失败路径
- [x] 4.5 对比旧 Baseline、新 Local Search、Search+Agent 固定残局结果

## 5. Public runtime extraction
- [x] 5.1 五子棋 Agent 通过后提取泛型 Tool Protocol、Runner、Transport、Budget、Abort、Trace、Fallback
- [x] 5.2 编写无棋种术语的公共 Runtime SKILL.md
- [x] 5.3 审计无万能棋类类型、无象棋改造、无重复 Search

## 6. Final acceptance
- [x] 6.1 `npm run type-check`
- [x] 6.2 `npm run lint`
- [x] 6.3 `npm run test:unit -- --run`
- [x] 6.4 `npm run build`
- [x] 6.5 安全、HTML语义、Worker清理、API Key 与禁止依赖审计
- [x] 6.6 输出调用链、Benchmark、真实 Agent 状态、风险和待确认项
