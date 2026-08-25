## 为什么

现有应用已经具备完整的五子棋训练闭环，但所有入口与业务代码仍围绕单一棋类组织，无法安全扩展第二种棋类。此次变更将应用升级为“AI 棋类练习器”，在保持五子棋行为不变的前提下增加规则可审计、可训练的中国象棋模块。

## 变更内容

- 将现有五子棋代码原样迁移为独立业务模块，并以测试、类型检查、Lint 和构建作为迁移门禁。
- 增加无 Router 的应用首页与 `home / gomoku / xiangqi` 内部状态切换。
- 增加中国象棋独立类型、10×9 棋盘、标准初始布局、七类棋子走法、攻击判断和唯一合法走法生成器。
- 增加将军、应将、将帅照面、将死、困毙、胜负和棋、局面历史、着法分类、重复循环识别与2020规则棋例裁决。
- 增加象棋让一步、AI额外行动、Checkpoint/Undo、最佳提示、独立会话经验和赛后复盘。
- 增加象棋独立评估、Alpha-Beta/Negamax、Move Ordering 与 Web Worker 搜索；DeepSeek 仅从本地合法候选中选择，失败时由本地搜索兜底。
- **BREAKING** 将现有 DeepSeek 本地代理路径整理为 `/api/gomoku/move`、`/api/gomoku/review`、`/api/xiangqi/move`、`/api/xiangqi/review`；前端调用同步迁移，不保留旧路径作为正式契约。
- 复杂棋例的实现和验收必须逐条引用项目提供或确认的《中国象棋协会审定〈象棋竞赛规则（2020版）〉》正文及棋例图；资料缺失时 Phase 4 保持阻断，且不得宣称完整规则已经实现。

## 功能 (Capabilities)

### 新增功能

- `game-practice-shell`: 棋类练习器首页、内部游戏切换、返回首页和五子棋独立模块边界。
- `xiangqi-board-rules`: 象棋独立模型、棋盘交互、基础走法、攻击判断、合法走法、将军与基础终局。
- `xiangqi-repetition-adjudication`: 局面历史、棋例着法分类、循环检测、证据保存和2020规则裁决。
- `xiangqi-training-flow`: 象棋先后手、让一步、Checkpoint/Undo、提示、复盘和独立会话经验。
- `xiangqi-search`: 象棋评估、合法走法搜索、Worker、候选主变化和本地兜底。
- `game-deepseek-proxy`: 按棋类和用途拆分的四个本地代理端点、独立 Prompt 与本地 Validator 边界。

### 修改功能

<!-- 当前 openspec/specs 为空，没有可引用的既有规范；五子棋行为保持不变，其模块边界由 game-practice-shell 新规范覆盖。 -->

## 影响

- 代码：`src/App.vue`、现有 `src/core`、`src/ai`、`src/components`、`src/types` 将迁入五子棋模块；新增首页和 `src/games/xiangqi`；代理代码重新组织。
- API：DeepSeek 本地开发代理路径发生破坏性调整，但 API Key、Base URL、模型与基础 HTTP 能力继续共享。
- 数据：象棋仅使用独立的 `sessionStorage` 键 `xiangqi:session-experience:v1`，不引入数据库或长期存储。
- 依赖：不增加 Router、Pinia、Canvas、后端业务服务、Tauri/Rust 或新的游戏框架依赖。
- 外部资料：Phase 4 依赖经项目确认的2020规则正文和棋例图；当前需求文本只给出了规则名称，尚不足以完成条款级审计。
