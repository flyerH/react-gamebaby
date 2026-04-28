/**
 * L3 Engine 共享类型与接口
 *
 * 这一层完全 DOM-agnostic：浏览器和 Node 都能运行。
 * 所有实现模块（screen / ticker / input 等）都对照此处的接口编写。
 */

/** 掌机按键 —— 方向键 + 功能键的合集 */
export type Button =
  | 'Up'
  | 'Down'
  | 'Left'
  | 'Right'
  | 'A'
  | 'B'
  | 'Start'
  | 'Select'
  | 'Sound'
  | 'Reset';

/** 按键动作：按下 / 抬起 */
export type ButtonAction = 'press' | 'release';

/** 音效标识符 —— 先给出最小集，后续游戏接入再扩展 */
export type SoundEffect = 'move' | 'rotate' | 'clear' | 'over' | 'start' | 'pause';

/** 位图：width × height 的 0/1 点阵，用于精灵、字符、图标 */
export interface Bitmap {
  readonly width: number;
  readonly height: number;
  /** 长度 = width * height，每字节取值 0 / 1 */
  readonly data: Uint8Array;
}

/** blit 的混合模式 */
export type BlitMode = 'overwrite' | 'or' | 'xor';

/** 订阅的取消函数 */
export type Unsubscribe = () => void;

/**
 * Screen —— 纯 framebuffer，硬件屏幕的抽象
 *
 * 不负责任何实际渲染；渲染器（Canvas / DOM / WebGL）通过 `subscribe`
 * 监听 buffer 变化并自行呈现。
 */
export interface Screen {
  readonly width: number;
  readonly height: number;
  /** 长度 = width * height，每字节取值 0 / 1 */
  readonly buffer: Uint8Array;
  setPixel(x: number, y: number, on: boolean): void;
  getPixel(x: number, y: number): boolean;
  blit(x: number, y: number, bitmap: Bitmap, mode?: BlitMode): void;
  /** 用外部 buffer 一次性覆盖整块屏幕（每帧 scene → screen 用） */
  commit(buffer: Uint8Array): void;
  clear(): void;
  subscribe(fn: () => void): Unsubscribe;
}

/**
 * Ticker —— 固定步长循环的抽象
 *
 * 具体驱动方式由实现决定：
 * - HeadlessTicker：外部手动 advance，不依赖真实时钟（Node 训练 / 测试）
 * - RealtimeTicker：基于 requestAnimationFrame + 累积器（浏览器运行时，后续版本实现）
 */
export interface Ticker {
  /** 当前速度，单位 ticks/second（仅语义约定，驱动方式由实现决定） */
  readonly speed: number;
  /** 已经推进的 tick 总数（逻辑时钟，供 `ctx.now` 使用） */
  readonly tickCount: number;
  start(onTick: () => void): void;
  stop(): void;
  pause(): void;
  resume(): void;
  setSpeed(ticksPerSecond: number): void;
}

/** InputBus —— 统一按键事件总线 */
export interface InputBus {
  emit(btn: Button, action: ButtonAction): void;
  subscribe(fn: (btn: Button, action: ButtonAction) => void): Unsubscribe;
  /** 当前处于按下状态的按键集合 */
  readonly pressed: ReadonlySet<Button>;
}

/** Counter —— 可订阅的整数原子状态（分数、关卡、速度、生命数等） */
export interface Counter {
  readonly value: number;
  set(n: number): void;
  add(n: number): void;
  subscribe(fn: (v: number) => void): Unsubscribe;
}

/** Toggle —— 可订阅的布尔原子状态（暂停、音效开关等） */
export interface Toggle {
  readonly value: boolean;
  set(v: boolean): void;
  toggle(): void;
  subscribe(fn: (v: boolean) => void): Unsubscribe;
}

/** Sound —— 8bit 音效抽象 */
export interface Sound {
  play(effect: SoundEffect): void;
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
}

/** Storage —— 键值持久化抽象 */
export interface Storage {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
}

/**
 * HardwareContext —— 游戏看到的"硬件上下文"
 *
 * L1 Games 的 init / step / render 只能通过这个对象访问运行时能力。
 * 确定性要求：
 * - 随机数一律走 `rng()`（可播种 PRNG，详见 rng.ts）
 * - 时间读取一律走 `now()`（Ticker 的逻辑时钟，单位：tick 数）
 */
export interface HardwareContext {
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

  /** 0..1 之间的伪随机数，由 mulberry32 驱动 */
  rng: () => number;
  /** 逻辑时钟：返回 ticker.tickCount（而非 wall-clock） */
  now: () => number;
}
