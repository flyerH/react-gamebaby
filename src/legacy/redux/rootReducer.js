import { combineReducers } from '@reduxjs/toolkit'
import screenReducer from '@/containers/Content/Top/Body/Screen/screenSlice';

export default combineReducers({
  screen: screenReducer
})
