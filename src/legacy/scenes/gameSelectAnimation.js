import store from '@/store';
import { initialState } from '@/reducers/table';
import { setTable } from '@/action';
import gameArray from '@/game';

const initAnimation = gameNum => {
  let table = initialState;
  const { gameMenu } = gameArray[gameNum];
  for (let i = 0, l = gameMenu.length; i < l; ++i) {
    table = table.setIn([gameMenu[i][0], gameMenu[i][1]], 1);
  }
  store.dispatch(setTable(table));
};

const run = gameNum => {
  initAnimation(gameNum);
};

export default { run };
