import React, { useState } from 'react';
import Button from './Button';
import Card from './Card';

const App: React.FC = () => {
  const [count, setCount] = useState(0);

  const handleIncrement = () => {
    setCount((prev) => prev + 1);
  };

  const handleReset = () => {
    setCount(0);
  };

  return (
    <div className="app">
      <h1>Counter App</h1>

      <Card title="Counter" className="counter-card">
        <p>Current count: {count}</p>

        <div className="button-group">
          <Button onClick={handleIncrement} variant="primary" className="increment-btn">
            Increment
          </Button>

          <Button onClick={handleReset} variant="secondary" disabled={count === 0}>
            Reset
          </Button>
        </div>
      </Card>

      <Card title="Info">
        <p>This is a sample React application.</p>
        <Button variant="primary">Learn More</Button>
      </Card>
    </div>
  );
};

export default App;
