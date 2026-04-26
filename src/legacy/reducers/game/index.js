import gameArray from '@/game';

const gameLength = gameArray.length;

const selectedGameNumber = (state = 0, action) => {
  switch (action.type) {
    case 'SWITCH_GAME_NEXT':
      console.log('SWITCH_GAME_NEXT', gameLength - 1 > state);
      if (gameLength - 1 > state) return state + 1;
      return 0;
    case 'SWITCH_GAME_PREV':
      console.log('SWITCH_GAME_PREV');
      if (state <= 0) return gameLength - 1;
      return state - 1;
    default:
      return state;
  }
};

export default selectedGameNumber;
