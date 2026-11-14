import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createServices, lookMemory } from './app/container';
import { lookToShow } from './domain/themes';
import { App } from './ui/App';
import { ServicesProvider } from './ui/ServicesContext';
import { showLook } from './ui/shell/useSiteTheme';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/controls.css';
import './ui/styles/widgets.css';
import './ui/styles/brand.css';
import './ui/styles/pearl-field.css';

showLook(lookToShow(undefined, lookMemory.recall()));

const services = await createServices();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>
  </StrictMode>,
);
