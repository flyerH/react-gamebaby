import { afterEach, describe, expect, it } from 'vitest';

import { createReplayBuffer, type Transition } from '../replay-buffer';
import { createDQNAgent, type DQNAgent } from '../dqn';

/**
 * DQN 基础测试
 *
 * 用极小的观测空间（2x2x1）和 2 个动作做快速验证，
 * 不追求训练效果，只验证接口正确性和张量不泄漏。
 */

const OBS_SHAPE = [2, 2, 1] as const;
const NUM_ACTIONS = 2;
const OBS_SIZE = 2 * 2 * 1;

function makeObs(val: number): Float32Array {
  return new Float32Array([val, val, val, val]);
}

function makeTrans(action: number): Transition {
  return {
    obs: makeObs(action * 0.1),
    action,
    reward: action === 1 ? 1.0 : -0.5,
    nextObs: makeObs((action + 1) * 0.1),
    done: false,
  };
}

describe('DQNAgent', () => {
  let agent: DQNAgent;

  afterEach(() => {
    agent?.dispose();
  });

  it('创建成功且初始 epsilon 为 epsilonStart', () => {
    agent = createDQNAgent({
      observationShape: OBS_SHAPE,
      numActions: NUM_ACTIONS,
      epsilonStart: 1.0,
    });
    expect(agent.epsilon).toBeCloseTo(1.0);
    expect(agent.trainSteps).toBe(0);
  });

  it('act 返回合法 action index', () => {
    agent = createDQNAgent({
      observationShape: OBS_SHAPE,
      numActions: NUM_ACTIONS,
    });
    const obs = makeObs(0.5);
    const action = agent.act(obs);
    expect(action).toBeGreaterThanOrEqual(0);
    expect(action).toBeLessThan(NUM_ACTIONS);
  });

  it('train 返回有限 loss 且 trainSteps 递增', () => {
    agent = createDQNAgent({
      observationShape: OBS_SHAPE,
      numActions: NUM_ACTIONS,
    });

    const buffer = createReplayBuffer(100, OBS_SIZE);
    for (let i = 0; i < 32; i++) {
      buffer.push(makeTrans(i % 2));
    }

    const batch = buffer.sample(16, 42);
    const loss = agent.train(batch);

    expect(Number.isFinite(loss)).toBe(true);
    expect(loss).toBeGreaterThanOrEqual(0);
    expect(agent.trainSteps).toBe(1);
  });

  it('多次 train 后 epsilon 衰减', () => {
    agent = createDQNAgent({
      observationShape: OBS_SHAPE,
      numActions: NUM_ACTIONS,
      epsilonStart: 1.0,
      epsilonEnd: 0.1,
      epsilonDecaySteps: 10,
    });

    const buffer = createReplayBuffer(100, OBS_SIZE);
    for (let i = 0; i < 32; i++) {
      buffer.push(makeTrans(i % 2));
    }

    const initialEps = agent.epsilon;
    for (let i = 0; i < 5; i++) {
      agent.train(buffer.sample(8, i));
    }
    expect(agent.epsilon).toBeLessThan(initialEps);
  });

  it('epsilon=0 时 act 走 greedy（不随机）', () => {
    agent = createDQNAgent({
      observationShape: OBS_SHAPE,
      numActions: NUM_ACTIONS,
    });
    const obs = makeObs(0.5);
    // 连续调多次，epsilon=0 应该都返回同一个 action
    const actions = new Set<number>();
    for (let i = 0; i < 10; i++) {
      actions.add(agent.act(obs, 0));
    }
    expect(actions.size).toBe(1);
  });

  it('syncTarget 不抛错', () => {
    agent = createDQNAgent({
      observationShape: OBS_SHAPE,
      numActions: NUM_ACTIONS,
    });
    expect(() => agent.syncTarget()).not.toThrow();
  });
});
