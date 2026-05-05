# react-gamebaby 代码评审规范

Gemini Code Assist 审查此仓库 PR 时按本文件与仓库根 `AGENTS.md` / `docs/ARCHITECTURE.md` 的约束执行，评审语言使用中文。

## 审查优先级（按严重度降序）

1. **分层依赖方向（L1 → L2 → L3 → L3.5 → L4 单向）**
   - `src/engine/` 下禁止 `import` React、`document`、`window`、`HTMLElement` 等 DOM 符号
   - `src/games/` 下禁止 import 任何 React API
   - `src/sdk/` 只能依赖 `src/engine/`
   - 跨目录导入用 `@/` 别名，同目录用相对路径

2. **确定性约束（硬规则）**
   - `src/engine/` / `src/sdk/` / `src/games/` / `src/ai/` 下禁止出现 `Math.random()` / `Date.now()` / `performance.now()`
   - 随机性走 `ctx.rng()`（可播种 PRNG）
   - 时间读取走 `ctx.now()`（Ticker 注入的逻辑时钟）
   - 仅 L4 UI 装配层（`src/app/` / `src/ui/` / `src/platform/browser/` 的装配点）可读真实时钟，用于派生 seed

3. **纯函数游戏（L1 Games）**
   - `src/games/<name>/` 的 `init` / `step` / `render` 除 `ctx` 参数外，不得有外部副作用
   - 不得引用模块级可变状态

4. **TypeScript 严格度**
   - 禁用 `any`，需要"未知"时用 `unknown` + 类型收窄
   - 优先 `readonly` 数组与 `Readonly<T>`；游戏 state 必须是不可变结构
   - 用字面量联合代替 `enum`（例：`type Dir = 'up' | 'down' | 'left' | 'right'`）
   - `export` 的公共 API 必须显式标注类型

5. **React 规范**
   - 只允许函数组件 + hooks，禁用 class 组件
   - 副作用（`useEffect`、外部订阅）只能出现在 L4
   - 单组件内部状态用 `useState` / `useReducer`，跨组件状态用 Zustand store

6. **测试**
   - 测试放在源文件同级的 `__tests__/` 子目录下
   - L1 / L2 / L3 的纯函数层必须有单元测试
   - 测试确定性：`vi.useFakeTimers()` + 固定 `ctx.rng` seed；禁止依赖真实时钟或真随机

7. **命名与目录**
   - 文件 / 目录：kebab-case
   - 类型 / 接口 / 类：PascalCase
   - 变量 / 函数：camelCase
   - 编译期常量：SCREAMING_SNAKE_CASE

8. **注释质量**
   - 写"为什么"，不写"是什么"
   - 禁止冗余注释（如"// Import the module"、"// Return the result"）
   - `TODO` / `FIXME` 必须带处理时机与依赖条件

9. **依赖选型**
   - 不引入 Lodash / Moment / Ramda 等能用原生替代的库
   - 不引入与 Zustand 冲突的状态管理方案（Redux / RTK / MobX / Jotai / Recoil / RxJS）

## 克制边界

- `src/legacy/` 已在 `ignore_patterns` 中排除，无需评审
- 单 PR 评论数上限 15 条（见 `config.yaml`），挑最高价值的问题说
- 符合规范的部分无需点赞，总结里一笔带过即可
- Pre-existing 问题（改动未触及的既有代码）不必挑起
