import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../App'
import './global.css'
import { registerServiceWorker } from './registerServiceWorker'
import { bindViewportHeight } from './utils/viewportHeight'

bindViewportHeight()
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
) 