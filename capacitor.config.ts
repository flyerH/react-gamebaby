import type { CapacitorConfig } from '@capacitor/cli';

// 远程域名模式：设置 CAP_REMOTE_URL 时，WebView 直接加载该 URL（线上版本），
// 不再走本地 dist 资源。用于在真机上验证线上部署，而不是本地构建产物，
// 也无需开发机一直跑 vite livereload。
const remoteUrl = process.env.CAP_REMOTE_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.flyerh.gamebaby',
  appName: 'GameBaby',
  webDir: 'dist',
  // Android WebView 容器底色 = 机身蓝色，启动到 Web 页面之间不会闪白
  backgroundColor: '#4a94c1',
  server: {
    androidScheme: 'https',
    ...(remoteUrl ? { url: remoteUrl, cleartext: false } : {}),
  },
  android: {
    // 允许混合内容（少量调试用）；生产构建里按需收紧
    allowMixedContent: false,
    // Android 端 WebView 背景色（同上）
    backgroundColor: '#4a94c1',
  },
};

export default config;
