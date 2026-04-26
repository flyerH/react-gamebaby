import store from '@/store';
import { initialState } from '@/reducers/table';
import { setTable, setBlock, setBlank } from '@/action';
import Immutable, { List, setIn } from 'immutable';

let runFlag;
let timer;

const nIn1 = [
  [1, 0],
  [1, 1],
  [1, 2],
  [2, 2],
  [3, 2],
  [3, 1],
  [3, 0],
  [4, 0],
  [5, 0],
  [5, 1],
  [5, 2],
  [7, 1],
  [7, 2],
  [7, 3],
  [8, 2],
  [9, 2],
  [10, 2],
  [11, 1],
  [11, 2],
  [11, 3],
  [7, 5],
  [8, 5],
  [9, 5],
  [9, 6],
  [10, 5],
  [10, 7],
  [11, 5],
  [11, 8],
  [10, 8],
  [9, 8],
  [8, 8],
  [7, 8],
  [13, 8],
  [14, 7],
  [14, 8],
  [15, 8],
  [16, 8],
  [17, 7],
  [17, 8],
  [17, 9],
];

const animaPos = () => {
  const posArr = [];
  for (let i = 0; i < 5; ++i) {
    for (let j = i; j < 10 - i; ++j) {
      posArr.push([i, j]);
    }
    for (let j = i + 1; j < 20 - i; ++j) {
      posArr.push([j, 9 - i]);
    }
    for (let j = 8 - i; j >= i; --j) {
      posArr.push([19 - i, j]);
    }
    for (let j = 18 - i; j > i; --j) {
      posArr.push([j, i]);
    }
  }
  return posArr;
};
const oneAnimation = animaPos();

const nIn1Init = () => {
  let table = initialState;
  for (let index = 0; index < nIn1.length; index++) {
    table = table.setIn([nIn1[index][0], nIn1[index][1]], 1);
  }
  return table;
};
const initAnimation = () => {
  let table = nIn1Init();
  store.dispatch(setTable(table));
  let i = 0;

  const l = oneAnimation.length;
  const stepOneTimer = () => {
    if (!runFlag) return;
    if (i >= l) {
      initAnimation();
    } else {
      table = table.setIn([oneAnimation[i][0], oneAnimation[i][1]], 1);
      store.dispatch(setTable(table));
      i += 1;
      timer = setTimeout(stepOneTimer, 15);
    }
  };
  stepOneTimer();
};

const run = () => {
  runFlag = true;
  initAnimation();
};

const stop = () => {
  runFlag = false;
  clearTimeout(timer);
};

export default { run, stop };
