# AI 工程化流水线

本仓库把"AI 自动化开发"拆成三层独立组件，按职责单一原则分别落地。任何一层都可以单独启用 / 禁用。

```
┌─────────────────────────────────────────────────────────────┐
│  C. Cursor Background Agent （云端 AI 开发者）               │
│     · 远程下发需求 → agent 穿完代码 → push 分支              │
│     · 配置在 Cursor 产品内，不通过 repo workflow             │
└────────────────────────┬────────────────────────────────────┘
                         │ push to feat/**
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  A. auto-pr.yml                                              │
│     · 自动开 PR / 复用已有 PR                                │
│     · 骨架 body：commit 列表                                 │
└────────────────────────┬────────────────────────────────────┘
                         │ pull_request opened / synchronize
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  B. ai-review.yml （Claude Code Action）                     │
│     · 按 AGENTS.md + ARCHITECTURE.md 做代码评审              │
│     · inline 评论 + 顶层总结                                 │
│     · 精修 PR body（加摘要）                                 │
└─────────────────────────────────────────────────────────────┘
                         │ 开发者 / AI 回应评审 → 追加 commit
                         ▼ （B 重新触发）
                         │ merge to master
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  deploy.yml                                                  │
│     · CI build + rsync 到 VPS（详见 docs/DEPLOY.md）         │
└─────────────────────────────────────────────────────────────┘
```

---

## 层 A：auto-pr.yml

**触发**：`feat/**` 或 `fix/**` 分支 push。
**动作**：检查是否已有同 head/base 的 open PR——有则跳过，没有则用 `gh pr create` 开一个，title 取最新 commit message，body 是 `origin/master..HEAD` 的 commit 列表。

**依赖**：无任何 secret。GitHub-hosted runner 自带 `gh` CLI，authentication 走 workflow 自带的 `GITHUB_TOKEN`。

**一次性配置**：仓库 Settings → Actions → General → Workflow permissions：

- 选 "Read and write permissions"
- 勾 "Allow GitHub Actions to create and approve pull requests"

## 层 B：ai-review.yml

**触发**：PR opened / synchronize / reopened / ready_for_review。
**动作**：跑 `anthropics/claude-code-action@v1`，把仓库 diff + 两份规范（AGENTS.md、docs/ARCHITECTURE.md）喂给 Claude，让它用 inline + 顶层评论完成代码评审，并用 `gh pr edit` 给 PR body 补一段中文摘要。

**依赖**：

| Secret              | 来源                                        |
| ------------------- | ------------------------------------------- |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |

**评审规范来自仓库内两份文件，workflow 本身不维护规则**：

- `AGENTS.md`：编码规范、命名、测试、依赖选型
- `docs/ARCHITECTURE.md`：分层依赖方向、确定性约束

改这两份文件即可调整评审口径，不用动 workflow。

**成本控制**：

- `if: github.event.pull_request.user.type != 'Bot'` 跳过 Dependabot 等自动 PR
- `concurrency.cancel-in-progress: true` 同 PR 新 commit 覆盖旧评审
- prompt 里明确"评论不要超过 10 条、忽略 src/legacy/、只说最高价值问题"

## 层 C：Cursor Background Agent

**是什么**：Cursor 产品自带的云端 agent，让你从手机 / 别处下发任务，agent 在 Cursor 云端跑完整个开发动作（穿代码、跑测试、push 分支），本机不需要开着。

**在本仓库怎么用**：

1. 在 Cursor 客户端：Settings → Features → Background Agents 启用
2. 下发任务时，agent 会自动读 `AGENTS.md` 与 `docs/ARCHITECTURE.md` 作为规则上下文
3. agent push 分支后，本仓库的层 A 与 层 B 自动接力：开 PR → AI 评审 → 你 review → merge → 自动部署

**repo 侧无需额外配置**——agent 消费的是 `AGENTS.md`，已经维护完备。

---

## 端到端流程示例

```
你（手机上）：
    "在 Cursor Background Agent 里下发：把 Tetris 游戏实现出来"
         │
         ▼
Cursor 云端 agent：
    git checkout -b feat/tetris
    ...编辑文件、跑测试、commit...
    git push origin feat/tetris
         │
         ▼ GitHub 收到 push
auto-pr.yml（~30s）：
    gh pr create → PR #N 出现
         │
         ▼ PR opened 事件
ai-review.yml（~2-5min）：
    Claude 拉 diff → 贴 inline 评论 + 顶层总结 → 精修 PR body
         │
         ▼
你在手机上收到 GitHub 通知：
    看到 Claude 的评审意见，如需修改，在 PR 里 @claude 或再下发一次 agent 任务
         │
         ▼ 你点 Merge PR
deploy.yml（~1-3min）：
    pnpm test → pnpm build → rsync dist → VPS 线上更新
```

全程你不需要本机开机；任何一步出问题都是独立的 workflow 失败，可以单独查 logs、重跑、回滚。

---

## 一次性配置 checklist

| 项                                     | 在哪里配                                        | 对应层 |
| -------------------------------------- | ----------------------------------------------- | ------ |
| Workflow permissions 允许开 PR         | 仓库 Settings → Actions → General               | A      |
| `ANTHROPIC_API_KEY` secret             | 仓库 Settings → Secrets and variables → Actions | B      |
| `SSH_PRIVATE_KEY` / `SSH_HOST` 等 5 项 | 仓库 Settings → Secrets and variables → Actions | deploy |
| Background Agent 启用                  | Cursor 客户端 → Settings → Features             | C      |

全部配完后，整个流水线就是"push 分支 → 自动评审 → 你看一眼 → merge → 自动部署"。
