/**
 * L2 SDK · Game 接口最小定义
 *
 * 当前阶段只承载菜单/选择所需字段（id / name / preview）。
 * 待首款真正的游戏落地时再扩展：init / step / render / onButton 等。
 */

/** 一个点阵坐标（列 x，行 y），与 L3 Screen.setPixel(x, y) 约定一致 */
export type Pixel = readonly [number, number];

/** 菜单 / 选择态下显示的游戏预览点阵；坐标落在 Screen 尺寸内 */
export type GamePreview = ReadonlyArray<Pixel>;

export interface Game {
  /** 机器可读标识，用于路由 / 存档 key，推荐 kebab-case */
  readonly id: string;
  /** 印在 SidePanel / 菜单里的可读名字 */
  readonly name: string;
  /** 选择态显示的预览点阵；后续可扩展 preview 动画帧 */
  readonly preview: GamePreview;
}
