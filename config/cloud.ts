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
      provider: 'porkbun',
      domain: APP_DOMAIN,
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
      // No migrate step: there is no database to migrate.
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
