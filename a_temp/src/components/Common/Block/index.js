/*!
 * Created by He on 2017/8/30.
 * E-mail:h@strawtc.cn
 */
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import style from './style.scss';
/* eslint react/forbid-prop-types:0 */

/* eslint react/prop-types:0 */
class Block extends Component {
  render() {
    const tableArr = this.props.tableArr;
    return (
      <div
        key={this.props.index - 1}
        className={tableArr[this.props.index] === 1 ? style.blockBlack : style.block}
      />
    );
  }
}

/* Block.defaultProps = {
  tableArr: [],
};

Block.propTypes = {
  tableArr: PropTypes.array,
  index: PropTypes.number.isRequired,
};*/

export default Block;
