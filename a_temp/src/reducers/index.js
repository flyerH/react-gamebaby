/*!
 * Created by He on 2017/8/29.
 * E-mail:h@strawtc.cn
 */
import { combineReducers } from 'redux-immutable';
import keyCode from './keyCode';
import table from './table';
import snake from './snake';
import snakeDir from './snake/dir';
import food from './snake/food';
import core from './flow';
import selectedGameNumber from './game';

const rootReducer = combineReducers({
  keyCode,
  table,
  snake,
  snakeDir,
  food,
  core,
  selectedGameNumber,
});
export default rootReducer;
