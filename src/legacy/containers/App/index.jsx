import React, { Component } from "react";
import Content from '@/containers/Content';
import style from "./style.scss";

class App extends Component {
  constructor() {
    super();
    this.state = {
      winWidth: document.documentElement.clientWidth,
      winHeight: document.documentElement.clientHeight,
    };
  }

  componentDidMount() {
    window.addEventListener("resize", this.resize.bind(this));
  }

  resize() {
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
      paddingTop: top === 0 ? "" : top,
      paddingBottom: top === 0 ? "" : top,
      marginTop: top === 0 ? "" : -475 - top,
    };

    return (
      <div className={style.app} style={outStyle}>
        {/* <BackgroundLeft /> */}
        <Content />
        {/* <BackgroundRight /> */}
      </div>
    );
  }
}

export default App;
