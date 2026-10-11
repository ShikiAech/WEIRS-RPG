import { createRoot } from 'react-dom/client';
import { App } from './App';
import './theme.css';
import './styles.css';
import './styles/tabletop.css';
import './styles/tabletop-map.css';
createRoot(document.getElementById('root')!).render(<App />);
