import type { HardwareContext } from '@/engine/types';

import type { GameEnv } from './types';

/**
 * 从完整的 HardwareContext 投影出一个 GameEnv 视图
 *
 * 纯函数，不复制底层引用，游戏获取的 screen / input / counter
 * 就是 engine 实例本身，仍然能订阅变化。Pause / Ticker / Storage 等
 * 应用与平台权限不暴露给游戏。
 */
export function toGameEnv(ctx: HardwareContext): GameEnv {
  return {
    screen: ctx.screen,
    auxScreen: ctx.auxScreen,
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
