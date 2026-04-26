/*!
 * Created by He on 2017/10/9.
 * E-mail:h@strawtc.cn
 */
import { SET_SNAKEDIR } from '../../action';

const initialState = 'right';

const snakeDir = (state = initialState, action) => {
  switch (action.type) {
    case SET_SNAKEDIR: {
      let snakeDirection = state;
      switch (action.data) {
        case 37:
          console.log('Press Left!');
          if (state !== 'left' && state !== 'right') {
            snakeDirection = 'left';
          }
          break;
        case 38:
          console.log('Press Up!');
          if (state !== 'up' && state !== 'down') {
            snakeDirection = 'up';
          }
          break;
        case 39:
          console.log('Press Right!');
          if (state !== 'left' && state !== 'right') {
            snakeDirection = 'right';
          }
          break;
        case 40:
          console.log('Press Down!');
          if (state !== 'up' && state !== 'down') {
            snakeDirection = 'down';
          }
          break;
        default:
      }
      return snakeDirection;
    }
    default:
      return state;
  }
};
export default snakeDir;
