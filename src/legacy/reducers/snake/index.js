/*!
 * Created by He on 2017/9/5.
 * E-mail:h@strawtc.cn
 */
import Immutable, { List } from 'immutable';
import { RUN_SNAKE, RUN_BLOCK, ADD_BLOCK } from '@/action';

const initialState = Immutable.fromJS([[0, 0], [0, 1], [0, 2]]);
// const initialState = Immutable.fromJS([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]]);

const snake = (state = initialState, action) => {
  switch (action.type) {
    case RUN_SNAKE: {
      return action.data;
    }
    case RUN_BLOCK: {
      let temp = state;
      for (let i = 1, k = temp.size; i < k; ++i) {
        temp = temp.set(i - 1, temp.get(i));
      }
      switch (action.data) {
        case 'up': {
          temp = temp.set(
            temp.size - 1,
            List([temp.getIn([temp.size - 1, 0]) - 1, temp.getIn([temp.size - 1, 1])])
          );
          break;
        }
        case 'down': {
          temp = temp.set(
            temp.size - 1,
            List([temp.getIn([temp.size - 1, 0]) + 1, temp.getIn([temp.size - 1, 1])])
          );
          break;
        }
        case 'left': {
          temp = temp.set(
            temp.size - 1,
            List([temp.getIn([temp.size - 1, 0]), temp.getIn([temp.size - 1, 1]) - 1])
          );
          break;
        }
        case 'right': {
          temp = temp.set(
            temp.size - 1,
            List([temp.getIn([temp.size - 1, 0]), temp.getIn([temp.size - 1, 1]) + 1])
          );
          break;
        }
        default:
          return false;
      }
      /* console.log(`temp: ${temp}`); */
      return temp;
    }
    case ADD_BLOCK: {
      return state.push(List([action.data.x, action.data.y]));
    }
    default:
      return state;
  }
};

export default snake;
