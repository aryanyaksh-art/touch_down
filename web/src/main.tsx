import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import ErrorBoundary from './components/ErrorBoundary'
import './styles.css'

const Root = lazy(() => import('./home/HomeExperience'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary message="Something went wrong. Reloading the page usually fixes it." reload>
      <Suspense fallback={null}>
        <Root />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)
