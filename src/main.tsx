import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initHeroAudioEarly} from './utils/heroAudio';

initHeroAudioEarly();

createRoot(document.getElementById('root')!).render(<App />);
