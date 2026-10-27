import { describe, it, expect } from 'vitest';

import { createHeadlessContext } from '@/platform/headless';
import { toGameEnv, type GameEnv } from '@/sdk';

import { tank } from '..';
import { init, isAnimating, isGameOver, onButton, render, step } from '../logic';
import {
  type BossTank,
  type Bullet,
  type EnemyTank,
  enemySpawnPoints,
  FIRE_WAIT_MS,
  playerCells,
  type TankState,
  TICK_HZ,
  TOTAL_ENEMIES,
} from '../state';

function makeEnv(width = 10, height = 20, seed = 42): GameEnv {
  return toGameEnv(createHeadlessContext({ seed, width, height }));
}

/** 已开局、没有任何待出生敌军的干净场面，方便逐项构造用例 */
function makeState(env: GameEnv, partial: Partial<TankState> = {}): TankState {
  return { ...init(env), phase: 'playing', spawnTimers: [], ...partial };
}

/** 冻结的敌军：永远不动、不开火，只当靶子 / 挡板 */
function dummyEnemy(id: number, x: number, y: number, partial: Partial<EnemyTank> = {}): EnemyTank {
  return { id, x, y, dir: 'up', moveAcc: -1e9, fireIn: 1e9, plan: [], ...partial };
}

function bullet(partial: Partial<Bullet> & Pick<Bullet, 'x' | 'y' | 'dir' | 'owner'>): Bullet {
  return { acc: 0, ...partial };
}

function run(env: GameEnv, s: TankState, frames: number): TankState {
  let cur = s;
  for (let i = 0; i < frames; i++) cur = step(env, cur);
  return cur;
}

describe('tank · init', () => {
  it('玩家在 (4,10) 朝上，4 条命，排好 4 辆敌军出生队列，停在 ready', () => {
    const env = makeEnv();
    const s = init(env);
    expect(s.phase).toBe('ready');
    expect(s.player).toEqual({ x: 4, y: 10, dir: 'up', horizontal: false });
    expect(s.lives).toBe(4);
    expect(s.spawnTimers).toEqual([1000, 2000, 3000, 4000]);
    expect(s.enemies).toEqual([]);
    expect(env.lives.value).toBe(4);
    expect(env.score.value).toBe(0);
  });

  it('opts 的 level / speed 写进 state 并同步到 Counter', () => {
    const env = makeEnv();
    const s = init(env, { level: 3, speed: 5 });
    expect(s.level).toBe(3);
    expect(s.speed).toBe(5);
    expect(env.level.value).toBe(3);
    expect(env.speed.value).toBe(5);
  });

  it('ready 阶段 step 原样返回，按任意游戏键开局', () => {
    const env = makeEnv();
    const s = init(env);
    expect(step(env, s)).toBe(s);
    expect(onButton(env, s, 'A', 'press').phase).toBe('playing');
  });
});

describe('tank · 玩家移动', () => {
  it('朝向不同先原地转向，朝向相同才前进', () => {
    const env = makeEnv();
    const s0 = makeState(env);
    const s1 = onButton(env, s0, 'Right', 'press');
    expect(s1.player).toMatchObject({ x: 4, y: 10, dir: 'right' });
    const s2 = onButton(env, onButton(env, s1, 'Right', 'release'), 'Right', 'press');
    expect(s2.player).toMatchObject({ x: 5, y: 10, dir: 'right' });
  });

  it('按住方向键按 130ms 节奏连续前进，松开即停', () => {
    const env = makeEnv();
    const s0 = makeState(env);
    const pressed = onButton(env, s0, 'Up', 'press');
    expect(pressed.player?.y).toBe(9);
    // 1 秒 ≈ 7 拍（每拍 130ms，30Hz 下第 4 帧触发）
    const held = run(env, pressed, TICK_HZ);
    expect(held.player?.y).toBe(2);
    const released = onButton(env, held, 'Up', 'release');
    expect(run(env, released, TICK_HZ).player?.y).toBe(2);
  });

  it('撞墙 / 撞敌军时原地不动', () => {
    const env = makeEnv();
    const atEdge = makeState(env, { player: { x: 4, y: 1, dir: 'up', horizontal: false } });
    expect(onButton(env, atEdge, 'Up', 'press').player?.y).toBe(1);

    const blocked = makeState(env, { enemies: [dummyEnemy(1, 4, 7, { dir: 'down' })] });
    expect(onButton(env, blocked, 'Up', 'press').player?.y).toBe(10);
  });

  it('repeat 事件被忽略，节奏只由游戏内计时决定', () => {
    const env = makeEnv();
    const s = makeState(env);
    expect(onButton(env, s, 'Up', 'repeat')).toBe(s);
  });
});

describe('tank · 开火', () => {
  it('子弹从炮口外一格出膛，300ms 内不能再发', () => {
    const env = makeEnv();
    const s1 = onButton(env, makeState(env), 'A', 'press');
    expect(s1.bullets).toEqual([{ x: 4, y: 8, dir: 'up', owner: 'player', acc: 0 }]);
    const again = onButton(env, onButton(env, s1, 'A', 'release'), 'A', 'press');
    expect(again.bullets).toHaveLength(1);
  });

  it('按住开火键按 FIRE_WAIT_MS 连发', () => {
    const env = makeEnv();
    const s1 = onButton(env, makeState(env), 'A', 'press');
    const frames = Math.ceil((FIRE_WAIT_MS * 2) / (1000 / TICK_HZ)) + 2;
    let shots = 1;
    let cur = s1;
    for (let i = 0; i < frames; i++) {
      const next = step(env, cur);
      if (next.sinceShot < cur.sinceShot) shots++;
      cur = next;
    }
    expect(shots).toBe(3);
  });

  it('子弹飞出屏幕后消失', () => {
    const env = makeEnv();
    const s = makeState(env, { bullets: [bullet({ x: 4, y: 0, dir: 'up', owner: 'player' })] });
    expect(run(env, s, 3).bullets).toEqual([]);
  });
});

describe('tank · 敌军', () => {
  it('第 1 辆在 1s 后从出生点出现，且离玩家至少 3 格', () => {
    const env = makeEnv();
    const s = { ...init(env), phase: 'playing' as const };
    const before = run(env, s, TICK_HZ - 1);
    expect(before.enemies).toHaveLength(0);
    const after = run(env, before, 2);
    expect(after.enemies).toHaveLength(1);
    const e = after.enemies[0];
    const points = enemySpawnPoints(10, 20).map(([x, y]) => `${x},${y}`);
    expect(points).toContain(`${e?.x},${e?.y}`);
    expect(after.spawned).toBe(1);
  });

  it('同时在场最多 4 辆，队列里多余的等待空位', () => {
    const env = makeEnv();
    const s = makeState(env, {
      enemies: [
        dummyEnemy(1, 1, 1),
        dummyEnemy(2, 8, 1),
        dummyEnemy(3, 1, 18),
        dummyEnemy(4, 8, 18),
      ],
      spawned: 4,
      spawnTimers: [0],
    });
    const next = step(env, s);
    expect(next.enemies).toHaveLength(4);
    expect(next.spawnTimers).toEqual([0]);
  });

  it('玩家子弹击毁敌军：L1S1 得 100 分，kills+1，2s 后补一辆', () => {
    const env = makeEnv();
    const s = makeState(env, {
      enemies: [dummyEnemy(1, 4, 5)],
      spawned: 1,
      bullets: [bullet({ x: 4, y: 7, dir: 'up', owner: 'player' })],
    });
    // 第 2 帧子弹先进入履带镂空格 (4,6)，第 3 帧才打到车身
    const next = run(env, s, 3);
    expect(next.enemies).toEqual([]);
    expect(next.kills).toBe(1);
    expect(next.score).toBe(100);
    expect(env.score.value).toBe(100);
    expect(next.spawnTimers).toHaveLength(1);
  });

  it('得分随 level + speed 增长', () => {
    const env = makeEnv();
    const s = makeState(env, {
      level: 3,
      speed: 4,
      enemies: [dummyEnemy(1, 4, 5)],
      bullets: [bullet({ x: 4, y: 7, dir: 'up', owner: 'player' })],
    });
    expect(run(env, s, 3).score).toBe(350);
  });

  it('敌军子弹打到其它敌军只会被吸收', () => {
    const env = makeEnv();
    const s = makeState(env, {
      enemies: [dummyEnemy(1, 7, 3)],
      bullets: [bullet({ x: 6, y: 5, dir: 'up', owner: 'enemy' })],
    });
    const next = run(env, s, 3);
    expect(next.enemies).toHaveLength(1);
    expect(next.bullets).toEqual([]);
  });

  it('敌军按 1~3s 随机间隔开火', () => {
    const env = makeEnv();
    const s = makeState(env, { enemies: [dummyEnemy(1, 1, 1, { dir: 'right', fireIn: 50 })] });
    const next = run(env, s, 2);
    expect(next.bullets.some((b) => b.owner === 'enemy')).toBe(true);
    const fireIn = next.enemies[0]?.fireIn ?? 0;
    expect(fireIn).toBeGreaterThanOrEqual(1000 - 1000 / TICK_HZ);
    expect(fireIn).toBeLessThan(3000);
  });

  it('迎面对射的两颗子弹互相抵消', () => {
    const env = makeEnv();
    const s = makeState(env, {
      player: { x: 1, y: 18, dir: 'up', horizontal: false },
      bullets: [
        bullet({ x: 6, y: 5, dir: 'down', owner: 'enemy', acc: 1000 }),
        bullet({ x: 6, y: 6, dir: 'up', owner: 'player', acc: 1000 }),
      ],
    });
    expect(step(env, s).bullets).toEqual([]);
  });
});

describe('tank · 阵亡与续命', () => {
  it('被击中 → dying 冻结 → 扣命 → 落幕 → 同关重开，已击毁数保留', () => {
    const env = makeEnv();
    const s = makeState(env, {
      kills: 7,
      spawned: 9,
      bullets: [bullet({ x: 4, y: 8, dir: 'down', owner: 'enemy', acc: 1000 })],
    });
    const hit = step(env, s);
    expect(hit.phase).toBe('dying');
    expect(hit.player).toBeNull();
    expect(isAnimating(hit)).toBe(true);
    expect(isGameOver(hit)).toBe(false);

    const cont = run(env, hit, Math.round(1.2 * TICK_HZ));
    expect(cont.phase).toBe('continue');
    expect(cont.lives).toBe(3);
    expect(env.lives.value).toBe(3);

    const again = run(env, cont, 40);
    expect(again.phase).toBe('playing');
    expect(again.kills).toBe(7);
    expect(again.spawned).toBe(7);
    expect(again.player).toMatchObject({ x: 4, y: 10 });
    expect(again.spawnTimers).toHaveLength(4);
  });

  it('最后一条命被击中 → game over → 动画结束回到 ready 新局', () => {
    const env = makeEnv();
    const s = makeState(env, {
      lives: 1,
      score: 500,
      bullets: [bullet({ x: 4, y: 8, dir: 'down', owner: 'enemy', acc: 1000 })],
    });
    const over = run(env, s, 1 + Math.round(1.2 * TICK_HZ));
    expect(over.phase).toBe('over');
    expect(isGameOver(over)).toBe(true);
    const fresh = run(env, over, 40);
    expect(fresh.phase).toBe('ready');
    expect(fresh.lives).toBe(4);
    expect(fresh.score).toBe(0);
  });
});

describe('tank · Boss 战', () => {
  function bossState(env: GameEnv, boss: Partial<BossTank> = {}): TankState {
    return makeState(env, {
      player: { x: 5, y: 18, dir: 'up', horizontal: true },
      boss: { x: 5, y: 3, hp: 2, moveAcc: -1e9, fireAcc: -1e9, plan: [], ...boss },
    });
  }

  it('击毁第 50 辆后进入 Boss 战：玩家换成横向形态，Boss HP = level + speed', () => {
    const env = makeEnv();
    const s = makeState(env, {
      level: 2,
      speed: 3,
      kills: TOTAL_ENEMIES - 1,
      spawned: TOTAL_ENEMIES,
      enemies: [dummyEnemy(1, 4, 5)],
      bullets: [bullet({ x: 4, y: 7, dir: 'up', owner: 'player' })],
    });
    const next = run(env, s, 3);
    expect(next.boss).toMatchObject({ x: 5, y: 3, hp: 5 });
    expect(next.player).toMatchObject({ y: 18, horizontal: true });
    expect(next.enemies).toEqual([]);
  });

  it('横向形态只能左右移动，按上 / 下不转向', () => {
    const env = makeEnv();
    const s = bossState(env);
    expect(onButton(env, s, 'Up', 'press').player).toMatchObject({ x: 5, y: 18, dir: 'up' });
    expect(onButton(env, s, 'Left', 'press').player).toMatchObject({ x: 4, dir: 'up' });
  });

  it('只有打中炮口才掉血，打到车身只会被挡下', () => {
    const env = makeEnv();
    const body = bossState(env);
    // x=3 这一列 Boss 最靠下的格子在 (3,4)，子弹要飞 3 格才撞上
    const hitBody = run(
      env,
      { ...body, bullets: [bullet({ x: 3, y: 7, dir: 'up', owner: 'player' })] },
      5
    );
    expect(hitBody.boss?.hp).toBe(2);
    expect(hitBody.bullets).toEqual([]);

    const hitMuzzle = run(
      env,
      { ...body, bullets: [bullet({ x: 5, y: 8, dir: 'up', owner: 'player' })] },
      3
    );
    expect(hitMuzzle.boss?.hp).toBe(1);
    expect(hitMuzzle.score).toBe(100);
  });

  it('Boss 被击毁 → 爆炸 → 落幕 → level/speed 交替升级并开新一轮', () => {
    const env = makeEnv();
    const s = {
      ...bossState(env, { hp: 1 }),
      bullets: [bullet({ x: 5, y: 7, dir: 'up', owner: 'player', acc: 1000 })],
    };
    const down = step(env, s);
    expect(down.phase).toBe('bossDown');
    expect(down.boss).toBeNull();

    const lvUp = run(env, down, Math.round(1.5 * TICK_HZ));
    expect(lvUp.phase).toBe('levelUp');
    const next = run(env, lvUp, 40);
    expect(next.phase).toBe('playing');
    expect(next).toMatchObject({ level: 2, speed: 1, levelIsUp: true, kills: 0, spawned: 0 });
    expect(next.player?.horizontal).toBe(false);
    expect(env.level.value).toBe(2);
  });

  it('Boss 按节奏向下开炮', () => {
    const env = makeEnv();
    const s = bossState(env, { fireAcc: 1000 });
    const next = step(env, s);
    expect(next.bullets).toEqual([
      expect.objectContaining({ x: 5, y: 7, dir: 'down', owner: 'enemy' }),
    ]);
  });
});

describe('tank · render', () => {
  it('画出玩家坦克形状，副屏显示剩余生命', () => {
    const env = makeEnv();
    const s = makeState(env, { lives: 3 });
    render(env, s);
    for (const [x, y] of playerCells(s.player ?? { x: 0, y: 0, dir: 'up' })) {
      expect(env.screen.getPixel(x, y)).toBe(true);
    }
    expect(env.screen.getPixel(0, 0)).toBe(false);
    expect([0, 1, 2].every((x) => env.auxScreen.getPixel(x, 0))).toBe(true);
    expect(env.auxScreen.getPixel(3, 0)).toBe(false);
  });
});

describe('tank · 确定性与 demo', () => {
  it('同 seed 同输入 → 同结果', () => {
    const play = (): TankState => {
      const env = makeEnv(10, 20, 7);
      let s = onButton(env, init(env, { level: 5, speed: 5 }), 'A', 'press');
      for (let i = 0; i < 600; i++) s = step(env, s);
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('demo 在 10×8 小屏上长时间运行不出错', () => {
    const env = makeEnv(10, 8, 3);
    let s = tank.demoInit?.(env);
    if (!s) throw new Error('demoInit 未实现');
    for (let i = 0; i < 3000; i++) {
      s = tank.demoStep?.(env, s) ?? s;
      tank.render?.(env, s);
    }
    expect(s.width).toBe(10);
  });
});
