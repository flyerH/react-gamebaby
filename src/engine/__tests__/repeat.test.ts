import { beforeEach, describe, expect, it } from 'vitest';

import { createInputBus } from '../input';
import { bindPressRepeat, type Schedule } from '../repeat';
import type { Button, ButtonAction, InputBus } from '../types';

/** 手动推进的假计时器：advance(ms) 依次触发到期任务 */
function createFakeSchedule(): { schedule: Schedule; advance: (ms: number) => void } {
  let now = 0;
  let seq = 0;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  return {
    schedule: (fn, ms) => {
      const id = seq++;
      tasks.set(id, { at: now + ms, fn });
      return () => {
        tasks.delete(id);
      };
    },
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        let nextId = -1;
        let nextAt = Infinity;
        for (const [id, t] of tasks) {
          if (t.at <= end && t.at < nextAt) {
            nextId = id;
            nextAt = t.at;
          }
        }
        const task = tasks.get(nextId);
        if (!task) break;
        tasks.delete(nextId);
        now = task.at;
        task.fn();
      }
      now = end;
    },
  };
}

describe('bindPressRepeat', () => {
  let input: InputBus;
  let log: Array<[Button, ButtonAction]>;
  let fake: ReturnType<typeof createFakeSchedule>;

  beforeEach(() => {
    input = createInputBus();
    log = [];
    input.subscribe((btn, action) => log.push([btn, action]));
    fake = createFakeSchedule();
  });

  it('游戏键 press 后 delay 到期开始 repeat，之后按 interval 重复', () => {
    bindPressRepeat(input, { schedule: fake.schedule, delayMs: 200, intervalMs: 50 });

    input.emit('Right', 'press');
    fake.advance(199);
    expect(log).toEqual([['Right', 'press']]);
    fake.advance(1);
    expect(log[1]).toEqual(['Right', 'repeat']);
    fake.advance(150);
    expect(log.filter(([, a]) => a === 'repeat')).toHaveLength(4);
  });

  it('release 后停止 repeat', () => {
    bindPressRepeat(input, { schedule: fake.schedule, delayMs: 100, intervalMs: 50 });

    input.emit('A', 'press');
    fake.advance(150);
    input.emit('A', 'release');
    const count = log.length;
    fake.advance(500);
    expect(log).toHaveLength(count);
    expect(log[log.length - 1]).toEqual(['A', 'release']);
  });

  it('控制键长按不产生 repeat', () => {
    bindPressRepeat(input, { schedule: fake.schedule, delayMs: 100, intervalMs: 50 });

    for (const btn of ['Start', 'Pause', 'Sound', 'Reset', 'Select'] as const) {
      input.emit(btn, 'press');
    }
    fake.advance(1000);
    expect(log.every(([, a]) => a === 'press')).toBe(true);
  });

  it('同一键重复 press 不会叠加多条 repeat 节奏', () => {
    bindPressRepeat(input, { schedule: fake.schedule, delayMs: 100, intervalMs: 100 });

    input.emit('Up', 'press');
    input.emit('Up', 'press');
    // 单条节奏在 100 / 200 / 300ms 各触发一次；叠加两条会是 6 次
    fake.advance(300);
    expect(log.filter(([, a]) => a === 'repeat')).toHaveLength(3);
  });

  it('未传 delay / interval 时使用默认 250ms / 100ms', () => {
    bindPressRepeat(input, { schedule: fake.schedule });

    input.emit('Down', 'press');
    fake.advance(249);
    expect(log).toHaveLength(1);
    fake.advance(1);
    expect(log).toHaveLength(2);
    fake.advance(100);
    expect(log).toHaveLength(3);
  });

  it('解绑后清掉未到期的计时器，也不再响应新的 press', () => {
    const unbind = bindPressRepeat(input, { schedule: fake.schedule, delayMs: 100 });

    input.emit('Left', 'press');
    unbind();
    fake.advance(1000);
    input.emit('Right', 'press');
    fake.advance(1000);
    expect(log).toEqual([
      ['Left', 'press'],
      ['Right', 'press'],
    ]);
  });
});
