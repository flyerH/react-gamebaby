import type { Game } from '@/sdk';

import { tetrisPreview } from './preview';

const tetris: Game = {
  id: 'tetris',
  name: 'TETRIS',
  preview: tetrisPreview,
};

export default tetris;
