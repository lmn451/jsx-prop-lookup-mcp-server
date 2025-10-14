import React from "react";
import { Card } from "./Card";

const App = () => {
  return (
    <div>
      <h1>My App</h1>
      <Card
        title="My Card"
        content="This is a card component."
        onAction={() => console.log("Card action")}
      />
    </div>
  );
};

export default App;
