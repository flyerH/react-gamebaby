import { describe, it, expect } from 'vitest';

import { defaultGames } from '@/games';

/** 主屏默认尺寸；与 createBrowserContext / createHeadlessContext 保持一致 */
const SCREEN_W = 10;
const SCREEN_H = 20;

describe('defaultGames 注册表', () => {
  it('包含 2 款已实现游戏（A01 Snake / A02 Tetris）', () => {
    expect(defaultGames.size).toBe(2);
    const ids = defaultGames.list().map((g) => g.id);
    expect(ids).toEqual(['snake', 'tetris']);
    // 两款都已脱离占位状态，init / step / render / onButton 全实现
    for (const g of defaultGames.list()) {
      expect(typeof g.init).toBe('function');
      expect(typeof g.step).toBe('function');
      expect(typeof g.render).toBe('function');
      expect(typeof g.onButton).toBe('function');
    }
  });

  it('每款游戏的 preview 所有坐标都落在 10×20 屏幕内', () => {
    for (const game of defaultGames.list()) {
      for (const [x, y] of game.preview) {
        expect(x, `${game.id} preview x`).toBeGreaterThanOrEqual(0);
        expect(x, `${game.id} preview x`).toBeLessThan(SCREEN_W);
        expect(y, `${game.id} preview y`).toBeGreaterThanOrEqual(0);
        expect(y, `${game.id} preview y`).toBeLessThan(SCREEN_H);
      }
    }
  });

  it('每款游戏的 preview 不为空且无重复点', () => {
    for (const game of defaultGames.list()) {
      expect(game.preview.length, `${game.id} preview`).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const [x, y] of game.preview) {
        const key = `${x},${y}`;
        expect(seen.has(key), `${game.id} 重复点 ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });
});
