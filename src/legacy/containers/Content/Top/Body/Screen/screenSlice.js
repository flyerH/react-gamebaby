import { createSlice } from '@reduxjs/toolkit';

const screenSlice = createSlice({
  name: 'screen',
  initialState: [],
  reducers: {
    setScreen(state, action) {
      return action.payload;
    },
  },
});

export const { setScreen } = screenSlice.actions;

export default screenSlice.reducer;
