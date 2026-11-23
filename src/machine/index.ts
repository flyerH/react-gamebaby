/**
 * 掌机固件对外入口：模式状态机、菜单、开机动画与开机音乐
 *
 * 各运行入口（src/app/<entry>/）用 createMachine 装配，具体平台能力由传入的
 * HardwareContext 提供。
 */

export { createMachine, initialMachineState } from './machine';
export type {
  Autopilot,
  AutopilotProvider,
  Machine,
  MachineOptions,
  MachineState,
  Mode,
} from './machine';
export { MENU_LEVEL_MAX, MENU_SPEED_MAX } from './menu';
export type { MenuState } from './menu';
