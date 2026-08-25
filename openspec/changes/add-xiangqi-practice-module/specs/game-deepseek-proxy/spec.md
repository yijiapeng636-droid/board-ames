## ADDED Requirements

### Requirement: 按棋类和用途拆分代理端点
本地Vite代理 MUST 提供 `/api/gomoku/move`、`/api/gomoku/review`、`/api/xiangqi/move`、`/api/xiangqi/review` 四个POST端点，共享配置、超时、HTTP和JSON基础解析但禁止共享Prompt。

#### Scenario: 错误HTTP方法
- **当** 客户端以非POST方法访问任一端点
- **那么** 代理返回405 JSON错误且不调用上游模型

### Requirement: 象棋候选约束
象棋move请求 MUST 包含sideToMove、棋盘、moves、searchedCandidates及可选sessionExperience，DeepSeek只能返回候选列表中的from/to。

#### Scenario: 模型创造落点
- **当** 模型返回的from/to不在当前本地候选中
- **那么** Validator拒绝该响应并使用重试或本地搜索兜底

### Requirement: 规则裁定留在本地
DeepSeek禁止决定走法合法性、将军、胜负、棋例分类或裁决；Prompt和Validator MUST 保持这一信任边界。

#### Scenario: 模型说明与本地规则冲突
- **当** 模型reason声称的规则结果与本地引擎不一致
- **那么** 系统以本地规则结果为准且不允许reason改变状态

### Requirement: 代理配置安全
代理 MUST 仅在本地服务端读取API Key，不得把Key写入前端快照、错误响应或日志。

#### Scenario: 上游请求失败
- **当** 包含敏感信息的上游错误发生
- **那么** 代理返回脱敏错误并且前端包中不存在API Key
