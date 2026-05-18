# 移动端 App 开发说明（Android）

本文档说明如何把 `react-gamebaby` 以原生壳方式运行在 Android。

> iOS 暂不在当前迭代范围内：架构上不阻塞，但工程文件、依赖、CI 都先不引入，避免维护双份原生壳。后续要加时再 `pnpm add @capacitor/ios && pnpm cap add ios` 即可。

## 1. 当前方案

- 使用 **Capacitor 8** 作为原生壳层；
- 游戏核心（L1 Games / L2 SDK / L3 Engine）与 UI（L4）继续复用现有 Web 实现；
- 移动端专属的"硬件桥接"放在 `src/platform/browser/`（如系统返回键），普通 Web 构建中安全 no-op；
- 平台差异先收敛在壳层与 `src/platform/browser/`，不破坏现有分层。

仓库已包含：

- `capacitor.config.ts`（机身蓝色背景、`androidScheme: 'https'`）
- `android/` 原生工程（`screenOrientation="portrait"` 锁竖屏）
- `@capacitor/app` 插件 → 监听系统返回键

> **关于 cap sync 生成的文件**：`android/capacitor.settings.gradle` 与 `android/app/capacitor.build.gradle` 不进版本库（`android/.gitignore` 已排除）。这俩由 `cap sync` 在本机生成，且 pnpm 严格隔离布局下路径含 hash，跨机器 / 依赖图变化时 hash 会漂移，提交进库会引入虚假 diff。下面所有 `pnpm mobile:*` 命令（除 `mobile:dev:android`）都自带 cap sync，正常入口零摩擦；**但首次 clone 仓库后，如果想直接用 Android Studio 打开 `android/` 工程，必须先跑一次 `pnpm mobile:sync` 让 gradle 文件落地，否则 Studio 同步会找不到 Capacitor 插件**。

## 2. 常用命令

```bash
pnpm mobile:sync                # build + cap sync android（同步 web 资源到 android/）
pnpm mobile:android             # build + sync + 打开 Android Studio
pnpm mobile:run:android         # build + cap run android（本地生产构建跑到设备/模拟器）
pnpm mobile:run:android:online  # 装一个直接加载线上域名的 APK（见下文"线上域名模式"）
pnpm mobile:dev:android         # 真机 livereload 调试（前端改动即时热更，需先开 vite dev）
```

### Livereload 工作流（开发推荐）

打开两个终端：

```bash
# 终端 A：前端 dev server，监听 0.0.0.0:8088（vite.config.ts 已固化）
pnpm dev

# 终端 B：把手机 WebView 指向电脑的 vite，并启用 adb reverse
pnpm mobile:dev:android
```

`--forwardPorts 8088:8088` 等价 `adb reverse tcp:8088 tcp:8088`：手机访问 `localhost:8088` 实际命中电脑的 dev server。**不依赖同 Wi-Fi，USB 数据线即可**。

之后 `src/` 下任何改动都会通过 vite HMR 推到手机 WebView，无需重装 APK。原生层（`android/` 工程、Capacitor 配置）改动仍需 `pnpm mobile:run:android` 重装。

## 3. 本地准备

1. 安装 [Android Studio](https://developer.android.com/studio)（一并装齐 SDK / Build-Tools / `adb`）；
2. SDK Manager 安装 Android SDK Platform 33+ 与 Build-Tools；
3. 把 `~/Library/Android/sdk/platform-tools` 加到 `~/.zshrc` 的 `PATH`，让终端能直接用 `adb`。

> 真机比模拟器更准（触摸延迟、按钮力度），日常优先真机。

### 真机 USB 调试

1. 手机开发者选项打开 **USB 调试**（设置 → 关于本机 → 连点 7 次"版本号" 启用开发者选项）；
2. USB 数据线连电脑，弹窗"允许此电脑调试" → 允许；
3. 终端跑 `adb devices` 应能看到设备 ID。

### 真机无线调试（Android 11+）

1. 开发者选项 → **无线调试** → 开启；
2. 选"使用配对码配对设备"，电脑跑 `adb pair <手机IP:端口>` 输配对码；
3. `adb connect <手机IP:5555>`；之后所有 `cap run` 命令的设备列表里会带上这台无线设备。

### 四种入口

| 命令                                   | 用途                         | 何时用                                |
| -------------------------------------- | ---------------------------- | ------------------------------------- |
| `pnpm mobile:android`                  | 打开 Android Studio 工程     | 第一次配置 / 调原生层 / 用 GUI 选设备 |
| `pnpm mobile:run:android`              | 装一个跑**本地构建产物**的包 | 验证本地修改后的生产构建              |
| `pnpm mobile:run:android:online`       | 装一个跑**线上域名**的 APK   | 验证已部署到线上的版本（无需带电脑）  |
| `pnpm dev` + `pnpm mobile:dev:android` | 真机 livereload 开发         | 日常迭代（前端改一行立即热更到手机）  |

第一次跑 `pnpm mobile:android` Studio 同步 Gradle 较慢（国内开代理重启 Studio）；之后日常用 livereload 工作流即可。

### 线上域名模式（`mobile:run:android:online`）

这个模式装出来的 APK 跟前两种最大的区别：**WebView 直接加载 `https://gamebaby.strawtc.cn`，不读 APK 里打包的本地 dist 也不连开发机的 vite**。它的典型用途：

- 把"线上正式版"装到自己手机日常玩，不用每次开浏览器，也不需要电脑常开；
- 验证 master 部署后的产物在真机上的实际表现（与浏览器试玩等价）；
- 给身边人装一份 demo，无线 / 飞行模式都能装，**首次启动必须有公网**（详见下文"离线缓存与自动更新"）。

实现机制：`capacitor.config.ts` 读到环境变量 `CAP_REMOTE_URL` 时，会把 `server.url` 写成该 URL，Capacitor 会把这条配置打进 APK，原生壳启动后 WebView 直接 `loadUrl(remoteUrl)`。

注意事项：

- 装出来的仍然是 **debug-signed APK**（沿用 `cap run` 的默认行为），不是 Play Store 上架用的 release-signed APK。要做正式发布签名包是另一笔工作（生成 keystore + 改 `android/app/build.gradle` 的 `signingConfigs`），按需再做。
- APK 里 `server.url` 是固化的：换域名要重新跑这条命令重装。
- 普通 `pnpm mobile:run:android` 不受影响——没设环境变量时 `capacitor.config.ts` 走原来的本地 dist 模式。

### 离线缓存与自动更新（PWA Service Worker）

`react-gamebaby` 是 PWA：通过 `vite-plugin-pwa` + Workbox 在前端层实现离线兜底与版本自动滚动。配置见 `vite.config.ts` 的 `VitePWA({ registerType: 'autoUpdate', ... })`。配套两个 192 / 512 PWA 图标在 `public/pwa-*.png`。

落到这套手机方案上的实际行为：

| 场景                                | 行为                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **首次安装 + 首次启动 + 没网**      | WebView 白屏（SW 还没装上，APK 里也没本地 dist 兜底）。所以装完 APK 至少得开一次有网                            |
| **首次启动 + 有网**                 | 正常加载，Workbox precache 把 `index.html` / `assets/*.js,css` / 图标 / 音效全部塞进 Cache Storage（约 1.3 MB） |
| **第二次以后 + 没网**               | SW 命中 cache，**完全离线可玩**；任何路由都通过 `NavigationRoute` 兜底到 `index.html`                           |
| **第二次以后 + 有网且服务器有新版** | SW 在后台 fetch 新 `index.html`，发现 hash 变化就 install 新 precache；**当前会话不强刷**，下次冷启动用新版     |
| **关键资源（hash 文件）改名**       | precache key 自带 revision，旧 cache 会被 Workbox `cleanupOutdatedCaches` 自动清掉，不会占无限空间              |

注册位置：`src/app/main.tsx` 里 `registerSW({ immediate: true })` 一行。`virtual:pwa-register` 模块在 dev 模式下是 no-op，不会干扰 vite HMR。

为什么不上"首次安装就能离线"那一档：

- SW 必须先装好才能拦截请求，这是浏览器规范的硬约束，绕不过去；
- 想突破这条要打"OTA 热更"路线（APK 里打包初始 dist + capacitor-updater 之类的更新插件），工程成本上一个量级，对当前项目体量不划算。

依赖与已知坑：

- `vite-plugin-pwa` 1.3.0 + Vite 8（rolldown 后端）下，rolldown 无法穿透 pnpm 的 `node_modules/.pnpm/` 间接依赖去解析 `workbox-window`，所以本项目把 `workbox-window` 显式提到顶层 `devDependencies`，让 rolldown 能直接找到。
- 不要给 `dist/sw.js` 加缓存：服务器需要让浏览器每次都重新校验 SW 文件本身，否则版本永远滚不动。当前部署用 nginx 默认配置（无显式 `Cache-Control`），浏览器走启发式缓存，Workbox 自己会带 `?_v=` 之类的查询串绕过——目前线上没问题，但**未来给 nginx 加全站强缓存时务必给 `/sw.js` 留 `Cache-Control: no-cache` 例外**。

## 4. 移动端体验适配（已落地）

| 项目                      | 实现位置                                          | 说明                                                   |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `viewport-fit=cover`      | `index.html`                                      | 让 WebView 内容铺满刘海屏与底部手势条区域              |
| 安全区 padding            | `src/app/App.module.css`                          | `.page` 用 `env(safe-area-inset-*)` 让出系统占用区域   |
| 100dvh 总高度             | `src/app/App.module.css`                          | 跟随地址栏 / 工具栏伸缩，避免按钮被顶到屏外            |
| `overscroll: none`        | `src/app/App.module.css`                          | 禁用整页 pull-to-refresh / 弹性滚动                    |
| 按钮 `touch-action: none` | `src/ui/Buttons/Buttons.module.css`               | 长按 D-pad / Rotate 不被解释为滚动手势，避免漏 release |
| 容器尺寸驱动 scale        | `src/ui/Device/Device.tsx`                        | 用 ResizeObserver 跟随实际容器尺寸缩放，安全区扣完再缩 |
| 锁竖屏                    | `AndroidManifest.xml`                             | `android:screenOrientation="portrait"`                 |
| 系统返回键映射            | `src/platform/browser/back-button.ts` + `App.tsx` | 见下                                                   |

### 系统返回键 / 边缘右滑行为

| App 当前 mode             | 返回键 / 右滑动作                                                            |
| ------------------------- | ---------------------------------------------------------------------------- |
| `playing`                 | 等同按 `Select` —— 退回菜单（不弹任何窗）                                    |
| `off` / `boot` / `select` | 弹原生 `AlertDialog`（"退出 GameBaby？/ 退出 / 取消"）→ 选"退出" → `exitApp` |

设计取舍：

- **关机按钮 ≠ 退出 App**：屏幕上方的关机键（`emit Start`）只把 mode 切到 `off`（屏幕黑，App 留前台），**永不弹窗也永不 exitApp**；想真退出必须用系统返回键 / 边缘右滑。两条路径解耦，避免误把"我想黑屏休息一下"理解成"我想退出 App"。
- **`playing` 不加确认**：返回菜单是无损操作，加确认窗反而打断游戏体验；`Select` 退菜单是玩家熟悉的语义。
- **非游戏态都给确认窗**：`off` / `boot` / `select` 三态下，玩家做的不是游戏内动作，右滑明确表达"想退出 App"的意图，所以都走同一条弹窗确认路径。这样"按关机 → 再右滑退出"是顺畅的两步动作，不会出现"右滑没反应"的死路。
- **边缘手势误触防御**：国产手机左右边缘右滑误触概率不低，掌机 demo 不希望被误退，确认窗就是这层兜底。

弹窗实现：用 `@capacitor/dialog` 而不是 `window.confirm`，主要为了控制按钮文字。`window.confirm` 的 OK / Cancel 按钮文字是浏览器/系统决定的不可定制，而 `@capacitor/dialog` 在原生壳下渲染 Android `AlertDialog` 时支持 `okButtonTitle` / `cancelButtonTitle`，能跟项目自身的 i18n（`src/ui/locale`）联动给出"退出 / 取消"。Web 端 `@capacitor/dialog` 自动 fallback 到 `window.confirm`（按钮文字仍为系统默认，但 title / message 仍按 i18n 出）。

实现上 `playing` 仍走 InputBus 的 `emit('Select', 'press')`，与按物理键 / 屏幕按钮共用同一条状态机分支，不引入额外 action。

## 5. 迭代建议

- 改前端代码后只需 `pnpm mobile:sync`；
- 只改前端逻辑，不必重建原生项目；
- 引入 Capacitor 插件的流程：`pnpm add @capacitor/<plugin>` → 在合适的桥接处（一般是 `src/platform/browser/`）暴露一个 `bind*` / `create*` 函数 → `pnpm mobile:sync`。

## 6. 后续 Android 路线

- 启动闪屏（`@capacitor/splash-screen`，把首次冷启动的白屏替换为机身色 / Logo）；
- 状态栏样式插件（`@capacitor/status-bar`，沉浸式或与机身同色）；
- 抽象 `src/platform/mobile/`：把 AudioContext 首次手势解锁、后台 `pause` 事件下挂起 ticker 等收敛起来；
- 移动端 E2E（Android Emulator 自动化跑流程冒烟）；
- 打包发布流水线（签名、AAB 产物、内测分发）。
