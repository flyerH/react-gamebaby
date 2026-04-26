/*!
 * Created by He on 2017/8/31.
 * E-mail:h@strawtc.cn
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import PropTypes from 'prop-types';
import { setFlowAction } from '@/action';
import Screen from '@/containers/Screen';
import { powerOn } from '@/scenes/menu';

import style from './style.scss';

class ContentTopbody extends Component {
  componentDidMount() {
    powerOn();
    // setTimeout(() => {
    //   document.getElementById('rotateButton').click();
    //   document.getElementById('rotateButton').click();
    // }, 300);
  }

  componentDidUpdate(preProps, prevState) {
    const { step } = this.props;
    if (preProps.step !== step) {
      switch (step) {
        case -1:
          powerOn();
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
ContentTopbody.propTypes = {
  step: PropTypes.number.isRequired,
  setFlow: PropTypes.func.isRequired,
};

// const mapDispatchToProps = dispatch => bindActionCreators({
//   setFlow, setSnakeDir, setKeyCode,
// }, dispatch);

export default connect(
  state => ({ step: state.get('core') }),
  dispatch => {
    return {
      setFlow: step => {
        dispatch(setFlowAction(step));
      },
    };
  }
)(ContentTopbody);
