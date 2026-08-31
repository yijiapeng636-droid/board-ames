# spec: 为 Gomoku 增加每局对局持久化、异常复盘与历史查询

Status: ready-for-agent

## Problem Statement

当前 Gomoku 只通过会话级经验记录保存有限的棋局数据：数据位于 `sessionStorage`，最多保留 20 局，关闭浏览器会话后无法可靠查询；记录内容主要是最终落子列表、简化的 AI 选择和教学复盘摘要。玩家和开发者无法获得一份跨会话、按局组织、可追溯的完整对局记录。

当本地搜索、Worker、DeepSeek Agent、战术门禁、落子校验或赛后复盘出现异常时，部分信息只存在于页面提示、开发控制台或临时 AI Trace 中。异常没有统一归属到具体棋局和具体回合，也没有持久化的结构化分类、Agent 异常复盘或可供后续 Agent 查询的历史经验。因此，相同异常可能重复发生，后续 Agent 也无法基于已知故障采取更稳妥的处理方式。

## Solution

为 Gomoku 增加一个浏览器本地的持久化对局历史能力。每次玩家明确开始对局时创建一条独立记录，并在整个对局生命周期内持续追加基础信息、所有已接受的落子、AI 决策诊断和异常。记录跨页面刷新与浏览器会话保留，完成、中断和包含悔棋的棋局都可追溯。

当一局棋出现异常时，在对局结束或中断后触发一次独立的 Agent 异常复盘，生成经过结构校验的原因、影响、已采取的回退措施和后续建议，并把复盘结果关联到该局异常。后续 Gomoku 决策 Agent 可通过只读、限量、脱敏的查询能力检索相关历史异常及复盘摘要。历史信息仅作为弱证据，不能覆盖棋规、合法性、立即胜、必须防守、强制胜证明或本地搜索事实。

持久化默认采用 IndexedDB，通过公开的对局历史服务封装；界面编排、AI 模块和 Agent 不直接依赖具体数据库 API。持久化失败不能阻塞正常下棋。

## User Stories

1. As a Gomoku player, I want every explicitly started game to receive a stable identifier, so that all events from one game can be correlated.
2. As a Gomoku player, I want completed games to remain available after refreshing or reopening the browser, so that history is not limited to one tab session.
3. As a Gomoku player, I want the record to identify when the game started and ended, so that I can understand its duration and sequence.
4. As a Gomoku player, I want the record to include my color, the AI color, and who moved first, so that the game context is unambiguous.
5. As a Gomoku player, I want the record to include board size, result, and lifecycle status, so that completed and interrupted games can be distinguished.
6. As a Gomoku player, I want every accepted human move to be recorded immediately, so that a later failure does not erase earlier play.
7. As a Gomoku player, I want every accepted AI move to be recorded immediately, so that the board can be reconstructed from history.
8. As a Gomoku player, I want each move to include its order, player, coordinate, timestamp, and game phase, so that the move sequence is auditable.
9. As a Gomoku player, I want an undone move to remain visible as reverted rather than disappearing, so that the record reflects what actually happened.
10. As a Gomoku player, I want a restarted game to be finalized as interrupted, so that restarting does not silently delete its history.
11. As a Gomoku player, I want leaving the game or reloading with an active game to mark it as interrupted when recovery occurs, so that stale active records are not mistaken for ongoing games.
12. As a developer, I want the record to distinguish completed, active, and interrupted games, so that consumers do not infer status from missing fields.
13. As a developer, I want each AI turn to record the position identity and move number, so that a decision can be tied to the exact board state.
14. As a developer, I want AI decisions to record the local baseline, selected move, final decision source, reason, and fallback state, so that decision provenance is clear.
15. As a developer, I want AI decisions to retain bounded local search metrics and candidate summaries, so that performance and tactical behavior can be diagnosed.
16. As a developer, I want Agent decisions to record tool names, model call count, duration, validation result, and failure classification, so that failures can be reproduced without storing hidden reasoning.
17. As a developer, I want deterministic forced moves to be recorded even when the Agent is bypassed, so that every AI move has a decision record.
18. As a developer, I want expected cancellation caused by restart, undo, navigation, or a stale response to be distinguished from real exceptions, so that history is not polluted.
19. As a developer, I want search, Worker, transport, model, tool, parser, tactical-gate, move-validation, review, and persistence failures to use one normalized anomaly shape, so that they can be queried consistently.
20. As a developer, I want every anomaly to include stage, category, severity, safe message, code, timestamp, move number, recovery state, fallback action, and stable fingerprint, so that repeated failures can be grouped.
21. As a developer, I want exception details to be sanitized before persistence, so that API keys, credentials, raw prompts, stack dumps, and sensitive response content are not stored.
22. As a developer, I want storage errors to be reported through a non-recursive fallback path, so that failure to save an anomaly does not generate an infinite anomaly loop.
23. As a Gomoku player, I want gameplay to continue using safe local fallback when persistence is unavailable, so that history recording never prevents a legal move.
24. As a maintainer, I want a game containing anomalies to receive one post-game Agent retrospective, so that failures have an actionable summary.
25. As a maintainer, I want the retrospective to identify likely causes, user impact, recovery actions, repeated patterns, and follow-up suggestions, so that it is useful for debugging.
26. As a maintainer, I want the retrospective to reference only anomalies and structured decision facts actually present in the game record, so that the Agent cannot invent incidents.
27. As a maintainer, I want retrospective output to be schema-validated and length-bounded, so that malformed model output cannot corrupt history.
28. As a maintainer, I want the game record to remain complete even when retrospective generation fails, so that model availability is not a persistence requirement.
29. As a maintainer, I want failed or timed-out retrospective attempts to have an explicit status and retry eligibility, so that incomplete reviews are visible without recursive review attempts.
30. As a future Gomoku Agent, I want a read-only query for historical anomalies filtered by category, stage, fingerprint, time, and relevance, so that I can retrieve prior failure experience on demand.
31. As a future Gomoku Agent, I want historical queries to return aggregates plus a small number of recent examples and retrospective lessons, so that context remains bounded.
32. As a future Gomoku Agent, I want historical anomaly results to be marked as weak evidence, so that they cannot override current deterministic search and rule facts.
33. As a future Gomoku Agent, I want historical queries to exclude raw model messages and hidden reasoning, so that only safe structured diagnostics enter the decision context.
34. As a developer, I want historical query results to be deterministic and ordered, so that the same stored history produces stable Agent context and stable tests.
35. As a developer, I want persisted records to carry a schema version, so that future changes can be migrated safely.
36. As a developer, I want legacy compatible session experience to be imported without inventing missing facts, so that currently available data is not needlessly lost.
37. As a developer, I want corrupt or unknown-version records to be isolated rather than wiping all history, so that one bad entry does not destroy unrelated games.
38. As a developer, I want record inputs and query results to be defensively copied, so that UI reactivity or callers cannot mutate persisted history accidentally.
39. As a developer, I want writes for a game to be ordered and idempotent, so that concurrent asynchronous callbacks cannot reorder or duplicate events.
40. As a maintainer, I want no automatic 20-game deletion policy for the audit history, so that every game remains available until an explicit future retention action is defined.
41. As a maintainer, I want the existing position-experience and teaching-review behavior to remain compatible, so that persistence does not regress current AI behavior.
42. As a user, I want the existing session-experience clearing action not to silently delete permanent audit history, so that a session-level control cannot cause unexpected data loss.
43. As a tester, I want clocks, identifiers, storage, and retrospective clients to be replaceable in tests, so that lifecycle tests remain deterministic.
44. As a tester, I want a browser storage contract test to prove data survives service re-creation, so that persistence is tested rather than assumed.
45. As a tester, I want component-level tests to prove real game actions are forwarded to history recording, so that the service cannot be correctly implemented but disconnected from gameplay.

## Implementation Decisions

- 引入一个公开的持久化对局历史服务作为功能的权威边界。它负责棋局生命周期、有序记录、持久化、异常复盘关联与历史异常查询；调用方不直接访问 IndexedDB。
- 默认使用 IndexedDB，因为每局包含多步落子、决策诊断、异常与复盘，且必须跨浏览器会话保留。服务接受可替换的存储适配器，便于测试与未来平台扩展。
- 仅在玩家确认开始新对局时创建记录；单纯挂载 Gomoku 页面不应创建棋局。
- 每局使用抗冲突 ID 与 schema version。基础信息包含开始/结束时间、状态、中断原因、结果、棋盘/规则元数据、玩家与 AI 执子、先手以及可用时经脱敏的运行时/模型标识。
- 棋局状态为 `active`、`completed` 或 `interrupted`。重开、切换先后手、返回首页以及恢复时发现的过期 active 记录都使用明确的中断原因；完成操作幂等。
- 落子表示为有序持久化事件。每个已接受落子记录唯一事件 ID、序号、回合、棋手、标准零基 row/column、时间与阶段。坐标的人类可读格式仅在展示层转换。
- 悔棋不删除原落子，而是标记事件已撤销并记录时间与原因。当前主线由未撤销落子派生，审计历史保持追加式。
- 每次 AI 尝试落子记录 position key、回合、开始/结束耗时、本地 baseline、有界候选事实、搜索指标、强制落子分类、Agent 使用情况、工具名、模型调用数、选择/最终落点、决策来源、公开理由、战术门禁、回退原因与校验结果。
- 复用现有 AI 诊断词汇。确定性强制落子、Agent 成功、Agent 回退、外层编排失败和无候选点都产生同一决策记录族。
- 不持久化 chain-of-thought、模型隐式推理、完整 prompt、API key、Authorization header、无限制模型响应或未脱敏 stack trace。只允许公开理由、枚举 code、有界安全 detail、指标和结构化证据。
- 异常统一包含 ID、时间、回合、可选 position key、来源子系统、阶段、分类、严重度、稳定 code、脱敏 message/detail、fingerprint、预期/非预期分类、可恢复性、回退动作和解决状态。
- 在现有编排边界捕获非预期故障：本地搜索与 Worker、Agent transport/model/tool/parsing、战术门禁与落子校验、复盘分析/请求/校验、持久化。重开、悔棋、导航造成的预期 `AbortError` 和被忽略的过期响应是生命周期事件，不是异常。
- fingerprint 由子系统、阶段、code 和归一化消息类型等稳定字段派生；坐标、时间、request ID、秘密与无限制文本不参与。
- 按 game ID 串行化写入，保持事件顺序。同一 event ID 的重复写入幂等；入参在入队前 clone，返回记录为防御性副本。
- IndexedDB 被禁用、不可用、数据损坏或 quota 超限时，内存状态仍可用。存储失败以有界状态呈现，不得阻止合法落子或安全 AI 回退。存储异常使用非递归备用通道，避免无限记录自身失败。
- 启动时将过期 active 记录恢复为 interrupted，因为浏览器卸载钩子无法保证完成异步 IndexedDB 写入。未持久化精确卸载时间时不伪造该时间。
- 默认保留所有持久化棋局，移除审计历史的自动 20 局上限。保留策略、导出与显式删除由后续产品决策定义。
- 通过兼容/查询外观保持现有 position experience 和教学复盘消费者。现有“清空本次会话经验”只能清除会话派生经验，不得静默删除持久化审计记录。
- 对当前会话内可见的合法旧 session experience 执行一次 best-effort 导入。导入记录标记为 legacy/incomplete，仅保留原始存在的事实，不伪造每步时间、异常或 Agent 复盘。
- 数据库与记录 schema 均支持版本迁移。单条无效数据隔离或跳过并生成安全诊断，不得删除整库。
- 仅在已完成或中断的棋局包含至少一个非预期异常，且同一异常集合没有已完成/进行中复盘时，触发 Agent 异常复盘。
- 先持久化终局，再异步请求异常复盘；棋局完成不依赖复盘完成。
- 异常复盘是结构化数据，包含摘要、引用异常 ID/fingerprint 的可能原因、用户影响、恢复/回退评估、重复历史模式、教训和后续建议。所有引用必须属于输入记录，列表和文本有长度上限。
- 复盘请求失败时保存 failed 状态、安全错误与可重试性；不自动递归触发新复盘，不改变棋局结果。
- 历史服务提供只读异常查询，并通过有界 Agent tool 或 context capability 暴露。过滤条件包含子系统/分类、阶段、fingerprint、时间范围、完成状态和数量上限。
- 查询返回聚合次数、最后出现时间、结果、回退有效性、复盘教训以及少量脱敏示例。默认按相关度、重复次数、最近时间排序，并使用稳定 tie-breaker。
- 历史异常只是 advisory session experience。Agent 指令和战术门禁必须明确：它不能覆盖棋规、立即胜、必须防守、已证明强制胜、合法性、position inspection、strategy candidate set 或确定性搜索事实。
- DeepSeek proxy/review 边界增加独立的异常复盘合约，不复用教学复盘语义。服务端 prompt 约束模型只引用已提供的异常 ID 与结构化事实。
- 本规格不要求新的历史管理页。持久化/复盘状态的最小用户反馈复用现有 game status/experience message 模式，不暴露敏感诊断。

## Testing Decisions

- 主测试接缝是公开的持久化对局历史服务。通过其公开 API 和可确定的 clock、ID generator、storage adapter、retrospective client 验证整体行为，不断言私有 helper 或内部对象布局。
- 存储合约测试使用支持 IndexedDB 的环境或忠实 fake IndexedDB。写入后重建服务/数据库连接，证明跨实例持久化。
- 测试一局完整棋局：开始、多步玩家/AI 落子、AI 诊断、终局、持久化异常复盘、服务重建和历史查询。
- 测试重开、切换先后手、返回首页和 stale-active recovery，确认没有已开始棋局被静默删除。
- 测试悔棋：撤销落子保留审计顺序，派生主线排除它们，替换落子获得新事件 ID。
- 覆盖所有 AI 决策来源：确定性强制结果、Agent 成功、战术门禁拒绝、Agent 回退、编排异常和无合法候选点。
- 覆盖 search、Worker、Agent model/tool/parser、validation、review 和 storage 异常的归一化；仅断言安全对外字段，不依赖内部 stack trace。
- 确认预期取消和过期异步响应不记为异常。
- 异常复盘仅在存在非预期异常时、终局持久化之后触发，且相同异常集合仅触发一次。
- 覆盖格式错误、伪造引用、超长、超时与失败的复盘响应；棋局记录始终可读且保持终局状态。
- 覆盖历史查询的过滤、相关度排序、聚合、数量上限、稳定 tie-breaker、防御性副本和敏感/原始字段排除。
- 确认历史建议无法绕过现有战术门禁，也无法改变确定性强制落子。
- 以敌对时序解析 move、decision、anomaly 和 completion，验证写入顺序与幂等性。
- 覆盖 IndexedDB 不可用、quota 失败、损坏记录和未知 schema version。只要持久化是可选能力，面向对局的操作必须保持 non-throwing，且无关合法记录不丢失。
- 覆盖旧 session experience 导入，确认不存在的旧字段保持缺失/incomplete，不被伪造。
- 在现有 mounted Gomoku 组件接缝增加薄集成测试。mock 公开历史服务，验证玩家落子、AI 落子、回退异常、悔棋、重开、终局和返回首页中断均被正确转发。
- 复用现有 Gomoku 组件异步生命周期测试、session-experience 生命周期测试、Agent failure diagnostic 测试和教学复盘 contract 测试作为先例。
- 好测试只观察持久化记录、生命周期结果、有界 Agent 查询和玩法连续性；不依赖私有函数名、具体 IndexedDB transaction 实现、响应式变量布局或 prompt 原文。

## Out of Scope

- 云同步、用户账号、多设备历史、共享历史或服务端棋局数据库。
- 完整的历史浏览、回放、搜索页面、导出/导入 UI、保留策略或单局删除控件。
- 自动上传记录、遥测、分析仪表盘或远程监控。
- 将该持久化模型扩展到象棋或其他游戏。
- 使用存储历史训练或微调模型。
- 持久化 chain-of-thought、原始 prompt、无限制模型响应、凭据或完整 stack trace。
- 捕获 Gomoku 活动生命周期之外的无关全局浏览器错误。
- 重建旧会话记录中从未存在的事实。
- 浏览器拒绝存储或设备空间不足时保证持久化；但必须保证玩法优雅降级。
- 修改 Gomoku 规则、搜索强度、战术优先级、候选生成或复盘评分。

## Further Notes

- 当前已有可复用基础：session-experience 生命周期、position key、结构化 AI diagnostics、归一化 Agent failure description、教学复盘 contract、安全本地 fallback 与组件异步生命周期测试。实现应深化并整合这些接缝，不要建立彼此无关的平行日志。
- “每局”表示持久化审计库不自动滚动删除。无上限本地历史最终需要产品级保留政策，存储可见性与保留管理由后续规格处理。
- 异常复盘与现有教学复盘是两种独立语义。一局棋可以同时有两者、只有其一或都没有。
- 如果分阶段交付，第一个交付版也必须完整写入棋局生命周期并提供只读历史异常查询；只写不读的日志不满足本规格。
