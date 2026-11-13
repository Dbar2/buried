import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/app.css';
import './shell/layout.css';

const container = document.getElementById('root');
if (!container) throw new Error('index.html has no #root element');

// No <StrictMode>: in development it mounts, unmounts and remounts every component, which would start
// the Unity Player twice on one canvas.
createRoot(container).render(<App />);
