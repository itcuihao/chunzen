"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
// Side panel webview entry point
const client_1 = require("react-dom/client");
const App_1 = require("./App");
require("./styles/tailwind.css");
require("./styles/panel.css");
const container = document.getElementById('app');
if (container) {
    const root = (0, client_1.createRoot)(container);
    root.render((0, jsx_runtime_1.jsx)(App_1.App, {}));
}
//# sourceMappingURL=index.js.map