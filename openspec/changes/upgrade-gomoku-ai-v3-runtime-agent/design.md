# Design

## Dependency direction

`rules → candidate facts → evaluation/threat search → alpha-beta/TT → Gomoku tools → Gomoku skill/config → generic runtime → proxy transport → GomokuGame orchestration`

Runtime 只认识泛型 Context、Decision、Tool、消息、预算和 fallback；棋盘、候选、威胁与规则全部留在 Gomoku 模块。

## Search correctness

- `orderingScore` 只用于排序；叶子统一调用 `evaluatePosition(board, perspective)`。
- TT key 包含棋盘与行动方，Entry 保存 depth、score、bound 和 bestMove；按原始 alpha/beta 窗口写入 exact/lower/upper。
- 迭代加深只发布完整深度；超时返回上一完整层。
- Threat Search 仅展开能迫使有限回应的着法；没有覆盖所有最佳防守时禁止标记 forcedWin。
- depth=0 只在确定战术状态下有限延伸，并受时间、层数和节点上限约束。

## Agent safety

- Tool context 是棋盘和候选的深拷贝，只允许预注册本地分析 Tool。
- Runner 校验 tool name/arguments，限制 rounds、tool calls、总时限并传播 AbortSignal。
- 模型最终结果仍经过 positionKey、sessionId、回合和 `validateAIMove` 校验。
- immediate win、mandatory block 和已证明 forced win 在 Agent 前执行，模型不可覆盖。
