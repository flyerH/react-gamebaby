// const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// const { merge } = require('webpack-merge');
// const path = require('path');
// const HtmlWebpackPlugin = require('html-webpack-plugin');
// const baseWebpackConfig = require('./webpack.base.conf');

// module.exports = merge(baseWebpackConfig, {
//   mode: 'production',
//   output: {
//     path: path.resolve(__dirname, '../dist/static'),
//     filename: 'js/[name].[chunkhash:8].js',
//     chunkFilename: 'js/[name].[chunkhash:8].chunk.js',
//     publicPath: './static/',
//   },
//   devtool: false,
//   module: {
//     rules: [{
//       test: /\.(scss|css)$/,
//       exclude: /node_modules/,
//       use: [MiniCssExtractPlugin.loader, {
//         loader: 'css-loader',
//         options: {
//           modules: true,
//           localIdentName: '[path][name]_[local]-[hash:base64:5]',
//         },
//       }, {
//         loader: 'postcss-loader',
//       }],
//     }],
//   },
//   plugins: [
//     new HtmlWebpackPlugin({
//       inject: true,
//       template: './public/index.html',
//       filename: '../index.html',
//       minify: {
//         removeComments: true,
//         collapseWhitespace: true,
//         removeRedundantAttributes: true,
//         useShortDoctype: true,
//         removeEmptyAttributes: true,
//         removeStyleLinkTypeAttributes: true,
//         keepClosingSlash: true,
//         minifyJS: true,
//         minifyCSS: true,
//         minifyURLs: true,
//       },
//     }),
//     new MiniCssExtractPlugin({
//       filename: 'css/style.css'
//     })
//   ],
// });