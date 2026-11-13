import type { RouteRegistry } from '@stacksjs/router'

/**
 * This app has no API of its own: its pages are views, and everything the map
 * draws is a file under public/. An entry here names a file in routes/ and
 * the prefix it is mounted under; adding the first one also means adding an
 * `api` site to config/cloud.ts, or the deploy refuses to ship pages whose
 * `/api` calls nothing would answer.
 */
export default {} satisfies RouteRegistry
