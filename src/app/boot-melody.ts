import type { Note } from '@/engine/types';

/**
 * 开机旋律：《Little Brown Jug》（小棕罐 / 棕色酒壶）开头 8 小节
 *
 * 出自 1869 年 Joseph E. Winner（笔名 Eastburn）创作的美国民谣，1939 年被
 * Glenn Miller 改编为 Big Band 经典。早过版权期，公有领域。Brick Game
 * 9999-in-1 在英美市场版本里常用此曲做开机 BGM；本项目目前作为兜底曲目，
 * 待识别出真机的精确旋律后再替换。
 *
 * 谱面以 D 大调 2/4 拍写出（依 Ruth, "Pioneer Western Folk Tunes",
 * 1948 的 ABC 转录）；速度 120 BPM 让一拍约 0.5s，整段 ≈ 8s。
 */

const PITCH = {
  REST: 0,
  Fs4: 369.99,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  Cs5: 554.37,
  D5: 587.33,
  E5: 659.26,
  Fs5: 739.99,
} as const;

const Q = 0.5;
const E_ = Q / 2;
const S = E_ / 2;
const H = Q * 2;

export const BOOT_MELODY: ReadonlyArray<Note> = [
  // 小节 1
  { freq: PITCH.Fs4, duration: E_ },
  { freq: PITCH.A4, duration: S },
  { freq: PITCH.A4, duration: S },
  { freq: PITCH.A4, duration: S },
  { freq: PITCH.A4, duration: S },
  { freq: PITCH.A4, duration: S },
  { freq: PITCH.A4, duration: S },
  // 小节 2
  { freq: PITCH.G4, duration: E_ },
  { freq: PITCH.B4, duration: E_ },
  { freq: PITCH.B4, duration: Q },
  // 小节 3
  { freq: PITCH.A4, duration: E_ },
  { freq: PITCH.Cs5, duration: S },
  { freq: PITCH.Cs5, duration: S },
  { freq: PITCH.Cs5, duration: S },
  { freq: PITCH.Cs5, duration: S },
  { freq: PITCH.Cs5, duration: S },
  { freq: PITCH.Cs5, duration: S },
  // 小节 4
  { freq: PITCH.A4, duration: E_ },
  { freq: PITCH.D5, duration: E_ },
  { freq: PITCH.Fs5, duration: Q },
  // 小节 5（同小节 1）
  { freq: PITCH.Fs4, duration: E_ },
  { freq: PITCH.A4, duration: S },
  { freq: PITCH.A4, duration: S },
  { freq: PITCH.A4, duration: S },
  { freq: PITCH.A4, duration: S },
  { freq: PITCH.A4, duration: S },
  { freq: PITCH.A4, duration: S },
  // 小节 6（同小节 2）
  { freq: PITCH.G4, duration: E_ },
  { freq: PITCH.B4, duration: E_ },
  { freq: PITCH.B4, duration: Q },
  // 小节 7
  { freq: PITCH.A4, duration: E_ },
  { freq: PITCH.Cs5, duration: E_ },
  { freq: PITCH.Cs5, duration: S },
  { freq: PITCH.B4, duration: S },
  { freq: PITCH.Cs5, duration: S },
  { freq: PITCH.D5, duration: S },
  // 小节 8
  { freq: PITCH.E5, duration: E_ },
  { freq: PITCH.D5, duration: E_ },
  { freq: PITCH.D5, duration: H },
];
