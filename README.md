# AI 棋类练习器

本项目是基于 Vue 3、TypeScript 和 Vite 的本地 Web 练习器，包含五子棋与中国象棋。规则、合法性、胜负和确定性搜索均在本地执行；DeepSeek 只在本地候选和规则事实范围内提供策略选择与中文讲解。

## 当前架构

- 五子棋：候选生成 → 棋型评估 → Threat Search → Minimax/Alpha-Beta → Strategy Agent → 本地安全门禁。
- 中国象棋：合法着法 → 局面评估 → 搜索 → 重复棋例裁决 → DeepSeek 候选选择。
- 计算任务：搜索、提示、复盘和局后分析运行在 Web Worker；公共 Worker 模块统一请求编号、数据克隆、取消和清理。
- 历史记录：`data/gomoku.sqlite` 长期保存，IndexedDB 作为浏览器镜像与故障兜底。
- 本地代理：Vite 服务端提供 `/api/gomoku/agent`、复盘接口和象棋接口，API Key 不进入浏览器 bundle。

## 本地运行

1. 复制 `.env.example` 为 `.env.local`，填写 DeepSeek 配置。
2. 安装依赖：`npm install`。
3. 启动项目：`npm run dev`。
4. 打开终端输出的本地地址，默认是 `http://localhost:5173`。

SQLite 使用 Node 内置的 `node:sqlite`，不需要额外安装数据库包。数据库默认位于 `data/gomoku.sqlite`；可通过 `.env.local` 的 `GAME_DB_PATH` 修改位置。

## 常用命令

```sh
npm run dev
npm run type-check
npm run build
npm run test:unit
npm run lint
```

这是 localhost 技术探索版本，不是生产部署方案。
