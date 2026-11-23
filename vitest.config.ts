import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // 已有 18+ 测试文件，关掉 passWithNoTests：测试文件被误删 / include
    // 配置失效时 CI 不会以 0 个测试通过而漏掉回归
    passWithNoTests: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // text: 终端摘要；html: 本地浏览看详情；lcov: 通用格式给外部服务；
      // json-summary + json: PR 评论 action 需要的机器可读格式
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      // 覆盖率 gate 只卡可确定性复用的核心（engine / sdk / games / machine + AI）：
      // app / ui / training 属于外围的入口装配与展示，按 AGENTS 约定按需测试，
      // 不作为全局门槛阻断 PR
      exclude: [
        '**/*.config.*',
        '**/*.d.ts',
        'src/app/**',
        'src/ui/**',
        'src/training/**',
        'src/**/index.ts', // 各目录的 barrel re-export，无实际逻辑
        'src/**/__tests__/**',
        'dist/**',
      ],
      // 覆盖率门槛：低于这些数值 vitest 会以非零码退出 → CI 失败 → 阻挡 PR
      // 合并。取接入门槛时实际覆盖率向下取约 1% buffer，避免常规小改动卡
      // PR；补完 sample 路径的 mock 测试后这几个数应该能整体上调
      thresholds: {
        lines: 88,
        statements: 86,
        functions: 85,
        branches: 81,
      },
    },
  },
});
