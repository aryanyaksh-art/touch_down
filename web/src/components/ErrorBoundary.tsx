import { Component, type ReactNode } from 'react'

// Catches a render error in its subtree and shows a plain message instead of a blank page.
// Used around the landing overlay's content (one bad replay should not take the whole page down) and around the app.
export default class ErrorBoundary extends Component<{ children: ReactNode; message: string; reload?: boolean }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="boundary" role="alert">
        <p>{this.props.message}</p>
        {this.props.reload && (
          <button type="button" onClick={() => location.reload()}>
            Reload the page
          </button>
        )}
      </div>
    )
  }
}
