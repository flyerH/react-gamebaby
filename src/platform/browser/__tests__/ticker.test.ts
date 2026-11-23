import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRealtimeTicker } from '../ticker';

describe('createRealtimeTicker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回调传入 undefined 时回退到浏览器实现', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7);
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.spyOn(performance, 'now').mockReturnValue(0);

    const ticker = createRealtimeTicker({
      requestFrame: undefined,
      cancelFrame: undefined,
      now: undefined,
    });
    ticker.start(() => undefined);
    ticker.stop();

    expect(raf).toHaveBeenCalledTimes(1);
    expect(caf).toHaveBeenCalledWith(7);
  });
});
