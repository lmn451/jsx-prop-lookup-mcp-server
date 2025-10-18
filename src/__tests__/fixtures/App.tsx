import React from "react";
import { Card } from "./Card";
import { Button } from "./Button";

const App = () => {
  return (
    <div>
      <h1>My App</h1>
      <Card
        title="My Card"
        content="This is a card component."
        onAction={() => console.log("Card action")}
      />
      <Button onClick={() => console.log("Button clicked")}>Click me</Button>
    </div>
  );
};

export default App;
