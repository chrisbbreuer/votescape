import type { ServerConfig } from '@stacksjs/types'
import process from 'node:process'

/**
 * **Server Configuration**
 *
 * This configuration defines how the views server behaves in the split
 * views/API topology, shared by `buddy dev` and `buddy serve`. Because Stacks
 * is fully-typed, you may hover any of the options below and the definitions
 * will be provided. In case you have any questions, feel free to reach out via
 * Discord or GitHub Discussions.
 */
const FOR_GOOD = 'public, max-age=31536000, immutable'

const CONTENT_SECURITY_POLICY = [
  'default-src \'self\'',
  // stx compiles a template's `:if` and `:class` expressions in the browser,
  // which is `unsafe-eval`, and ships each page's own script inline. What
  // this still refuses is script from anywhere but this site.
  'script-src \'self\' \'unsafe-inline\' \'unsafe-eval\'',
  'style-src \'self\' \'unsafe-inline\'',
  'img-src \'self\' data: blob:',
  'font-src \'self\' data:',
  'connect-src \'self\'',
  'worker-src \'self\' blob:',
  'object-src \'none\'',
  'base-uri \'self\'',
  'form-action \'self\'',
  'frame-ancestors \'self\'',
].join('; ')

export default {
  // Opt in after publishing the native Request model and migrating its table.
  captureRequests: false,
  /**
   * **API Proxy**
   *
   * The views server renders stx pages and forwards everything else to the API
   * process. By default "everything else" means the `/api/**` prefix plus the
   * mutating verbs (POST/PUT/PATCH/DELETE), which never match a page render.
   *
   * A plain `GET` route declared at the root on the API process is therefore
   * not reachable unless you say so here. That is what these options are for:
   *
   * ```ts
   * proxy: {
   *   paths: ['/health', '/me'],
   *   prefixes: ['/oauth/'],
   * }
   * ```
   *
   * `buddy dev` prints the effective rules at boot, so you can see what will
   * be forwarded without guessing at a 404.
   *
   * One caveat worth knowing before you add a path: stx runs its request hook
   * before static file serving, so a path listed here shadows a `public/` file
   * of the same name. Listing `/script.js` makes `public/script.js`
   * unreachable.
   */
  proxy: {
    prefixes: [],
    paths: [],
  },

  /**
   * **Redirects**
   *
   * Old URLs and where they go now. Every site that replaces an older one
   * inherits its URLs — they are in search indexes, in other people's links,
   * and on printed material — and a 301 is the only thing that carries their
   * standing across to the new page.
   *
   * ```ts
   * redirects: {
   *   '/old-page': '/new-page',
   *   '/summer-sale': { to: '/specials', status: 302 },
   *   '/docs': { to: 'https://docs.example.com', preserveQuery: false },
   * }
   * ```
   *
   * A rule written as `/section/*` claims that subtree instead, appending
   * whatever followed the prefix to the target — `'/dashboard/*':
   * 'https://dash.example.com'` sends `/dashboard/events/42` to
   * `https://dash.example.com/events/42`. It is the one wildcard form there
   * is: moving a section whose pages are dynamic cannot be written as a list
   * of exact rules. An exact rule always wins over a subtree one.
   *
   * Matching is otherwise exact on the path, ignoring a trailing slash, and the query
   * string is carried over unless you say otherwise. Rules are answered before
   * a page is looked for and before `public/` is searched, so — as with
   * `proxy.paths` — a rule shadows a static file of the same name. Anything
   * under `/api/` is ignored, and a rule pointing at itself is dropped rather
   * than looping the browser.
   *
   * `buddy dev` prints the effective rules at boot.
   */
  redirects: {},

  /**
   * **Domains**
   *
   * Hosts whose home page is a page of the site.
   *
   * ```ts
   * domains: {
   *   '{username}.example.com': '/{username}',
   * }
   * ```
   *
   * `chris.example.com` then renders what `example.com/chris` renders — the
   * same `resources/views/[username].stx`, with the same params — while the
   * address bar keeps the host: a profile, a team or a shop with a domain of
   * its own. Only the host's root is routed; its other paths are the site's
   * own. A `{name}` label matches one DNS label.
   *
   * `{ to: '/{username}', elsewhere: 'https://example.com' }` keeps the root
   * as the page and redirects the host's other pages to the main site, so a
   * visitor browses and signs in on one origin.
   *
   * The hostnames still have to reach the server: with ts-cloud, list
   * `*.example.com` in the site's `aliases` in `config/cloud.ts`.
   */
  domains: {},

  /**
   * **Security headers**
   *
   * Rendered pages carry `X-Frame-Options: SAMEORIGIN`,
   * `X-Content-Type-Options: nosniff` and
   * `Referrer-Policy: strict-origin-when-cross-origin`, the same three the
   * API already sent. None of them can be set from a template:
   * `X-Frame-Options` has no `<meta>` equivalent, and CSP `frame-ancestors`
   * is ignored when set that way.
   *
   * `embeddable` lists the paths another origin is allowed to frame. Those
   * paths omit `X-Frame-Options` and keep everything else:
   *
   * ```ts
   * security: {
   *   embeddable: ['/embed/', '/share/card'],
   * }
   * ```
   *
   * An entry ending in `/` is a prefix, anything else is an exact path.
   * `buddy dev` and `buddy serve` both print the list at boot, because a page
   * that can be framed is a deliberate exception worth seeing.
   *
   * Two headers are deliberately NOT sent on pages. A `STACKS_CSP` policy is
   * not, because it has only ever reached JSON responses and a blanket policy
   * breaks inline stx script bootstrapping, Stripe iframes and OAuth popups.
   * `Strict-Transport-Security` is not, because `buddy serve` treats itself as
   * production even on a laptop, and HSTS on localhost pins that host to
   * HTTPS in your browser for a year.
   *
   * `STACKS_SECURITY_HEADERS_DISABLE=true` turns the whole set off, for a
   * deployment behind a proxy that injects its own.
   */
  security: {
    embeddable: [],
  },
  // Headers by path. A later, narrower entry wins over `/*` for the same
  // header.
  headers: {
    '/*': {
      // HTTPS only, for a year: the site has no plain-HTTP use. Only where
      // it is deployed, or a laptop's own host name is pinned to HTTPS too.
      ...(process.env.APP_ENV === 'production' && { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }),
      // Everything the pages load is the site's own. Inline script and style
      // are how stx ships a page's own behaviour and how the map places its
      // labels; `blob:` is the map library's workers and textures.
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    },
    // The page names these with a version in the address (`?v=`), which
    // changes when the file does, so a copy can be kept for good.
    '/js/*': { 'Cache-Control': FOR_GOOD },
    '/css/*': { 'Cache-Control': FOR_GOOD },
    '/data/geo/*': { 'Cache-Control': FOR_GOOD },
    // Not this one: it is rewritten every few hours where the site runs, and
    // a page that could not name its version asks for it plainly.
    '/data/results/*': { 'Cache-Control': 'public, max-age=300' },
    '/favicon.svg': { 'Cache-Control': 'public, max-age=86400' },
    '/images/*': { 'Cache-Control': 'public, max-age=86400' },
  },
} satisfies ServerConfig
