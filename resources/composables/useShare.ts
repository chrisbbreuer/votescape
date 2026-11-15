/**
 * Sharing what the map shows: a link that opens the same view, the places a
 * link can be posted, and a picture of the numbers to go with it.
 *
 * Everything that touches the browser is here, so the component only says
 * what to share.
 */

import type { View } from '../functions/election'
import { viewQuery } from '../functions/election'

/** What the picture says: one place's result for one office. */
export interface ShareCard {
  /** The office, as the panels name it. */
  eyebrow: string
  /** The election, for the corner: `2024 presidential`. */
  election: string
  year: number
  /** The place: `Harris County`, `Texas`, `United States`. */
  title: string
  /** The state a county is in. Empty for a state or the country. */
  subtitle: string
  hasRace: boolean
  /** `D+14.0`, `R+3.2`, `Even`, or empty. */
  margin: string
  leansDem: boolean
  demName: string
  repName: string
  dem: number
  rep: number
  total: number
  /** `Unofficial results, updated November 13, 2026`. */
  footer: string
}

/** The address of this view: the page, with the election, office, height and county it shows. */
export function viewUrl(view: View): string {
  return `${location.origin}${location.pathname}${viewQuery(view)}`
}

/** Where a link can be posted, each as an address that opens that site's own form. */
export function shareTargets(text: string, url: string, subject: string): Record<string, string> {
  const t = encodeURIComponent(text)
  const u = encodeURIComponent(url)
  const both = encodeURIComponent(`${text} ${url}`)
  return {
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`,
    bluesky: `https://bsky.app/intent/compose?text=${both}`,
    threads: `https://www.threads.net/intent/post?text=${both}`,
    whatsapp: `https://wa.me/?text=${both}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
    email: `mailto:?subject=${encodeURIComponent(subject)}&body=${both}`,
  }
}

/** True where the device has its own share sheet. */
export function nativeShareAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/** Open the device's share sheet. False if it has none, or the reader closed it. */
export async function shareNative(title: string, text: string, url: string): Promise<boolean> {
  if (!nativeShareAvailable())
    return false
  try {
    await navigator.share({ title, text, url })
    return true
  }
  catch {
    return false
  }
}

/** Put text on the clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  }
  catch {
    // No clipboard permission: the old way, through a field.
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(field)
    field.select()
    let done = false
    try {
      done = document.execCommand('copy')
    }
    catch {
      done = false
    }
    field.remove()
    return done
  }
}

/** Close a popover by id, if it is open. */
export function closePopover(id: string): void {
  try {
    (document.getElementById(id) as (HTMLElement & { hidePopover?: () => void }) | null)?.hidePopover?.()
  }
  catch {
    // Not open.
  }
}

// --- The picture ------------------------------------------------------------

const WIDTH = 1200
const HEIGHT = 630
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const DEM = '#5b9dff'
const REP = '#ff6f66'

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Text no wider than `max`: the size comes down until it fits. */
function fitted(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number): void {
  let px = size
  ctx.font = `${weight} ${px}px ${FONT}`
  while (ctx.measureText(text).width > max && px > 28) {
    px -= 2
    ctx.font = `${weight} ${px}px ${FONT}`
  }
}

/** Draw the picture: the place, its margin, and the two sides' shares. */
export function drawShareCard(card: ShareCard): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')!
  const pad = 72

  ctx.fillStyle = '#0b0f17'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const glow = ctx.createRadialGradient(WIDTH / 2, -80, 0, WIDTH / 2, -80, 820)
  glow.addColorStop(0, '#1b2646')
  glow.addColorStop(1, 'rgba(11, 15, 23, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // The mark and the name.
  const bars: Array<[number, number, number, string]> = [[0, 22, 26, DEM], [18, 0, 48, '#e8dce4'], [36, 12, 36, REP]]
  for (const [x, y, h, colour] of bars) {
    ctx.fillStyle = colour
    rounded(ctx, pad + x, 60 + y, 12, h, 3)
    ctx.fill()
  }
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#e9edf5'
  ctx.font = `650 34px ${FONT}`
  ctx.fillText('Votescape', pad + 66, 100)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#9aa5b8'
  ctx.font = `500 26px ${FONT}`
  ctx.fillText(card.election, WIDTH - pad, 98)
  ctx.textAlign = 'left'

  // What and where.
  ctx.fillStyle = '#9aa5b8'
  ctx.font = `600 26px ${FONT}`
  ctx.fillText(card.eyebrow.toUpperCase(), pad, 214)

  const hasMargin = card.hasRace && !!card.margin
  if (hasMargin) {
    ctx.textAlign = 'right'
    ctx.fillStyle = card.margin === 'Even' ? '#e9edf5' : card.leansDem ? DEM : REP
    ctx.font = `700 112px ${FONT}`
    ctx.fillText(card.margin, WIDTH - pad, 310)
    ctx.textAlign = 'left'
  }
  const marginWidth = hasMargin ? ctx.measureText(card.margin).width + 48 : 0
  ctx.fillStyle = '#ffffff'
  fitted(ctx, card.title, 700, 84, WIDTH - 2 * pad - marginWidth)
  ctx.fillText(card.title, pad, 300)
  if (card.subtitle) {
    ctx.fillStyle = '#c6cedb'
    ctx.font = `500 32px ${FONT}`
    ctx.fillText(card.subtitle, pad, 346)
  }

  const sides = card.dem + card.rep
  if (card.hasRace && sides > 0) {
    const share = card.dem / sides
    const y = 392
    const w = WIDTH - 2 * pad
    ctx.fillStyle = REP
    rounded(ctx, pad, y, w, 26, 13)
    ctx.fill()
    ctx.save()
    rounded(ctx, pad, y, w, 26, 13)
    ctx.clip()
    ctx.fillStyle = DEM
    ctx.fillRect(pad, y, w * share, 26)
    ctx.fillStyle = '#0b0f17'
    ctx.fillRect(pad + w * share - 2, y, 4, 26)
    ctx.restore()

    const percent = (value: number): string => `${(value * 100).toFixed(1)}%`
    const count = (value: number): string => `${Math.round(value).toLocaleString('en-US')} votes`

    ctx.fillStyle = DEM
    ctx.font = `700 44px ${FONT}`
    ctx.fillText(percent(share), pad, 482)
    ctx.fillStyle = '#d5dbe6'
    fitted(ctx, card.demName, 500, 28, w / 2 - 40)
    ctx.fillText(card.demName, pad, 522)

    ctx.textAlign = 'right'
    ctx.fillStyle = REP
    ctx.font = `700 44px ${FONT}`
    ctx.fillText(percent(1 - share), WIDTH - pad, 482)
    ctx.fillStyle = '#d5dbe6'
    fitted(ctx, card.repName, 500, 28, w / 2 - 40)
    ctx.fillText(card.repName, WIDTH - pad, 522)
    ctx.textAlign = 'left'

    ctx.textAlign = 'center'
    ctx.fillStyle = '#9aa5b8'
    ctx.font = `500 26px ${FONT}`
    ctx.fillText(count(card.total), WIDTH / 2, 482)
    ctx.textAlign = 'left'
  }
  else {
    ctx.fillStyle = '#c6cedb'
    ctx.font = `500 34px ${FONT}`
    ctx.fillText(card.hasRace ? 'Votes were cast here, but not between a Democrat and a Republican.' : `This office was not on the ballot here in ${card.year}.`, pad, 440)
  }

  ctx.fillStyle = 'rgba(148, 163, 184, 0.22)'
  ctx.fillRect(pad, 556, WIDTH - 2 * pad, 1)
  ctx.fillStyle = '#e9edf5'
  ctx.font = `650 26px ${FONT}`
  ctx.fillText('votescape.org', pad, 598)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#9aa5b8'
  ctx.font = `500 24px ${FONT}`
  ctx.fillText(card.footer, WIDTH - pad, 598)
  ctx.textAlign = 'left'
  return canvas
}

/** A name for the picture's file, from the place it shows. */
function fileName(card: ShareCard): string {
  const slug = `${card.title} ${card.subtitle}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `votescape-${slug || 'results'}.png`
}

/**
 * Hand the picture over: to the share sheet on a phone, where it can go
 * straight into a post, and as a download anywhere else.
 */
export async function saveShareCard(card: ShareCard, text: string, url: string): Promise<'shared' | 'saved' | 'failed'> {
  const canvas = drawShareCard(card)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob)
    return 'failed'
  const file = new File([blob], fileName(card), { type: 'image/png' })
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (touch && nativeShareAvailable() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `${text} ${url}` })
      return 'shared'
    }
    catch (error) {
      // Closed by the reader: nothing to fall back to.
      if ((error as { name?: string } | null)?.name === 'AbortError')
        return 'failed'
    }
  }
  const link = document.createElement('a')
  const href = URL.createObjectURL(blob)
  link.href = href
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
  return 'saved'
}
