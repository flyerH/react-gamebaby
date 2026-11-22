# react-gamebaby

> 复刻经典的"俄罗斯方块"掌机，用统一架构在 Web 上实现贪吃蛇、俄罗斯方块、坦克大战等游戏，
> 并以此沉淀一套端到端 AI 工程化实践。

🕹️ 在线试玩：[https://gamebaby.strawtc.cn/](https://gamebaby.strawtc.cn/)

## 特性

- 像素级复刻真机外观：10×20 LCD 阴影格 + 真机外壳 + D-pad / Rotate / Pause / Sound / Reset 物理按键 + WebAudio sample + Oscillator 合成的 8-bit 音效。
- 多游戏统一架构：Snake / Tetris / Tank 共享同一套 `Game<S>` 接口；新游戏只需实现 `init / step / render / onButton`，自动接入菜单 / Ticker / 输入总线 / 持久化 / 音效。
- 可玩 + 可训练：浏览器跑游戏，Node 跑 RL 训练（DQN + tfjs-node），同一份 engine / SDK 代码两端复用；站内 AI 自动玩时加载 Snake 的训练模型。
- AI 工程化协作：[`AGENTS.md`](AGENTS.md) 编码规范 + Cursor Skills（如 `add-game` 骨架生成）+ 自动 PR Code Review（CodeRabbit）+ master push 自动部署到 VPS。

## 架构总览

```text
核心（纯 TS、确定性、可在 Node 运行）
  engine/    硬件接口：Screen / Ticker / InputBus / Sound / Storage
  sdk/       游戏契约：Game 接口、GameEnv、Registry
  games/     各款游戏（纯函数）
  machine/   主机固件：开关机、菜单、调速、绘制、最高分
外围
  platform/  宿主驱动：headless（Node 训练）/ browser（浏览器）/ wechat（微信小游戏）
  ui/        React 视图
  app/       入口装配：web（网页与 Android WebView）/ wechat（微信小游戏）
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

## 移动端 App（Android）

项目使用 Capacitor 打包为 Android App，复用同一套 Web UI + Engine 逻辑。
iOS 暂不在当前迭代范围内（架构上保留扩展空间，后续按需再加）。

```bash
pnpm mobile:sync                     # 先 build，再同步到 android/
pnpm mobile:android                  # 同步并打开 Android Studio 工程
pnpm mobile:run:android              # 生产构建并运行到已连接设备/模拟器
pnpm mobile:run:android:online       # 装一个直接加载线上域名的 APK
pnpm dev + pnpm mobile:dev:android   # 真机 livereload 开发（前端改动即时热更）
```

详细流程见 [`docs/MOBILE.md`](docs/MOBILE.md)。

## 微信小游戏

小游戏入口在 `src/app/wechat/`，复用同一套 engine / games / machine，机身用 canvas 按网页版的设计尺寸复刻。

```bash
pnpm wechat:build    # 构建到 wechat/dist/（game.js + game.json）
pnpm wechat:watch    # 监听源码变更并重新构建，开发者工具自动刷新
```

微信开发者工具导入 `wechat/` 目录。该目录的 `project.config.json`（含 AppID）提交进仓库，通过 `miniprogramRoot` 指向构建产物 `dist/`。小游戏不包含 AI 自动玩。

## 部署

master 每次 push 自动通过 GitHub Actions 构建并 rsync 到 VPS，详见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 协作规范

[`AGENTS.md`](AGENTS.md) 是项目的核心协作规范，约定编码风格 / 测试 / 提交 / AI 协作流程，人类与 AI 共同遵守。

## License

[MIT](LICENSE)
