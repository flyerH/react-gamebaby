import type { Button, ButtonAction } from '@/engine/types';
import type { GameEnv, GameInitOptions, Pixel } from '@/sdk';

import {
  BOSS_EXPLOSION,
  BOSS_FIRE_MS,
  BOSS_HALF,
  type BossTank,
  bossCells,
  bossHp,
  bossSpawn,
  type Bullet,
  type BulletOwner,
  type Direction,
  DIRECTIONS,
  dirVec,
  type EnemyTank,
  enemyBulletMs,
  enemyCells,
  enemyMoveMs,
  enemySpawnPoints,
  FIRE_WAIT_MS,
  FRAME_MS,
  inside,
  killScore,
  LEVEL_MAX,
  MAX_ALIVE_ENEMIES,
  muzzle,
  type Phase,
  PLAYER_BULLET_MS,
  PLAYER_MOVE_MS,
  playerCells,
  playerSpawn,
  randFloat,
  randInt,
  RESPAWN_DELAY_MS,
  SPAWN_MIN_DISTANCE,
  SPEED_MAX,
  START_LIVES,
  TANK_EXPLOSION,
  type TankState,
  TICK_HZ,
  TOTAL_ENEMIES,
} from './state';

/** 玩家被击中后的冻结时长：1.2s */
const DYING_FRAMES = Math.round(1.2 * TICK_HZ);
/** Boss 被击毁后的爆炸时长：1.5s */
const BOSS_DOWN_FRAMES = Math.round(1.5 * TICK_HZ);
/** 爆炸图案亮 / 灭各持续的帧数 */
const BLINK_FRAMES = 3;
/** 敌军开火间隔随机区间（ms） */
const ENEMY_FIRE_MIN_MS = 1000;
const ENEMY_FIRE_MAX_MS = 3000;

const ANIMATING_PHASES: ReadonlySet<Phase> = new Set([
  'dying',
  'continue',
  'bossDown',
  'levelUp',
  'over',
]);

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function hasCell(cells: ReadonlyArray<Pixel>, x: number, y: number): boolean {
  return cells.some(([cx, cy]) => cx === x && cy === y);
}

/**
 * 一轮开局：清场、玩家回出生点、按"还剩多少辆没出生"排出生队列。
 *
 * 最多排 4 辆，分别延迟 1/2/3/4s 出生；续命重开时 spawned 被设回 kills，
 * 已击毁的不再补。
 */
function startRound(state: TankState, kills: number): TankState {
  const [px, py] = playerSpawn(state.width, state.height);
  const count = Math.min(MAX_ALIVE_ENEMIES, TOTAL_ENEMIES - kills);
  return {
    ...state,
    phase: 'playing',
    phaseFrame: 0,
    player: { x: px, y: py, dir: 'up', horizontal: false },
    enemies: [],
    boss: null,
    bullets: [],
    explosion: null,
    spawnTimers: Array.from({ length: count }, (_, i) => (i + 1) * 1000),
    spawned: kills,
    kills,
    moveAcc: 0,
    fireAcc: 0,
    sinceShot: FIRE_WAIT_MS,
  };
}

/** 打满 TOTAL_ENEMIES 辆：清场，Boss 落在顶部，玩家换成只能左右移动的形态 */
function startBoss(state: TankState): TankState {
  const [bx, by] = bossSpawn(state.width);
  const [px] = playerSpawn(state.width, state.height);
  return {
    ...state,
    player: { x: px, y: state.height - 2, dir: 'up', horizontal: true },
    enemies: [],
    boss: {
      x: bx,
      y: by,
      hp: bossHp(state.level, state.speed),
      moveAcc: 0,
      fireAcc: 0,
      plan: [],
    },
    bullets: [],
    spawnTimers: [],
    moveAcc: 0,
    fireAcc: 0,
    sinceShot: FIRE_WAIT_MS,
  };
}

/**
 * 初始状态：玩家就位、敌军出生队列已排好，停在 ready 等首次按键。
 *
 * opts 存进 lastOpts，game over 动画播完自动重开时沿用菜单选定的难度。
 */
export function init(env: GameEnv, opts?: GameInitOptions): TankState {
  const level = clamp(opts?.level ?? 1, 1, LEVEL_MAX);
  const speed = clamp(opts?.speed ?? 1, 1, SPEED_MAX);
  env.score.set(0);
  env.lives.set(START_LIVES);
  env.level.set(level);
  env.speed.set(speed);
  const base: TankState = {
    width: env.screen.width,
    height: env.screen.height,
    phase: 'ready',
    phaseFrame: 0,
    frame: 0,
    player: null,
    enemies: [],
    boss: null,
    bullets: [],
    explosion: null,
    spawnTimers: [],
    spawned: 0,
    kills: 0,
    nextEnemyId: 1,
    score: 0,
    lives: START_LIVES,
    level,
    speed,
    levelIsUp: false,
    heldDir: null,
    moveAcc: 0,
    fireHeld: false,
    fireAcc: 0,
    sinceShot: FIRE_WAIT_MS,
    lastOpts: opts ?? null,
  };
  return { ...startRound(base, 0), phase: 'ready' };
}

/* ------------------------------------------------------------------ *
 * 占位与碰撞
 * ------------------------------------------------------------------ */

/** 收集除自身外所有坦克占的格子；skipEnemyId / skipPlayer 用于排除正在移动的那辆 */
function blockedCells(
  state: TankState,
  skipEnemyId: number | null,
  skipPlayer: boolean
): ReadonlySet<string> {
  const set = new Set<string>();
  if (state.player && !skipPlayer) {
    for (const [x, y] of playerCells(state.player)) set.add(key(x, y));
  }
  for (const e of state.enemies) {
    if (e.id === skipEnemyId) continue;
    for (const [x, y] of enemyCells(e)) set.add(key(x, y));
  }
  if (state.boss) {
    for (const [x, y] of bossCells(state.boss)) set.add(key(x, y));
  }
  return set;
}

function canPlace(
  state: TankState,
  cells: ReadonlyArray<Pixel>,
  blocked: ReadonlySet<string>
): boolean {
  return cells.every(
    ([x, y]) => inside(state.width, state.height, x, y) && !blocked.has(key(x, y))
  );
}

/** 子弹从 from 沿 dir 出膛一格；出界直接作废 */
function makeBullet(
  state: TankState,
  from: Pixel,
  dir: Direction,
  owner: BulletOwner
): Bullet | null {
  const [dx, dy] = dirVec(dir);
  const x = from[0] + dx;
  const y = from[1] + dy;
  return inside(state.width, state.height, x, y) ? { x, y, dir, owner, acc: 0 } : null;
}

/* ------------------------------------------------------------------ *
 * 玩家
 * ------------------------------------------------------------------ */

/**
 * 玩家按方向走一拍：朝向不同先原地转向（转不开就不动），朝向相同才前进。
 * Boss 战形态只响应左右，且不转向。
 */
function playerAct(state: TankState, dir: Direction): TankState {
  const p = state.player;
  if (!p) return state;
  const blocked = blockedCells(state, null, true);

  if (p.horizontal) {
    if (dir !== 'left' && dir !== 'right') return state;
    const moved = { ...p, x: p.x + dirVec(dir)[0] };
    return canPlace(state, playerCells(moved), blocked) ? { ...state, player: moved } : state;
  }

  if (p.dir !== dir) {
    const turned = { ...p, dir };
    return canPlace(state, playerCells(turned), blocked) ? { ...state, player: turned } : state;
  }
  const [dx, dy] = dirVec(dir);
  const moved = { ...p, x: p.x + dx, y: p.y + dy };
  return canPlace(state, playerCells(moved), blocked) ? { ...state, player: moved } : state;
}

function playerFire(state: TankState): TankState {
  const p = state.player;
  if (!p || state.sinceShot < FIRE_WAIT_MS) return state;
  const bullet = makeBullet(state, muzzle(p), p.dir, 'player');
  return {
    ...state,
    sinceShot: 0,
    bullets: bullet ? [...state.bullets, bullet] : state.bullets,
  };
}

/* ------------------------------------------------------------------ *
 * 敌军
 * ------------------------------------------------------------------ */

/**
 * 规划下一段行动：
 * - level ≥ 2 时有 (level−1)×10% 概率进入追踪：先横后纵或先纵后横走到玩家处
 * - 否则随机选一个方向连走 2~8 步
 */
function planFor(env: GameEnv, state: TankState, e: EnemyTank): ReadonlyArray<Direction> {
  const p = state.player;
  if (p && state.level >= 2 && randInt(env.rng, 0, 100) < (state.level - 1) * 10) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const hs = Array<Direction>(Math.abs(dx)).fill(dx > 0 ? 'right' : 'left');
    const vs = Array<Direction>(Math.abs(dy)).fill(dy > 0 ? 'down' : 'up');
    const plan = env.rng() < 0.5 ? [...hs, ...vs] : [...vs, ...hs];
    if (plan.length > 0) return plan;
  }
  const dir = DIRECTIONS[randInt(env.rng, 0, DIRECTIONS.length)] ?? 'up';
  return Array<Direction>(randInt(env.rng, 2, 9)).fill(dir);
}

function replaceEnemy(state: TankState, next: EnemyTank): TankState {
  return { ...state, enemies: state.enemies.map((e) => (e.id === next.id ? next : e)) };
}

/** 敌军走一拍：与玩家相同的"先转向再前进"；被挡住就放弃当前计划，下拍重新规划 */
function enemyAct(env: GameEnv, state: TankState, e: EnemyTank): TankState {
  const plan = e.plan.length > 0 ? e.plan : planFor(env, state, e);
  const dir = plan[0];
  if (!dir) return state;
  const blocked = blockedCells(state, e.id, false);

  if (e.dir !== dir) {
    const turned = { ...e, dir, plan };
    const ok = canPlace(state, enemyCells(turned), blocked);
    return replaceEnemy(state, ok ? turned : { ...e, plan: [] });
  }
  const [dx, dy] = dirVec(dir);
  const moved = { ...e, x: e.x + dx, y: e.y + dy, plan: plan.slice(1) };
  const ok = canPlace(state, enemyCells(moved), blocked);
  return replaceEnemy(state, ok ? moved : { ...e, plan: [] });
}

function stepEnemies(env: GameEnv, state: TankState): TankState {
  const interval = enemyMoveMs(state.speed);
  let s = state;
  for (const { id } of state.enemies) {
    const cur = s.enemies.find((e) => e.id === id);
    if (!cur) continue;
    const acc = cur.moveAcc + FRAME_MS;
    if (acc >= interval) {
      const ready = { ...cur, moveAcc: acc - interval };
      s = enemyAct(env, replaceEnemy(s, ready), ready);
    } else {
      s = replaceEnemy(s, { ...cur, moveAcc: acc });
    }

    const after = s.enemies.find((e) => e.id === id);
    if (!after) continue;
    const fireIn = after.fireIn - FRAME_MS;
    if (fireIn > 0) {
      s = replaceEnemy(s, { ...after, fireIn });
      continue;
    }
    const bullet = makeBullet(s, muzzle(after), after.dir, 'enemy');
    s = replaceEnemy(
      { ...s, bullets: bullet ? [...s.bullets, bullet] : s.bullets },
      { ...after, fireIn: randFloat(env.rng, ENEMY_FIRE_MIN_MS, ENEMY_FIRE_MAX_MS) }
    );
  }
  return s;
}

/** 两辆坦克中心距离是否够远：横纵两个方向不能同时落在 SPAWN_MIN_DISTANCE 以内 */
function farEnough(a: Pixel, b: Pixel): boolean {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  const d = SPAWN_MIN_DISTANCE;
  return !((dx < d && dy <= d) || (dx <= d && dy < d));
}

/** 在 6 个出生点里随机挑一个与所有坦克保持距离的；都不满足返回 null，下帧再试 */
function pickSpawnPoint(env: GameEnv, state: TankState): Pixel | null {
  const tanks: Pixel[] = state.enemies.map((e): Pixel => [e.x, e.y]);
  if (state.player) tanks.push([state.player.x, state.player.y]);
  const free = enemySpawnPoints(state.width, state.height).filter((pt) =>
    tanks.every((t) => farEnough(pt, t))
  );
  if (free.length === 0) return null;
  return free[randInt(env.rng, 0, free.length)] ?? null;
}

function processSpawns(env: GameEnv, state: TankState): TankState {
  if (state.spawnTimers.length === 0) return state;
  let s = state;
  const timers: number[] = [];
  for (const t of state.spawnTimers) {
    const left = t - FRAME_MS;
    if (left > 0) {
      timers.push(left);
      continue;
    }
    if (s.spawned >= TOTAL_ENEMIES) continue;
    const point = s.enemies.length < MAX_ALIVE_ENEMIES ? pickSpawnPoint(env, s) : null;
    if (!point) {
      timers.push(0);
      continue;
    }
    const enemy: EnemyTank = {
      id: s.nextEnemyId,
      x: point[0],
      y: point[1],
      dir: 'up',
      moveAcc: 0,
      fireIn: randFloat(env.rng, ENEMY_FIRE_MIN_MS, ENEMY_FIRE_MAX_MS),
      plan: [],
    };
    s = {
      ...s,
      enemies: [...s.enemies, enemy],
      spawned: s.spawned + 1,
      nextEnemyId: s.nextEnemyId + 1,
    };
  }
  return { ...s, spawnTimers: timers };
}

/* ------------------------------------------------------------------ *
 * Boss
 * ------------------------------------------------------------------ */

/** Boss：随机向左 / 右连走 2~4 步，撞边即停；每秒从炮口向下开一炮 */
function stepBoss(env: GameEnv, state: TankState): TankState {
  const b = state.boss;
  if (!b) return state;
  let boss: BossTank = { ...b, moveAcc: b.moveAcc + FRAME_MS, fireAcc: b.fireAcc + FRAME_MS };
  let bullets = state.bullets;

  const interval = enemyMoveMs(state.speed);
  if (boss.moveAcc >= interval) {
    const plan =
      boss.plan.length > 0
        ? boss.plan
        : Array<'left' | 'right'>(randInt(env.rng, 2, 5)).fill(
            randInt(env.rng, 0, 2) === 0 ? 'left' : 'right'
          );
    const dir = plan[0] ?? 'left';
    const nx = boss.x + dirVec(dir)[0];
    const fits = nx >= BOSS_HALF && nx <= state.width - 1 - BOSS_HALF;
    boss = fits
      ? { ...boss, x: nx, plan: plan.slice(1), moveAcc: boss.moveAcc - interval }
      : { ...boss, plan: [], moveAcc: boss.moveAcc - interval };
  }

  if (boss.fireAcc >= BOSS_FIRE_MS) {
    const bullet = makeBullet(state, [boss.x, boss.y + BOSS_HALF], 'down', 'enemy');
    if (bullet) bullets = [...bullets, bullet];
    boss = { ...boss, fireAcc: boss.fireAcc - BOSS_FIRE_MS };
  }
  return { ...state, boss, bullets };
}

/* ------------------------------------------------------------------ *
 * 子弹
 * ------------------------------------------------------------------ */

/**
 * 子弹按各自速度前进一格；出界消失；两颗子弹落在同一格或迎面交错都互相抵消。
 *
 * 只判"同一格"的话，相向而行的两颗子弹可能在同一帧互换位置直接穿过，所以要补交错判定。
 */
function moveBullets(state: TankState): TankState {
  if (state.bullets.length === 0) return state;
  const enemyRate = enemyBulletMs(state.speed);
  const moved = state.bullets.map((b) => {
    const rate = b.owner === 'player' ? PLAYER_BULLET_MS : enemyRate;
    const acc = b.acc + FRAME_MS;
    if (acc < rate) return { bullet: { ...b, acc }, px: b.x, py: b.y };
    const [dx, dy] = dirVec(b.dir);
    return { bullet: { ...b, x: b.x + dx, y: b.y + dy, acc: acc - rate }, px: b.x, py: b.y };
  });
  const alive = moved.filter(({ bullet }) => inside(state.width, state.height, bullet.x, bullet.y));

  const dead = new Set<number>();
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      if (!a || !b) continue;
      const same = a.bullet.x === b.bullet.x && a.bullet.y === b.bullet.y;
      const crossed =
        a.bullet.x === b.px && a.bullet.y === b.py && b.bullet.x === a.px && b.bullet.y === a.py;
      if (same || crossed) {
        dead.add(i);
        dead.add(j);
      }
    }
  }
  return { ...state, bullets: alive.filter((_, i) => !dead.has(i)).map(({ bullet }) => bullet) };
}

function addScore(env: GameEnv, state: TankState): TankState {
  const score = state.score + killScore(state.level, state.speed);
  env.score.set(score);
  return { ...state, score };
}

/** 击毁一辆敌军：计分、计数、2s 后补一辆；打满 50 辆立即进入 Boss 战 */
function killEnemy(env: GameEnv, state: TankState, id: number): TankState {
  env.sound.play('clear');
  const kills = state.kills + 1;
  const s = addScore(env, {
    ...state,
    enemies: state.enemies.filter((e) => e.id !== id),
    kills,
    spawnTimers:
      state.spawned < TOTAL_ENEMIES ? [...state.spawnTimers, RESPAWN_DELAY_MS] : state.spawnTimers,
  });
  return kills >= TOTAL_ENEMIES ? startBoss(s) : s;
}

/**
 * 结算所有子弹落点的命中：
 * - 玩家子弹打中敌军 → 击毁；打中 Boss 只有落在炮口那一行才掉血，打到车身只会被挡下
 * - 敌军子弹打中玩家 → 玩家阵亡；打中其它敌军 → 被吸收，不伤友军
 *
 * 触发阵亡 / Boss 战 / Boss 被毁时场面会被重置或冻结，立即停止后续结算。
 */
function resolveHits(env: GameEnv, state: TankState): TankState {
  let s = state;
  const kept: Bullet[] = [];
  const bullets = state.bullets;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b) continue;
    const rest = (): Bullet[] => [...kept, ...bullets.slice(i + 1)];

    if (b.owner === 'player') {
      const boss = s.boss;
      if (boss) {
        if (!hasCell(bossCells(boss), b.x, b.y)) {
          kept.push(b);
          continue;
        }
        if (b.y !== boss.y + BOSS_HALF) continue;
        const hp = boss.hp - 1;
        s = addScore(env, { ...s, boss: { ...boss, hp } });
        if (hp > 0) {
          env.sound.play('rotate');
          continue;
        }
        env.sound.play('clear');
        return {
          ...s,
          boss: null,
          bullets: rest(),
          phase: 'bossDown',
          phaseFrame: 0,
          explosion: [boss.x, boss.y],
        };
      }
      const hit = s.enemies.find((e) => hasCell(enemyCells(e), b.x, b.y));
      if (!hit) {
        kept.push(b);
        continue;
      }
      s = killEnemy(env, s, hit.id);
      if (s.boss) return s;
      continue;
    }

    const p = s.player;
    if (p && hasCell(playerCells(p), b.x, b.y)) {
      env.sound.play('over');
      return {
        ...s,
        player: null,
        bullets: rest(),
        phase: 'dying',
        phaseFrame: 0,
        explosion: [p.x, p.y],
        // Boss 战中阵亡要从头再打 50 辆
        kills: p.horizontal ? 0 : s.kills,
      };
    }
    if (s.enemies.some((e) => hasCell(enemyCells(e), b.x, b.y))) continue;
    kept.push(b);
  }
  return { ...s, bullets: kept };
}

/* ------------------------------------------------------------------ *
 * step
 * ------------------------------------------------------------------ */

function stepPlaying(env: GameEnv, state: TankState): TankState {
  let s: TankState = { ...state, frame: state.frame + 1, sinceShot: state.sinceShot + FRAME_MS };

  if (s.heldDir) {
    const acc = s.moveAcc + FRAME_MS;
    s =
      acc >= PLAYER_MOVE_MS
        ? playerAct({ ...s, moveAcc: acc - PLAYER_MOVE_MS }, s.heldDir)
        : { ...s, moveAcc: acc };
  }
  if (s.fireHeld) {
    const acc = s.fireAcc + FRAME_MS;
    s = acc >= FIRE_WAIT_MS ? playerFire({ ...s, fireAcc: 0 }) : { ...s, fireAcc: acc };
  }

  s = processSpawns(env, s);
  s = stepEnemies(env, s);
  s = stepBoss(env, s);
  s = moveBullets(s);
  return resolveHits(env, s);
}

/** 通关升级：level 与 speed 交替 +1，一项到顶后只升另一项，全满回 1/1 */
function levelSpeedUp(state: TankState): Pick<TankState, 'level' | 'speed' | 'levelIsUp'> {
  const { level, speed, levelIsUp } = state;
  if (level >= LEVEL_MAX && speed >= SPEED_MAX) return { level: 1, speed: 1, levelIsUp: false };
  if (!levelIsUp) {
    return level < LEVEL_MAX
      ? { level: level + 1, speed, levelIsUp: true }
      : { level, speed: speed + 1, levelIsUp: false };
  }
  return speed < SPEED_MAX
    ? { level, speed: speed + 1, levelIsUp: false }
    : { level: level + 1, speed, levelIsUp: false };
}

function curtainFrames(state: TankState): number {
  return state.height * 2;
}

/** 落幕动画播完后的去向：续命同关重开 / 升级开下一轮 / game over 回 ready */
function afterCurtain(env: GameEnv, state: TankState): TankState {
  switch (state.phase) {
    case 'continue':
      return startRound(state, state.kills);
    case 'levelUp': {
      const next = { ...state, ...levelSpeedUp(state) };
      env.level.set(next.level);
      env.speed.set(next.speed);
      env.sound.play('start');
      return startRound(next, 0);
    }
    default:
      return init(env, state.lastOpts ?? undefined);
  }
}

export function step(env: GameEnv, state: TankState): TankState {
  switch (state.phase) {
    case 'ready':
      return state;
    case 'playing':
      return stepPlaying(env, state);
    case 'dying': {
      if (state.phaseFrame + 1 < DYING_FRAMES) {
        return { ...state, phaseFrame: state.phaseFrame + 1 };
      }
      const lives = state.lives - 1;
      env.lives.set(lives);
      return {
        ...state,
        lives,
        phase: lives > 0 ? 'continue' : 'over',
        phaseFrame: 0,
        explosion: null,
      };
    }
    case 'bossDown':
      if (state.phaseFrame + 1 < BOSS_DOWN_FRAMES) {
        return { ...state, phaseFrame: state.phaseFrame + 1 };
      }
      return { ...state, phase: 'levelUp', phaseFrame: 0, explosion: null };
    case 'continue':
    case 'levelUp':
    case 'over':
      if (state.phaseFrame + 1 < curtainFrames(state)) {
        return { ...state, phaseFrame: state.phaseFrame + 1 };
      }
      return afterCurtain(env, state);
  }
}

/* ------------------------------------------------------------------ *
 * render
 * ------------------------------------------------------------------ */

export function render(env: GameEnv, state: TankState): void {
  const { screen, auxScreen } = env;
  const { width: w, height: h } = state;
  const plot = (x: number, y: number): void => {
    if (inside(w, h, x, y)) screen.setPixel(x, y, true);
  };
  screen.clear();

  const curtain = state.phase === 'continue' || state.phase === 'levelUp' || state.phase === 'over';
  const clearing = curtain && state.phaseFrame >= h;

  if (!clearing) {
    if (state.player) for (const [x, y] of playerCells(state.player)) plot(x, y);
    for (const e of state.enemies) for (const [x, y] of enemyCells(e)) plot(x, y);
    if (state.boss) for (const [x, y] of bossCells(state.boss)) plot(x, y);
    for (const b of state.bullets) plot(b.x, b.y);

    const ex = state.explosion;
    if (ex && Math.floor(state.phaseFrame / BLINK_FRAMES) % 2 === 0) {
      const pattern = state.phase === 'bossDown' ? BOSS_EXPLOSION : TANK_EXPLOSION;
      for (const [dx, dy] of pattern) plot(ex[0] + dx, ex[1] + dy);
    }
  }

  if (curtain) {
    const from = clearing ? Math.min(h, state.phaseFrame - h + 1) : h - (state.phaseFrame + 1);
    for (let y = Math.max(0, from); y < h; y++) {
      for (let x = 0; x < w; x++) screen.setPixel(x, y, true);
    }
  }

  // 副屏显示剩余生命：每条命一列 1×2 竖条，最多 4 条正好铺满 4×2
  auxScreen.clear();
  const lives = Math.min(state.lives, auxScreen.width);
  for (let i = 0; i < lives; i++) {
    for (let y = 0; y < auxScreen.height; y++) auxScreen.setPixel(i, y, true);
  }
}

/* ------------------------------------------------------------------ *
 * 输入
 * ------------------------------------------------------------------ */

function buttonToDir(btn: Button): Direction | null {
  switch (btn) {
    case 'Up':
      return 'up';
    case 'Down':
      return 'down';
    case 'Left':
      return 'left';
    case 'Right':
      return 'right';
    default:
      return null;
  }
}

/**
 * 输入语义：
 * - 方向键按下立即走一拍，按住期间由 step 每 PLAYER_MOVE_MS 再走一拍；
 *   平台层的 repeat 事件不参与，节奏完全由游戏自己控制
 * - A / B 开火：按下立即开一炮，按住每 FIRE_WAIT_MS 连发
 * - release 在任何阶段都要处理，否则动画期间松手会让"按住"状态残留
 */
export function onButton(
  _env: GameEnv,
  state: TankState,
  btn: Button,
  action: ButtonAction
): TankState {
  const dir = buttonToDir(btn);
  const isFire = btn === 'A' || btn === 'B';
  if (!dir && !isFire) return state;

  if (action === 'repeat') return state;
  if (action === 'release') {
    if (dir && state.heldDir === dir) return { ...state, heldDir: null, moveAcc: 0 };
    if (isFire && state.fireHeld) return { ...state, fireHeld: false, fireAcc: 0 };
    return state;
  }

  if (state.phase === 'ready') return { ...state, phase: 'playing' };
  if (state.phase !== 'playing') return state;

  if (dir) return playerAct({ ...state, heldDir: dir, moveAcc: 0 }, dir);
  return playerFire({ ...state, fireHeld: true, fireAcc: 0 });
}

export function isGameOver(state: TankState): boolean {
  return state.phase === 'over';
}

export function isAnimating(state: TankState): boolean {
  return ANIMATING_PHASES.has(state.phase);
}
