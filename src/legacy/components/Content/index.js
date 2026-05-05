/*!
 * Created by He on 2017/8/30.
 * E-mail:h@strawtc.cn
 */
import React, { Component } from 'react';
import ContentTop from './Top';
import ContentBottom from './Bottom';
import style from './style.scss';

class Content extends Component {
  render() {
    return (
      <div className={style.content}>
        <ContentTop />
        <ContentBottom />
      </div>
    );
  }
}

export default Content;
