/**
 * Snake DQN 训练 CLI
 *
 * 用法：pnpm train [--episodes 5000] [--seed 42] [--out models/snake-dqn]
 *
 * 训练循环：
 * 1. 每 episode 重置环境，agent 用 epsilon-greedy 选动作
 * 2. 每步把 transition 推入 ReplayBuffer
 * 3. buffer 够大后定期做 mini-batch 训练
 * 4. 定期打印进度 + 写 JSONL 训练日志
 * 5. 训练结束保存模型
 *
 * 训练日志 `<outDir>/train-log.jsonl` 每行一个 JSON，
 * 可供后续 dashboard 读取绘制 reward 曲线。
 */

// tfjs-node 原生后端（C++ 加速）；若未安装自动 fallback 到纯 JS
try {
  await import('@tensorflow/tfjs-node');
} catch {
  // fallback：纯 JS 后端，慢但能用
}

import * as tf from '@tensorflow/tfjs';

import { createSnakeRLEnv } from '@/games/snake/rl';

import { createDQNAgent } from './dqn';
import { createReplayBuffer } from './replay-buffer';

/* ---------- 命令行参数解析 ---------- */

function parseArgs(): { episodes: number; seed: number; outDir: string } {
  const args = process.argv.slice(2);
  let episodes = 3000;
  let seed = 42;
  let outDir = 'models/snake-dqn';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--episodes' && next) {
      episodes = parseInt(next, 10);
      i++;
    } else if (arg === '--seed' && next) {
      seed = parseInt(next, 10);
      i++;
    } else if (arg === '--out' && next) {
      outDir = next;
      i++;
    }
  }

  return { episodes, seed, outDir };
}

/* ---------- 训练参数 ---------- */

const FIELD_W = 10;
const FIELD_H = 10;
const BATCH_SIZE = 32;
const BUFFER_CAPACITY = 50000;
const MIN_BUFFER_SIZE = 500;
const TRAIN_EVERY = 4;
const LOG_INTERVAL = 100;

/* ---------- 主训练循环 ---------- */

async function main(): Promise<void> {
  await tf.ready();
  const backend = tf.getBackend();
  console.log(`[训练] tfjs backend: ${backend}`);

  const { episodes, seed, outDir } = parseArgs();
  console.log(`[训练] episodes=${episodes}, seed=${seed}, output=${outDir}`);

  const env = createSnakeRLEnv({
    width: FIELD_W,
    height: FIELD_H,
    seed,
    maxIdleSteps: FIELD_W * FIELD_H * 2,
  });

  const obsSize = env.observationShape.reduce((a, b) => a * b, 1);

  const agent = createDQNAgent({
    observationShape: env.observationShape,
    numActions: env.actionSpace.length,
    learningRate: 0.0005,
    gamma: 0.95,
    epsilonStart: 1.0,
    epsilonEnd: 0.05,
    epsilonDecaySteps: episodes * 5,
    targetUpdateFreq: 500,
  });

  const buffer = createReplayBuffer(BUFFER_CAPACITY, obsSize);

  // 训练日志（JSONL 格式）
  const fs = await import('fs');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const logPath = `${outDir}/train-log.jsonl`;
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });

  // 统计
  const recentRewards: number[] = [];
  const recentLengths: number[] = [];
  let totalSteps = 0;
  let recentLoss = 0;
  let lossCount = 0;

  // 训练 CLI 的墙钟计时，不影响游戏确定性
  const startTime = process.hrtime.bigint();

  for (let ep = 0; ep < episodes; ep++) {
    let rlState = env.reset(seed + ep);
    let episodeReward = 0;
    let steps = 0;

    while (true) {
      const obs = env.encodeState(rlState);
      const actionIdx = agent.act(obs);
      const action = env.actionSpace[actionIdx]!;

      const result = env.step(rlState, action);
      const nextObs = env.encodeState(result.state);

      buffer.push({
        obs,
        action: actionIdx,
        reward: result.reward,
        nextObs,
        done: result.done,
      });

      episodeReward += result.reward;
      steps++;
      totalSteps++;

      if (buffer.size >= MIN_BUFFER_SIZE && totalSteps % TRAIN_EVERY === 0) {
        const batch = buffer.sample(BATCH_SIZE, totalSteps);
        const loss = agent.train(batch);
        recentLoss += loss;
        lossCount++;
      }

      if (result.done) break;
      rlState = result.state;
    }

    recentRewards.push(episodeReward);
    recentLengths.push(steps);

    // 每 episode 写一行 JSON 日志
    const logEntry = {
      ep: ep + 1,
      reward: +episodeReward.toFixed(3),
      length: steps,
      score: rlState.score,
      epsilon: +agent.epsilon.toFixed(4),
    };
    logStream.write(JSON.stringify(logEntry) + '\n');

    // 定期打印终端摘要
    if ((ep + 1) % LOG_INTERVAL === 0) {
      const avgReward = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;
      const avgLength = recentLengths.reduce((a, b) => a + b, 0) / recentLengths.length;
      const avgLoss = lossCount > 0 ? recentLoss / lossCount : 0;
      const elapsed = (Number(process.hrtime.bigint() - startTime) / 1e9).toFixed(1);

      console.log(
        `[ep ${ep + 1}/${episodes}] ` +
          `avgReward=${avgReward.toFixed(2)}, ` +
          `avgLen=${avgLength.toFixed(1)}, ` +
          `eps=${agent.epsilon.toFixed(3)}, ` +
          `loss=${avgLoss.toFixed(4)}, ` +
          `steps=${totalSteps}, ` +
          `time=${elapsed}s`
      );

      // ASCII 进度条
      const pct = Math.floor(((ep + 1) / episodes) * 40);
      const bar = '█'.repeat(pct) + '░'.repeat(40 - pct);
      console.log(`  [${bar}] ${(((ep + 1) / episodes) * 100).toFixed(0)}%\n`);

      recentRewards.length = 0;
      recentLengths.length = 0;
      recentLoss = 0;
      lossCount = 0;
    }
  }

  logStream.end();

  // 保存模型
  await agent.save(outDir);
  console.log(`[训练] 模型已保存到 ${outDir}/`);
  console.log(`[训练] 日志已写入 ${logPath}`);

  agent.dispose();
  console.log('[训练] 完成');
}

main().catch((err: unknown) => {
  console.error('[训练] 失败:', err);
  process.exit(1);
});
