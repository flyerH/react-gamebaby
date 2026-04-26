/*!
 * Created by He on 2017/7/9.
 * E-mail:h@strawtc.cn
 */
/* eslint camelcase: "off" */
import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import store from '@/store';
import { addLocaleData, IntlProvider } from 'react-intl';
import zh from 'react-intl/locale-data/zh';
import en from 'react-intl/locale-data/en';
import intl from 'intl';
import zh_CN from './locale/zh_CN';
import en_US from './locale/en_US';
import App from './components/App';

addLocaleData([...en, ...zh]);

const messages = {};
messages['en-US'] = en_US;
messages['zh-CN'] = zh_CN;

function getLanguage() {
  switch (navigator.language.split('-')[0]) {
    case 'en':
      return 'en-US';
    case 'zh':
      return 'zh-CN';
    default:
      return 'en-US';
  }
}

ReactDOM.render(
  <IntlProvider
    locale={getLanguage()}
    messages={messages[getLanguage()]}
  >
    <Provider store={store}>
      <App />
    </Provider>
  </IntlProvider>,
  document.getElementById('root')
);
