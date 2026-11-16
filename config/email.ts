import type { EmailConfig } from '@stacksjs/types'
import { env } from '@stacksjs/env'

export default {
  from: {
    name: env.MAIL_FROM_NAME || 'Votescape',
    address: env.MAIL_FROM_ADDRESS || 'hello@votescape.org',
  },

  domain: env.MAIL_DOMAIN || 'votescape.org',
  // The address the site writes from. The deploy creates it on the mail
  // server and keeps its password, encrypted, as MAIL_PASSWORD_HELLO.
  mailboxes: ['hello'],
  forwards: {},
  url: env.APP_URL || 'votescape.localhost',
  charset: 'UTF-8',

  server: {
    // Votescape's own mail: the deploy registers votescape.org on the mail
    // server, signs what it sends, and publishes MX, SPF, DKIM and DMARC.
    enabled: true,
    generatePasswords: true,
    scan: true,
    subdomain: 'mail',
    // Gmail Postmaster Tools shows how Gmail receives your mail. Add your
    // domain at https://postmaster.google.com, paste the TXT value it shows,
    // and every deploy keeps it published.
    // postmaster: { google: 'google-site-verification=...' },
  },
} satisfies EmailConfig
