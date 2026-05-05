import type { Game } from '@/sdk';

import { tetrisPreview } from './preview';

export const tetris: Game = {
  id: 'tetris',
  name: 'TETRIS',
  preview: tetrisPreview,
};
