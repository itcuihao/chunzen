// Typed postMessage wrapper for side panel webview
import { ExtToPanelMessage, PanelToExtMessage } from '../../types/messages';

declare function acquireVsCodeApi<T = unknown>(): { postMessage(msg: unknown): void; getState(): T; setState(state: T): void };

const api = acquireVsCodeApi<{ retain: boolean }>();

export function postMessage(msg: PanelToExtMessage): void {
  api.postMessage(msg);
}

export function onMessage(handler: (msg: ExtToPanelMessage) => void): () => void {
  const listener = (event: MessageEvent<ExtToPanelMessage>) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export { api };