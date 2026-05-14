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
  | 'Pause'
  | 'Sound'
  | 'Reset';

/**
 * 按键动作：按下 / 长按重复 / 抬起
 *
 * - press   首次按下（每次"全新按键"必发）
 * - repeat  按住超过起始延迟后由平台层按固定节奏发出；游戏自己决定响应
 *           不响应（Snake 方向键 + A 都响应；Tetris 方向键响应、A 不响应）
 * - release 松开
 */
export type ButtonAction = 'press' | 'repeat' | 'release';

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

/**
 * 单个音符：频率 + 持续时长。freq=0 表示休止符（停顿不发声）。
 *
 * 用于 playMelody 把多音符旋律串成一段开机音 / 菜单 BGM；保持 Hz + 秒
 * 这种平铺数据，调用方既可以手写谱子也可以由工具生成。
 */
export interface Note {
  /** 频率（Hz）；0 表示该拍为休止符 */
  readonly freq: number;
  /** 持续时长（秒） */
  readonly duration: number;
}

/** Sound —— 8bit 音效抽象 */
export interface Sound {
  play(effect: SoundEffect): void;
  /**
   * 播放一段音符序列：依次调度每个 Note 在前一拍结束时刻发声。
   * 返回 cancel 函数，调用后停止尚未发声的音符 + 截断当前音符。
   * 整段播完后调 cancel 是 no-op。
   */
  playMelody(notes: ReadonlyArray<Note>): () => void;
  setEnabled(on: boolean): void;
  /**
   * 探测当前环境能否在 *无用户手势* 的上下文里直接发声。
   *
   * 浏览器自动播放策略下，刚 mount 的 AudioContext 初始 state 通常是
   * 'suspended'，调 resume() 后看是否变成 'running' 来判断。返回
   * true 表示之后调 play / playMelody 会真发声；返回 false 通常意味
   * 着需要等用户首次手势（按键 / 点击）才能 audio。
   */
  canAutoplay(): Promise<boolean>;
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
  /** 4×2 预览屏：游戏在 render 里直接画下一块，SidePanel 订阅渲染 */
  nextScreen: Screen;
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
