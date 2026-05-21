// Side panel webview entry point
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tailwind.css';

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}