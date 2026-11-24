# AGENTS.md

本文件定义本仓库的编码与协作规范，适用于所有 AI 编码助手（Cursor / Claude Code / Codex 等）以及人类贡献者。

> 项目业务定位、阶段性决策、临时状态等不写在此处，请改写到 `docs/` 或 commit message。

## 技术栈

- 包管理器：pnpm 10（Node ≥ 20.19）
- 构建 / 开发：Vite 8
- UI：React 19 + TypeScript 6（`strict` + `noUncheckedIndexedAccess` + `noUnusedLocals/Parameters`）
- Lint / Format：ESLint 9（flat config）+ Prettier 3
- 测试：Vitest 4 + jsdom
- 状态管理：Zustand

## 常用命令

- `pnpm dev`：启动开发服务器
- `pnpm build`：生产构建（含 `tsc --noEmit` 类型检查）
- `pnpm lint`：对 `src/**/*.{ts,tsx}` 跑 ESLint
- `pnpm test`：跑一次 Vitest（CI / 提交前用）

pre-commit 钩子会自动对 staged 文件跑 `eslint --fix` + `prettier --write`，并对项目跑 `tsc --noEmit`。不得使用 `--no-verify` 跳过。

## 语言

- 代码注释、文档、README、commit message、PR 描述**一律使用中文**。
- 例外：`LICENSE`、`package.json` 字段、第三方模板必需的英文内容保留原样。

## Git 规范

- Commit message 格式：`type: 中文描述`
  - `type` 取自：`feat` / `fix` / `build` / `chore` / `docs` / `test` / `refactor` / `style` / `perf`
  - 英文冒号 + 半角空格 + 中文描述，标题 ≤ 72 字
  - 需要解释原因时，空行后写 body
- 不提交 `console.log` / `debugger` / 死代码 / 被注释掉的旧实现
- AI 助手不得主动 `git push` 或执行 `gh pr create` / `gh pr edit` 等对远端产生可见变更的动作；**推送 / 提 PR / 改远端 PR 只能在用户明确指令后执行**
- `gh` CLI 已纳入项目工具链；AI 处理 PR 相关操作（提 / 关 / 改 body / 评论）一律走 `gh`，不要求用户手动打开链接
- **AI 每次 `git commit` 前必须先把拟用的 commit message（标题 + body）完整展示给用户确认**，用户确认后再执行 commit；用户可以在确认前要求改措辞 / 拆分 / 合并
- **AI 每次 `gh pr create`，或用 `gh pr edit` 修改标题 / 描述前，必须先把拟用的 PR 标题与描述完整展示给用户确认**，用户确认后再执行
- **AI 每次 `gh pr create` / `gh pr edit` 后必须在回复里输出 PR 链接**（形如 `https://github.com/<owner>/<repo>/pull/<n>`），方便用户直接跳转

## AI 协作流程

- **用户要求"提 PR"时，AI 必须先做 CR 再提**：
  1. `git log origin/master..HEAD` 看提交，`git diff origin/master..HEAD` 看改动
  2. 按本文件 + `docs/ARCHITECTURE.md` 做一次中文评审，列高价值问题
  3. 用户修完或确认无问题后，展示 PR 标题与描述（见「Git 规范」），用户确认后再 `gh pr create`
- 远程侧由 CodeRabbit（GitHub App）自动复审，配置文件在 `.coderabbit.yaml`；AI 本地 CR 与远程 App CR 互为补充
- **AI 修复 CR 问题后必须收尾**：
  1. 已修复的 review thread 要 resolve（通过 GraphQL `resolveReviewThread`）
  2. PR body 要同步更新以反映后续 commit 的变更（如新增 / 删除的功能点）

## 架构分层

```
核心（纯 TS、确定性、可在 Node 运行）
  engine/    硬件接口与通用实现：Screen / Ticker / InputBus / Sound / Storage / Counter / RNG / 长按连发
  sdk/       游戏契约：Game 接口、GameEnv、Registry
  games/     各款游戏（纯函数）
  machine/   主机固件：模式状态机、菜单、开机动画与音乐、按键路由、调速、最高分
外围
  platform/  宿主驱动：按运行环境实现 engine 接口（headless / browser / wechat）
  ui/        React 视图
  app/       入口装配：每个运行入口一个子目录（web / wechat）
工具
  ai/ training/  RL 训练、推理与训练看板
```

详见 `docs/ARCHITECTURE.md`。以下是必须遵守的约束：

- **依赖方向**：

  | 目录         | 可以依赖                                                         |
  | ------------ | ---------------------------------------------------------------- |
  | `engine`     | 无                                                               |
  | `sdk`        | `engine`                                                         |
  | `games`      | `sdk`、`engine`                                                  |
  | `machine`    | `sdk`、`engine`（具体游戏由入口传入注册表，不 import `@/games`） |
  | `platform/*` | `engine`；子目录之间互不依赖                                     |
  | `ui`         | `engine` 的类型                                                  |
  | `app/*`      | 全部                                                             |

  例外：`src/games/<name>/rl.ts` 是给 RL 训练用的适配，可额外依赖 `@/ai` 与 `@/platform/headless`；游戏的 `index.ts` 不得引入 `rl.ts`。

- **核心不碰宿主**：核心与 `platform/headless` 不得 `import` React，不得使用 `window` / `document` / `navigator` / `setTimeout` / `performance.now()` 等宿主 API。需要计时等宿主能力时，由调用方注入（例如 `bindPressRepeat` 的 `schedule`）。
- **宿主桥接放 platform**：`src/platform/browser/`、`src/platform/wechat/` 用宿主 API 把真实时间、输入、音频、存储、生命周期、离线缓存等桥接到 engine 接口。ui 与 app 可为渲染与布局测量使用宿主绘图能力（如 `ResizeObserver`、`devicePixelRatio`、小游戏 canvas），系统返回键、前后台、Service Worker 等桥接仍放对应的 platform 子目录。
- **games 是纯函数**：`src/games/<name>/` 的 `init` / `step` / `render` 除 `env` 参数外，不得有外部副作用、不得引用模块级可变状态。
- **主机规则只写在 machine**：开关机、菜单、暂停、调速、绘制、最高分等规则写在 `src/machine/`，各入口只做装配，不重复实现。
- **UI 与状态分离**：ui 组件只通过 `subscribe` 观察状态，不直接修改；状态变更经由 `InputBus.emit` 等 engine 接口或 machine 的方法。

**新文件放哪？** 依次问两个问题：

1. 它需要知道游戏接口吗？不需要 → `src/engine/`
2. 需要的话，它是游戏作者使用的，还是负责调度游戏的？前者 → `src/sdk/`，后者 → `src/machine/`

## 确定性约束（硬规则）

在 `src/engine/` / `src/sdk/` / `src/games/` / `src/machine/` / `src/platform/headless/` / `src/ai/` 下：

- 禁用 `Math.random()` / `Date.now()` / `performance.now()`
- 随机性一律走 `ctx.rng()`（可播种 PRNG）
- 时间读取一律走 `ctx.now()`（由 Ticker 注入的逻辑时钟）

ESLint 的 `no-restricted-properties` / `no-restricted-globals` 会拦截上述违规，但规则本身优先级更高：即便 lint 暂未覆盖的变体（例如解构后使用），同样禁止。

## TypeScript

- 禁用 `any`；需要未知类型时用 `unknown` + 收窄
- 优先 `readonly` 数组与 `Readonly<T>`；Game state 必须是不可变结构
- 用联合字面量类型代替 `enum`：`type Dir = 'up' | 'down' | 'left' | 'right'`
- 跨目录导入统一走 `@/` 路径别名；同目录使用相对路径
- 公共 API（`export` 的符号）必须显式标注类型；内部变量优先依赖类型推断
- `export default` 仅用于 React 组件与框架约定场景，其他导出一律具名

## React

- 只用函数组件 + hooks，禁用 class 组件
- React 只出现在 `src/ui/` 与 `src/app/` 的 `.tsx` 入口；核心不得 `import` 任何 React API
- 单组件内部状态用 `useState` / `useReducer`；跨组件状态用 Zustand store
- 组件文件命名 `PascalCase.tsx`，一个文件一个组件
- `props` 超过 5 个或嵌套超过 2 层时，改走 Zustand 或拆组件

## 命名与目录

- 文件 / 目录：`kebab-case`（例如 `brick-breaker/`、`frame-buffer.ts`）
- 类型 / 接口 / 类：`PascalCase`
- 变量 / 函数：`camelCase`
- 编译期常量：`SCREAMING_SNAKE_CASE`（不要用于普通配置对象）
- 新增游戏放在 `src/games/<name>/`，目录内至少包含：
  - `index.ts`：默认导出 `Game<S>` 对象
  - `state.ts`：状态类型与 reducer

## 注释

- 写为什么，不写是什么；代码能自解释的不加注释
- 涉及非显然的算法、工程权衡、与规范的偏离时必须加注释
- `TODO` / `FIXME` 必须带上下文：何时处理、依赖什么条件

## 行文风格

适用于代码注释、文档、commit message 与 PR 描述。

- 用陈述句写事实和原因，不用夸张或强调的措辞，如杜绝、彻底、完全、风暴、量级
- 用书面语，不用口语，如掐断应写作停止、翻标志应写作切换状态、兜住应写作覆盖、瓜分应写作分配
- 不复述需求来源或对话过程，如对齐某某诉求、按要求实现；读代码的人看不到这些上下文
- 少用引号包短语、破折号和加粗；加粗只用于硬性约束
- 同一个设计点只在一处详细解释，其他位置引用，不在多个文件重复同一句话

## 测试

- 单元测试放在源文件同级的 `__tests__/` 子目录下，命名 `<name>.test.ts` / `<name>.spec.ts`（例如 `src/engine/rng.ts` 对应 `src/engine/__tests__/rng.test.ts`）
- 核心（engine / sdk / games / machine）与 platform **必须**有单元测试
- ui 组件与 app 入口按需测试，交互密集处使用 Testing Library
- 测试的确定性：`vi.useFakeTimers()` + 固定 `ctx.rng` seed；禁止依赖真实时钟或真随机

## 依赖选型

- 不引入功能可原生或已有工具实现的库（Lodash / Moment / Ramda 等）
- 不引入与 Zustand 冲突的状态管理方案（Redux / RTK / MobX / Jotai / Recoil / RxJS）
- 新增 runtime 依赖必须在 commit body 或 PR 说明中给出理由（包大小、替代方案、必要性）
