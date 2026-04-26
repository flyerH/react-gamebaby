/* eslint react/no-array-index-key:0 */
import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import ImmutablePropTypes from 'react-immutable-proptypes';
import { connect } from 'react-redux';
import style from './style.scss';

const ScreenTable = ({ table }) => {
  const board = [];
  for (let rowIndex = 0; rowIndex < 20; ++rowIndex) {
    const col = [];
    for (let colIndex = 0; colIndex < 10; ++colIndex) {
      col.push(
        <div
          key={`col-${colIndex}`}
          className={table.getIn([rowIndex, colIndex]) === 1 ? style.blockBlack : style.block}
          //     className={
          //   (table.[rowIndex] && table[rowIndex][colIndex]) === 1 ? style.blockBlack : style.block
          // }
        />
      );
    }
    board.push(
      <div key={`row-${rowIndex}`} className={style.outBlock}>
        {col}
      </div>
    );
  }
  return board;
  // table.map((value, i) => (
  //   <div key={i} className={style.outBlock}>
  //     {value.map((_, index) => (
  //       <div
  //         key={index}
  //         className={table.getIn([i, index]) === 1 ? style.blockBlack : style.block}
  //       />
  //     ))}
  //   </div>
  // ));
};

class Screen extends PureComponent {
  // componentDidMount() {
  //   window.addEventListener('keydown',e=>console.log(e))
  //   setTimeout(() => {
  //     const e = new KeyboardEvent('keydown', {keyCode: 32});
  //     window.dispatchEvent(e)
  //   }, 1000);
  // }

  render() {
    const { table } = this.props;
    return (
      <div className={style.screen}>
        <div className={style.left}>
          <ScreenTable table={table} />
        </div>
        <div className={style.right}>Right</div>
      </div>
    );
  }
}

Screen.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types
  table: PropTypes.any,
  // table: ImmutablePropTypes.list.isRequired,
};

const mapStateToProps = state => ({
  table: state.get('table'),
});

export default connect(mapStateToProps)(Screen);
