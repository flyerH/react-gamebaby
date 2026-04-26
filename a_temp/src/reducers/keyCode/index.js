/*!
 * Created by He on 2017/9/5.
 * E-mail:h@strawtc.cn
 */
import { SET_KEYCODE } from '../../action';

const initialState = 1;

const keyCode = (state = initialState, action) => {
  switch (action.type) {
    case SET_KEYCODE:
      console.log(`currentKEYCODE: ${action.data}`);
      return action.data;
    default:
      return state;
  }
};

export default keyCode;
