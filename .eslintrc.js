module.exports = {
  parser: 'babel-eslint',
  extends: ['airbnb', 'prettier'],
  plugins: ['import', 'jsx-a11y', 'react'],
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  rules: {
    'no-console': 'off',
    'react/prefer-stateless-function': 'off',
    'linebreak-style': 'off',
    'react/jsx-filename-extension': [2, { extensions: ['.js', '.jsx'] }],
    'no-unused-vars': 'warn',
    'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
    'object-shorthand': 'warn',
    'class-methods-use-this': 'warn',
    'react/no-unused-prop-types': 'warn',
    'react/destructuring-assignment': 'warn',
    'react/no-unused-state': 'warn',
  },
  settings: {
    'import/resolver': {
      webpack: {
        config: './config/webpack.base.conf.js',
      },
    },
  },
};
