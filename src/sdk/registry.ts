import type { AnyGame as Game } from './types';

/**
 * 游戏注册表：只读快照 + O(1) id 查找
 *
 * 设计要点：
 * - 构造时一次性冻结 games 列表，后续 list() 拿到的永远是同一个数组引用，
 *   便于 React / Zustand 做引用相等判断
 * - 重复 id 在构造时就抛，避免运行时静默覆盖
 */
export interface GameRegistry {
  readonly list: () => ReadonlyArray<Game>;
  readonly get: (id: string) => Game | undefined;
  readonly size: number;
}

export function createRegistry(games: ReadonlyArray<Game>): GameRegistry {
  const frozen = Object.freeze([...games]);
  const byId = new Map<string, Game>();
  for (const g of frozen) {
    if (byId.has(g.id)) {
      throw new Error(`游戏 id 冲突：${g.id}`);
    }
    byId.set(g.id, g);
  }
  return Object.freeze({
    list: () => frozen,
    get: (id: string) => byId.get(id),
    size: frozen.length,
  });
}
