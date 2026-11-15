/**
 * Errors in a reader's browser, sent to BugHQ.
 *
 * Nearly everything that can go wrong on this site goes wrong there: the map
 * is drawn by the browser, on whatever graphics hardware it has. The server
 * never hears about it unless the page tells someone.
 *
 * The page's head carries the project's ingest key in a meta tag, and only
 * where the site is deployed. That key is public by design: it lets a
 * browser submit an error and nothing else. Without the tag this does
 * nothing, which is every laptop and every test.
 */
import { bughq, captureException } from '@bughq/sdk'

let started = false

function meta(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

/** Begin reporting uncaught errors, once. Safe to call on every page. */
export function startErrorReporting(): void {
  if (started)
    return
  const key = meta('bughq-key')
  if (!key)
    return
  started = true
  try {
    bughq.init({
      key,
      host: meta('bughq-host') || 'https://bughq.org',
      environment: meta('app-environment') || 'production',
      release: meta('app-release') || undefined,
      beforeSend(event) {
        // Browser extensions throw inside every page they touch. Not ours.
        const text = `${event.message} ${event.stack ?? ''}`
        return /(?:chrome|moz|safari(?:-web)?)-extension:\/\//.test(text) ? null : event
      },
    })
  }
  catch (error) {
    started = false
    console.error('[votescape] error reporting could not start:', error)
  }
}

/** Report an error that was caught, with what the page was doing. */
export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!started)
    return
  try {
    captureException(error, context)
  }
  catch {
    // Reporting an error must never be the next error.
  }
}
