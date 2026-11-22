import { describe, it, expect, vi } from 'vitest';
import { bitmapFromRows, createScreen } from '../screen';

describe('createScreen', () => {
  it('非法尺寸抛错', () => {
    expect(() => createScreen(0, 10)).toThrow();
    expect(() => createScreen(10, -1)).toThrow();
  });

  it('初始 buffer 全零，长度 = width × height', () => {
    const s = createScreen(4, 3);
    expect(s.buffer.length).toBe(12);
    expect(Array.from(s.buffer)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('setPixel / getPixel 基础读写', () => {
    const s = createScreen(5, 5);
    s.setPixel(1, 2, true);
    expect(s.getPixel(1, 2)).toBe(true);
    expect(s.getPixel(0, 0)).toBe(false);
    s.setPixel(1, 2, false);
    expect(s.getPixel(1, 2)).toBe(false);
  });

  it('越界写静默忽略、越界读返回 false', () => {
    const s = createScreen(3, 3);
    s.setPixel(-1, 0, true);
    s.setPixel(3, 0, true);
    s.setPixel(0, 10, true);
    expect(s.getPixel(-1, 0)).toBe(false);
    expect(s.getPixel(3, 0)).toBe(false);
    expect(Array.from(s.buffer)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('setPixel 值未变化时不通知订阅者', () => {
    const s = createScreen(2, 2);
    const spy = vi.fn();
    s.subscribe(spy);
    s.setPixel(0, 0, false);
    expect(spy).not.toHaveBeenCalled();
    s.setPixel(0, 0, true);
    expect(spy).toHaveBeenCalledTimes(1);
    s.setPixel(0, 0, true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clear 清屏并通知一次', () => {
    const s = createScreen(2, 2);
    s.setPixel(0, 0, true);
    s.setPixel(1, 1, true);
    const spy = vi.fn();
    s.subscribe(spy);
    s.clear();
    expect(Array.from(s.buffer)).toEqual([0, 0, 0, 0]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('commit 整块覆盖；长度不符抛错', () => {
    const s = createScreen(2, 2);
    s.commit(new Uint8Array([1, 0, 0, 1]));
    expect(Array.from(s.buffer)).toEqual([1, 0, 0, 1]);
    expect(() => s.commit(new Uint8Array([1, 0, 0]))).toThrow();
  });

  describe('blit', () => {
    const sprite = bitmapFromRows([
      [1, 1],
      [0, 1],
    ]);

    it('overwrite（默认）：覆盖目标区域', () => {
      const s = createScreen(3, 3);
      s.setPixel(0, 0, true);
      s.blit(0, 0, sprite);
      expect(s.getPixel(0, 0)).toBe(true);
      expect(s.getPixel(1, 0)).toBe(true);
      expect(s.getPixel(0, 1)).toBe(false);
      expect(s.getPixel(1, 1)).toBe(true);
    });

    it('or：保留已有亮点，叠加新亮点', () => {
      const s = createScreen(3, 3);
      s.setPixel(0, 1, true);
      s.blit(0, 0, sprite, 'or');
      expect(s.getPixel(0, 1)).toBe(true);
      expect(s.getPixel(1, 1)).toBe(true);
    });

    it('xor：已亮被擦除，未亮被点亮', () => {
      const s = createScreen(3, 3);
      s.setPixel(0, 0, true);
      s.blit(0, 0, sprite, 'xor');
      expect(s.getPixel(0, 0)).toBe(false);
      expect(s.getPixel(1, 0)).toBe(true);
      expect(s.getPixel(1, 1)).toBe(true);
    });

    it('超出屏幕边界的像素被裁剪', () => {
      const s = createScreen(3, 3);
      s.blit(2, 2, sprite); // 仅右下角 (2,2) 能落在屏幕内
      expect(s.getPixel(2, 2)).toBe(true);
    });

    it('没有实际变化时不通知', () => {
      const s = createScreen(3, 3);
      s.blit(0, 0, bitmapFromRows([[0, 0]]));
      const spy = vi.fn();
      s.subscribe(spy);
      s.blit(0, 0, bitmapFromRows([[0, 0]]));
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('subscribe 的 unsubscribe 后不再收到通知', () => {
    const s = createScreen(2, 2);
    const spy = vi.fn();
    const off = s.subscribe(spy);
    s.setPixel(0, 0, true);
    off();
    s.setPixel(1, 1, true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  describe('batch', () => {
    it('批内多次写只在结束时通知一次', () => {
      const s = createScreen(4, 4);
      const spy = vi.fn();
      s.subscribe(spy);
      s.batch(() => {
        s.setPixel(0, 0, true);
        s.setPixel(1, 0, true);
        s.setPixel(2, 0, true);
        // 批内还没通知
        expect(spy).not.toHaveBeenCalled();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      // 写入照常生效
      expect(s.getPixel(0, 0)).toBe(true);
      expect(s.getPixel(2, 0)).toBe(true);
    });

    it('批内无实际变化不通知', () => {
      const s = createScreen(2, 2);
      const spy = vi.fn();
      s.subscribe(spy);
      s.batch(() => {
        s.setPixel(0, 0, false); // 本就是 0，不算变化
        s.clear(); // 本就全 0
      });
      expect(spy).not.toHaveBeenCalled();
    });

    it('嵌套 batch 只在最外层结束时通知一次', () => {
      const s = createScreen(3, 3);
      const spy = vi.fn();
      s.subscribe(spy);
      s.batch(() => {
        s.setPixel(0, 0, true);
        s.batch(() => {
          s.setPixel(1, 1, true);
        });
        // 内层结束不应通知
        expect(spy).not.toHaveBeenCalled();
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('batch 结束后再写恢复逐次通知', () => {
      const s = createScreen(2, 2);
      const spy = vi.fn();
      s.subscribe(spy);
      s.batch(() => {
        s.setPixel(0, 0, true);
      });
      expect(spy).toHaveBeenCalledTimes(1);
      s.setPixel(1, 1, true);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('fn 抛错也会恢复批深度并对已写入变更通知一次', () => {
      const s = createScreen(2, 2);
      const spy = vi.fn();
      s.subscribe(spy);
      expect(() =>
        s.batch(() => {
          s.setPixel(0, 0, true);
          throw new Error('boom');
        })
      ).toThrow('boom');
      // 抛错后仍通知一次（buffer 已变），且批深度已复位
      expect(spy).toHaveBeenCalledTimes(1);
      s.setPixel(1, 1, true);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});

describe('bitmapFromRows', () => {
  it('正确构造出 Bitmap', () => {
    const b = bitmapFromRows([
      [1, 0, 1],
      [0, 1, 0],
    ]);
    expect(b.width).toBe(3);
    expect(b.height).toBe(2);
    expect(Array.from(b.data)).toEqual([1, 0, 1, 0, 1, 0]);
  });

  it('各行长度不一致时抛错', () => {
    expect(() =>
      bitmapFromRows([
        [1, 0],
        [0, 1, 1],
      ])
    ).toThrow();
  });
});
