import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { setupDiscord } from './discord'

async function init() {
  // Try to set up Discord — works inside Discord, gracefully skips in browser
  await setupDiscord().catch(() => {});

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

init();