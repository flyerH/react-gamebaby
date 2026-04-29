# 部署指南

本项目为 Vite + React 静态单页应用，部署产物是 `dist/` 下的纯静态文件，任何支持静态托管的 web server（nginx / apache / caddy）都能直接 serve。

自动部署通过 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) 实现：`master` 分支每次 push 都会触发一次 build → rsync 到 VPS 的完整流程。

---

## 整体流程

```
本地 push / PR merge 到 master
        │
        ▼
GitHub Actions runner（ubuntu-latest）
  1. checkout
  2. pnpm install --frozen-lockfile
  3. pnpm test -- --run
  4. pnpm build          —— 产出 dist/
  5. ssh-agent 加载私钥
  6. rsync dist/ → VPS:$DEPLOY_PATH
        │
        ▼
web server（nginx 等）直接 serve $DEPLOY_PATH
```

静态文件覆盖后无需重启 web server；浏览器端刷新即可拿到新版本。

---

## 一次性准备

### 1. 服务器侧

1. 选定项目专属目录（避免 rsync `--delete` 误删其他文件），并确保 SSH 用户对该目录有读写权限：

   ```bash
   sudo mkdir -p /var/www/react-gamebaby
   sudo chown -R "$USER":"$USER" /var/www/react-gamebaby
   ```

2. 确保服务器安装了 `rsync` 与 `openssh-server`：

   ```bash
   # Debian/Ubuntu
   sudo apt-get install -y rsync openssh-server
   ```

3. 配置 web server 指向 `/var/www/react-gamebaby`（以 nginx 为例）：

   ```nginx
   server {
     listen 80;
     server_name your-domain.example;
     root /var/www/react-gamebaby;
     index index.html;

     # 单页应用路由回退：任意未知路径都走 index.html
     location / {
       try_files $uri $uri/ /index.html;
     }
   }
   ```

   重载配置：`sudo nginx -s reload`。

### 2. SSH 部署密钥

在**本地**生成一对仅用于部署的 SSH key（和你平时用的 key 分开，降低泄露影响面）：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/react-gamebaby-deploy -C 'react-gamebaby deploy' -N ''
```

- 公钥 `~/.ssh/react-gamebaby-deploy.pub` 的内容追加到服务器的 `~/.ssh/authorized_keys`（对应上面 `SSH_USER` 用户）：

  ```bash
  ssh-copy-id -i ~/.ssh/react-gamebaby-deploy.pub user@host
  # 或手动：cat ~/.ssh/react-gamebaby-deploy.pub | ssh user@host 'cat >> ~/.ssh/authorized_keys'
  ```

- 私钥 `~/.ssh/react-gamebaby-deploy` 的完整内容（包括 `-----BEGIN ... KEY-----` 和 `-----END ... KEY-----`）填到下面 `SSH_PRIVATE_KEY` secret。

### 3. GitHub Secrets

进入仓库 **Settings → Secrets and variables → Actions → New repository secret**，按表添加：

| Secret            | 是否必填 | 说明                                                             |
| ----------------- | -------- | ---------------------------------------------------------------- |
| `SSH_PRIVATE_KEY` | 必填     | 上一步生成的**私钥**完整内容                                     |
| `SSH_HOST`        | 必填     | 服务器主机名或 IP                                                |
| `SSH_USER`        | 必填     | 服务器 SSH 用户名                                                |
| `SSH_PORT`        | 可选     | 非默认 22 端口时填；未配置时 workflow 按 22 处理                 |
| `DEPLOY_PATH`     | 必填     | 服务器上项目根目录的**绝对路径**，例如 `/var/www/react-gamebaby` |

> **`DEPLOY_PATH` 必须是项目专属目录**。workflow 用了 `rsync --delete`，目标目录下**所有不在 `dist/` 里的文件都会被删除**。不要填 `/`、`/var/www`、用户家目录这类包含其他内容的路径。

---

## 日常流程

```
本地开发 → push → PR → merge 到 master → GitHub Actions 自动部署
```

合并到 master 后：

- 打开仓库 **Actions** 标签页，能看到 `deploy` workflow 正在跑。
- 跑完一次大约 1 ～ 3 分钟（取决于依赖缓存命中情况）。
- 部署成功后浏览器刷新页面即可。

## 手动触发

有时需要跳过 push、直接用当前 master 重新部署一次（例如服务器迁移、手动清理后补一次同步）。在仓库 **Actions → deploy → Run workflow** 按钮即可手动触发一次，无需新提交。

## 回滚

静态产物的回滚最简单的方式是重新部署老版本：

```bash
git checkout master
git revert <bad-commit>       # 或 git reset --hard <good-commit> 后强推（慎用）
git push origin master
```

master 的新 commit 会触发一次新的部署，把旧产物覆盖回去。

## 排错

- **`Permission denied (publickey)`**：`SSH_PRIVATE_KEY` 未正确配置，或服务器 `authorized_keys` 没加上对应公钥。
- **`Host key verification failed`**：服务器 SSH 指纹变了（重装系统 / 换 IP），workflow 里的 `ssh-keyscan` 每次会重新抓取，但本地如果想调试 rsync 命令，需要先清理本地 `~/.ssh/known_hosts` 里的旧记录。
- **`rsync: chown failed`**：`DEPLOY_PATH` 所属用户与 `SSH_USER` 不一致，按 "服务器侧 1" 调整 `chown`。
- **部署成功但浏览器看不到新版本**：web server 可能配了静态缓存（`expires` / `Cache-Control`），强制刷新（Cmd+Shift+R）或调整缓存策略。Vite 产物文件名自带 hash，缓存对 index.html 的命中才是元凶。
