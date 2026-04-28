# react-gamebaby · 架构设计

> 本文档是项目的单一事实来源 (Single Source of Truth)。
> 所有 AI agent、Cursor Skill、CodeRabbit review、以及人类协作者都应以本文档为准。

## 1. 项目定位

**模拟一台 Brick Game 9999-in-1 复古掌机**，承载多款经典游戏（Snake / Tetris / Tank / ...），同时是一套 **端到端 AI 工程化实践的参考实现**。

两条并行主线：

1. **产品主线**：做一台"像"的复古掌机，像素级 LCD 显示 + 8bit 声音 + 实体按键感，多游戏可插拔。
2. **AI 工程化主线**：沉淀一套可复用的 AI 开发实践（规范、Skills、自动 PR、远端 CR、RL 游戏 AI、AI 测试、文档自动化），其他项目可直接参考或复制。

**非目标 (out of scope)**：

- 不追求逐字节还原 Brick Game 硬件行为（不模拟 LCD 扫描时序、不模拟真实按键去抖）
- 不追求 SOTA 的 RL 算法（选择 DQN baseline，优先代码清晰与可复现性）
- 不追求"大模型驱动"（游戏 AI 走 RL，不用 LLM）

---

## 2. 整体架构

### 2.1 四层架构图

```
┌─────────────────────────────────────────────────────────────┐
│ L4  UI Shell                              纯视图，可替换渲染 │
│                                                              │
│   Device (外壳)                                              │
│     ├─ ContentScreen   主 10×20 点阵 (Canvas2D/DOM/WebGL)   │
│     ├─ SidePanel       Score/Level/Speed/Next               │
│     └─ Buttons         方向 + 功能键                         │
├─────────────────────────────────────────────────────────────┤
│ L3  Engine (Hardware Abstraction)         DOM-agnostic 核心 │
│                                                              │
│   接口: Screen · Ticker · InputBus · Sound · Storage · ...  │
│   跨平台通用实现: Screen framebuffer · InputBus · Counter / │
│     Toggle · rng                                             │
│                                                              │
│   └─ Platform (平台适配层)     按运行环境落地 L3 接口       │
│      ├─ headless/  HeadlessTicker · MemoryStorage · Null    │
│      │            Sound · HeadlessContext                    │
│      └─ browser/   RealtimeTicker · LocalStorage · zzfx     │
│                   Sound · bindKeyboardInput · BrowserContext│
├─────────────────────────────────────────────────────────────┤
│ L2  SDK                                   游戏作者用的工具箱 │
│                                                              │
│   Game<S> 接口 · Scene · draw helpers                       │
│   GameEnv (Gym-like) · Autopilot · Registry                 │
├─────────────────────────────────────────────────────────────┤
│ L1  Games                                 纯函数、可插拔     │
│                                                              │
│   menu/  snake/  tetris/  tank/  _template/                 │
└─────────────────────────────────────────────────────────────┘

          ↓ engine/sdk/games 同时被两边复用；平台差异锁在 platform/ ↓

┌──────────────────────────────┐     ┌──────────────────────────────┐
│ 浏览器运行时                  │     │ Node 训练运行时              │
│ (src/platform/browser/ + ui/) │     │ (src/platform/headless/)     │
│                               │     │                              │
│ RealtimeTicker                │     │ HeadlessTicker / Batch       │
│ Canvas renderer + <Device/>   │     │ Screen buffer only (无渲染)  │
│ Keyboard/Touch InputBus 桥接  │     │ Policy 驱动 InputBus         │
│ zzfx Sound                    │     │ Null Sound                   │
│ LocalStorage                  │     │ Memory Storage               │
│ tfjs (推理)                   │     │ tfjs-node (训练)             │
└──────────────────────────────┘     └──────────────────────────────┘
                                         │
                                   Hono + SSE
                                         │
                                         ↓
                                  Dashboard (浏览器)
                                  指标图表 + 确定性回放
```

### 2.2 分层核心原则

| 原则                     | 说明                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| **严格单向依赖**         | L1 → L2 → L3，上层只能向下引用，下层不知道上层存在                |
| **L3 完全 DOM-agnostic** | Engine 层禁止 import React / DOM API，确保可在 Node 训练          |
| **L1 Game 是纯函数**     | `init / onInput / onTick / render` 全部 pure，除 `ctx` 外无副作用 |
| **随机性走 `ctx.rng`**   | 禁用 `Math.random()` / `Date.now()`，保证确定性可回放             |
| **UI 与状态分离**        | L4 组件只订阅不修改，所有状态变更经由 L3 API                      |

---

## 3. 核心接口定义

### 3.1 L3 Engine

```ts
// Screen —— 纯 framebuffer，硬件屏幕的抽象
interface Screen {
  readonly width: number;
  readonly height: number;
  setPixel(x: number, y: number, on: boolean): void;
  getPixel(x: number, y: number): boolean;
  blit(x: number, y: number, bitmap: Bitmap, mode?: 'overwrite' | 'or' | 'xor'): void;
  commit(buffer: Uint8Array): void; // 从 Scene 一次性提交
  clear(): void;
  readonly buffer: Uint8Array; // 长度 = width * height，每字节 0/1
  subscribe(fn: () => void): () => void;
}

// Ticker —— 固定步长循环
interface Ticker {
  start(onTick: () => void): void;
  stop(): void;
  pause(): void;
  resume(): void;
  readonly speed: number; // ticks/second
  setSpeed(ticksPerSecond: number): void;
}

// 具体实现（均位于 src/platform/）：
//   browser/  RealtimeTicker   使用 requestAnimationFrame + 累积器
//   headless/ HeadlessTicker   非自驱，外部 advance 推进，用于训练 / 单测
//   headless/ BatchTicker      批量推进 N 步后返回，用于 evaluator（可选）

// InputBus —— 统一按键总线
type Button = 'Up' | 'Down' | 'Left' | 'Right' | 'A' | 'B' | 'Start' | 'Select' | 'Sound' | 'Reset';

interface InputBus {
  emit(btn: Button, action: 'press' | 'release'): void;
  subscribe(fn: (btn: Button, action: 'press' | 'release') => void): () => void;
  readonly pressed: ReadonlySet<Button>;
}

// Counter / Toggle —— 可订阅的原子状态
interface Counter {
  readonly value: number;
  set(n: number): void;
  add(n: number): void;
  subscribe(fn: (v: number) => void): () => void;
}

interface Toggle {
  readonly value: boolean;
  set(v: boolean): void;
  toggle(): void;
  subscribe(fn: (v: boolean) => void): () => void;
}

// Sound —— 8bit 音效，底层用 zzfx
interface Sound {
  play(effect: SoundEffect): void;
  setEnabled(on: boolean): void;
}

// Storage —— 本地持久化（最高分、设置等）
interface Storage {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
}

// Context —— 游戏看到的"硬件上下文"
interface Context {
  screen: Screen;
  ticker: Ticker;
  input: InputBus;
  sound: Sound;
  storage: Storage;

  score: Counter;
  level: Counter;
  speed: Counter;
  lives: Counter;
  pause: Toggle;
  soundOn: Toggle;

  rng: () => number; // 0..1，seeded PRNG（mulberry32）
}

// 两种 Context 构造函数（按运行环境从对应 platform 子目录导入）：
//   import { createBrowserContext  } from '@/platform/browser'   浏览器运行时
//   import { createHeadlessContext } from '@/platform/headless'  Node 训练 / 测试
```

### 3.2 L2 SDK

```ts
// Scene —— 游戏临时画布（render 里用），commit 后同步到 Screen
interface Scene {
  readonly width: number;
  readonly height: number;
  setPixel(x: number, y: number, on: boolean): void;
  drawRect(x: number, y: number, w: number, h: number, on: boolean): void;
  drawSprite(x: number, y: number, sprite: Bitmap): void;
  drawBorder(): void;
  clear(): void;
  readonly buffer: Uint8Array;
}

// Game —— 核心接口，每款游戏一个实现
interface Game<S> {
  readonly meta: GameMeta;
  init(ctx: Context, level: number): S;
  onInput(state: S, btn: Button, ctx: Context): S;
  onTick(state: S, ctx: Context): S;
  render(state: S, scene: Scene): void;
  isGameOver(state: S): boolean;
}

interface GameMeta {
  id: string;
  name: string;
  icon: Bitmap; // 菜单里预览用
  defaultSpeed: number; // ticks/second
  maxLevel: number;
}

// GameEnv —— Gym-like 抽象，给 RL 用
interface GameEnv<S, A = Button> {
  reset(seed?: number): S;
  step(state: S, action: A): { state: S; reward: number; done: boolean };
  actionSpace: readonly A[];
  encodeState(state: S): Float32Array;
}

// Autopilot —— AI 代玩接口
interface Autopilot<S, A = Button> {
  act(state: S, env: GameEnv<S, A>): A;
  load?(modelUrl: string): Promise<void>;
}

// Registry —— 游戏注册表
interface Registry {
  register<S>(game: Game<S>): void;
  get(id: string): Game<unknown> | undefined;
  list(): GameMeta[];
}
```

### 3.3 游戏循环（引擎内部）

```ts
// 引擎主循环伪代码
function mainLoop(game: Game<S>, ctx: Context) {
  let state = game.init(ctx, 0);
  const scene = createScene(ctx.screen.width, ctx.screen.height);

  ctx.input.subscribe((btn, action) => {
    if (action === 'press') state = game.onInput(state, btn, ctx);
  });

  ctx.ticker.start(() => {
    state = game.onTick(state, ctx);
    scene.clear();
    game.render(state, scene);
    ctx.screen.commit(scene.buffer);

    if (game.isGameOver(state)) {
      ctx.ticker.stop();
    }
  });
}
```

---

## 4. 渲染与主题

### 4.1 渲染策略：Declarative Full-Redraw

每 tick 执行 `scene.clear() → game.render(state, scene) → screen.commit(scene.buffer)`，即 **声明式全量重绘**。

- 游戏代码只描述 _当前状态应该长什么样_，不用管 _上一帧长什么样_
- 天然支持游戏切换、暂停、回放 —— 给一个 state 就能画出对应画面
- 状态是唯一事实来源，渲染是 state 的纯函数

**性能不是问题**：10×20 = 200 像素，全量重绘开销可忽略。

### 4.2 可切换的 Renderer

L4 的 `ContentScreen` 组件支持三种 renderer，运行时可切：

| Renderer     | 实现                                   | 适用                   | 技术要点                 |
| ------------ | -------------------------------------- | ---------------------- | ------------------------ |
| **Canvas2D** | `<canvas>` + `fillRect` / `strokeRect` | 默认，性能好           | 主题绘制、dirty 优化     |
| **DOM**      | 200 个 `<div>` + CSS                   | 调试友好，可检查单像素 | 性能对比基准             |
| **WebGL**    | Three.js 或原生 shader                 | 支持 CRT 滤镜（可选）  | GPU 管线、ShaderMaterial |

**主题切换**（`PixelStyle`）：

```ts
interface PixelStyle {
  id: 'classic' | 'filled' | 'outlined';
  onColor: string; // 点亮像素颜色
  offColor: string; // 背景 / 熄灭像素（不是黑，保留 LCD 底色）
  drawPixel(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean): void;
}

// classic   —— 外框 + 中心小方块（贴近原机 LCD 视觉）
// filled    —— 纯实心方块
// outlined  —— 空心外框
```

刻意 **不做** CRT 扫描线 / 暗角 —— Brick Game 是固定点阵 LCD，不是 CRT，那些效果违和。

---

## 5. 确定性设计

### 5.1 核心要求

给定 `{ seed, actions[] }`，**任意环境下重放都必须得到完全一致的 state 序列**。

### 5.2 硬规则

- ❌ 禁止 `Math.random()` —— ESLint `no-restricted-globals` 卡住
- ❌ 禁止 `Date.now()` / `performance.now()` 进入游戏逻辑
- ❌ 禁止游戏 import DOM / React / window
- ✅ 所有随机走 `ctx.rng()`
- ✅ 游戏函数必须 pure（除 `ctx` 外无副作用）

### 5.3 PRNG 实现

选用 **mulberry32** —— 实现约 10 行，跨平台行为一致，伪随机质量满足游戏与 RL 训练需求：

```ts
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### 5.4 回放协议

```ts
interface Episode {
  seed: number;
  actions: Array<{ tick: number; btn: Button }>;
  gameId: string;
  totalTicks: number;
  finalScore: number;
}
```

一局 1000 tick 的贪吃蛇，Episode 大约 **1 KB**，完美复现。

---

## 6. AI 工程化落点

七个模块，覆盖从编码到发布的完整 AI 辅助闭环。

| #   | 模块           | 技术选型                            | 核心能力                                             |
| --- | -------------- | ----------------------------------- | ---------------------------------------------------- |
| 1   | **AI 规范**    | `.cursor/rules/*.mdc` + `AGENTS.md` | 分层规则、规则 eval 方法、和 CR 规则共享             |
| 2   | **Skills**     | Cursor Skills                       | `add-game` 骨架生成、Skill 组合调用                  |
| 3   | **自动 PR**    | PAT + `gh` CLI                      | 轻量化方案，无需 GitHub App                          |
| 4   | **远端 CR**    | CodeRabbit                          | 和本地 Hook 的分工                                   |
| 5   | **文档自动化** | Skill + Hook                        | diff → changelog、架构文档自同步                     |
| 6   | **RL 玩游戏**  | TF.js + DQN + Gym 抽象              | Node 训练/浏览器推理分离、确定性回放、训练 dashboard |
| 7   | **AI 测试**    | Vitest + Playwright MCP + 模型回归  | AI 批量造 case、CI 模型门禁、visual regression       |

详见各模块子文档（后续逐个落地）。

---

## 7. 技术栈

| 层       | 技术                  | 替代方案            | 理由                                     |
| -------- | --------------------- | ------------------- | ---------------------------------------- |
| 语言     | TypeScript 5.x        | JS                  | 接口复杂度高、RL 泛型多                  |
| 构建     | Vite 5.x              | Webpack 5 / Rspack  | 快、生态新、tfjs 友好                    |
| UI       | React 18              | Vue / Solid         | 生态成熟、Hooks 模型稳定                 |
| 状态     | Zustand               | Redux Toolkit       | 简单、TS 友好、无样板代码                |
| 样式     | CSS Modules           | Tailwind            | 像素艺术组件数量少，不需要 utility-first |
| 音效     | zzfx                  | Howler.js           | 1 KB、参数化合成、适合 8bit 音色         |
| RL 训练  | @tensorflow/tfjs-node | PyTorch (Python)    | 同 JS 全栈、engine 代码复用              |
| RL 推理  | @tensorflow/tfjs      | ONNX Runtime Web    | 配套、模型格式一致                       |
| 训练服务 | Hono + SSE            | Express + WebSocket | 轻、类型好、Edge 友好                    |
| 图表     | ECharts               | Chart.js / Recharts | 交互强、训练曲线场景丰富                 |
| 测试     | Vitest                | Jest                | Vite 原生、ESM 友好                      |
| E2E      | Playwright (MCP)      | Cypress             | MCP 工具链、可被 AI 驱动                 |
| CI       | GitHub Actions        | -                   | 标配                                     |

---

## 8. 目录结构

```
react-gamebaby/
├─ docs/
│  ├─ ARCHITECTURE.md          本文档
│  ├─ AI-PRACTICES.md          AI 工程化细节
│  └─ RL-TRAINING.md           RL 训练流程
├─ src/
│  ├─ engine/                  L3 Engine：接口 + 跨平台通用实现 (DOM-agnostic)
│  │  ├─ types.ts              所有接口定义
│  │  ├─ screen.ts             framebuffer
│  │  ├─ input.ts              按键事件总线
│  │  ├─ counter.ts            可订阅原子状态
│  │  └─ rng.ts                可播种 PRNG
│  ├─ platform/                平台适配层：按运行环境落地 L3 接口
│  │  ├─ headless/             Node / 训练 / 单测
│  │  │  ├─ ticker.ts          createHeadlessTicker（非自驱）
│  │  │  ├─ storage.ts         createMemoryStorage
│  │  │  ├─ sound.ts           createNullSound
│  │  │  └─ context.ts         createHeadlessContext
│  │  └─ browser/              浏览器（待建）
│  │     ├─ ticker.ts          createRealtimeTicker（requestAnimationFrame）
│  │     ├─ input.ts           bindKeyboardInput（键盘桥接到 InputBus）
│  │     ├─ storage.ts         createLocalStorage
│  │     ├─ sound.ts           createZzfxSound
│  │     └─ context.ts         createBrowserContext
│  ├─ sdk/                     L2 SDK
│  │  ├─ scene.ts
│  │  ├─ game.ts               Game<S> 接口
│  │  ├─ env.ts                GameEnv 接口
│  │  ├─ autopilot.ts
│  │  ├─ registry.ts
│  │  └─ draw/                 画图助手 (text, number, sprite)
│  ├─ games/                   L1 Games
│  │  ├─ _template/            新游戏骨架
│  │  ├─ menu/
│  │  ├─ snake/
│  │  ├─ tetris/               (后续)
│  │  └─ tank/                 (后续)
│  ├─ ui/                      L4 UI
│  │  ├─ Device/
│  │  ├─ ContentScreen/
│  │  │  └─ renderers/
│  │  ├─ SidePanel/
│  │  ├─ Buttons/
│  │  ├─ theme/
│  │  └─ dashboard/            训练可视化
│  ├─ ai/                      RL 通用层
│  │  ├─ dqn.ts
│  │  ├─ replay-buffer.ts
│  │  ├─ train.ts              Node 训练 CLI
│  │  └─ eval.ts
│  ├─ training/                训练服务
│  │  ├─ server.ts             Hono + SSE
│  │  ├─ protocol.ts           事件类型
│  │  └─ capture.ts
│  ├─ app/
│  │  ├─ store.ts              Zustand
│  │  ├─ App.tsx
│  │  └─ main.tsx
│  └─ i18n/
├─ .cursor/
│  ├─ rules/                   AI 规范
│  └─ skills/                  add-game 等
├─ .github/
│  ├─ workflows/               CI
│  └─ coderabbit.yml           CR 配置
├─ AGENTS.md                   LLM 入口规范
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ vitest.config.ts
```

---

## 9. 命名规范

| 类型              | 风格              | 例子                    |
| ----------------- | ----------------- | ----------------------- |
| 文件 / 目录       | kebab-case        | `replay-buffer.ts`      |
| React 组件目录    | PascalCase        | `ContentScreen/`        |
| TypeScript 类型   | PascalCase        | `GameMeta`              |
| 变量 / 函数       | camelCase         | `createScreen`          |
| 常量              | UPPER_SNAKE_CASE  | `DEFAULT_SEED`          |
| Button 枚举       | PascalCase 字面量 | `'Start'`               |
| 接口              | 不加 `I` 前缀     | `Screen` 而非 `IScreen` |
| 模板 / 非内容目录 | `_` 前缀          | `games/_template/`      |

---

## 10. 7 天迭代计划

| 天  | 任务                                              | 主要产出           |
| --- | ------------------------------------------------- | ------------------ |
| D1  | 基建迁移：Vite + TS + React 18 + Vitest + Actions | 现代化空壳         |
| D2  | L3 engine + L2 SDK + Snake 迁移到新架构           | 贪吃蛇跑起来       |
| D3  | 像素主题 + 8bit 声音 + SidePanel + Menu 游戏      | 完整外观与交互     |
| D4  | 模块 1-5（规范 + Skills + 自动 PR + CR + 文档）   | AI 工程基础设施    |
| D5  | 模块 6 上：Gym 抽象 + DQN + Node 训练 pipeline    | 第一条 reward 曲线 |
| D6  | 模块 6 下：训练 dashboard + 权重集成到浏览器      | 会玩的 AI          |
| D7  | 模块 7：测试 + 模型回归 CI + polish + demo 录制   | 可上线可演示       |

> 每一天视为一个 PR 单位，由 Cursor Background Agent 或 Claude Code 主导实现，人工 review + merge。

---

## 11. 决策记录 (ADR 简版)

| #   | 决策                                              | 取舍                                    |
| --- | ------------------------------------------------- | --------------------------------------- |
| 1   | Screen 是纯 framebuffer，而非 Game Boy 式 PPU/OAM | 贴近 Brick Game 真实硬件，接口小        |
| 2   | 声明式全量重绘，不做脏区优化                      | 200 像素规模下优化收益低于维护成本      |
| 3   | Node 训练 + 浏览器推理，而非浏览器训练            | tfjs-node 原生加速，I/O 方便            |
| 4   | seed + PRNG，而非事件流记录                       | 复杂游戏里事件流会膨胀                  |
| 5   | PAT + `gh` CLI，而非 GitHub App                   | 小型项目中 App 过度设计，CLI 方案更轻量 |
| 6   | DQN baseline，不追 SOTA                           | 代码清晰、可复现优先于性能              |
| 7   | SidePanel 独立组件，而非共享 framebuffer          | 分离 metadata 与 game pixels            |
| 8   | Menu 作为一款 Game，而非 UI 组件                  | 一致性抽象、复用所有 game 机制          |
| 9   | 不做 CRT 扫描线 / 暗角                            | Brick Game 是 LCD 不是 CRT              |

---

## 12. 术语表

| 术语          | 含义                                          |
| ------------- | --------------------------------------------- |
| Screen        | L3 硬件抽象的 framebuffer（数据）             |
| ContentScreen | L4 主显示 UI 组件（视图）                     |
| Device        | L4 最外层容器（外壳）                         |
| Scene         | L2 SDK 提供的临时画布，game.render 在这上面画 |
| Ticker        | 固定步长游戏循环                              |
| Context       | 游戏能看到的"硬件上下文"聚合                  |
| Episode       | 一局完整游戏的回放包 `{ seed, actions }`      |
| Autopilot     | AI 代玩实现                                   |
| GameEnv       | Gym-like 环境封装，给 RL 用                   |
