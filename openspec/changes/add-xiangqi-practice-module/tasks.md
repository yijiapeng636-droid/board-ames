## 1. Phase 1：五子棋模块化

- [x] 1.1 建立 `src/games/gomoku` 垂直目录并机械移动现有 Game、components、core、ai、types
- [x] 1.2 更新五子棋内部 import、Worker URL、测试 import 与 mock 路径，禁止改写搜索算法
- [x] 1.3 将现有五子棋根界面收敛为 `GomokuGame.vue` 并暴露“返回首页”事件
- [x] 1.4 执行全部既有五子棋测试、TypeScript、Lint、Build，记录数量与结果；失败时停止

## 2. Phase 1/2：应用首页与象棋模型

- [x] 2.1 将根 `App.vue` 改为 `home / gomoku / xiangqi` 状态壳，增加两个游戏入口和返回首页
- [x] 2.2 建立独立象棋 side、piece、position、move、board、result、phase 类型
- [x] 2.3 实现10×9标准初始棋盘与稳定克隆/序列化基础函数
- [x] 2.4 确保初始棋盘 + XiangqiMove History 可确定性重建任意历史节点的完整棋盘和 sideToMove，至少可恢复走子前后棋盘、走子方、from、to、被吃棋子与下一行动方；本阶段不提前实现repetition classification或adjudication，Position History稳定键仍由Phase 4的5.4实现
- [x] 2.5 使用 DOM + CSS/SVG 实现楚河汉界、九宫、棋子、选择、合法目标和最后一步显示
- [x] 2.6 增加首页切换、标准布局、历史重建、HTML语义测试并执行 Phase 2 前置验证

## 3. Phase 2：七类棋子伪合法走法

- [x] 3.1 实现车的横竖移动和路径阻挡测试
- [x] 3.2 实现马的日字移动、蹩马腿和测试
- [x] 3.3 实现炮的无炮架移动、单炮架吃子和测试
- [x] 3.4 实现相/象田字、塞象眼、不过河和测试
- [x] 3.5 实现仕/士斜一步、九宫限制和测试
- [x] 3.6 实现帅/将九宫横竖一步和测试
- [x] 3.7 实现兵/卒前进、过河横移、禁止后退和测试
- [x] 3.8 执行全部 Piece Rules 测试与工程检查；失败时停止

## 4. Phase 3：攻击、合法走法与基础终局

- [x] 4.1 实现不依赖Legal Moves的 `isSquareAttacked`、将帅照面和 `isInCheck`
- [x] 4.2 实现模拟执行与 `generateLegalMoves`，过滤送将、未应将和将帅照面
- [x] 4.3 实现将军、应将、将死、困毙及“不依赖历史重复棋例分析”的基础终局结果；本阶段禁止按重复局面直接判和、实现长将/长杀/长捉裁决或使用“三次重复=和棋”
- [x] 4.4 让棋盘交互只消费唯一Legal Move Generator
- [x] 4.5 补齐送将、应将、照面、将军、将死、困毙及历史重建测试并执行 Phase 3 门禁；所有依赖Position History、循环着法和责任判断的和/负裁决统一留到Phase 4

## 5. Phase 4：2020棋例规则引擎

### Phase 4.0：规则资料与覆盖清单门禁

- [x] 5.1 获取并登记经确认的《中国象棋竞赛规则（2020版）》正文、条款、棋例细则和棋例图来源；资料缺失时禁止开始Move Classification或Adjudicator实现
- [ ] 5.2 建立2020棋例覆盖矩阵，逐项记录scope（in-scope / out-of-scope）、ruleReference、棋例编号/来源、初始局面、循环着法、官方预期着法分类、官方预期裁决、对应测试、implementationStatus和testStatus；out-of-scope条目必须记录排除理由
- [ ] 5.3 审核覆盖矩阵中的规则事实；存在规则来源缺失、ruleReference缺失、官方预期分类不明确、官方预期裁决不明确或guess时，Phase 4.0保持阻塞；Phase 4开始时implementationStatus和testStatus允许为pending，不得仅因“尚未实现”或“尚未测试”阻塞5.4～5.9开发

### Phase 4.1：历史、分类、循环与裁决

- [x] 5.4 实现包含棋子、颜色、位置和sideToMove的Position History稳定键，并验证可从Move History确定性重建覆盖矩阵中的任一历史节点
- [ ] 5.5 按确认条款实现effects、primaryEffect与将/杀/捉/兑/献/拦/闲证据模型；禁止用简单优先级冒充完整分类
- [x] 5.6 实现循环起止、红黑双方循环着法识别与循环证据，禁止“三次重复直接和棋”
- [x] 5.7 实现独立Adjudicator及none/mustChange/draw/loss，明确责任方、规则原因和继续不变的后果
- [ ] 5.8 将官方棋例图转换为自动测试，覆盖单方长将、单方长杀、一将一杀、长捉车、长捉无根子、一将/杀一捉、双方禁止着法、联合捉、有根/无根、兑献拦、多重作用、兵卒/帅将和交换价值；每个fixture必须含规则条款、初始局面、循环着法、预期effects、primaryEffect、verdict及ruleReference
- [ ] 5.9 完成覆盖矩阵中全部in-scope棋例：每项必须有明确ruleReference、官方预期分类、官方预期裁决、自动测试且测试通过；不得以“已实现主要规则”代替矩阵完成，存在任何in-scope未覆盖项时禁止进入Phase 5或声称“本项目范围内的2020象棋棋盘规则与棋例裁决已完整实现”

### Phase 4 Final Gate：象棋规则引擎独立验收

- [ ] 5.10 在完全不依赖Vue、DeepSeek、Search和UI的情况下，以Position + Move History输入验证规则引擎可输出Legal Moves、Check、Game Result、重复循环、Move Classification和2020 Adjudication，且覆盖矩阵全部通过；失败时禁止进入Phase 5

## 6. Phase 5：象棋本地AI

- [ ] 6.1 集中定义Material、位置、Mobility、King Safety、Check Pressure、Pawn Advancement评估参数
- [ ] 6.2 实现只使用Legal Moves和Adjudicator的Negamax/Alpha-Beta、Move Ordering与PV；每个Search Node必须携带足够的repetition context / Position History，使模拟路径内也能判断mustChange/draw/loss，禁止仅在真实落子后裁决
- [ ] 6.3 实现独立Search Worker、Abort、时间预算和已完成深度兜底
- [ ] 6.4 测试合法返回、输入不变、将死/困毙、棋例约束、Abort和主线程响应；验证Search遇到mustChange时不继续选择违规长将/长杀/长捉循环，且模拟repetition history不污染真实Game History
- [ ] 6.5 记录典型局面节点数、深度和耗时并执行 Phase 5 门禁

## 7. Phase 6：象棋训练交互

- [ ] 7.1 实现玩家/AI执红执黑选择并确保红方先行
- [ ] 7.2 实现Bonus调度及胜负、将军、棋例、Bonus优先级和AI逐手重新搜索
- [ ] 7.3 实现完整Checkpoint与稳定决策点Undo，快照必须包含board、moves、sideToMove、bonus、phase、result、positionHistory及repetition/adjudication state；验证循环中悔棋会回退重复计数、mustChange后悔棋会恢复裁决状态，并以Abort和sessionId阻止旧Search/DeepSeek/Review回写
- [ ] 7.4 实现复用Search的只读Hint、起止高亮和中文走法显示
- [ ] 7.5 实现独立Replay关键点分析、赛后教学复盘和失败重试
- [ ] 7.6 实现 `xiangqi:session-experience:v1` 并验证与五子棋会话隔离
- [ ] 7.7 完成按钮、将军状态、最后一步和合法HTML语义测试并执行 Phase 6 门禁

## 8. Phase 7：DeepSeek代理与联调

- [ ] 8.1 抽取代理共享配置、HTTP、超时、脱敏和JSON解析能力
- [ ] 8.2 迁移五子棋到 `/api/gomoku/move` 与 `/api/gomoku/review` 并保持现有行为
- [ ] 8.3 立即执行完整五子棋回归门禁：既有测试、type-check、lint、build及DeepSeek Mock/可执行验证必须全部通过；失败时禁止新增象棋DeepSeek端点
- [ ] 8.4 实现独立 `/api/xiangqi/move` Prompt、候选约束和本地Validator
- [ ] 8.5 实现独立 `/api/xiangqi/review` Prompt并只消费本地规则事实
- [ ] 8.6 测试DeepSeek失败时使用最高分合法候选正常继续
- [ ] 8.7 经用户允许执行四端点真实调用并记录模型、结果与失败项

## 9. 最终验收

- [x] 9.1 执行 `npm run type-check`
- [x] 9.2 执行 `npm run lint`
- [x] 9.3 执行 `npm run test:unit -- --run` 并记录测试文件和用例数量
- [x] 9.4 执行 `npm run build` 并记录Worker产物与构建结果
- [ ] 9.5 核对禁止依赖、会话键隔离、HTML语义、未覆盖棋例和规则条款清单
- [ ] 9.6 输出2020规则覆盖矩阵统计：总条目、in-scope、out-of-scope、已实现、已测试、通过、失败、未覆盖、规则依据缺失；in-scope未覆盖或规则依据缺失大于0时禁止输出“本项目范围内的2020象棋棋盘规则与棋例裁决已完整实现”
- [ ] 9.7 输出每阶段完成内容、文件、规则条款、测试、性能、真实DeepSeek状态和下一阶段门槛结论
