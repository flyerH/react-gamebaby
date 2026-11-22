# `src/app` · 入口装配

每个运行入口一个子目录，负责把某个平台的 HardwareContext、游戏注册表与 machine 拼成可运行的程序。主机规则在 `src/machine/`，这里不重复实现。

| 子目录 | 运行环境               | 内容                                                                                                    |
| ------ | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `web/` | 网页与 Android WebView | `main.tsx` 渲染入口与离线缓存配置；`App.tsx` 装配 browser 平台 + machine + ui，绑定键盘、返回键、前后台 |

入口的职责：

- 用 `@/platform/<env>` 创建 HardwareContext，调用 `createMachine({ ctx, games, seed })` 并在生命周期内 `start` / `stop`
- 绑定宿主事件：键盘或触控转成 `ctx.input.emit`，长按连发用 engine 的 `bindPressRepeat`，前后台调用 `machine.suspend` / `resume`
- 订阅 machine 与 ctx 的状态并渲染

可以读取真实时间等非确定性来源作为种子；需要重现的训练与测试走 `createHeadlessContext({ seed })`。
