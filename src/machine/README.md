# `src/machine` · 主机固件

掌机的开机、菜单与游戏调度规则，网页与以后的小游戏等入口共用。只依赖 `@/sdk` 与 `@/engine`，不依赖 React 与宿主 API，可在 Node 中测试。

| 文件                | 导出                        | 职责                                                                  |
| ------------------- | --------------------------- | --------------------------------------------------------------------- |
| `machine.ts`        | `createMachine` / `Machine` | 四态状态机、按键路由、ticker 调速、每帧绘制、暂停、最高分、自动玩钩子 |
| `menu.ts`           | 菜单 reducer                | 选游戏、speed / level 单击递增循环                                    |
| `boot-animation.ts` | 开机动画                    | logo + 螺旋轨迹点阵                                                   |
| `boot-melody.ts`    | `BOOT_MELODY`               | 开机音乐音符序列                                                      |
| `index.ts`          | 统一 re-export              | 外部只从这里导入                                                      |

状态流转与接口说明见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §3.3。
