import type { Button, ButtonAction, Counter, InputBus, Screen, Sound } from '@/engine/types';

/**
 * L2 SDK · Game 接口
 *
 * 当前字段集：
 * - id / name / preview（必选）—— 菜单注册与选择态呈现
 * - init / step / render / onButton / tickSpeed（可选）—— 真正的
 *   可玩游戏填上这些；仅 preview 的占位可省略。
 *
 * init / step / onButton 是纯函数：接收当前 state 返回新 state，
 * 不允许改动传入 state（AGENTS.md 要求 state 不可变）。render
 * 唯一副作用是写 GameEnv.screen——L3 Screen 会把 buffer 变化
 * 通知给订阅者（Canvas 渲染器）。
 */

/** 一个点阵坐标（列 x，行 y），与 L3 Screen.setPixel(x, y) 约定一致 */
export type Pixel = readonly [number, number];

/** 菜单 / 选择态下显示的游戏预览点阵；坐标落在 Screen 尺寸内 */
export type GamePreview = ReadonlyArray<Pixel>;

/**
 * 游戏看到的"硬件 / 平台"上下文切片
 *
 * 从 HardwareContext 中选出游戏必需的能力：屏幕、输入、音效、RNG、
 * 逻辑时钟、可订阅计数器。**不暴露**：ticker（节奏由 Mode 外层
 * 管控）、storage（持久化由 App 负责）、pause / soundOn 等 Toggle。
 *
 * 所有字段 readonly：游戏不能替换引用，但可以通过 counter.set /
 * screen.setPixel 等方法修改底层状态。
 */
export interface GameEnv {
  readonly screen: Screen;
  readonly input: InputBus;
  readonly sound: Sound;
  readonly rng: () => number;
  readonly now: () => number;

  readonly score: Counter;
  readonly level: Counter;
  readonly speed: Counter;
  readonly lives: Counter;
}

export interface Game<S = unknown> {
  /** 机器可读标识，用于路由 / 存档 key，推荐 kebab-case */
  readonly id: string;
  /** 印在 SidePanel / 菜单里的可读名字 */
  readonly name: string;
  /** 选择态显示的预览点阵；后续可扩展 preview 动画帧 */
  readonly preview: GamePreview;

  /**
   * 建议的 tick 速度（每秒 tick 数）。App 在进入 playing 态时会把
   * Ticker 调到这个值；未指定时沿用当前速度。
   */
  readonly tickSpeed?: number;

  /** 构造初始 state；未实现则游戏视为 preview-only 占位 */
  init?(env: GameEnv): S;
  /** 推进一帧，返回新 state（state 必须不可变） */
  step?(env: GameEnv, state: S): S;
  /** 把当前 state 投影到 env.screen；不修改 state */
  render?(env: GameEnv, state: S): void;
  /** 响应按键；未命中场景直接返回原 state */
  onButton?(env: GameEnv, state: S, btn: Button, action: ButtonAction): S;
  /** 判定游戏是否结束；App 据此决定是否暂停推进 / 回菜单 */
  isGameOver?(state: S): boolean;
}

/** 任意游戏的无类型视图，便于 App / Registry 等消费方统一持有 */
export type AnyGame = Game<unknown>;
