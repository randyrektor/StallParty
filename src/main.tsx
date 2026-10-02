import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../App'
import './global.css'
import { listenForInstallPrompt } from './utils/installPrompt'
import { registerServiceWorker } from './registerServiceWorker'
import { bindViewportHeight } from './utils/viewportHeight'

bindViewportHeight()
listenForInstallPrompt()
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
) 