# AGENTS.md

本文件定义本仓库的**编码与协作规范**，适用于所有 AI 编码助手（Cursor / Claude Code / Codex 等）以及人类贡献者。

> 项目业务定位、阶段性决策、临时状态等**不写在此处**，请改写到 `docs/` 或 commit message。

## 技术栈

- **包管理器**：pnpm 10（Node ≥ 20.19）
- **构建 / 开发**：Vite 8
- **UI**：React 19 + TypeScript 6（`strict` + `noUncheckedIndexedAccess` + `noUnusedLocals/Parameters`）
- **Lint / Format**：ESLint 9（flat config）+ Prettier 3
- **测试**：Vitest 4 + jsdom
- **状态管理**：Zustand

## 常用命令

- `pnpm dev` —— 启动开发服务器
- `pnpm build` —— 生产构建（含 `tsc --noEmit` 类型检查）
- `pnpm lint` —— 对 `src/**/*.{ts,tsx}` 跑 ESLint
- `pnpm test` —— 跑一次 Vitest（CI / 提交前用）

pre-commit 钩子会自动对 staged 文件跑 `eslint --fix` + `prettier --write`，并对项目跑 `tsc --noEmit`。不得使用 `--no-verify` 跳过。

## 语言

- 代码注释、文档、README、commit message、PR 描述**一律使用中文**。
- 例外：`LICENSE`、`package.json` 字段、第三方模板必需的英文内容保留原样。

## Git 规范

- Commit message 格式：`type: 中文描述`
  - `type` 取自：`feat` / `fix` / `build` / `chore` / `docs` / `test` / `refactor` / `style` / `perf`
  - 英文冒号 + 半角空格 + 中文描述，标题 ≤ 72 字
  - 需要解释原因时，空行后写 body
- 一个 commit 只做一件事；**格式化 / 重命名 / 移动**与**逻辑变更**分开提交
- 不提交 `console.log` / `debugger` / 死代码 / 被注释掉的旧实现
- AI 助手不得主动 `git push` 或执行 `gh pr create` / `gh pr edit` 等对远端产生可见变更的动作；**推送 / 开 PR / 改远端 PR 只能在用户明确指令后执行**
- `gh` CLI 已纳入项目工具链；AI 处理 PR 相关操作（提 / 关 / 改 body / 评论）一律走 `gh`，不让用户手动点链接
- **AI 每次 `git commit` 前必须先把拟用的 commit message（标题 + body）完整展示给用户确认**，用户点头再真正 commit；用户可以在确认前要求改措辞 / 拆分 / 合并
- **AI 每次 `gh pr create` / `gh pr edit` 后必须在回复里输出 PR 链接**（形如 `https://github.com/<owner>/<repo>/pull/<n>`），方便用户直接跳转

## AI 协作流程

- **用户要求"提 PR"时，AI 必须先做 CR 再提**：
  1. `git log origin/master..HEAD` 看提交，`git diff origin/master..HEAD` 看改动
  2. 按本文件 + `docs/ARCHITECTURE.md` 做一次中文评审，列高价值问题
  3. 用户修完或确认无问题后，再 `gh pr create`
- 远程侧由 CodeRabbit 与 Gemini Code Assist（均为 GitHub App）自动复审，配置文件在 `.coderabbit.yaml` / `.gemini/`；AI 本地 CR 与远程 App CR 互为补充

## 四层架构

```
L4  UI Shell   —— React 组件、DOM 渲染
L3  Engine     —— Screen / Ticker / InputBus / Sound / Storage / Context（接口 + 跨平台通用实现）
 └─ Platform   —— 平台专属实现（src/platform/<platform>/），对称落地 L3 接口
L2  SDK        —— Game 接口、GameEnv、Registry、draw helpers
L1  Games      —— 各款游戏实现（纯函数）
```

详见 `docs/ARCHITECTURE.md`。以下是必须遵守的约束：

- **L3 Engine 完全 DOM-agnostic**：`src/engine/` 下不得 `import` React、`document`、`window`、`HTMLElement` 等；Engine 必须能在 Node 里运行（RL 训练会用到）。
- **Platform 按运行环境分目录**：`src/platform/headless/` 为 Node / 测试实现，`src/platform/browser/` 为浏览器实现；二者互不依赖，都只依赖 `@/engine/*`。`src/platform/browser/` 是**唯一**允许直接调用 `window` / `document` / `performance.now()` / `requestAnimationFrame` 等真实环境 API 的目录——它的职责就是把墙钟与 DOM 事件桥接到 L3 接口。
- **L1 Games 是纯函数**：`src/games/<name>/` 的 `init` / `step` / `render` 除 `ctx` 参数外，不得有外部副作用、不得引用模块级可变状态。
- **依赖方向单向**：L1 → L2 → L3，不得反向。L4 UI 可依赖全部下层，并按环境从 `@/platform/<platform>` 装配 `HardwareContext`。
- **UI 与状态分离**：L4 组件只通过 `subscribe` 观察状态，不直接修改；所有状态变更经由 L3 API。

**Engine 还是 SDK？** 新增文件纠结归哪层时，问自己："删掉它，这台机器还能开机吗？"

- 不能（比如屏幕根本点不亮、按键收不到、循环转不起来） → 放 `src/engine/`
- 能（只是游戏开发者要重复造轮子、每款游戏重写一遍） → 放 `src/sdk/`

## 确定性约束（硬规则）

在 `src/engine/` / `src/platform/headless/` / `src/sdk/` / `src/games/` / `src/ai/` 下：

- ❌ `Math.random()` / `Date.now()` / `performance.now()`
- ✅ 随机性一律走 `ctx.rng()`（可播种 PRNG）
- ✅ 时间读取一律走 `ctx.now()`（由 Ticker 注入的逻辑时钟）

ESLint 的 `no-restricted-properties` / `no-restricted-globals` 会拦截上述违规，但规则本身优先级更高：即便 lint 暂未覆盖的变体（例如解构后使用），同样禁止。

## TypeScript

- 禁用 `any`；需要"未知"时用 `unknown` + 收窄
- 优先 `readonly` 数组与 `Readonly<T>`；Game state 必须是不可变结构
- 用联合字面量类型代替 `enum`：`type Dir = 'up' | 'down' | 'left' | 'right'`
- 跨目录导入统一走 `@/` 路径别名；同目录使用相对路径
- 公共 API（`export` 的符号）必须显式标注类型；内部变量优先依赖类型推断
- `export default` 仅用于 React 组件与框架约定场景，其他导出一律具名

## React

- 只用函数组件 + hooks，禁用 class 组件
- 副作用（`useEffect`、外部订阅）只能出现在 L4；L1 / L2 / L3 不得 `import` 任何 React API
- 单组件内部状态用 `useState` / `useReducer`；跨组件状态用 Zustand store
- 组件文件命名 `PascalCase.tsx`，一个文件一个组件
- `props` 超过 5 个或嵌套超过 2 层时，改走 Zustand 或拆组件

## 命名与目录

- 文件 / 目录：`kebab-case`（例如 `brick-breaker/`、`frame-buffer.ts`）
- 类型 / 接口 / 类：`PascalCase`
- 变量 / 函数：`camelCase`
- 编译期常量：`SCREAMING_SNAKE_CASE`（不要用于普通配置对象）
- 新增游戏放在 `src/games/<name>/`，目录内至少包含：
  - `index.ts` —— 默认导出 `Game<S>` 对象
  - `state.ts` —— 状态类型与 reducer

## 注释

- 写"**为什么**"，不写"**是什么**"；代码能自解释的不加注释
- 涉及**非显然的算法**、**工程权衡**、**与规范的偏离**时必须加注释
- `TODO` / `FIXME` 必须带上下文：**何时处理**、**依赖什么条件**

## 测试

- 单元测试放在源文件**同级的 `__tests__/` 子目录**下，命名 `<name>.test.ts` / `<name>.spec.ts`（例如 `src/engine/rng.ts` 对应 `src/engine/__tests__/rng.test.ts`）
- L1 / L2 / L3 的纯函数层**必须**有单元测试
- L4 UI 组件按需测试，交互密集处使用 Testing Library
- 测试的确定性：`vi.useFakeTimers()` + 固定 `ctx.rng` seed；禁止依赖真实时钟或真随机

## 依赖选型

- 不引入功能可原生或已有工具实现的库（Lodash / Moment / Ramda 等）
- 不引入与 Zustand 冲突的状态管理方案（Redux / RTK / MobX / Jotai / Recoil / RxJS）
- 新增 runtime 依赖必须在 commit body 或 PR 说明中给出理由（包大小、替代方案、必要性）
