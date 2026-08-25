## 上下文

应用当前是单一 `App.vue` 驱动的 Vue 3 本地五子棋训练器，包含纯 TypeScript 规则、搜索 Worker、DeepSeek 本地 Vite 代理和会话经验。新增中国象棋会引入完全不同的棋盘模型、合法性约束、重复棋例裁决和搜索空间，不能通过给现有五子棋类型增加可选字段来共享。需求同时要求阶段门禁：五子棋迁移必须先零回归，2020棋例必须先于象棋 AI。

当前尚未获得经项目确认的《中国象棋协会审定〈象棋竞赛规则（2020版）〉》正文和棋例图。基础棋盘工作可以开始，但任何第六、八、九章相关分类与裁决都必须等待资料，且测试必须记录条款编号。

## 目标 / 非目标

**目标：**

- 以功能模块隔离五子棋与中国象棋，根组件只管理 `home / gomoku / xiangqi`。
- 保持现有五子棋运行行为、会话键和测试不变。
- 为象棋建立单一、纯函数、可测试的合法走法来源，并让 UI、Search、Hint、Validator、Review 全部复用。
- 将复杂棋例的分类证据、循环范围和裁决结果显式建模，使实现可按2020规则审计。
- 采用 Worker 本地搜索提供可用棋力；DeepSeek 仅选择本地候选并提供教学说明，失败不阻断游戏。
- 所有异步任务支持 Abort 和 sessionId 失效保护。

**非目标：**

- 不实现赛事组织、计时、迟到、名次、纪律等非棋盘规则。
- 不增加 Router、Pinia、后端业务服务、数据库、Canvas、Tauri、Rust 或通用插件框架。
- 不把两个棋类抽象为万能 Board/Game Manager，也不借迁移改写五子棋算法。
- 未获得规则正文和棋例测试前，不实现或宣称完整2020棋例裁决。

## 决策

### 1. 按棋类垂直模块化

使用 `src/games/gomoku` 与 `src/games/xiangqi` 两个垂直目录。每个模块拥有自己的 Game 组件、components、core、ai 和 types。根 `App.vue` 仅维护活动页面状态并传递“返回首页”事件。

替代方案是抽象统一 Game/Board 接口；拒绝该方案，因为两种棋的 Move、终局和重复规则差异巨大，会产生大量 optional 字段并模糊规则边界。

### 2. 分阶段迁移，门禁失败即停止

Phase 1 只机械移动五子棋并新增壳层，不修改搜索算法。每个阶段完成后执行对应测试，最终执行全部四条工程命令。Phase 4 的规则资料和棋例测试未满足时，Phase 5 AI 不得开始。

### 3. 象棋规则采用纯函数分层

规则层按以下单向依赖组织：

`pieceMoves (pseudo legal) → attacks → legalMoves → check/result`

`attacks` 直接按攻击语义检测，不调用 `generateLegalMoves`，从结构上消除 `legalMoves → isInCheck → legalMoves` 递归。模拟走棋使用克隆或成对 apply/unapply，第一版优先正确性。

### 4. 位置历史与棋例证据优先可审计

Position key 使用稳定序列化，包含全部棋子与 `sideToMove`，不提前引入 Zobrist。每手记录执行前后位置、基础效果集合、primaryEffect、相关棋子和规则证据。重复检测先定位循环区间，再将双方循环着法交给独立 Adjudicator。

`check > kill > capture > idle` 只可作为搜索排序信息，禁止作为2020规则最终分类。最终 primaryEffect 和裁决必须来自经条款验证的规则表与测试案例。

### 5. Bonus 调度优先级显式化

每手后的处理顺序固定为：胜负 → 将军 → 棋例裁决 → Bonus → 普通换方。形成将军时清除当前行动方剩余 Bonus，并立即交给对方应将。AI 的额外手重新运行合法走法、Search 和 Validator。

### 6. Search 与 DeepSeek 的信任边界

象棋 Search 只消费 `generateLegalMoves`，采用 Negamax/Alpha-Beta、集中评估参数、Move Ordering 和独立 Worker。DeepSeek 接收有限候选并返回 `from/to/reason`；Validator 再次对当前局面、回合、候选和棋例约束校验。网络或 JSON 失败直接采用搜索第一候选。

四个 Vite 中间件共享配置读取、超时、HTTP 和 JSON 解析函数，但 Prompt 分离。五子棋前端与代理路径一起迁移，避免保留双路径造成模糊契约。

### 7. 训练任务彼此隔离

Hint、Review、Move Search 使用各自 Controller/Worker 和 sessionId。Hint 仅保存起止高亮，不修改游戏状态。Review 在独立棋盘重放并比较搜索结果。Undo 快照包含规则历史与棋例状态，恢复时废弃所有旧异步结果。

## 风险 / 权衡

- [规则正文缺失导致复杂棋例无法可信实现] → Phase 4 设置硬门禁；资料到位前只交付并声明基础规则覆盖。
- [机械迁移破坏别名、Worker URL 或测试 mock 路径] → Phase 1 不做算法改造，逐项更新 import 后执行原测试、类型、Lint 和 Build。
- [象棋搜索分支大导致 UI 卡顿或超时] → 独立 Worker、迭代加深/时间预算、可随时返回已完成深度的最佳合法候选。
- [稳定序列化和克隆成本较高] → 第一版接受该成本并记录性能；只有出现测量证据后再考虑增量哈希或 apply/unapply 优化。
- [代理路径破坏本地调用] → 同一阶段原子迁移代理与前端，并以 mock 测试和一次经用户允许的真实调用验证。
- [“完整规则”范围过大造成虚假完成] → 最终报告列出条款覆盖、未覆盖棋例和规则资料状态；存在缺口时禁止使用“完整实现”。

## 迁移计划

1. 建立 `src/games/gomoku`，机械移动现有业务文件与测试，提供 `GomokuGame.vue`；根组件暂时只渲染该模块并通过 Phase 1 门禁。
2. 增加首页和内部页面状态，补充入口/返回测试。
3. 增加象棋模型、初始棋盘、DOM 棋盘和七类伪合法走法，再通过 Piece Rules 门禁。
4. 增加 attacks/legal/check/result 并通过基础合法性门禁。
5. 取得规则资料后实现分类、循环和 Adjudicator；逐条转换棋例图并通过 Phase 4。
6. 增加评估、Search Worker、本地兜底和性能记录。
7. 增加 Bonus、Undo、Hint、Review、Session Experience 和拆分后的 DeepSeek 代理，完成真实联调。

每阶段保持可回滚的独立提交边界；若 Phase 1 失败，恢复目录移动即可，不进入象棋代码。

## 开放问题

- 项目尚未提供可读取的2020规则正文、条款页码和棋例图文件；Phase 4 需要用户附加或确认权威材料。
- 真实 DeepSeek 联调是否允许消耗当前 API 配额，需要在 Phase 7 执行前确认；本地 mock 和失败兜底不依赖该许可。
