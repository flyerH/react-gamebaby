/*!
 * Created by He on 2017/8/29.
 * E-mail:h@strawtc.cn
 */
import React, { Component } from 'react';
import { hot } from 'react-hot-loader';
import { FormattedMessage } from 'react-intl';
import BackgroundLeft from '../Background/Left';
import Content from '../Content';
import style from './style.scss';
import BackgroundRight from '../Background/Right';

class App extends Component {
  constructor() {
    super();
    this.state = {
      winWidth: document.documentElement.clientWidth,
      winHeight: document.documentElement.clientHeight,
      // scaleCount: `scale(${document.documentElement.clientHeight / 950})`,
    };
  }

  componentDidMount() {
    window.addEventListener('resize', this.resize.bind(this));
  }

  resize() {
    // console.log(`clientWidth: ${document.documentElement.clientWidth}`);
    // console.log(`clientHeight: ${document.documentElement.clientHeight}`);
    // console.log(`bodyHeight: ${document.body.clientHeight}`);
    // console.log(`innerHeight: ${window.innerHeight}`);
    this.setState({
      winWidth: document.documentElement.clientWidth,
      winHeight: document.documentElement.clientHeight,
    });
  }

  render() {
    let scale = 0;
    let top = 0;
    const { winWidth, winHeight } = this.state;

    if (winHeight / winWidth < 1.46) {
      scale = window.innerHeight / 950;
      top = 0;
    } else {
      scale = winWidth / 650;
      top = Math.round((winHeight - Math.round(winWidth * 1.46)) / scale / 2);
    }

    const outStyle = {
      transform: `scale(${scale})`,
      paddingTop: top === 0 ? '' : top,
      paddingBottom: top === 0 ? '' : top,
      marginTop: top === 0 ? '' : -475 - top
    };

    return (
      <div className={style.app} style={outStyle}>
        <BackgroundLeft />
        <Content />
        <BackgroundRight />
      </div>
    );
  }
}

export default App;