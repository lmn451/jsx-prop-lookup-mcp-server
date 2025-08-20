
import React from 'react';

const InlineFunctionPropsComponent = ({ onClick, onHover }) => {
  return (
    <button onClick={() => onClick()} onMouseOver={onHover}>
      Click me
    </button>
  );
};

export default InlineFunctionPropsComponent;
