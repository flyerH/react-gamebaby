const path = require("path");

module.exports = {
  devtool: "eval-source-map",
  entry: "./src/index.js",
  resolve: {
    extensions: [".js", ".jsx"],
    mainFiles: ["index"],
    alias: { "@": path.resolve(__dirname, "../src") },
  },
  module: {
    rules: [
      // {
      //   test: /\.(js|jsx)$/,
      //   enforce: 'pre',
      //   loader: 'eslint-loader',
      //   exclude: /node_modules/,
      //   options: {
      //     emitWarning: true,
      //   },
      // },
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader?cacheDirectory",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
          },
        },
      },
    ],
  },
};
