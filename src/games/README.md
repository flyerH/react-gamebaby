# `src/games` · 游戏实现

每款游戏一个子目录，实现 `@/sdk` 的 `Game<S>` 接口；`index.ts` 汇总成 `defaultGames` 默认注册表，数组顺序即菜单里的游戏编号顺序。游戏不依赖 DOM，可在 Node 中做 RL 训练与单元测试。

| 目录      | 说明                       |
| --------- | -------------------------- |
| `snake/`  | 贪吃蛇，含 RL 适配 `rl.ts` |
| `tetris/` | 俄罗斯方块                 |
| `tank/`   | 坦克大战                   |

目录结构、硬规则与依赖方向见 [`AGENTS.md`](AGENTS.md)；新增游戏可使用 `.cursor/skills/add-game/`。
