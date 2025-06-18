import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { declareCustomElement } from 'testnet-maintenance-widget'
declareCustomElement();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* @ts-expect-error (custom element) */}
    <maintenance-widget />
    <App />
  </StrictMode>,
)
