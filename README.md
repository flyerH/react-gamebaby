# react-gamebaby

> 复刻童年的 "俄罗斯方块" 复古掌机 —— 贪吃蛇 / 俄罗斯方块 / 坦克大战等经典游戏的
> 统一架构 web 实现，并以此沉淀一套端到端 AI 工程化实践。

🕹️ **在线试玩**：[https://gamebaby.strawtc.cn/](https://gamebaby.strawtc.cn/)

## 特性

- **像素级复刻真机外观**：10×20 LCD 阴影格 + 真机外壳 + D-pad / Rotate / Pause / Sound / Reset 物理按键 + WebAudio sample + Oscillator 合成的 8-bit 音效。
- **多游戏统一架构**：Snake / Tetris / Tank 共享同一套 `Game<S>` 接口；新游戏只需实现 `init / step / render / onButton`，自动接入菜单 / Ticker / 输入总线 / 持久化 / 音效。
- **可玩 + 可训练**：浏览器跑游戏，Node 跑 RL 训练（DQN + tfjs-node），同一份 engine / SDK 代码两端复用；Snake 的训练模型可在站内"AI 自动玩"加载。
- **AI 工程化协作**：[`AGENTS.md`](AGENTS.md) 编码规范 + Cursor Skills（如 `add-game` 骨架生成）+ 自动 PR Code Review（CodeRabbit + Gemini Code Assist）+ master push 自动部署到 VPS。

## 架构总览

```text
L4  UI Shell   —— React 组件、DOM 渲染
L3  Engine     —— Screen / Ticker / InputBus / Sound / Storage / Context（DOM-agnostic）
 └─ Platform   —— 平台专属实现：headless（Node 训练）+ browser（浏览器）
L2  SDK        —— Game 接口、GameEnv、Registry、draw helpers
L1  Games      —— 各款游戏实现（纯函数）
```

完整设计见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 本地开发

需要 Node ≥ 20.19 + pnpm 10。

```bash
pnpm install
pnpm dev             # http://localhost:8088/
pnpm test            # 一次性跑完 Vitest
pnpm lint            # ESLint
pnpm build           # tsc --noEmit + Vite production build
```

## 部署

master 每次 push 自动通过 GitHub Actions 构建并 rsync 到 VPS，详见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 协作规范

[`AGENTS.md`](AGENTS.md) 是项目的核心协作规范，约定编码风格 / 测试 / 提交 / AI 协作流程，**人类与 AI 共同遵守**。

## License

[MIT](LICENSE)
