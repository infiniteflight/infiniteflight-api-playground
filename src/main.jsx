import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { bootPlayground } from "./playgroundApp.js";
import "./styles.css";

function Root() {
  useEffect(() => {
    void bootPlayground().catch(error => {
      console.error(error);
    });
  }, []);

  return <App />;
}

createRoot(document.getElementById("root")).render(<Root />);
