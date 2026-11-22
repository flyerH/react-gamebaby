# `src/sdk` · 游戏契约

游戏与主机之间的契约，只依赖 `@/engine`。games 实现这份契约，machine 与训练脚本使用它，两边互不引用。

| 文件          | 导出                                                | 职责                                                                        |
| ------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| `types.ts`    | `Game<S>` / `GameEnv` / `GameInitOptions` / `Pixel` | 游戏需要实现的方法与可访问的能力                                            |
| `env.ts`      | `toGameEnv`                                         | 从 HardwareContext 投影出 GameEnv，挡住 ticker / storage / pause 等主机权限 |
| `registry.ts` | `createRegistry` / `GameRegistry`                   | 冻结列表、id 唯一、O(1) 查找                                                |
| `index.ts`    | 统一 re-export                                      | 外部只从这里导入                                                            |

`Game<S>` 只有 `id` / `name` / `preview` 必填，其余方法缺省时视为菜单里的预览占位条目。完整接口见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §3.2。
