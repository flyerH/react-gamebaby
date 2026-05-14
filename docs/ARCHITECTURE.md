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

```text
┌────────────────────────────────────────────────────────────────────┐
│ L4  UI Shell                                   纯视图，订阅 Screen │
│                                                                    │
│   Device (外壳)                                                    │
│     ├─ ContentScreen   10×20 主屏，Canvas2D 渲染                   │
│     ├─ SidePanel       Score / Hi / Aux / Speed / Level            │
│     └─ Buttons         方向键 + 功能键 + 触屏按钮                  │
├────────────────────────────────────────────────────────────────────┤
│ L3  Engine (Hardware Abstraction)                DOM-agnostic 核心 │
│                                                                    │
│   接口        Screen · Ticker · InputBus · Sound · Storage         │
│   通用实现    NullSound · MemoryStorage · mulberry32 RNG           │
│                                                                    │
│   └─ Platform                               按运行环境落地 L3 接口 │
│      ├─ headless/    HeadlessTicker · HeadlessContext              │
│      └─ browser/     RealtimeTicker · LocalStorage ·               │
│                      WebAudio Sound · bindKeyboardInput ·          │
│                      BrowserContext                                │
├────────────────────────────────────────────────────────────────────┤
│ L2  SDK                                         游戏作者用的工具箱 │
│                                                                    │
│   Game<S> 接口 · GameEnv 投影 · GameRegistry                       │
├────────────────────────────────────────────────────────────────────┤
│ L1  Games                                           纯函数、可插拔 │
│                                                                    │
│   snake/    tetris/                                                │
└────────────────────────────────────────────────────────────────────┘

         ↓ engine / sdk / games 两端复用；平台差异锁在 platform/ ↓

┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│ 浏览器运行时                     │     │ Node 训练运行时                  │
│ (src/platform/browser/ + ui/)    │     │ (src/platform/headless/)         │
│                                  │     │                                  │
│ RealtimeTicker                   │     │ HeadlessTicker                   │
│ Canvas renderer + <Device/>      │     │ Screen buffer only (无渲染)      │
│ Keyboard / Touch InputBus 桥接   │     │ Policy 驱动 InputBus             │
│ WebAudio Sound (sample +         │     │ Null Sound                       │
│   oscillator)                    │     │                                  │
│ LocalStorage                     │     │ Memory Storage                   │
│ tfjs (推理)                      │     │ tfjs-node (训练)                 │
└──────────────────────────────────┘     └──────────────────────────────────┘
                                            │
                                     训练完写出 model.json
                                            │
                                            ↓
                              浏览器 Dashboard (training.html)
                              指标曲线 + 当前 Episode 回放
```

### 2.2 分层核心原则

| 原则                     | 说明                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| **严格单向依赖**         | L1 → L2 → L3，上层只能向下引用，下层不知道上层存在               |
| **L3 完全 DOM-agnostic** | Engine 层禁止 import React / DOM API，确保可在 Node 训练         |
| **L1 Game 是纯函数**     | `init / step / onButton / render` 全部 pure，除 `env` 外无副作用 |
| **随机性走 `ctx.rng`**   | 禁用 `Math.random()` / `Date.now()`，保证确定性可回放            |
| **UI 与状态分离**        | L4 组件只订阅不修改，所有状态变更经由 L3 API                     |

---

## 3. 核心接口定义

### 3.1 L3 Engine

接口集中定义在 `src/engine/types.ts`，下面是与运行时实现对齐的当前签名：

```ts
// Screen —— 纯 framebuffer，硬件屏幕的抽象
interface Screen {
  readonly width: number;
  readonly height: number;
  readonly buffer: Uint8Array; // 长度 = width * height，每字节 0/1
  setPixel(x: number, y: number, on: boolean): void;
  getPixel(x: number, y: number): boolean;
  blit(x: number, y: number, bitmap: Bitmap, mode?: 'overwrite' | 'or' | 'xor'): void;
  commit(buffer: Uint8Array): void;
  clear(): void;
  subscribe(fn: () => void): () => void;
}

// Ticker —— 固定步长循环
interface Ticker {
  readonly speed: number; // ticks/second（语义约定，驱动方式由实现决定）
  readonly tickCount: number; // 已推进 tick 总数，作为逻辑时钟
  start(onTick: () => void): void;
  stop(): void;
  pause(): void;
  resume(): void;
  setSpeed(ticksPerSecond: number): void;
}

// 具体实现：
//   src/platform/browser/  RealtimeTicker  requestAnimationFrame + 累积器
//   src/platform/headless/ HeadlessTicker  非自驱，外部 advance 推进（训练 / 测试）

// InputBus —— 统一按键总线
type Button =
  | 'Up'
  | 'Down'
  | 'Left'
  | 'Right'
  | 'A'
  | 'B'
  | 'Start'
  | 'Select'
  | 'Pause'
  | 'Sound'
  | 'Reset';

// 'press' 首次按下；'repeat' 平台层 long-press 节奏；'release' 抬起
type ButtonAction = 'press' | 'repeat' | 'release';

interface InputBus {
  emit(btn: Button, action: ButtonAction): void;
  subscribe(fn: (btn: Button, action: ButtonAction) => void): () => void;
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

// Sound —— 8-bit 音效抽象
//   browser 实现：移动 / 死亡走 sample 切片（public/sounds/sfx.m4a），
//                  其它走 WebAudio Oscillator 合成；masterGain 实时静音
//   headless 实现：Null Sound（所有方法 no-op）
interface Sound {
  readonly enabled: boolean;
  play(effect: SoundEffect): void;
  /** 播放音符序列；返回 cancel 以中止尾段 */
  playMelody(notes: ReadonlyArray<Note>): () => void;
  setEnabled(on: boolean): void;
  /** 探测当前能否在无用户手势下发声（autoplay 策略）*/
  canAutoplay(): Promise<boolean>;
}

// Storage —— 键值持久化抽象
interface Storage {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
}

// HardwareContext —— 游戏看到的"硬件上下文"聚合
interface HardwareContext {
  screen: Screen;
  /** 4×2 副屏，画下一块 / 辅助信息；UI 订阅渲染到 SidePanel */
  auxScreen: Screen;
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

  rng: () => number; // 0..1，mulberry32 seeded PRNG
  now: () => number; // 逻辑时钟（= ticker.tickCount，禁用 wall-clock）
}

// 两种 Context 构造函数（按运行环境从对应 platform 子目录导入）：
//   import { createBrowserContext  } from '@/platform/browser'   浏览器运行时
//   import { createHeadlessContext } from '@/platform/headless'  Node 训练 / 测试
```

### 3.2 L2 SDK

```ts
// GameEnv —— 游戏看到的 HardwareContext 切片
//   屏蔽 Ticker / Storage / pause / soundOn 等"应用级"权限；游戏只摸
//   屏幕 / 输入 / 音效 / RNG / 逻辑时钟 / 计数器
interface GameEnv {
  readonly screen: Screen;
  readonly auxScreen: Screen;
  readonly input: InputBus;
  readonly sound: Sound;
  readonly rng: () => number;
  readonly now: () => number;
  readonly score: Counter;
  readonly level: Counter;
  readonly speed: Counter;
  readonly lives: Counter;
}

interface GameInitOptions {
  readonly speed: number; // 1..9，菜单选择得来
  readonly level: number; // 1..9
}

// Game —— 核心接口，每款游戏一个实现。仅 id / name / preview 必填，
// 其它字段缺省即视为 preview-only 占位条目（菜单可见但按 A 不进游戏）
interface Game<S = unknown> {
  readonly id: string;
  readonly name: string;
  readonly preview: ReadonlyArray<readonly [number, number]>;
  /** 9 档起始 tick 速度，index 与菜单 speed-1 对应 */
  readonly tickSpeeds?: readonly number[];
  readonly tickSpeed?: number;

  init?(env: GameEnv, opts?: GameInitOptions): S;
  step?(env: GameEnv, state: S): S;
  render?(env: GameEnv, state: S): void;
  onButton?(env: GameEnv, state: S, btn: Button, action: ButtonAction): S;
  isGameOver?(state: S): boolean;
  /** 游戏内动画期（如消行 / 死亡爆炸），App 据此切固定 anim tick 速 */
  isAnimating?(state: S): boolean;
  /** 选关界面 demo 演示（可选） */
  demoInit?(env: GameEnv): S;
  demoStep?(env: GameEnv, state: S): S;
}

// GameRegistry —— 冻结列表，O(1) id 查找
interface GameRegistry {
  list(): ReadonlyArray<Game>;
  get(id: string): Game | undefined;
}

// Gym-like 抽象（用于 RL 训练）写在游戏自己的 rl.ts 旁边，按需 export，
// 不强约束所有游戏都暴露 —— 目前只有 Snake 实现（src/games/snake/rl.ts）
```

### 3.3 游戏循环（App 状态机驱动）

App 是个四态状态机（`src/app/App.tsx`），由 `useReducer` 推进，所有副作用集中在 `useEffect`：

```text
        Start (autoplay 允许或玩家按下)
   off  ───────────────────────────────►  boot  (开机动画 + Korobeiniki 旋律)
    ▲                                      │
    │      Start                           │ 任意按键
    │ ◄────────────                        ▼
    │                                    select  (方向键切游戏；Up/Down 调 speed/level；
    │                                              B 在 snake 上加载 AI 模型)
    │      Start                           │
    │ ◄────────────                        │ A
    │                                      ▼
    │      Start                         playing  (游戏 step 循环；
    └──────────────────────────────────             Reset 重开局；Select 回菜单)
```

主循环伪代码：

```ts
ctx.input.subscribe((btn, action) => {
  // 关机：只允许 Start 通电，其它按键全部短路
  if (mode === 'off') {
    if (action === 'press' && btn === 'Start') powerOn();
    return;
  }
  // 控制键（Start / Pause / Sound / Reset）只响 press，处理完即 return
  if (action === 'press') handleControlKeys(btn);
  // 游戏键 → reducer → game.onButton(env, state, btn, action)
  dispatch({ type: 'INPUT', button: btn, kind: action });
});

ctx.ticker.start(() => dispatch({ type: 'TICK' }));
// reduce(TICK) → 按 mode 调 stepBoot / demoStep / game.step
```

确定性约束依然成立：reducer 是纯函数；副作用通过 `GameEnv.sound.play` / `Counter.set` 等 SDK 公开出口走，不破坏 reducer 自身的"同输入同输出"语义。

---

## 4. 渲染与主题

### 4.1 渲染策略：Declarative Full-Redraw

每 tick 执行 `scene.clear() → game.render(state, scene) → screen.commit(scene.buffer)`，即 **声明式全量重绘**。

- 游戏代码只描述 _当前状态应该长什么样_，不用管 _上一帧长什么样_
- 天然支持游戏切换、暂停、回放 —— 给一个 state 就能画出对应画面
- 状态是唯一事实来源，渲染是 state 的纯函数

**性能不是问题**：10×20 = 200 像素，全量重绘开销可忽略。

### 4.2 Renderer

当前 L4 的 `ContentScreen` 用 **Canvas2D** 实现：`<canvas>` + `fillRect` 绘 LCD 阴影格背景与点亮像素。订阅 `Screen.subscribe` 在 buffer 变化时重绘整块（200 像素，开销可忽略）。

**规划支持多 renderer 切换**：DOM / Canvas2D / WebGL 三选一，运行时切换。三者都基于 `Screen.subscribe` + `Screen.buffer` 平行实现，只换视图层不动数据：

| Renderer | 实现要点                            | 适用                  |
| -------- | ----------------------------------- | --------------------- |
| DOM      | 200 个 `<div>` + CSS                | 调试 / 单像素可检查   |
| Canvas2D | `<canvas>` + `fillRect`（当前默认） | 性能 / 主题绘制       |
| WebGL    | 原生 shader 或 Three.js             | 后续 CRT 滤镜等可选项 |

主题系统（点亮像素颜色 / 形状）也走类似机制 —— 留作后续迭代。

刻意 **不做**：CRT 扫描线 / 暗角效果。Brick Game 是固定点阵 LCD，不是 CRT，那些效果违和。

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

覆盖从编码到发布的 AI 辅助闭环；表内每行对应仓库里能看到实物的位置。

| #   | 模块          | 技术选型                            | 当前落地点                                                                                   |
| --- | ------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | **编码规范**  | `AGENTS.md` + `.cursor/rules/*.mdc` | 项目根 + 各层目录 `AGENTS.md`，pre-commit `eslint --fix` + `prettier --write`                |
| 2   | **Skills**    | Cursor Skills                       | `.cursor/skills/add-game/`：新游戏骨架生成 + Registry 注册                                   |
| 3   | **自动 PR**   | `gh` CLI                            | AI 助手按 `AGENTS.md` 走"先 CR 再 `gh pr create`"流程，不要求 GitHub App                     |
| 4   | **远端 CR**   | CodeRabbit + Gemini Code Assist     | `.coderabbit.yaml` / `.gemini/`，PR 自动评论 + 与本地规则互补                                |
| 5   | **RL 玩游戏** | tfjs-node 训练 + tfjs 推理 + DQN    | `src/ai/`（dqn/replay/train/inference）+ `src/games/snake/rl.ts`，模型在 `models/snake-dqn/` |
| 6   | **训练 UI**   | Vite 多入口 + ECharts               | `training.html` + `src/training/`，浏览器端可视化训练曲线                                    |
| 7   | **AI 测试**   | Vitest 4 + jsdom + AudioContext 桩  | `__tests__/` 全层覆盖，含 RL 网络结构、状态机、声音通路                                      |

未来计划：Playwright MCP 接入 visual regression、PR 模型门禁；尚未落地，写在 backlog 里。

---

## 7. 技术栈

| 层      | 技术                                             | 理由                                                           |
| ------- | ------------------------------------------------ | -------------------------------------------------------------- |
| 语言    | TypeScript 6                                     | 接口复杂度高、RL 泛型多                                        |
| 构建    | Vite 8                                           | 快、生态新、tfjs 友好                                          |
| UI      | React 19                                         | 生态成熟、Hooks 模型稳定                                       |
| 状态    | useReducer + Zustand（按需）                     | App 主状态机用 useReducer 已够；跨组件共享留 Zustand 槽位      |
| 样式    | CSS Modules                                      | 像素艺术组件数量少，不需要 utility-first                       |
| 音效    | WebAudio (sample + Oscillator)                   | move/over 走预录 sample 切片保证还原度，其它走单 OSC 节省体积  |
| RL 训练 | @tensorflow/tfjs-node                            | 同 JS 全栈、engine 代码复用                                    |
| RL 推理 | @tensorflow/tfjs                                 | 配套、模型格式一致                                             |
| 训练 UI | training.html + ECharts                          | 直接用 Vite 多入口在浏览器跑训练 + 可视化，不引服务端依赖      |
| 测试    | Vitest 4 + jsdom                                 | Vite 原生、ESM 友好；jsdom 跑 React 组件层 + AudioContext 桩   |
| Lint    | ESLint 9 (flat) + Prettier 3                     | flat config + 项目级硬规则（no-restricted-globals 拦截随机源） |
| CI      | GitHub Actions + CodeRabbit / Gemini Code Assist | master push 自动构建 + rsync 部署；PR 自动双 AI Review         |

---

## 8. 目录结构

```text
react-gamebaby/
├─ docs/
│  ├─ ARCHITECTURE.md          本文档
│  └─ DEPLOY.md                master 自动部署到 VPS 流程
├─ public/
│  └─ sounds/sfx.m4a           move / over 的预录 PCM 切片源
├─ models/                     训练产物（Snake DQN model.json + weights）
├─ src/
│  ├─ engine/                  L3 Engine：接口 + 跨平台通用实现 (DOM-agnostic)
│  │  ├─ types.ts              所有接口定义（Screen / Ticker / InputBus / Sound / ...）
│  │  ├─ screen.ts             framebuffer
│  │  ├─ input.ts              按键事件总线
│  │  ├─ counter.ts            Counter / Toggle / PersistentToggle
│  │  ├─ sound.ts              createNullSound（headless 默认）
│  │  ├─ storage.ts            createMemoryStorage（headless 默认）
│  │  └─ rng.ts                mulberry32 可播种 PRNG
│  ├─ platform/                平台适配层
│  │  ├─ headless/             Node / 训练 / 单测
│  │  │  ├─ ticker.ts          createHeadlessTicker（非自驱）
│  │  │  └─ context.ts         createHeadlessContext（复用 engine null/memory 实现）
│  │  └─ browser/              浏览器
│  │     ├─ ticker.ts          createRealtimeTicker（requestAnimationFrame）
│  │     ├─ input.ts           bindKeyboardInput（键盘桥接 + long-press repeat 节奏）
│  │     ├─ storage.ts         createLocalStorage
│  │     ├─ sound.ts           createBrowserSound（WebAudio sample + oscillator）
│  │     └─ context.ts         createBrowserContext
│  ├─ sdk/                     L2 SDK
│  │  ├─ types.ts              Game<S> / GameEnv / GameInitOptions
│  │  ├─ env.ts                toGameEnv(ctx) 投影
│  │  └─ registry.ts           defaultGames 注册表
│  ├─ games/                   L1 Games（纯函数）
│  │  ├─ snake/                state / logic / index / rl
│  │  └─ tetris/               state / logic / index
│  ├─ ui/                      L4 UI
│  │  ├─ Device/               外壳容器
│  │  ├─ ContentScreen/        Canvas2D 主屏渲染
│  │  ├─ SidePanel/            分数 / hi-score / aux 副屏 / speed / level 等
│  │  ├─ Buttons/              方向键 + 功能键面板
│  │  └─ locale/               按钮标签 i18n（按浏览器首选语言一次装配）
│  ├─ ai/                      RL 通用层
│  │  ├─ dqn.ts                DQN 网络结构
│  │  ├─ replay-buffer.ts      经验回放
│  │  ├─ rl-env.ts             Game → Gym-like 适配
│  │  ├─ train.ts              tsx 跑的 Node 训练 CLI
│  │  └─ inference.ts          浏览器端模型加载 + agent.act
│  ├─ training/                浏览器训练 dashboard（training.html 入口）
│  │  ├─ TrainingApp.tsx       UI shell
│  │  ├─ Dashboard.tsx         ECharts 指标曲线
│  │  └─ useTrainingData.ts    训练事件订阅
│  └─ app/                     游戏主入口
│     ├─ App.tsx               四态状态机（off/boot/select/playing）
│     ├─ boot-animation.ts     开机动画
│     ├─ boot-melody.ts        Korobeiniki 音符序列
│     ├─ menu.ts               游戏菜单 reducer
│     └─ main.tsx              ReactDOM.render 入口
├─ .cursor/
│  ├─ rules/                   Cursor AI 规则
│  └─ skills/                  add-game 等技能
├─ .github/workflows/          CI（lint + test + build + 部署）
├─ .coderabbit.yaml            CodeRabbit AI CR 配置
├─ .gemini/                    Gemini Code Assist 配置 + styleguide
├─ AGENTS.md                   编码规范 / 协作流程（人 + AI 共同遵守）
├─ index.html                  游戏入口
├─ training.html               训练 dashboard 入口
├─ package.json / tsconfig.json / vite.config.ts / vitest.config.ts
```

---

## 9. 命名规范

| 类型              | 风格              | 例子                    |
| ----------------- | ----------------- | ----------------------- |
| 文件 / 目录       | kebab-case        | `replay-buffer.ts`      |
| React 组件目录    | PascalCase        | `ContentScreen/`        |
| TypeScript 类型   | PascalCase        | `HardwareContext`       |
| 变量 / 函数       | camelCase         | `createScreen`          |
| 常量              | UPPER_SNAKE_CASE  | `DEFAULT_SEED`          |
| Button 枚举       | PascalCase 字面量 | `'Start'`               |
| 接口              | 不加 `I` 前缀     | `Screen` 而非 `IScreen` |
| 模板 / 非内容目录 | `_` 前缀          | `games/_template/`      |

---

## 10. 实现进度

当前已落地：

- L3 Engine 接口 + 跨平台通用实现（Screen / Ticker / InputBus / Counter / Toggle / Sound / Storage / RNG）
- Platform 双实现：`headless`（Node 训练 / Vitest）+ `browser`（含 WebAudio Sound、LocalStorage、键盘 long-press repeat 节奏）
- L2 SDK：`Game<S>` 接口、`GameEnv` 投影、`defaultGames` 注册表
- L1 Games：Snake（含 RL 适配 `rl.ts`）+ Tetris
- L4 UI：Device / ContentScreen（Canvas2D）/ SidePanel / Buttons + 多语言按钮标签
- App 状态机：off / boot / select / playing 四态 + 开机旋律 + 选关 demo + AI 自动玩
- AI：tfjs-node 训练（`pnpm train`）+ tfjs 浏览器推理 + 训练 dashboard（`training.html`）
- AI 工程基础设施：`AGENTS.md` + 各层 `AGENTS.md` + `.cursor/skills/add-game/` + CodeRabbit / Gemini Code Assist + GitHub Actions（lint/test/build/部署）

Backlog（顺序无承诺）：

- **多 renderer 切换**：DOM / Canvas2D / WebGL 三选一，运行时切换；同步落地像素主题系统（颜色 / 形状）
- 第二款 RL 游戏（Tetris RL env）
- Playwright MCP 驱动 visual regression
- PR 阶段的模型回归门禁（推理胜率 / Episode 长度退化即拦截）

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

| 术语            | 含义                                                          |
| --------------- | ------------------------------------------------------------- |
| Screen          | L3 硬件抽象的 framebuffer（数据），10×20 主屏 + 4×2 副屏      |
| ContentScreen   | L4 主显示 UI 组件（视图，订阅 Screen 重绘）                   |
| Device          | L4 最外层容器（外壳 + 屏幕 + SidePanel + Buttons）            |
| Ticker          | 固定步长游戏循环；Realtime 用 RAF，Headless 由调用方推进      |
| HardwareContext | 游戏能看到的"硬件上下文"聚合（L3）                            |
| GameEnv         | HardwareContext 的安全切片（L2，给游戏使用）                  |
| Mode            | App 状态机阶段：`off / boot / select / playing`               |
| Episode         | 一局完整游戏的回放包 `{ seed, actions }`                      |
| boot melody     | 开机时播放的 Korobeiniki 音符序列（`src/app/boot-melody.ts`） |
