# AI 五子棋本地 Web MVP

Vue 3 + TypeScript + Vite 的 localhost 技术验证版。玩家执黑，DeepSeek 执白；胜负与落点合法性始终由本地 TypeScript 代码判断。

当前 V2 棋力链路为：Web Worker 候选池与棋型分析 → Minimax + Alpha-Beta 多步搜索 → 会话级临时经验摘要 → DeepSeek 候选决策 → 本地 Validator。DeepSeek 不可用时会采用 `searchScore` 最高的本地搜索结果。

会话经验仅保存在内存和 `sessionStorage`，跨 restart 和页面刷新保留，浏览器会话结束后失效；页面提供独立的“清空本次会话经验”按钮。

## 本地运行

1. 复制 `.env.example` 为 `.env.local`，填写已确认的 DeepSeek 配置。
2. 执行 `npm install`。
3. 执行 `npm run dev`。

浏览器仅请求 `/api/deepseek`。API Key 由 Vite 开发服务器读取，不会进入 Vue 客户端 bundle。该代理仅用于 localhost 开发验证，不是生产部署方案。

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
