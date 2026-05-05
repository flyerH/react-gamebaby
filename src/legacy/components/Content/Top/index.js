/*!
 * Created by He on 2017/8/30.
 * E-mail:h@strawtc.cn
 */
import React, { Component } from 'react';
import style from './style.scss';
import Body from './Body';

class ContentTop extends Component {
  render() {
    return (
      <div className={style.contentTop}>
        <div className={style.title}>
          <p>GameBaby</p>
        </div>
        <div className={style.contentBody}>
          <Body />
        </div>
      </div>

    );
  }
}

export default ContentTop;
