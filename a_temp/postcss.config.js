/*!
 * Created by He on 2017/10/10.
 * E-mail:h@strawtc.cn
 */

/* eslint-disable global-require */
module.exports = {
  plugins: [
    require('precss'),
    require('autoprefixer')({
      browsers: ['last 5 versions'],
    }),
  ],
};
