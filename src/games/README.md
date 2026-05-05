# `src/games` · L1 游戏实现

每款游戏一个子目录，全部实现 `Game<State>` 接口。**不依赖 DOM**（利于 RL 无头训练）。

## 目录规划

| 目录       | 说明                                             |
| ---------- | ------------------------------------------------ |
| `menu/`    | 主菜单"游戏"。按 `Game` 接口实现，和其它游戏同构 |
| `snake/`   | 贪吃蛇（首发）                                   |
| `tetris/`  | 俄罗斯方块（规划中）                             |
| `tank/`    | 坦克大战（规划中）                               |
| `_shared/` | 跨游戏复用的纯工具函数                           |

## 每个游戏需要的产物

1. `index.ts` —— 导出 `Game<State>` 实例。
2. `state.ts` —— 状态类型定义。
3. `step.ts` —— 纯函数 `step(state, input, ctx) => nextState`。
4. `render.ts` —— 纯函数 `render(state, scene)`。
5. `meta.ts` —— 元信息（名称、缩略图、难度分级等）。

## 规则

- **禁用 `Math.random()`**，用 `ctx.rng()`，便于确定性回放。
- **禁用 `Date.now()` / `performance.now()`**，时间由 `ctx.now()` 注入。
- 新游戏接入流程见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §7.1。
