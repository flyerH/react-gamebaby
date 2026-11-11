import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createScreen } from '@/engine/screen';

import { ContentScreen } from '../ContentScreen';

function litCells(container: HTMLElement): number {
  return container.querySelectorAll('[data-on="1"]').length;
}

describe('ContentScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('默认用 DOM 渲染器：每个像素一个格子，亮灭跟随 Screen 变化', () => {
    const screen = createScreen(3, 2);
    screen.setPixel(0, 0, true);
    const { container } = render(<ContentScreen screen={screen} />);

    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelectorAll('[data-on]')).toHaveLength(6);
    expect(litCells(container)).toBe(1);

    act(() => {
      screen.batch(() => {
        screen.setPixel(0, 0, false);
        screen.setPixel(2, 1, true);
        screen.setPixel(1, 1, true);
      });
    });
    expect(litCells(container)).toBe(2);
  });

  it("renderer='canvas' 时挂载即绘制，Screen 每次通知重绘一遍", () => {
    const fillRect = vi.fn();
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      fillRect,
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
    };
    // getContext 有多个重载，按整个函数签名断言，避免 spyOn 只推断到 webgpu 那个
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => ctx) as unknown as HTMLCanvasElement['getContext']
    );
    const screen = createScreen(3, 2);
    const { container } = render(<ContentScreen screen={screen} renderer="canvas" />);

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.querySelector('[data-on]')).toBeNull();
    expect(fillRect).toHaveBeenCalledTimes(6);

    act(() => {
      screen.batch(() => {
        screen.setPixel(0, 0, true);
        screen.setPixel(1, 0, true);
      });
    });
    expect(fillRect).toHaveBeenCalledTimes(12);
  });

  it('切换渲染器后按当前 buffer 画出同样的画面', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const screen = createScreen(2, 2);
    const { container, rerender } = render(<ContentScreen screen={screen} renderer="canvas" />);

    act(() => {
      screen.setPixel(1, 1, true);
    });
    rerender(<ContentScreen screen={screen} renderer="dom" />);

    expect(container.querySelector('canvas')).toBeNull();
    expect(litCells(container)).toBe(1);
  });
});
