const { merge } = require("webpack-merge");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
// const FriendlyErrorsWebpackPlugin = require('friendly-errors-webpack-plugin');

const baseWebpackConfig = require("./webpack.base.conf");

module.exports = merge(baseWebpackConfig, {
  mode: "development",
  output: {
    filename: "js/[name].js",
    publicPath: "/",
  },
  module: {
    rules: [
      {
        test: /\.(scss|css)$/,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              modules: {
                localIdentName: "[local]",
              },
            },
          },
          {
            loader: "sass-loader",
          },
          // {
          //   loader: 'postcss-loader',
          //   options: {
          //     sourceMap: true,
          //   },
          // },
        ],
      },
    ],
  },
  devServer: {
    contentBase: "./public",
    historyApiFallback: true,
    hot: true,
    port: 8088,
    inline: true,
    // open: true,
    quiet: true,
    host: "0.0.0.0",
  },
  plugins: [
    // new FriendlyErrorsWebpackPlugin({
    //   compilationSuccessInfo: {
    //     notes: ['Your application is running here: http://localhost:8088'],
    //   },
    //   clearConsole: true,
    // }),
    // new webpack.HotModuleReplacementPlugin(),
    new HtmlWebpackPlugin({
      inject: true,
      template: "./public/index.html",
    }),
  ],
});
