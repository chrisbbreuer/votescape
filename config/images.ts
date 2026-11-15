import type { ImagesConfig, SocialCardPageConfig } from '@stacksjs/types'
import { STATES } from '../resources/data/states'
import { countrySummary, stateSummary } from '../resources/functions/summary'

/**
 * **Images Configuration**
 *
 * The cards a link to the site is shown with: one for the country, one for
 * the about page and one for each state. `bun scripts/build-cards.ts` draws
 * each place's picture into storage/cards and then builds the cards from
 * what is declared here, so the words on a card are the results as they
 * stand when it is built.
 */

/**
 * A place's picture. scripts/build-cards.ts draws it before it builds the
 * cards, so run that script and not `buddy generate:images` on its own.
 */
const picture = (name: string): string => `storage/cards/${name}.png`

const country = countrySummary()

const pages: SocialCardPageConfig[] = [
  { path: '/', eyebrow: country.eyebrow, title: country.title, subtitle: country.subtitle, foreground: picture('us') },
  {
    path: '/about',
    eyebrow: 'About the map',
    title: 'How to read Votescape',
    subtitle: 'What the heights and colours mean, and where the numbers come from.',
    foreground: picture('us'),
  },
  ...STATES.map((state) => {
    const summary = stateSummary(state.code)!
    return { path: `/state/${state.code}`, eyebrow: summary.eyebrow, title: summary.title, subtitle: summary.subtitle, foreground: picture(state.code) }
  }),
]

export default {
  fonts: {
    title: 'resources/fonts/Geist-Bold.ttf',
    body: 'resources/fonts/Geist-Regular.ttf',
  },

  // The page's own night sky: the same dark blue, lit from the top.
  background: {
    color: '#0b0f17',
    gradient: { angle: 180, stops: [
      { offset: 0, color: '#131b30' },
      { offset: 0.6, color: '#0b0f17' },
    ] },
    glows: [{ x: 0.78, y: 0.05, radius: 0.7, color: '#5b9dff26' }],
  },
  color: '#f1f4f9',
  mutedColor: '#aab4c5',
  accent: '#8ab4ff',
  brand: 'Votescape',
  mark: 'public/favicon.svg',
  markPlate: false,

  social: {
    enabled: true,
    outputDir: 'public/social',
    publicPath: '/social',
    presets: ['og'],
    format: 'jpeg',
    quality: 90,
    // The pictures are cut out, not screenshots: no frame, corner or shadow.
    device: { radius: 0, shadow: false, scale: 1 },
    // A card is mostly seen small, so its small print is set larger than usual.
    text: { eyebrowSize: 24, subtitleSize: 28 },
    pages,
  },

  appStore: {
    enabled: false,
    outputDir: 'resources/app-store/screenshots',
    displays: ['APP_IPHONE_67', 'APP_IPAD_PRO_3GEN_129', 'APP_DESKTOP'],
    // Each slide is one claim about the product. `capture` is a raw screenshot
    // of the app — no frame, no caption; the framing happens for you.
    // slides: [
    //   { capture: 'dist/captures/home.png', headline: 'What it does.', subheadline: 'Why that matters.' },
    // ],
  },

  appIcons: {
    enabled: false,
    // source: 'resources/icon.png',
    outputDir: 'resources/app-icons',
    platforms: ['ios', 'macos'],
    favicon: false,
    faviconDir: 'public',
  },
} satisfies ImagesConfig
