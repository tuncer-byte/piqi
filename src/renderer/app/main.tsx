import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/fonts'
import '../styles/global.css'
import { App } from './App'
import { Splash } from './Splash'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash>
      <App />
    </Splash>
  </StrictMode>
)
