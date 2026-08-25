## ADDED Requirements

### Requirement: 标准象棋棋盘与交互
系统 MUST 使用 DOM + CSS/SVG 渲染10×9棋盘、楚河汉界、九宫、红黑棋子和标准初始布局，并以合法 button 完成点击选子和走棋。

#### Scenario: 点击棋子和合法目标
- **当** 当前行动方点击己方棋子
- **那么** 系统高亮该棋子及其全部合法目标；点击另一己方棋子切换选择，点击合法目标执行走棋

### Requirement: 七类棋子伪合法走法
规则层 MUST 分别实现车、马、炮、相/象、仕/士、帅/将、兵/卒的基础走法，禁止在 Vue 组件内判断规则。

#### Scenario: 棋子阻挡与地域约束
- **当** 生成任一棋子的伪合法着法
- **那么** 系统正确处理车路径、蹩马腿、炮架、塞象眼与不过河、九宫、兵卒过河及禁止后退

### Requirement: 唯一合法走法来源
系统 MUST 以 `generateLegalMoves(board, side)` 作为 UI、AI、Hint、Review 和 Validator 的唯一合法走法来源；每个伪合法着法 MUST 经模拟执行和己方将帅安全过滤。

#### Scenario: 禁止送将和将帅照面
- **当** 某伪合法着法使己方仍被将军或造成将帅照面
- **那么** 该着法不出现在任何调用方获得的合法着法列表中

### Requirement: 非递归攻击判断
系统 MUST 提供独立 `isSquareAttacked` 和 `isInCheck`，攻击判断禁止调用 `generateLegalMoves`。

#### Scenario: 判断将军
- **当** 对方棋子按其攻击语义控制己方将帅位置
- **那么** `isInCheck` 返回真且不会产生 legalMoves 与 isInCheck 的递归依赖

### Requirement: 基础终局
系统 MUST 依据本地规则识别应将、将死、困毙、胜负与基础和棋，DeepSeek 禁止参与规则裁定。

#### Scenario: 无合法应着
- **当** 当前方没有合法着法
- **那么** 系统依据其是否被将军返回将死或困毙对应的本地终局结果
