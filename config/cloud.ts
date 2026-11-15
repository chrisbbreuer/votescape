import type { CloudConfig } from '@stacksjs/types'
import type { CloudConfig as TsCloudConfig } from '@stacksjs/ts-cloud'

const APP_SLUG = 'votescape'
const APP_DOMAIN = 'votescape.org'

/**
 * This app's port on the shared box, bound to localhost; rpx fronts it by
 * host name. No other app's config claims 3259 to 3459, and the deploy asks
 * the box itself before it starts anything.
 */
const PORT = 3270

/**
 * Where votescape.org runs.
 *
 * It joins the server the `stacks` project owns and provisions nothing of its
 * own: one page server behind the box's rpx gateway, which issues the
 * certificate, and the address records at Porkbun, where the domain is
 * registered.
 *
 * There is no database and no API. The pages are stx views and everything the
 * map draws is a file under public/, so the release is the checkout as it
 * stands, including the built results and the vendored map library.
 */
export const tsCloud: TsCloudConfig = {
  project: {
    name: 'Votescape',
    slug: APP_SLUG,
    region: 'us-east-1',
  },

  stateDir: 'storage/cloud',

  cloud: {
    provider: 'hetzner',
    attachTo: 'stacks',
  },

  mode: 'server',

  environments: {
    production: {
      type: 'production',
      deployBranch: 'main',
      region: 'us-east-1',
      domain: APP_DOMAIN,
      variables: {
        APP_ENV: 'production',
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
      },
    },
  },

  infrastructure: {
    dns: {
      /*
       * The zone is served by Cloudflare; the domain stays registered at
       * Porkbun. The site runs on one box, so every page and every map file
       * was a round trip to it from wherever the reader is. Behind Cloudflare,
       * TLS ends at the nearest edge and the county shapes, scripts and pages
       * are answered from the edge cache.
       *
       * `registrar` makes the move part of the deploy: ts-cloud creates the
       * zone, copies Porkbun's records across, checks them record for record,
       * and only then repoints the nameservers. It needs CLOUDFLARE_API_TOKEN,
       * CLOUDFLARE_ACCOUNT_ID, PORKBUN_API_KEY and PORKBUN_SECRET_KEY in the
       * deploy's environment.
       */
      provider: 'cloudflare',
      domain: APP_DOMAIN,

      registrar: {
        provider: 'porkbun',
        // Only the web hosts go through the proxy. A mail host must never.
        proxied: [APP_DOMAIN, `www.${APP_DOMAIN}`],
      },

      // `strict` because the box holds a real certificate. A new Cloudflare
      // zone starts on `full`, and `flexible` loops against HTTPS redirects.
      zone: {
        ssl: 'strict',
        alwaysUseHttps: true,
        minTlsVersion: '1.2',
      },
    },
    compute: {
      instances: 1,
      size: 'small',
      disk: {
        size: 20,
        type: 'ssd',
        encrypted: true,
      },
      webServer: 'rpx',
      proxy: {
        engine: 'rpx',
        onDemandTls: true,

        /*
         * Cloudflare's edge in front of the box, with cache rules that fit
         * what the site serves (config/server.ts names the same paths):
         *
         * - Scripts, styles and the county shapes carry a version in their
         *   address, so the edge and the browser keep them for good. `json`
         *   is in the list for `/data/geo/*`.
         * - `/data/results/*` is rewritten while a count is running and asked
         *   for without a version, so it is never held at the edge: the box's
         *   own five-minute header is what a browser gets.
         * - Pages, images and cards are held at the edge for five minutes and
         *   checked again by the browser each visit. A page states the
         *   current count, so it may be no staler than the results file.
         *
         * The edge is emptied at the end of every deploy.
         */
        cdn: {
          provider: 'cloudflare',
          cloudflare: {
            cache: {
              assetExtensions: ['js', 'mjs', 'css', 'map', 'json', 'woff', 'woff2', 'wasm'],
              bypassPaths: ['/data/results', '/api'],
              documentEdgeTtl: 300,
            },
          },
        },
      },
    },
  },

  sites: {
    main: {
      root: '.',
      path: '/',
      domain: APP_DOMAIN,
      start: 'bun node_modules/@stacksjs/buddy/dist/serve-entry.js',
      port: PORT,
      healthCheck: { path: '/' },
      // No migrate step of its own: there is no database. The deploy adds
      // `migrate --no-generate` all the same, which finds no migrations and
      // does nothing. It also runs app/Scheduler.ts as a service on this site.
      preStart: ['bun install --frozen-lockfile'],
      // What the data scripts download and keep as they work. The files the
      // site serves are the ones they write to public/data; the scheduled
      // refresh (app/Scheduler.ts) builds its own working copies on the box.
      exclude: ['storage/data', 'tests'],
      env: {
        HOST: '127.0.0.1',
        PORT: String(PORT),
        APP_ENV: 'production',
        NODE_ENV: 'production',
        APP_NAME: 'Votescape',
        APP_URL: `https://${APP_DOMAIN}`,
        APP_DOMAIN,
        STACKS_DEFAULT_ROUTES: 'none',
        STACKS_MODEL_APIS: 'none',
      },
    },

    www: {
      domain: `www.${APP_DOMAIN}`,
      path: '/',
      redirect: { to: `https://${APP_DOMAIN}`, preservePath: true },
    },
  },
}

const config: CloudConfig = {}

export default config
