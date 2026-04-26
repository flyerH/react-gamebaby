const flow = (state = -1, action) => {
  if (action.type === 'SET_FLOW') {
    return action.step;
  }
  return state;
};
export default flow;
