# `src/training` · 训练可视化仪表盘

Node 端训练进程 + 浏览器端可视化面板，**不是**游戏运行时的一部分。

## 架构一览

```
Node 训练进程（src/ai/runtime/training.ts）
        ↓ 指标、轨迹
Hono HTTP + SSE（src/training/server.ts）
        ↓
浏览器仪表盘（src/training/dashboard/*.tsx）
   · ECharts 实时图表（reward / loss / epsilon）
   · 轨迹回放（基于 seed 复现，共用游戏引擎）
```

## 目录规划

| 目录 / 文件  | 职责                                              |
| ------------ | ------------------------------------------------- |
| `server.ts`  | Hono 服务器，暴露 SSE 推送与模型下载接口          |
| `dashboard/` | React 仪表盘：指标图、轨迹回放、超参表            |
| `storage/`   | 训练轨迹（seed + 指标）持久化（IndexedDB / 文件） |
| `metrics.ts` | 指标类型定义与聚合工具                            |

## 规则

- **仅开发期使用**：默认不随生产包发布。
- **回放走 `seed + 游戏引擎`**，不记录完整事件流。
- **不得污染游戏运行时**：游戏代码不应 `import` 本目录。

完整方案见 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §6。
