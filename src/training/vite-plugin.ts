/**
 * 训练 API Vite Plugin
 *
 * 把训练产物目录（models/snake-dqn/ 等）映射到 /api/training/*，
 * 供训练页面 fetch JSONL 日志和加载模型文件。
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve, relative } from 'path';

import type { Plugin } from 'vite';

const PREFIX = '/api/training/';

export function trainingApiPlugin(opts: { dir: string }): Plugin {
  const baseDir = resolve(opts.dir);

  return {
    name: 'training-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/') {
          req.url = '/training.html';
        }

        if (!req.url?.startsWith(PREFIX)) return next();

        const filePath = resolve(baseDir, req.url.slice(PREFIX.length));

        // 防止路径遍历：确保解析后的路径仍在 baseDir 内
        const rel = relative(baseDir, filePath);
        if (rel.startsWith('..') || resolve(baseDir, rel) !== filePath) {
          res.statusCode = 403;
          res.end();
          return;
        }

        if (!existsSync(filePath)) {
          res.statusCode = 404;
          res.end();
          return;
        }

        const ct = filePath.endsWith('.json')
          ? 'application/json'
          : filePath.endsWith('.jsonl')
            ? 'application/x-ndjson'
            : 'application/octet-stream';

        void readFile(filePath).then(
          (content) => {
            res.setHeader('Content-Type', ct);
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(content);
          },
          () => {
            res.statusCode = 500;
            res.end();
          }
        );
      });
    },
  };
}
