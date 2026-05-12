/**
 * 训练 API Vite Plugin
 *
 * 把训练产物目录（models/snake-dqn/ 等）映射到 /api/training/*，
 * 供训练页面 fetch JSONL 日志和加载模型文件。
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import type { Plugin } from 'vite';

const PREFIX = '/api/training/';

export function trainingApiPlugin(opts: { dir: string }): Plugin {
  return {
    name: 'training-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // / → /training.html，省得 URL 要带文件名
        if (req.url === '/') {
          req.url = '/training.html';
        }

        if (!req.url?.startsWith(PREFIX)) return next();

        const filePath = resolve(opts.dir, req.url.slice(PREFIX.length));
        if (!existsSync(filePath)) {
          res.statusCode = 404;
          res.end();
          return;
        }

        const content = readFileSync(filePath);
        const ct = filePath.endsWith('.json')
          ? 'application/json'
          : filePath.endsWith('.jsonl')
            ? 'application/x-ndjson'
            : 'application/octet-stream';

        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(content);
      });
    },
  };
}
