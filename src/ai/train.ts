/**
 * Snake DQN 训练 CLI
 *
 * 用法：pnpm train [--episodes 5000] [--seed 42] [--out models/snake-dqn] [--no-dashboard]
 *
 * 架构：
 * - 带 dashboard（默认）：主进程启动 Vite dev server，fork 子进程跑训练。
 *   两个进程通过 JSONL 文件通信，互不阻塞。
 * - --no-dashboard：单进程直接跑训练，无 Vite。
 */

// tfjs-node 原生后端（C++ 加速）；若未安装自动 fallback 到纯 JS
try {
  await import('@tensorflow/tfjs-node');
} catch {
  // fallback：纯 JS 后端，慢但能用
}

import * as tf from '@tensorflow/tfjs';

import { createSnakeRLEnv } from '@/games/snake/rl';
import { trainingApiPlugin } from '@/training/vite-plugin';

import { createDQNAgent } from './dqn';
import { createReplayBuffer } from './replay-buffer';

/* ---------- 命令行参数解析 ---------- */

interface TrainArgs {
  episodes: number;
  seed: number;
  outDir: string;
  dashboard: boolean;
}

function parseArgs(): TrainArgs {
  const args = process.argv.slice(2);
  let episodes = 3000;
  let seed = 42;
  let outDir = 'models/snake-dqn';
  let dashboard = true;

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
    } else if (arg === '--no-dashboard') {
      dashboard = false;
    }
  }

  return { episodes, seed, outDir, dashboard };
}

/* ---------- 训练参数 ---------- */

const FIELD_W = 10;
const FIELD_H = 20;
const BATCH_SIZE = 32;
const BUFFER_CAPACITY = 50000;
const MIN_BUFFER_SIZE = 500;
const TRAIN_EVERY = 4;
const LOG_INTERVAL = 100;

/* ---------- 训练循环（子进程 / 单进程时执行） ---------- */

async function runTraining(args: TrainArgs): Promise<void> {
  await tf.ready();
  console.log(`[训练] tfjs backend: ${tf.getBackend()}`);

  const { episodes, seed, outDir } = args;
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

  const fs = await import('fs');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const logPath = `${outDir}/train-log.jsonl`;
  // 用 appendFileSync 逐行写入，确保每条数据立即落盘，Dashboard 实时可见
  const writeLog = (data: Record<string, unknown>): void => {
    fs.appendFileSync(logPath, JSON.stringify(data) + '\n');
  };
  fs.writeFileSync(logPath, '');
  writeLog({ totalEpisodes: episodes });

  const recentRewards: number[] = [];
  const recentLengths: number[] = [];
  let totalSteps = 0;
  let recentLoss = 0;
  let lossCount = 0;

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

    const logEntry = {
      ep: ep + 1,
      reward: +episodeReward.toFixed(3),
      length: steps,
      score: rlState.score,
      epsilon: +agent.epsilon.toFixed(4),
    };
    writeLog(logEntry);

    if ((ep + 1) % LOG_INTERVAL === 0) {
      const avgReward = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;
      const avgLength = recentLengths.reduce((a, b) => a + b, 0) / recentLengths.length;
      const avgLoss = lossCount > 0 ? recentLoss / lossCount : 0;
      const elapsed = (Number(process.hrtime.bigint() - startTime) / 1e9).toFixed(1);

      const summaryEntry = {
        ep: ep + 1,
        avgReward: +avgReward.toFixed(3),
        avgLength: +avgLength.toFixed(1),
        avgLoss: +avgLoss.toFixed(4),
        totalSteps,
        elapsedSec: +elapsed,
      };
      writeLog(summaryEntry);

      console.log(
        `[ep ${ep + 1}/${episodes}] ` +
          `avgReward=${avgReward.toFixed(2)}, ` +
          `avgLen=${avgLength.toFixed(1)}, ` +
          `eps=${agent.epsilon.toFixed(3)}, ` +
          `loss=${avgLoss.toFixed(4)}, ` +
          `steps=${totalSteps}, ` +
          `time=${elapsed}s`
      );

      const pct = Math.floor(((ep + 1) / episodes) * 40);
      const bar = '█'.repeat(pct) + '░'.repeat(40 - pct);
      console.log(`  [${bar}] ${(((ep + 1) / episodes) * 100).toFixed(0)}%\n`);

      recentRewards.length = 0;
      recentLengths.length = 0;
      recentLoss = 0;
      lossCount = 0;
    }
  }

  await agent.save(outDir);
  console.log(`[训练] 模型已保存到 ${outDir}/`);
  console.log(`[训练] 日志已写入 ${logPath}`);

  agent.dispose();
  console.log('[训练] 完成');
}

/* ---------- 入口 ---------- */

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.dashboard) {
    // 主进程：只跑 Vite，训练 fork 到子进程
    const fs = await import('fs');
    if (!fs.existsSync(args.outDir)) {
      fs.mkdirSync(args.outDir, { recursive: true });
    }
    // 先清空旧日志，防止 Dashboard 读到上轮训练的残留数据
    fs.writeFileSync(`${args.outDir}/train-log.jsonl`, '');

    const { fileURLToPath, URL: NodeURL } = await import('node:url');
    const { createServer } = await import('vite');
    const vite = await createServer({
      configFile: false,
      root: process.cwd(),
      plugins: [
        (await import('@vitejs/plugin-react')).default(),
        trainingApiPlugin({ dir: args.outDir }),
      ],
      resolve: {
        alias: { '@': fileURLToPath(new NodeURL('..', import.meta.url)) },
      },
      server: { port: 8089, open: '/' },
      appType: 'mpa',
    });
    await vite.listen();
    vite.printUrls();

    // fork 子进程跑训练，继承 tsx loader 和 stdio
    const { fork } = await import('child_process');
    const scriptPath = fileURLToPath(import.meta.url);
    const child = fork(
      scriptPath,
      [
        '--episodes',
        String(args.episodes),
        '--seed',
        String(args.seed),
        '--out',
        args.outDir,
        '--no-dashboard',
      ],
      {
        stdio: 'inherit',
        execArgv: process.execArgv,
      }
    );

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('[dashboard] 训练完成，Dashboard 仍在运行（按 Ctrl+C 退出）');
      } else {
        console.error(`[训练] 子进程异常退出 (code=${code})`);
        process.exit(1);
      }
    });
  } else {
    // 子进程 / --no-dashboard：直接跑训练
    await runTraining(args);
  }
}

main().catch((err: unknown) => {
  console.error('[训练] 失败:', err);
  process.exit(1);
});
