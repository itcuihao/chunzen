"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
exports.postMessage = postMessage;
exports.onMessage = onMessage;
const api = acquireVsCodeApi();
exports.api = api;
function postMessage(msg) {
    api.postMessage(msg);
}
function onMessage(handler) {
    const listener = (event) => handler(event.data);
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
}
//# sourceMappingURL=vscode.js.map