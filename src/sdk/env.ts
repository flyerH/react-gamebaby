import type { HardwareContext } from '@/engine/types';

import type { GameEnv } from './types';

/**
 * 从完整的 L3 HardwareContext 投影出一个 GameEnv 视图
 *
 * 纯函数，不复制底层引用——游戏拿到的 screen / input / counter
 * 就是 L3 实例本身，仍然能订阅变化。Pause / Ticker / Storage 等
 * "应用/平台层"权限被显式拦掉。
 */
export function toGameEnv(ctx: HardwareContext): GameEnv {
  return {
    screen: ctx.screen,
    nextScreen: ctx.nextScreen,
    input: ctx.input,
    sound: ctx.sound,
    rng: ctx.rng,
    now: ctx.now,
    score: ctx.score,
    level: ctx.level,
    speed: ctx.speed,
    lives: ctx.lives,
  };
}
