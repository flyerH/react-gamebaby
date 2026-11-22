import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** dev flavor 的 applicationId 后缀，见 android/app/build.gradle 的 productFlavors */
const DEV_APP_ID_SUFFIX = '.dev';

/**
 * 当前是否运行在 Android 开发版（dev flavor）里
 *
 * 按原生包名判断而非页面地址：dev 包既可能跑本地资源（https://localhost），
 * 也可能连开发机 livereload，正式包同样可能跑本地资源，只有包名能准确区分。
 * 网页版 / 读取失败一律视为非开发版
 */
export async function isDevBuild(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { id } = await CapacitorApp.getInfo();
    return id.endsWith(DEV_APP_ID_SUFFIX);
  } catch {
    return false;
  }
}
