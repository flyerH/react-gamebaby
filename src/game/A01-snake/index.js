// snake

import store from '@/store';
import { runSnakeAction, setTable, setSnakeDir, setFood, setBlank } from '@/action';
import { initialState } from '@/reducers/table';
import { List } from 'immutable';

const snakeMenu = [
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 2],
  [2, 6],
  [3, 2],
  [3, 3],
  [3, 4],
  [3, 5],
  [3, 6],
  [4, 2],
  [4, 6],
  [15, 2],
  [15, 3],
  [15, 4],
  [15, 7],
  [16, 2],
  [16, 4],
  [16, 6],
  [16, 7],
  [17, 2],
  [17, 4],
  [17, 7],
  [18, 2],
  [18, 4],
  [18, 7],
  [19, 2],
  [19, 3],
  [19, 4],
  [19, 6],
  [19, 7],
  [19, 8],
];

let canRun = true;

const snakePosToTablePos = snakePos => {
  let tablePos = initialState;
  for (let i = 0, l = snakePos.size; i < l; ++i) {
    tablePos = tablePos.setIn([snakePos.getIn([i, 0]), snakePos.getIn([i, 1])], 1);
  }
  const food = store.getState().get('food');
  if (food) tablePos = tablePos.setIn([food.get(0), food.get(1)], 1);

  return tablePos;
};

// 判断是否能够移动到蛇头前进方向的下一个方块
const canMoveHere = (snake, newHead) => {
  if (snake.includes(newHead)) return false;
  const headRow = newHead.get(0);
  const headCol = newHead.get(1);
  if (headRow < 0 || headRow > 19) return false;
  if (headCol < 0 || headCol > 9) return false;
  return true;
};

const gameFail = () => {
  // TODO GG
  canRun = false;
};

const getRandom = (min, max) => {
  const num = min + Math.round(Math.random() * (max - min));
  return num;
};

const randomSetFood = snake => {
  let flag = true;
  let foodPos = null;
  while (flag) {
    foodPos = List([getRandom(0, 19), getRandom(0, 9)]);
    if (!snake.includes(foodPos)) {
      flag = false;
    }
  }
  store.dispatch(setFood(foodPos));
};

const runSnake = () => {
  /* for (let i = 0, l = this.props.snake.size; i < l; ++i) {
     this.props.setBlock(this.props.snake.getIn([i, 0]), this.props.snake.getIn([i, 1]), 0);
   } */
  // this.props.setBlank(); // 清除上一次蛇的蛇身色块
  const snake = store.getState().get('snake');
  const snakeDir = store.getState().get('snakeDir');
  let snakeHead = snake.get(snake.size - 1);
  const food = store.getState().get('food');

  switch (snakeDir) {
    case 'up': {
      snakeHead = snakeHead.set(0, snakeHead.get(0) - 1);
      break;
    }
    case 'right': {
      snakeHead = snakeHead.set(1, snakeHead.get(1) + 1);
      break;
    }
    case 'down': {
      snakeHead = snakeHead.set(0, snakeHead.get(0) + 1);
      break;
    }
    case 'left': {
      snakeHead = snakeHead.set(1, snakeHead.get(1) - 1);
      break;
    }
    default:
      break;
  }
  if (!canMoveHere(snake, snakeHead)) {
    gameFail();
    return;
  }
  let newSnake = snake;
  if (food.equals(snakeHead)) {
    newSnake = newSnake.push(snakeHead);

    randomSetFood(snake);
  } else newSnake = newSnake.shift();
  newSnake = newSnake.push(snakeHead);
  store.dispatch(runSnakeAction(newSnake));
  store.dispatch(setTable(snakePosToTablePos(newSnake)));
};

const start = () => {
  setTimeout(() => {
    runSnake();
    if (canRun) start();
  }, 800);
};

const run = () => {
  const snake = store.getState().get('snake');
  randomSetFood(snake);
  store.dispatch(setTable(snakePosToTablePos(snake)));
  start();

  document.getElementsByClassName('contentBottom')[0].addEventListener('click', e => {
    switch (e.target.id) {
      case 'leftButton':
        store.dispatch(setSnakeDir(37));
        break;
      case 'topButton':
        store.dispatch(setSnakeDir(38));
        break;
      case 'rightButton':
        store.dispatch(setSnakeDir(39));
        break;
      case 'bottomButton':
        store.dispatch(setSnakeDir(40));
        break;

      default:
        break;
    }
  });
};

export default { gameMenu: snakeMenu, run };
