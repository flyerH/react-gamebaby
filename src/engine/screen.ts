import type { Bitmap, BlitMode, Screen, Unsubscribe } from './types';

/**
 * 创建纯内存 framebuffer 屏幕
 *
 * 设计要点：
 * - 越界写静默忽略、越界读返回 false —— 简化上层绘制逻辑，不引入 if 散布
 * - 任何写操作都会触发订阅者通知；游戏循环每帧 `scene.clear → render → screen.commit`
 *   只会通知一次，开销可控（20×10 = 200 像素，一次复制可忽略）
 * - `buffer` 字段直接暴露 Uint8Array，供渲染器零拷贝读取
 */
export function createScreen(width: number, height: number): Screen {
  // 必须是正整数：浮点尺寸会让 y * width + x 落到 Uint8Array 的对象属性
  // 而非 typed array 内部 buffer，写入像素静默丢失
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`非法屏幕尺寸：${String(width)}×${String(height)}`);
  }
  const size = width * height;
  const buffer = new Uint8Array(size);
  const subs = new Set<() => void>();

  const notify = (): void => {
    for (const fn of subs) fn();
  };

  // 同上：坐标也必须是整数；浮点 x/y 会让索引计算落到对象属性
  const inBounds = (x: number, y: number): boolean =>
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < width && y >= 0 && y < height;

  return {
    width,
    height,
    buffer,

    setPixel(x: number, y: number, on: boolean): void {
      if (!inBounds(x, y)) return;
      const next = on ? 1 : 0;
      const idx = y * width + x;
      if (buffer[idx] === next) return;
      buffer[idx] = next;
      notify();
    },

    getPixel(x: number, y: number): boolean {
      if (!inBounds(x, y)) return false;
      return buffer[y * width + x] === 1;
    },

    blit(x: number, y: number, bitmap: Bitmap, mode: BlitMode = 'overwrite'): void {
      const { width: bw, height: bh, data } = bitmap;
      let changed = false;
      for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
          const tx = x + bx;
          const ty = y + by;
          if (!inBounds(tx, ty)) continue;
          const src = data[by * bw + bx] ?? 0;
          const dstIdx = ty * width + tx;
          const prev = buffer[dstIdx]!;
          let next = prev;
          if (mode === 'overwrite') next = src;
          else if (mode === 'or') next = prev | src;
          else next = prev ^ src;
          if (next !== prev) {
            buffer[dstIdx] = next;
            changed = true;
          }
        }
      }
      if (changed) notify();
    },

    commit(source: Uint8Array): void {
      if (source.length !== size) {
        throw new Error(
          `commit buffer 长度不匹配：期望 ${String(size)}，实际 ${String(source.length)}`
        );
      }
      buffer.set(source);
      notify();
    },

    clear(): void {
      let dirty = false;
      for (let i = 0; i < size; i++) {
        if (buffer[i] !== 0) {
          buffer[i] = 0;
          dirty = true;
        }
      }
      if (dirty) notify();
    },

    subscribe(fn: () => void): Unsubscribe {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

/** 便捷构造：从 0/1 的二维数组构造 Bitmap */
export function bitmapFromRows(rows: ReadonlyArray<ReadonlyArray<0 | 1>>): Bitmap {
  const height = rows.length;
  const width = height === 0 ? 0 : (rows[0]?.length ?? 0);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    if (!row || row.length !== width) {
      throw new Error('bitmapFromRows：各行长度必须一致');
    }
    for (let x = 0; x < width; x++) {
      data[y * width + x] = row[x]!;
    }
  }
  return { width, height, data };
}
