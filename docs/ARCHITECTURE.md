# react-gamebaby · 架构设计

> 本文档是项目的单一事实来源 (Single Source of Truth)。
> 所有 AI agent、Cursor Skill、CodeRabbit review、以及人类协作者都应以本文档为准。

## 1. 项目定位

模拟一台 Brick Game 9999-in-1 复古掌机，承载多款经典游戏（Snake / Tetris / Tank / ...），同时是一套端到端 AI 工程化实践的参考实现。

两条并行主线：

1. 产品主线：还原复古掌机的外观与操作体验，包括 LCD 点阵显示、8bit 音效和实体按键，多游戏可插拔。
2. AI 工程化主线：沉淀一套可复用的 AI 开发实践（规范、Skills、自动 PR、远端 CR、RL 游戏 AI、AI 测试、文档自动化），其他项目可直接参考或复制。

非目标（out of scope）：

- 不追求逐字节还原 Brick Game 硬件行为（不模拟 LCD 扫描时序、不模拟真实按键去抖）
- 不追求 SOTA 的 RL 算法（选择 DQN baseline，优先代码清晰与可复现性）
- 不追求大模型驱动（游戏 AI 走 RL，不用 LLM）

---

## 2. 整体架构

### 2.1 分层

代码分为核心与外围两圈。核心是纯 TS，不依赖 React 与宿主 API，可在 Node 里确定性地运行；外围负责把核心接到具体运行环境上。

```text
┌─ 核心 ─────────────────────────────────────────────────────────────┐
│                                                                    │
│  machine/   主机固件      模式状态机 off/boot/select/playing        │
│                           菜单 · 开机动画与音乐 · 按键路由          │
│                           调速 · 每帧绘制 · 最高分 · 自动玩钩子     │
│     │                                                              │
│     ▼                                                              │
│  sdk/       游戏契约      Game<S> · GameEnv 投影 · GameRegistry     │
│     ▲                                                              │
│     │                                                              │
│  games/     各款游戏      snake/ · tetris/ · tank/（纯函数）        │
│                                                                    │
│  engine/    硬件接口      Screen · Ticker · InputBus · Sound ·      │
│                           Storage · Counter · RNG · 长按连发        │
│             （以上三者都依赖 engine）                               │
└────────────────────────────────────────────────────────────────────┘
┌─ 外围 ─────────────────────────────────────────────────────────────┐
│                                                                    │
│  platform/  宿主驱动，只依赖 engine                                 │
│    headless/   HeadlessTicker · HeadlessContext（Node 训练 / 测试） │
│    browser/    RealtimeTicker · LocalStorage · WebAudio Sound ·     │
│                键盘 · 返回键 · 前后台 · 离线缓存 · BrowserContext   │
│    wechat/     wx 存储 · 触控 · WebAudio · 前后台 · WechatContext   │
│                                                                    │
│  ui/        React 视图：Device · ContentScreen · SidePanel · Buttons│
│                                                                    │
│  app/       入口装配，每个运行入口一个子目录                        │
│    web/        网页与 Android WebView：browser 平台 + machine + ui  │
│    wechat/     微信小游戏：wechat 平台 + machine + canvas 机身      │
└────────────────────────────────────────────────────────────────────┘
  工具：ai/（DQN 训练与推理）· training/（训练看板）
```

一个入口做的事情：用对应平台创建 `HardwareContext`，把它和游戏注册表交给 `createMachine`，再把宿主事件（键盘、返回键、前后台）接到 machine，并把 machine 的状态渲染出来。网页入口（`app/web/`）用 React 渲染，微信小游戏入口（`app/wechat/`）用 canvas 渲染，共用同一个 machine。

Node 训练不经过 machine：`ai/` 用 `platform/headless` 加单款游戏直接跑，训练完写出 `model.json`，网页入口通过 machine 的自动玩钩子加载推理。

### 2.2 依赖规则

| 目录         | 可以依赖                                      |
| ------------ | --------------------------------------------- |
| `engine`     | 无                                            |
| `sdk`        | `engine`                                      |
| `games`      | `sdk`、`engine`                               |
| `machine`    | `sdk`、`engine`；具体游戏由入口通过注册表传入 |
| `platform/*` | `engine`；子目录之间互不依赖                  |
| `ui`         | `engine` 的类型                               |
| `app/*`      | 全部                                          |

例外：`games/<name>/rl.ts` 是 RL 训练适配，可额外依赖 `ai` 与 `platform/headless`，游戏的 `index.ts` 不引入它。

其他原则：

| 原则               | 说明                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| 核心不碰宿主       | 核心禁止 import React、使用 DOM 与宿主计时器；需要计时时由调用方注入 |
| 游戏是纯函数       | `init / step / onButton / render` 除 `env` 外无副作用                |
| 随机性走 `ctx.rng` | 禁用 `Math.random()` / `Date.now()`，保证确定性可回放                |
| 主机规则只有一份   | 开关机、菜单、暂停、调速等写在 machine，各入口只做装配               |
| UI 与状态分离      | ui 组件只订阅不修改，状态变更经由 engine 接口或 machine 的方法       |

新文件放哪：先问它需要知道游戏接口吗，不需要放 engine；需要的话，游戏作者使用的放 sdk，负责调度游戏的放 machine。

---

## 3. 核心接口定义

### 3.1 engine

接口集中定义在 `src/engine/types.ts`，下面是与运行时实现对齐的当前签名：

```ts
// Screen：纯 framebuffer，硬件屏幕的抽象
interface Screen {
  readonly width: number;
  readonly height: number;
  readonly buffer: Uint8Array; // 长度 = width * height，每字节 0/1
  setPixel(x: number, y: number, on: boolean): void;
  getPixel(x: number, y: number): boolean;
  blit(x: number, y: number, bitmap: Bitmap, mode?: 'overwrite' | 'or' | 'xor'): void;
  commit(buffer: Uint8Array): void;
  clear(): void;
  batch(fn: () => void): void; // fn 内的写操作合并为最多一次订阅通知
  subscribe(fn: () => void): () => void;
}

// Ticker：固定步长循环
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

// InputBus：统一按键总线
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

// 'press' 首次按下；'repeat' 长按连发（engine 的 bindPressRepeat 产生）；'release' 抬起
type ButtonAction = 'press' | 'repeat' | 'release';

interface InputBus {
  emit(btn: Button, action: ButtonAction): void;
  subscribe(fn: (btn: Button, action: ButtonAction) => void): () => void;
  readonly pressed: ReadonlySet<Button>;
}

// Counter / Toggle：可订阅的原子状态
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

// Sound：8-bit 音效抽象
//   browser 实现：移动 / 死亡走 sample 切片（public/sounds/sfx.m4a），
//                  其它走 WebAudio Oscillator 合成；masterGain 实时静音
//   以上逻辑在 engine 的 createSynthSound，浏览器 / 小游戏只注入音频上下文与采样加载
//   headless 实现：Null Sound（所有方法 no-op）
interface Sound {
  readonly enabled: boolean;
  play(effect: SoundEffect): void;
  /** 播放音符序列；返回 cancel 以中止尾段 */
  playMelody(notes: ReadonlyArray<Note>): () => void;
  setEnabled(on: boolean): void;
  /** 进后台 / 回前台时挂起与恢复音频，不改变 enabled */
  suspend(): void;
  resume(): void;
  /** 探测当前能否在无用户手势下发声（autoplay 策略）*/
  canAutoplay(): Promise<boolean>;
}

// Storage：键值持久化抽象
interface Storage {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
}

// HardwareContext：游戏看到的硬件上下文聚合
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

### 3.2 sdk

```ts
// GameEnv：游戏看到的 HardwareContext 切片
//   屏蔽 Ticker / Storage / pause / soundOn 等应用级权限；游戏只能访问
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

// Game：核心接口，每款游戏一个实现。仅 id / name / preview 必填，
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
  /** 游戏内动画期（如消行 / 死亡爆炸），machine 据此切固定 anim tick 速 */
  isAnimating?(state: S): boolean;
  /** 选关界面 demo 演示（可选） */
  demoInit?(env: GameEnv): S;
  demoStep?(env: GameEnv, state: S): S;
}

// GameRegistry：冻结列表，O(1) id 查找
interface GameRegistry {
  list(): ReadonlyArray<Game>;
  get(id: string): Game | undefined;
}

// Gym-like 抽象（用于 RL 训练）写在游戏自己的 rl.ts 旁边，按需 export，
// 不强约束所有游戏都暴露；目前只有 Snake 实现（src/games/snake/rl.ts）
```

### 3.3 machine：主机固件

`createMachine({ ctx, games, seed, autopilot })`（`src/machine/machine.ts`）持有四态状态机，订阅 `ctx.input` 与 `ctx.ticker`，状态变化后同步完成调速、绘制、暂停与最高分更新。入口只调用 `start` / `stop` / `suspend` / `resume`，并通过 `subscribe` + `getState` / `getHiScore` 观察状态：

```ts
interface Machine {
  getState(): MachineState; // mode / menu / playingId / gameState / aiPlaying ...
  getHiScore(): number; // 当前游戏或菜单选中游戏的最高分
  subscribe(fn: () => void): Unsubscribe;
  start(): void; // 订阅输入、启动 ticker；能直接发声时自动通电
  stop(): void;
  powerOn(): void;
  suspend(): void; // 进入后台
  resume(): void; // 回到前台
}

// 自动玩钩子：select 态在 gameId 对应的游戏上按 B 时 load，之后每 tick 调 act 注入按键
interface AutopilotProvider {
  gameId: string;
  load(): Promise<{ act(gameState: unknown): Button | null; dispose(): void }>;
}
```

状态流转：

```text
        Start (autoplay 允许或玩家按下)
   off  ───────────────────────────────►  boot  (开机动画 + 开机音乐)
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
  // 关机：只允许 Start 通电，其它按键全部忽略
  if (mode === 'off') {
    if (action === 'press' && btn === 'Start') powerOn();
    return;
  }
  // 控制键（Start / Pause / Sound / Reset）只响应 press，处理完即返回
  if (action === 'press') handleControlKeys(btn);
  // playing 态的游戏键先缓存，其它按键立即进 reducer
  if (mode === 'playing' && isGameKey(btn)) pendingKeys.push({ btn, action });
  else dispatch({ type: 'INPUT', button: btn, kind: action });
});

ctx.ticker.start(() => {
  // 帧开头按顺序送达缓存的游戏键与自动玩按键，再推进这一帧，计时约定见 sdk Game.onButton
  for (const k of pendingKeys) dispatch({ type: 'INPUT', button: k.btn, kind: k.action });
  if (piloting) dispatch({ type: 'INPUT', button: pilot.act(gameState), kind: 'press' });
  dispatch({ type: 'TICK' });
});
// reduce(INPUT) → game.onButton(env, state, btn, action)
// reduce(TICK) → 按 mode 调 stepBoot / demoStep / game.step
// dispatch 后：设置 ticker 速度 → screen.batch 内绘制 → 应用暂停 → 更新最高分 → 通知订阅者
```

确定性约束依然成立：reducer 是纯函数；副作用通过 `GameEnv.sound.play` / `Counter.set` 等 SDK 公开出口走，不破坏 reducer 自身的同输入同输出语义。select 态 demo 的随机种子由 `seed` 派生，machine 内部不读取真实时间；自动玩 game over 后的重开等待按 tick 计数。

---

## 4. 渲染与主题

### 4.1 渲染策略：Declarative Full-Redraw

每次 state 变化，machine 在 `screen.batch()` 内调用 `game.render(env, state)`，游戏先 `screen.clear()` 再按当前 state 画出整屏，即声明式全量重绘。

- 游戏代码只描述当前状态对应的画面，无需关心上一帧的状态
- 天然支持游戏切换、暂停、回放：给定一个 state 就能画出对应画面
- 状态是唯一事实来源，渲染是 state 的纯函数

全量重绘发生在 Screen buffer 层：10×20 = 200 像素，开销可忽略。显示层的增量更新由渲染器负责（见 4.2），游戏侧不做脏区管理。

### 4.2 Renderer

`ContentScreen` 通过 `renderer` prop（`'dom'` | `'canvas'`，默认 `'dom'`）选择具体渲染器，样式默认值只在这一处补齐。默认的 `DomScreen` 是保留式 DOM 像素格：`width×height` 个长期存在的 `<div>` 格子（外框 + 内方块，熄灭态按半透明底色画出），模拟真机 LCD 阴影格。格子在尺寸不变时只创建一次，不随游戏 tick 重建；订阅 `Screen.subscribe` 后只更新亮灭状态发生变化的格子的 `data-on` 属性，配合 Screen 的 `batch()`（见下），每帧的 DOM 写入次数与变化格数成正比。

通知批处理（`Screen.batch`）：单次 `setPixel` 默认立即通知，但一次 `game.render()` 常做上百次 `setPixel`，逐次通知会让渲染器整屏重画上百遍。machine 把整段绘制包在 `screen.batch(() => auxScreen.batch(paint))` 里，使主屏 / 副屏每逻辑帧各只通知订阅者一次。该语义在 engine 内实现（DOM-agnostic），Web / 原生 / 小游戏渲染器共享。

`CanvasScreen` 订阅后整屏重画，位图按 `devicePixelRatio` 放大保证高分屏清晰。绘制逻辑抽在纯函数 `drawLcd(ctx, screen, style)` 里，只依赖最小 2D 绘图接口 `LcdContext2D`，不绑定 DOM 类型，微信 / 抖音小游戏的 canvas 可直接复用。

多 renderer 切换：三者都基于 `Screen.subscribe` + `Screen.buffer` 平行实现，只换视图层不动数据。DOM / Canvas2D 已落地，运行时切换的 UI 入口与 WebGL 待做：

| Renderer | 实现要点                        | 状态           | 适用                         |
| -------- | ------------------------------- | -------------- | ---------------------------- |
| DOM      | `width×height` 个 `<div>` + CSS | 已实现（默认） | 真机 LCD 质感 / 单像素可检查 |
| Canvas2D | `<canvas>` + `drawLcd`          | 已实现         | 大点阵 / 主题绘制 / 小游戏   |
| WebGL    | 原生 shader 或 Three.js         | 待做           | 后续 CRT 滤镜等可选项        |

主题系统（点亮像素颜色 / 形状）也走类似机制，留作后续迭代。

刻意不做：CRT 扫描线 / 暗角效果。Brick Game 是固定点阵 LCD，不是 CRT，这类效果与 LCD 不符。

---

## 5. 确定性设计

### 5.1 核心要求

给定 `{ seed, actions[] }`，**任意环境下重放都必须得到一致的 state 序列**。

### 5.2 硬规则

- 禁止 `Math.random()`，由 ESLint `no-restricted-globals` 拦截
- 禁止 `Date.now()` / `performance.now()` 进入游戏逻辑
- 禁止游戏 import DOM / React / window
- 所有随机走 `ctx.rng()`
- 游戏函数必须 pure（除 `ctx` 外无副作用）

### 5.3 PRNG 实现

选用 mulberry32：实现约 10 行，跨平台行为一致，伪随机质量满足游戏与 RL 训练需求：

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

一局 1000 tick 的贪吃蛇，Episode 大约 1 KB，可完整复现。

---

## 6. AI 工程化落点

覆盖从编码到发布的 AI 辅助闭环；表内每行对应仓库中的具体位置。

| #   | 模块      | 技术选型                           | 当前落地点                                                                                   |
| --- | --------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | 编码规范  | `AGENTS.md`                        | 项目根 + 各层目录 `AGENTS.md`，pre-commit `eslint --fix` + `prettier --write`                |
| 2   | Skills    | Cursor Skills                      | `.cursor/skills/add-game/`：新游戏骨架生成 + Registry 注册                                   |
| 3   | 自动 PR   | `gh` CLI                           | AI 助手按 `AGENTS.md` 走"先 CR 再 `gh pr create`"流程，不要求 GitHub App                     |
| 4   | 远端 CR   | CodeRabbit                         | `.coderabbit.yaml`，PR 自动评论 + 与本地规则互补                                             |
| 5   | RL 玩游戏 | tfjs-node 训练 + tfjs 推理 + DQN   | `src/ai/`（dqn/replay/train/inference）+ `src/games/snake/rl.ts`，模型在 `models/snake-dqn/` |
| 6   | 训练 UI   | Vite 多入口 + ECharts              | `training.html` + `src/training/`，浏览器端可视化训练曲线                                    |
| 7   | AI 测试   | Vitest 4 + jsdom + AudioContext 桩 | `__tests__/` 全层覆盖，含 RL 网络结构、状态机、声音通路                                      |

未来计划：Playwright MCP 接入 visual regression、PR 模型门禁；尚未落地，写在 backlog 里。

---

## 7. 技术栈

| 层      | 技术                           | 理由                                                                                                |
| ------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| 语言    | TypeScript 6                   | 接口复杂度高、RL 泛型多                                                                             |
| 构建    | Vite 8                         | 快、生态新、tfjs 友好                                                                               |
| UI      | React 19                       | 生态成熟、Hooks 模型稳定                                                                            |
| 状态    | machine + Zustand（按需）      | 主机状态由 machine 持有，React 用 useSyncExternalStore 订阅；需要跨组件共享 UI 状态时再引入 Zustand |
| 样式    | CSS Modules                    | 像素艺术组件数量少，不需要 utility-first                                                            |
| 音效    | WebAudio (sample + Oscillator) | move/over 走预录 sample 切片保证还原度，其它走单 OSC 节省体积                                       |
| RL 训练 | @tensorflow/tfjs-node          | 同 JS 全栈、engine 代码复用                                                                         |
| RL 推理 | @tensorflow/tfjs               | 配套、模型格式一致                                                                                  |
| 训练 UI | training.html + ECharts        | 直接用 Vite 多入口在浏览器跑训练 + 可视化，不引服务端依赖                                           |
| 测试    | Vitest 4 + jsdom               | Vite 原生、ESM 友好；jsdom 跑 React 组件层 + AudioContext 桩                                        |
| Lint    | ESLint 9 (flat) + Prettier 3   | flat config + 项目级硬规则（no-restricted-globals 拦截随机源）                                      |
| CI      | GitHub Actions + CodeRabbit    | master push 自动构建 + rsync 部署；PR 自动 AI Review                                                |

---

## 8. 目录结构

```text
react-gamebaby/
├─ docs/
│  ├─ ARCHITECTURE.md          本文档
│  ├─ DEPLOY.md                master 自动部署到 VPS 流程
│  └─ MOBILE.md                Capacitor 移动端开发说明（当前仅 Android）
├─ android/                    Capacitor Android 原生工程
├─ wechat/                     微信小游戏工程：project.config.json（miniprogramRoot 指向 dist/）
├─ capacitor.config.ts         Capacitor 配置
├─ public/
│  └─ sounds/sfx.m4a           move / over 的预录 PCM 切片源
├─ models/                     训练产物（Snake DQN model.json + weights）
├─ src/
│  ├─ engine/                  核心 · 硬件接口 + 跨平台通用实现
│  │  ├─ types.ts              所有接口定义（Screen / Ticker / InputBus / Sound / ...）
│  │  ├─ screen.ts             framebuffer
│  │  ├─ input.ts              按键事件总线
│  │  ├─ repeat.ts             bindPressRepeat 长按连发（计时器由调用方注入）
│  │  ├─ frame-ticker.ts       createFrameTicker 帧驱动 Ticker（帧调度与时钟由调用方注入）
│  │  ├─ counter.ts            Counter / Toggle / PersistentToggle
│  │  ├─ sound.ts              createNullSound（headless 默认）
│  │  ├─ synth-sound.ts        createSynthSound 采样切片 + 方波合成（音频上下文与采样加载由调用方注入）
│  │  ├─ storage.ts            createMemoryStorage（headless 默认）
│  │  └─ rng.ts                mulberry32 可播种 PRNG
│  ├─ sdk/                     核心 · 游戏契约
│  │  ├─ types.ts              Game<S> / GameEnv / GameInitOptions
│  │  ├─ env.ts                toGameEnv(ctx) 投影
│  │  └─ registry.ts           createRegistry 注册表工厂
│  ├─ games/                   核心 · 各款游戏（纯函数）
│  │  ├─ index.ts              defaultGames 默认注册表
│  │  ├─ snake/                state / logic / index / rl
│  │  ├─ tetris/               state / logic / index
│  │  └─ tank/                 state / logic / index
│  ├─ machine/                 核心 · 主机固件
│  │  ├─ machine.ts            createMachine：四态状态机、按键路由、调速、绘制、最高分、自动玩钩子
│  │  ├─ menu.ts               游戏菜单 reducer
│  │  ├─ boot-animation.ts     开机动画
│  │  └─ boot-melody.ts        开机音乐音符序列
│  ├─ platform/                外围 · 宿主驱动
│  │  ├─ headless/             Node / 训练 / 单测
│  │  │  ├─ ticker.ts          createHeadlessTicker（非自驱）
│  │  │  └─ context.ts         createHeadlessContext（复用 engine null/memory 实现）
│  │  ├─ browser/              浏览器与 Android WebView
│  │  │  ├─ ticker.ts          createRealtimeTicker（requestAnimationFrame 驱动 engine 的 FrameTicker）
│  │  │  ├─ input.ts           bindKeyboardInput（键盘桥接）+ timeoutSchedule
│  │  │  ├─ storage.ts         createLocalStorage
│  │  │  ├─ sound.ts           createBrowserSound（new AudioContext + fetch 采样）
│  │  │  ├─ back-button.ts     bindBackButton（Android 系统返回键桥接）
│  │  │  ├─ app-state.ts       bindAppState（前后台切换桥接）
│  │  │  ├─ app-info.ts        isDevBuild（开发版识别）
│  │  │  ├─ offline.ts         setupOfflineCache（Service Worker 注册与清理）
│  │  │  └─ context.ts         createBrowserContext
│  │  └─ wechat/               微信小游戏
│  │     ├─ api.ts             用到的 wx 能力的最小类型声明
│  │     ├─ storage.ts         createWxStorage（wx 同步存储）
│  │     ├─ touch.ts           bindTouchInput（多指触控 → InputBus）
│  │     ├─ lifecycle.ts       bindAppLifecycle（wx.onShow / onHide）
│  │     ├─ sound.ts           createWechatSound（wx.createWebAudioContext + 包内采样）
│  │     └─ context.ts         createWechatContext
│  ├─ ui/                      外围 · React 视图
│  │  ├─ Device/               外壳容器
│  │  ├─ ContentScreen/        DOM 像素格主屏渲染
│  │  ├─ SidePanel/            分数 / hi-score / aux 副屏 / speed / level 等
│  │  ├─ Buttons/              方向键 + 功能键面板
│  │  └─ locale/               按钮标签 i18n（按浏览器首选语言一次装配）
│  ├─ app/                     外围 · 入口装配
│  │  ├─ web/                  网页与 Android WebView 入口
│  │  │  ├─ main.tsx           createRoot 渲染入口 + 离线缓存配置
│  │  │  └─ App.tsx            装配 browser 平台 + machine + ui，绑定宿主事件
│  │  └─ wechat/               微信小游戏入口
│  │     ├─ main.ts            收集小游戏全局 wx / requestAnimationFrame 等并启动
│  │     ├─ app.ts             startWechatApp：装配 wechat 平台 + machine，渲染循环
│  │     ├─ layout.ts          机身布局（网页版 580 宽设计坐标 + 同样的缩放与留白规则）与触摸判定
│  │     ├─ draw.ts            canvas 复刻网页版机身；静态部分缓存为离屏图层
│  │     └─ public/            game.json（构建时复制到 wechat/dist/）
│  ├─ ai/                      工具 · RL 通用层
│  │  ├─ dqn.ts                DQN 网络结构
│  │  ├─ replay-buffer.ts      经验回放
│  │  ├─ rl-env.ts             Game → Gym-like 适配
│  │  ├─ train.ts              tsx 跑的 Node 训练 CLI
│  │  └─ inference.ts          浏览器端模型加载 + agent.act
│  └─ training/                工具 · 浏览器训练 dashboard（training.html 入口）
│     ├─ TrainingApp.tsx       看板外壳
│     ├─ Dashboard.tsx         ECharts 指标曲线
│     └─ useTrainingData.ts    训练事件订阅
├─ .cursor/
│  └─ skills/                  add-game 等技能
├─ .github/workflows/          CI（lint + test + build + 部署）
├─ .coderabbit.yaml            CodeRabbit AI CR 配置
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

- engine：接口 + 跨平台通用实现（Screen / Ticker / InputBus / Counter / Toggle / Sound / Storage / RNG / 长按连发）
- platform 双实现：`headless`（Node 训练 / Vitest）+ `browser`（含 WebAudio Sound、LocalStorage、键盘、返回键、前后台、离线缓存）
- sdk：`Game<S>` 接口、`GameEnv` 投影、注册表工厂
- games：Snake（含 RL 适配 `rl.ts`）+ Tetris + Tank
- machine：off / boot / select / playing 四态 + 开机音乐 + 选关 demo + 自动玩钩子
- ui：Device / ContentScreen（DOM 像素格）/ SidePanel / Buttons + 多语言按钮标签
- AI：tfjs-node 训练（`pnpm train`）+ tfjs 浏览器推理 + 训练 dashboard（`training.html`）
- AI 工程基础设施：`AGENTS.md` + 各层 `AGENTS.md` + `.cursor/skills/add-game/` + CodeRabbit + GitHub Actions（lint/test/build/部署）
- 微信小游戏：`src/platform/wechat/`（wx 存储、多指触控、WebAudio 音效、前后台）+ `src/app/wechat/`（canvas 复刻网页版机身，静态部分缓存为离屏图层），`pnpm wechat:build` 构建到 `wechat/dist/`，开发者工具导入 `wechat/`；不含 AI 自动玩
- 移动端混合应用：Capacitor 8（`android/`），复用同一套 Web 游戏逻辑与 UI；锁竖屏、安全区适配、系统返回键映射到 InputBus（`src/platform/browser/back-button.ts`）；iOS 暂不在迭代范围内

Backlog（顺序无承诺）：

- 微信小游戏：真机验证 WebAudio 与采样解码、发布体验版
- 多 renderer 切换：DOM / Canvas2D 已可通过 `renderer` prop 选择；待补 PC 端切换按钮（选择存 Zustand）与 WebGL 渲染器，同步落地像素主题系统（颜色 / 形状）
- 第二款 RL 游戏（Tetris RL env）
- Playwright MCP 驱动 visual regression
- PR 阶段的模型回归门禁（推理胜率 / Episode 长度退化即拦截）
- Android 启动闪屏（`@capacitor/splash-screen`）
- 把移动端专属代码（当前位于 `src/platform/browser/` 的 `back-button.ts`、`app-state.ts`、`app-info.ts`）抽到独立的 `src/platform/mobile/`，并补齐首次手势解锁 AudioContext 等行为
- Android 打包发布流水线（签名、AAB 产物、内测分发）
- iOS 端：评估上架成本与 Web 体验差异后再开（`pnpm cap add ios` 可恢复）

---

## 11. 决策记录 (ADR 简版)

| #   | 决策                                              | 取舍                                                                                       |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Screen 是纯 framebuffer，而非 Game Boy 式 PPU/OAM | 贴近 Brick Game 真实硬件，接口小                                                           |
| 2   | 游戏侧声明式全量重绘，不做脏区管理                | 游戏代码保持简单；增量更新交给渲染器                                                       |
| 3   | Node 训练 + 浏览器推理，而非浏览器训练            | tfjs-node 原生加速，I/O 方便                                                               |
| 4   | seed + PRNG，而非事件流记录                       | 复杂游戏里事件流会膨胀                                                                     |
| 5   | PAT + `gh` CLI，而非 GitHub App                   | 小型项目中 App 过度设计，CLI 方案更轻量                                                    |
| 6   | DQN baseline，不追 SOTA                           | 代码清晰、可复现优先于性能                                                                 |
| 7   | SidePanel 独立组件，而非共享 framebuffer          | 分离 metadata 与 game pixels                                                               |
| 8   | 菜单是 machine 内的独立 reducer，而非一款 Game    | 菜单要读写 speed / level 并决定进哪款游戏，属于主机规则；不需要 Game 的 step / render 循环 |
| 9   | 不做 CRT 扫描线 / 暗角                            | Brick Game 是 LCD 不是 CRT                                                                 |
| 10  | 主机规则放在 machine，不写在 React 组件里         | 网页与小游戏等多个入口共用一份规则，且可在 Node 中测试；代价是多一个目录                   |

---

## 12. 术语表

| 术语            | 含义                                                     |
| --------------- | -------------------------------------------------------- |
| Screen          | engine 的 framebuffer（数据），10×20 主屏 + 4×2 副屏     |
| ContentScreen   | ui 的主显示组件（视图，订阅 Screen 重绘）                |
| Device          | ui 的最外层容器（外壳 + 屏幕 + SidePanel + Buttons）     |
| Ticker          | 固定步长游戏循环；Realtime 用 RAF，Headless 由调用方推进 |
| HardwareContext | engine 的硬件上下文聚合，由 platform 组装                |
| GameEnv         | HardwareContext 的安全切片（sdk，给游戏使用）            |
| Machine         | 主机固件实例（`createMachine`），持有模式状态机          |
| Mode            | machine 状态机阶段：`off / boot / select / playing`      |
| Episode         | 一局完整游戏的回放包 `{ seed, actions }`                 |
| boot melody     | 开机音乐的音符序列（`src/machine/boot-melody.ts`）       |
