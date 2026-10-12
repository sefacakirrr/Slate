import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { TooltipLayer } from './components/TooltipLayer'
import { initLanguage } from './i18n/init'
import './index.css'

function render(): void {
  // TooltipLayer sits beside <App /> so every renderer root (main window,
  // quick-capture and sticky-note windows, selected by route hash) gets it.
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
      <TooltipLayer />
    </React.StrictMode>,
  )
}

// Resolve the UI language before the first paint so no window flashes English.
initLanguage()
  .catch((err) => console.error('language init failed:', err))
  .finally(render)
