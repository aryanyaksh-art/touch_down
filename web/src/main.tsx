import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
import '@fontsource-variable/unbounded'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary message="Something went wrong. Reloading the page usually fixes it." reload>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
