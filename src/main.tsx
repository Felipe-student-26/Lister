import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/fontFaces';
import { initTheme } from './store/theme';
import { hideNativeSplash } from './lib/nativeSplash';

initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Android: cuando React ya pintó, se quita el splash nativo (el web ya está debajo).
requestAnimationFrame(() => void hideNativeSplash());
