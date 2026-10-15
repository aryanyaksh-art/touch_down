import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import ErrorBoundary from './components/ErrorBoundary'
import './styles.css'

// The new click-to-play 3D experience is the front page. The previous scrolling site stays reachable at ?legacy while the revamp
// is built part by part (galaxy screen, landing view and story are still to come).
const legacy = new URLSearchParams(location.search).has('legacy')
const Root = legacy ? lazy(() => import('./legacyEntry')) : lazy(() => import('./home/HomeExperience'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary message="Something went wrong. Reloading the page usually fixes it." reload>
      <Suspense fallback={null}>
        <Root />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)
