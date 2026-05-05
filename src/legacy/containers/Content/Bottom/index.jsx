/*!
 * Created by He on 2017/8/30.
 * E-mail:h@strawtc.cn
 */
import React, { Component } from 'react';
// import { gameSelect, gameStart } from '@/scenes/menu';
import style from './style.scss';

class ContentBottom extends Component {
  constructor() {
    super();
  }

  render() {
    return (
      <div className={style.contentBottom} onClick={this.buttonClick} role="presentation">
        <div className={style.topButton} id="topButton">
          {/* <FormattedMessage id="topButton" description="top button" defaultMessage="Top">
            {msg => <p className={style.buttonTip}>{msg}</p>}
          </FormattedMessage>
          <div className={style.buttonDir} />
        </div>
        <div className={style.rightButton} id="rightButton">
          <FormattedMessage id="rightButton" description="right button" defaultMessage="Right">
            {msg => <p className={style.buttonTip}>{msg}</p>}
          </FormattedMessage>
          <div className={style.buttonDir} />
        </div>
        <div className={style.bottomButton} id="bottomButton">
          <FormattedMessage id="bottomButton" description="bottom button" defaultMessage="Bottom">
            {msg => <p className={style.buttonTip}>{msg}</p>}
          </FormattedMessage>
          <div className={style.buttonDir} />
        </div>
        <div className={style.leftButton} id="leftButton">
          <FormattedMessage id="leftButton" description="left button" defaultMessage="Left">
            {msg => <p className={style.buttonTip}>{msg}</p>}
          </FormattedMessage>
          <div className={style.buttonDir} />
        </div>
        <div className={style.rotateButton} id="rotateButton">
          <FormattedMessage id="rotateButton" description="rotate button" defaultMessage="Rotate">
            {msg => <p className={style.buttonTip}>{msg}</p>}
          </FormattedMessage> */}
          <span className={style.rotateArrowLeft}>
            <span className={style.rotateArrowBody} />
          </span>
          <span className={style.rotateArrowRight}>
            <span className={style.rotateArrowBody} />
          </span>
        </div>
      </div>
    );
  }
}

export default ContentBottom;
