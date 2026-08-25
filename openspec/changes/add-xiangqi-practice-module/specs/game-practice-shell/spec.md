## ADDED Requirements

### Requirement: 棋类练习器首页
系统 MUST 在不安装 Router 的情况下提供包含五子棋和中国象棋入口的首页，并使用应用内部状态切换活动页面。

#### Scenario: 进入并返回游戏
- **当** 用户从首页选择任一棋类并随后点击“返回首页”
- **那么** 系统切换到对应游戏再返回首页，且不触发浏览器路由导航

### Requirement: 五子棋独立模块
系统 MUST 将既有五子棋 Game、components、core、ai、types 组织在独立模块中，禁止借迁移重写其算法或改变行为。

#### Scenario: 五子棋迁移门禁
- **当** 五子棋模块迁移完成
- **那么** 原有五子棋测试 MUST 100%通过，且 TypeScript、Lint、Build 均通过后才能开始象棋实现

### Requirement: 棋类类型隔离
系统 MUST 为两个棋类保留独立 Board、Move、Result 与 Phase 类型，禁止通过大量 optional 字段构造万能棋类模型。

#### Scenario: 新增象棋着法字段
- **当** 象棋着法需要起点、终点和棋子信息
- **那么** 这些字段只存在于象棋类型中，五子棋 Move 保持原结构
