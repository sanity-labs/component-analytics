import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@sanity/ui";
import { buildTheme } from "@sanity/ui/theme";
import { App } from "./App.jsx";

const theme = buildTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
