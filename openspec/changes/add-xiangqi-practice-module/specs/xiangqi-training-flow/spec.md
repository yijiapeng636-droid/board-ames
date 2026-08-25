## ADDED Requirements

### Requirement: 象棋先后手
系统 MUST 允许玩家执红AI执黑或AI执红玩家执黑，并始终由红方先行。

#### Scenario: AI执红
- **当** 用户选择AI执红
- **那么** 开局后AI自动完成第一手合法红方着法，再交给执黑玩家

### Requirement: 象棋让一步调度
系统 MUST 允许任一方获得至多一个额外行动机会，并按“胜负→将军→棋例裁决→Bonus→普通切换”处理每手结果。

#### Scenario: 额外手形成将军
- **当** 有Bonus的一方第一手形成将军
- **那么** 系统立即清除其剩余Bonus并切换给被将军方应将

### Requirement: 稳定决策点悔棋
系统 MUST 在玩家稳定决策点保存包含 board、moves、sideToMove、bonus、phase、result、repetition history、棋例状态和AI显示状态的Checkpoint。

#### Scenario: 悔棋取消旧任务
- **当** 用户在AI、Hint或Review任务运行期间悔棋
- **那么** 系统 Abort/废弃相关任务、递增sessionId并同时恢复棋盘和规则历史

### Requirement: 只读最佳提示
玩家回合的最佳提示 MUST 使用象棋同一Search Engine，高亮起点与目标并可显示中文走法名，禁止修改任何游戏状态。

#### Scenario: 请求提示
- **当** 玩家请求最佳提示
- **那么** 系统返回当前玩家的合法候选并保持 board、moves、bonus、sideToMove 不变

### Requirement: 赛后教学复盘
游戏结束后系统 MUST 在独立棋盘重放，比较玩家实战着法与搜索最佳着法，筛选关键节点后才请求DeepSeek教学总结。

#### Scenario: DeepSeek复盘失败
- **当** 本地关键点已完成但教学总结请求失败
- **那么** 系统保留本地关键点并允许重试，不污染已结束棋局

### Requirement: 独立会话经验
象棋经验 MUST 使用 `xiangqi:session-experience:v1`，禁止与五子棋 `gomoku:session-experience:v2` 混合。

#### Scenario: 记录象棋经验
- **当** 象棋对局或复盘完成
- **那么** 仅象棋会话记录发生变化，关闭浏览器会话后允许清除
