/*!
 * Created by He on 2017/9/5.
 * E-mail:h@strawtc.cn
 */
export const DROP_BLOCK = 'DROP_BLOCK';
export const SET_TABLE = 'SET_TABLE';
export const SET_BLOCK = 'SET_BLOCK';
export const SET_BLANK = 'SET_BLANK';
export const RUN_SNAKE = 'RUN_SNAKE';
export const RUN_BLOCK = 'RUN_BLOCK';
export const ADD_BLOCK = 'ADD_BLOCK';
export const SET_FOOD = 'SET_FOOD';
export const SET_SNAKEDIR = 'SET_SNAKEDIR';
export const SET_KEYCODE = 'SET_KEYCODE';
export const SET_FLOW = 'SET_FLOW';
export const SWITCH_GAME_NEXT = 'SWITCH_GAME_NEXT';
export const SWITCH_GAME_PREV = 'SWITCH_GAME_PREV';

const dropBlock = state => {
  let hY = 0;
  if (state.headY > 7) {
    hY = 8;
  } else {
    hY = state.headY + 1;
  }
  return {
    type: DROP_BLOCK,
    data: {
      headX: 0,
      headY: hY,
      failX: 0,
      failY: 0,
    },
  };
};

const setTable = data => ({
  type: SET_TABLE,
  data,
});

const setBlock = (x, y, type) => ({
  type: SET_BLOCK,
  data: {
    x,
    y,
    type,
  },
});

const setBlank = () => ({
  type: SET_BLANK,
});

const runSnakeAction = data => ({
  type: RUN_SNAKE,
  data,
});

const runBlock = dir => ({
  type: RUN_BLOCK,
  data: dir,
});

const addBlock = (x, y) => ({
  type: ADD_BLOCK,
  data: {
    x,
    y,
  },
});

const setFood = data => ({
  type: SET_FOOD,
  data,
});

const setSnakeDir = keyCode => ({
  type: SET_SNAKEDIR,
  data: keyCode,
});

const setKeyCode = keyCode => ({
  type: SET_KEYCODE,
  data: keyCode,
});

const setFlowAction = nowStep => ({
  type: SET_FLOW,
  step: nowStep,
});

const switchGameNextAction = () => ({
  type: SWITCH_GAME_NEXT,
});

const switchGamePrevAction = () => ({
  type: SWITCH_GAME_PREV,
});

export {
  dropBlock,
  setTable,
  setBlock,
  setBlank,
  runSnakeAction,
  runBlock,
  addBlock,
  setFood,
  setSnakeDir,
  setKeyCode,
  setFlowAction,
  switchGameNextAction,
  switchGamePrevAction,
};
