import { SET_FOOD } from '@/action';

const food = (state = null, action) => {
  switch (action.type) {
    case SET_FOOD: {
      return action.data;
    }
    default:
      return state;
  }
};
export default food;
