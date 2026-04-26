/*!
 * Created by He on 2017/8/30.
 * E-mail:h@strawtc.cn
 */
import React, { Component } from 'react';
import style from './style.scss';

class BackgroundLeft extends Component {
  render() {
    return (
      <div className={`background ${style.left}`}><p>BackgroundLeft</p></div>

    );
  }
}

export default BackgroundLeft;
