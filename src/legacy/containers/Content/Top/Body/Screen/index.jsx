import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { setScreen } from './screenSlice';
import style from './style.scss';

class Screen extends PureComponent {
  componentDidMount() {
    const { setScreen } = this.props;
    for (let rowIndex = 0; rowIndex < 20; ++rowIndex) {
      for (let colIndex = 0; colIndex < 10; ++colIndex) {
        const col = [];
        col[rowIndex] = [];
        col[rowIndex][colIndex] = 1;
        setTimeout(() => {
          setScreen(col);
        }, 500 * rowIndex + 50 * colIndex);
      }
    }
  }

  render() {
    const { screen } = this.props;
    const board = [];
    for (let rowIndex = 0; rowIndex < 20; ++rowIndex) {
      const col = [];
      for (let colIndex = 0; colIndex < 10; ++colIndex) {
        col.push(
          <div
            key={`col-${colIndex}`}
            className={screen[rowIndex] && screen[rowIndex][colIndex] === 1 ? style.blockBlack : style.block}
          />
        );
      }
      board.push(
        <div key={`row-${rowIndex}`} className={style.outBlock}>
          {col}
        </div>
      );
    }

    return (
      <div className={style.screen}>
        <div className={style.left}>{board}</div>
        <div className={style.right}>Right</div>
      </div>
    );
  }
}

const mapStateToProps = (state) => ({
  screen: state.screen,
});
const mapDispatch = { setScreen };

export default connect(mapStateToProps, mapDispatch)(Screen);
