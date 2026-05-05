import { List } from 'immutable';
import { SET_TABLE, SET_BLOCK, SET_BLANK } from '@/action';

const initialState = (() => {
  const table = [];
  for (let i = 0; i < 20; ++i) {
    const cols = [];
    for (let j = 0; j < 10; ++j) {
      cols.push(0);
    }
    table.push(cols);
  }
  return List(table);
})();

const table = (state = List(), action) => {
  switch (action.type) {
    case SET_TABLE:
      return action.data;
    case SET_BLOCK:
      return state.setIn([action.data.x, action.data.y], action.data.type);
    case SET_BLANK:
      return initialState;
    default:
      return state;
  }
};

export { initialState };
export default table;
