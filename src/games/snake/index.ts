import type { Game } from '@/sdk';

import { snakePreview } from './preview';

const snake: Game = {
  id: 'snake',
  name: 'SNAKE',
  preview: snakePreview,
};

export default snake;
