/*!
 * Created by He on 2017/9/17.
 * E-mail:h@strawtc.cn
 */
function animaPos() {
  const posArr = [];
  for (let i = 0; i < 5; ++i) {
    for (let j = i; j < 10 - i; ++j) {
      posArr.push([i, j]);
    }
    for (let j = i + 1; j < 20 - i; ++j) {
      posArr.push([j, 9 - i]);
    }
    for (let j = 8 - i; j >= i; --j) {
      posArr.push([19 - i, j]);
    }
    for (let j = 18 - i; j > i; --j) {
      posArr.push([j, i]);
    }
  }
  return posArr;
}

const config = {
  oneAnimation: animaPos(),

  snakeMenu: [[0, 4], [1, 3], [1, 5], [2, 2], [2, 6], [3, 2], [3, 3],
    [3, 4], [3, 5], [3, 6], [4, 2], [4, 6], [15, 2], [15, 3],
    [15, 4], [15, 7], [16, 2], [16, 4], [16, 6], [16, 7], [17, 2],
    [17, 4], [17, 7], [18, 2], [18, 4], [18, 7], [19, 2], [19, 3],
    [19, 4], [19, 6], [19, 7], [19, 8]],
};

export default config;
