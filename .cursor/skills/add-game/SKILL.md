---
name: add-game
description: 为 react-gamebaby 新增一款游戏，生成骨架文件并注册到 Registry。当用户要求添加新游戏（如 tank、breakout、frogger）时使用。
---

# 新增游戏

在 `src/games/<name>/` 下生成完整骨架并注册到应用。

## 步骤

### 1. 确认游戏名

向用户确认 `<name>`（kebab-case，如 `brick-breaker`）和中文名称。

### 2. 创建骨架文件

```
src/games/<name>/
  state.ts     —— 状态类型
  logic.ts     —— 游戏逻辑
  preview.ts   —— 菜单预览点阵
  index.ts     —— 导出 Game 对象
  __tests__/<name>.test.ts —— 基础测试
```

#### state.ts

```typescript
import type { GameEnv, Pixel } from '@/sdk';

export interface <Name>State {
  readonly width: number;
  readonly height: number;
  readonly over: boolean;
  readonly score: number;
  readonly awaitingFirstMove: boolean;
  readonly overFrame: number;
  // 游戏特有字段…
}
```

#### logic.ts

```typescript
import type { Button, ButtonAction } from '@/engine/types';
import type { GameEnv, GameInitOptions } from '@/sdk';
import type { <Name>State } from './state';

export function init(env: GameEnv, opts?: GameInitOptions): <Name>State {
  const { width, height } = env.screen;
  // …
}

export function step(env: GameEnv, state: <Name>State): <Name>State {
  if (state.awaitingFirstMove || state.over) return state;
  // …
}

export function render(env: GameEnv, state: <Name>State): void {
  const { screen } = env;
  screen.clear();
  // …
}

export function onButton(
  env: GameEnv, state: <Name>State, btn: Button, action: ButtonAction,
): <Name>State {
  if (action === 'release') return state;
  // …
}

export function isGameOver(state: <Name>State): boolean {
  return state.over;
}
```

#### preview.ts

10x20 屏幕上的预览点阵，上部为类别字母（A/B/C…），下部为游戏编号。参考 `src/games/snake/preview.ts` 的格式。

#### index.ts

```typescript
import type { Game, GameEnv } from '@/sdk';
import { init, isGameOver, onButton, render, step } from './logic';
import { <name>Preview } from './preview';
import type { <Name>State } from './state';

export const <name>: Game<<Name>State> = {
  id: '<name>',
  name: '<NAME>',
  preview: <name>Preview,
  tickSpeeds: [1, 1.5, 2, 2.5, 3.5, 4.5, 6, 8, 10],
  init, step, render, onButton, isGameOver,
};
```

### 3. 注册到 App

在 `src/app/App.tsx` 的 `GAMES` 数组中追加新游戏 import。

### 4. 基础测试

在 `__tests__/<name>.test.ts` 中至少覆盖：

- `init` 返回合法初始状态
- `step` 在 `awaitingFirstMove` 时不推进
- `onButton` 方向键改变状态
- `isGameOver` 在 `over=false` 时返回 false

使用 `createHeadlessContext` + `toGameEnv` 构造测试环境。

### 5. 运行验证

```bash
pnpm test
pnpm lint
pnpm build
```

## 约束提醒

- State 所有字段 `readonly`，函数返回新对象
- 随机走 `env.rng()`，禁用 `Math.random()`
- 不 import DOM / React / window
- 详见 `src/games/AGENTS.md`
