## ADDED Requirements

### Requirement: 集中象棋评估
象棋评估 MUST 集中管理 Material、Piece Position、Mobility、King Safety、Check Pressure 和 Pawn Advancement 分数，禁止在搜索流程散布魔法数字。

#### Scenario: 评估局面
- **当** 搜索评估非终局节点
- **那么** 分数由集中配置和上述特征计算，且不修改输入棋盘

### Requirement: 合法走法搜索
系统 MUST 使用 `generateLegalMoves` 实现独立 Negamax/Alpha-Beta、Move Ordering 和Web Worker搜索，并正确消费终局与棋例裁决结果。

#### Scenario: 搜索返回着法
- **当** 当前方存在合法着法且搜索时间预算结束
- **那么** Worker返回已完成深度中的最佳合法着法、分数、特征和Principal Variation，主线程保持可响应

#### Scenario: 无合法着法
- **当** 搜索局面为将死、困毙或已裁决终局
- **那么** 搜索返回对应终局分数且不生成非法候选

### Requirement: AI额外行动重新搜索
AI每个额外行动 MUST 从更新后的局面重新生成Legal Moves、重新Search并重新Validator，禁止一次Search预生成两手。

#### Scenario: AI拥有Bonus
- **当** AI完成第一手且没有将军、终局或棋例裁决阻止Bonus
- **那么** 系统为第二手创建新的搜索请求并验证新的当前局面

### Requirement: 本地搜索兜底
DeepSeek不可用、超时或返回无效内容时，系统 MUST 选择当前搜索分数最高的合法候选继续对局。

#### Scenario: 网络请求失败
- **当** DeepSeek move请求失败
- **那么** AI执行本地第一候选且游戏保持可继续
