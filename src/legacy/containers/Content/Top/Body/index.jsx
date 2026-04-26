import React, { Component } from 'react';
import Screen from './Screen';
// import { powerOn } from '@/scenes/menu';

import style from './style.scss';

class ContentTopbody extends Component {
  componentDidMount() {
    // powerOn();
  }

  componentDidUpdate(preProps, prevState) {
    const { step } = this.props;
    if (preProps.step !== step) {
      switch (step) {
        case -1:
          // powerOn();
          break;

        default:
          break;
      }
    }
  }

  render() {
    return (
      <div className={style.body}>
        <Screen />
      </div>
    );
  }
}

export default ContentTopbody;
