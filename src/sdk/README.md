# `src/sdk` · L2 游戏 SDK

在 L3（硬件抽象）之上封装游戏通用能力，给 L1（各游戏）复用。**同样不依赖 DOM**。

## 职责划分

| 文件（规划） | 导出                   | 职责                                             |
| ------------ | ---------------------- | ------------------------------------------------ |
| `game.ts`    | `Game<State>` 接口     | 游戏契约：`init` / `step` / `render` / `onInput` |
| `scene.ts`   | `Scene`                | 单帧的临时画布，最后整体 `commit` 到 `Screen`    |
| `sprite.ts`  | `drawSprite`、`Sprite` | 软件层位图辅助（非硬件 sprite）                  |
| `timer.ts`   | `createTimer`          | 基于 tick 的定时器工具                           |
| `board.ts`   | `createBoard`          | 通用棋盘 / 方格状态管理                          |

## 规则

- **纯函数优先**：`step(state, input) => nextState` 必须是纯函数。
- **渲染声明式**：`render(state, scene)` 里只描述"当前帧应该长什么样"，不保留跨帧脏区。
- **禁止使用时间 / 随机 API**：同 L3 规则，走 `ctx.rng` / `ctx.now()`。
- 状态采用不可变更新（浅复制 + 新对象），不要原地修改。

完整接口契约见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §3.2。
