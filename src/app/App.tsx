import { useState } from 'react';

import { createBrowserContext } from '@/platform/browser';
import { Buttons } from '@/ui/Buttons';
import { ContentScreen } from '@/ui/ContentScreen';
import { Device } from '@/ui/Device';
import { SidePanel } from '@/ui/SidePanel';

import styles from './App.module.css';

/**
 * App —— 掌机外观装配层
 *
 * 当前阶段：视觉完整（蓝色塑料外壳 + LCD 屏 + 红色实体按键），但尚未接
 * 游戏逻辑与按键交互。屏幕默认全熄灭状态，能看到 LCD 阴影格。
 *
 * 下一步接入 L2 SDK + 首款游戏后，本文件会改为 ticker.start 游戏循环，
 * 并订阅 score / level / speed 计数器把数据喂到 SidePanel。
 */
export function App(): React.ReactElement {
  // createBrowserContext 纯组装、无副作用，一次性创建即可
  const [ctx] = useState(() => createBrowserContext({ seed: 42 }));

  return (
    <div className={styles.page}>
      <Device
        screen={<ContentScreen screen={ctx.screen} />}
        side={<SidePanel />}
        buttons={
          <Buttons
            onPress={(btn) => {
              ctx.input.emit(btn, 'press');
            }}
          />
        }
      />
    </div>
  );
}
