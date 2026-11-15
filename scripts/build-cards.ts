/**
 * The pictures a link to the site is shown with: one for the country, one for
 * each state, drawn from the same shapes and results the map uses.
 *
 *   bun scripts/build-cards.ts
 *
 * Two steps. First each place is drawn as the map shows it, counties standing
 * as tall as their votes and coloured by their margin, and saved as a picture
 * with nothing behind it (storage/cards). Then ts-images sets each one on a
 * card beside its words (config/images.ts) and writes public/social.
 *
 * The results refresh runs this when it finishes, so a card never quotes a
 * margin the map has moved on from.
 */

import type { CountyFeature, ResultsFile, StateFeature } from '../resources/functions/election'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { createImageData, encode } from 'ts-images'
import { LATEST } from '../resources/data/elections'
import { MARGIN_STOPS, NEUTRAL_COLOR } from '../resources/functions/election'

const ROOT = join(import.meta.dir, '..')
const OUT = join(ROOT, 'storage/cards')

/** Drawn at twice the size and averaged down, which is what smooths the edges. */
const SAMPLES = 2
const GROUND: RGB = [28, 36, 52]
const EDGE: RGB = [11, 15, 23]

type RGB = [number, number, number]
type Ring = Array<[number, number]>

function read<T>(path: string): T | null {
  const file = join(ROOT, path)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : null
}

function hex(colour: string): RGB {
  const n = Number.parseInt(colour.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The colour of a margin, between the same stops the map and its legend use. */
function marginColour(margin: number | null | undefined): RGB {
  if (margin === null || margin === undefined)
    return hex(NEUTRAL_COLOR)
  const stops = MARGIN_STOPS
  if (margin <= stops[0]![0])
    return hex(stops[0]![1])
  for (let i = 1; i < stops.length; i++) {
    const [at, colour] = stops[i]!
    if (margin <= at) {
      const [from, before] = stops[i - 1]!
      const t = (margin - from) / (at - from)
      const a = hex(before)
      const b = hex(colour)
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    }
  }
  return hex(stops[stops.length - 1]![1])
}

const shade = (colour: RGB, by: number): RGB => [colour[0] * by, colour[1] * by, colour[2] * by]

/** A canvas of opaque pixels on nothing. */
class Canvas {
  readonly data: Uint8ClampedArray

  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4)
  }

  private put(x: number, y: number, colour: RGB): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height)
      return
    const i = (y * this.width + x) * 4
    this.data[i] = colour[0]
    this.data[i + 1] = colour[1]
    this.data[i + 2] = colour[2]
    this.data[i + 3] = 255
  }

  /** One run of pixels on a row. */
  fill(y: number, from: number, to: number, colour: RGB): void {
    for (let x = from; x <= to; x++)
      this.put(x, y, colour)
  }

  /**
   * Every run of pixels inside a shape, row by row. A shape's holes are rings
   * like its outline, and a point is inside if it crosses an odd number of
   * edges getting there.
   */
  spans(rings: Ring[], each: (y: number, from: number, to: number) => void): void {
    let top = Infinity
    let bottom = -Infinity
    for (const ring of rings) {
      for (const [, y] of ring) {
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
    for (let y = Math.max(0, Math.ceil(top - 0.5)); y <= Math.min(this.height - 1, Math.floor(bottom - 0.5)); y++) {
      const at = y + 0.5
      const crossings: number[] = []
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [x1, y1] = ring[i]!
          const [x2, y2] = ring[j]!
          if ((y1 <= at && y2 > at) || (y2 <= at && y1 > at))
            crossings.push(x1 + ((at - y1) / (y2 - y1)) * (x2 - x1))
        }
      }
      crossings.sort((a, b) => a - b)
      for (let i = 0; i + 1 < crossings.length; i += 2)
        each(y, Math.round(crossings[i]!), Math.round(crossings[i + 1]!) - 1)
    }
  }

  /** A footprint raised `height` pixels: its walls, darker toward the ground, then its roof. */
  prism(rings: Ring[], height: number, colour: RGB): void {
    const h = Math.round(height)
    if (h > 0) {
      this.spans(rings, (y, from, to) => {
        for (let up = 0; up < h; up++) {
          const wall = shade(colour, 0.46 + 0.22 * (up / h))
          for (let x = from; x <= to; x++)
            this.put(x, y - up, wall)
        }
      })
    }
    this.spans(rings, (y, from, to) => {
      for (let x = from; x <= to; x++)
        this.put(x, y - h, colour)
    })
    // The roof's edge, so neighbours of one colour stay apart.
    const line = h > 0 ? shade(colour, 0.78) : EDGE
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
        this.line(ring[j]![0], ring[j]![1] - h, ring[i]![0], ring[i]![1] - h, line)
    }
  }

  private line(x1: number, y1: number, x2: number, y2: number, colour: RGB): void {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))))
    for (let s = 0; s <= steps; s++)
      this.put(Math.round(x1 + ((x2 - x1) * s) / steps - 0.5), Math.round(y1 + ((y2 - y1) * s) / steps - 0.5), colour)
  }

  /** Averaged down by `SAMPLES`, with colour kept off the see-through pixels. */
  reduced(): { width: number, height: number, data: Uint8ClampedArray } {
    const width = Math.floor(this.width / SAMPLES)
    const height = Math.floor(this.height / SAMPLES)
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0
        let g = 0
        let b = 0
        let a = 0
        for (let dy = 0; dy < SAMPLES; dy++) {
          for (let dx = 0; dx < SAMPLES; dx++) {
            const i = ((y * SAMPLES + dy) * this.width + x * SAMPLES + dx) * 4
            const alpha = this.data[i + 3]!
            r += this.data[i]! * alpha
            g += this.data[i + 1]! * alpha
            b += this.data[i + 2]! * alpha
            a += alpha
          }
        }
        const o = (y * width + x) * 4
        if (a > 0) {
          data[o] = r / a
          data[o + 1] = g / a
          data[o + 2] = b / a
          data[o + 3] = a / (SAMPLES * SAMPLES)
        }
      }
    }
    return { width, height, data }
  }
}

function ringsOf(county: CountyFeature): Ring[][] {
  const geometry = county.geometry as { type: string, coordinates: any }
  return geometry.type === 'Polygon' ? [geometry.coordinates as Ring[]] : geometry.coordinates as Ring[][]
}

/**
 * Draw some counties as the map shows them, looked at from the south and
 * above: north is squeezed, and each county stands as tall as its votes.
 */
async function draw(name: string, counties: CountyFeature[], results: ResultsFile | null, width: number, lift?: number): Promise<void> {
  const TILT = 0.6
  const rows = results?.top?.counties ?? {}
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const county of counties) {
    for (const polygon of ringsOf(county)) {
      for (const [x, y] of polygon[0]!) {
        west = Math.min(west, x)
        east = Math.max(east, x)
        south = Math.min(south, y)
        north = Math.max(north, y)
      }
    }
  }
  const W = width * SAMPLES
  const margin = W * 0.03
  const scale = (W - 2 * margin) / (east - west)
  const ground = (north - south) * scale * TILT
  // Room above the ground for the tallest tower: more for a place that is
  // wide and shallow, where the towers are most of the picture.
  const tallest = lift ? W * lift : Math.max(W * 0.2, Math.min(W * 0.34, ground * 0.7))
  const H = Math.ceil(ground + tallest + 2 * margin)
  const canvas = new Canvas(W, H)
  const most = counties.reduce((max, county) => Math.max(max, rows[county.id]?.[2] ?? 0), 0)

  const project = ([x, y]: [number, number]): [number, number] => [margin + (x - west) * scale, H - margin - (y - south) * scale * TILT]
  // The far side first, so what is nearer is drawn over it.
  const ordered = [...counties].sort((a, b) => b.properties.c[0] - a.properties.c[0])
  for (const county of ordered) {
    const row = rows[county.id]
    const colour = row ? marginColour(row[5]) : GROUND
    const height = row && most > 0 ? (row[2] / most) * tallest : 0
    for (const polygon of ringsOf(county))
      canvas.prism(polygon.map(ring => ring.map(project)), height, colour)
  }

  // Cut to what was drawn, so the card gives its room to the place and not
  // to the empty sky above a short tower.
  const small = canvas.reduced()
  let top = small.height
  let bottom = 0
  let left = small.width
  let right = 0
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      if (small.data[(y * small.width + x) * 4 + 3]! > 0) {
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
        left = Math.min(left, x)
        right = Math.max(right, x)
      }
    }
  }
  const image = createImageData(right - left + 1, bottom - top + 1)
  for (let y = top; y <= bottom; y++)
    image.data.set(small.data.subarray((y * small.width + left) * 4, (y * small.width + right + 1) * 4), (y - top) * image.width * 4)
  writeFileSync(join(OUT, `${name}.png`), await encode(image, 'png'))
}

/**
 * The site's mark as a square picture, for a phone's home screen: the three
 * bars of public/favicon.svg, set in from the edge so a round mask keeps them.
 */
async function icon(file: string, size: number): Promise<void> {
  const canvas = new Canvas(size * SAMPLES, size * SAMPLES)
  const unit = (size * SAMPLES) / 48
  const box = (x: number, y: number, w: number, h: number): Ring[] => [[[x * unit, y * unit], [(x + w) * unit, y * unit], [(x + w) * unit, (y + h) * unit], [x * unit, (y + h) * unit]]]
  canvas.prism(box(0, 0, 48, 48), 0, hex('#0b0f17'))
  // The favicon's bars, drawn at four fifths of their size about the middle.
  const bars: Array<[number, number, number, string]> = [[8, 23, 17, '#5b9dff'], [19.75, 8, 32, '#e8dce4'], [31.5, 16, 24, '#ff6f66']]
  for (const [x, y, h, colour] of bars) {
    const inset = (value: number): number => 24 + (value - 24) * 0.8
    for (const ring of box(inset(x), inset(y), 8.5 * 0.8, h * 0.8))
      canvas.spans([ring], (row, from, to) => canvas.fill(row, from, to, hex(colour)))
  }
  const small = canvas.reduced()
  const image = createImageData(small.width, small.height)
  image.data.set(small.data)
  writeFileSync(join(ROOT, 'public/images', file), await encode(image, 'png'))
}

/** Draw every place's picture, then every card. Returns how many cards were written. */
export async function buildCards(): Promise<number> {
  const counties = read<{ features: CountyFeature[] }>('public/data/geo/counties.json')?.features
  const states = read<{ features: StateFeature[] }>('public/data/geo/states.json')?.features
  if (!counties || !states)
    throw new Error('The shapes are not built. Run `bun run data:geo` first.')
  const results = read<ResultsFile>(`public/data/results/${LATEST.year}.json`)
  mkdirSync(OUT, { recursive: true })

  await icon('apple-touch-icon.png', 180)
  await icon('icon-192.png', 192)
  await icon('icon-512.png', 512)

  // The country is wide and shallow: its towers are given the height to fill a card.
  await draw('us', counties, results, 1100, 0.36)
  for (const state of states)
    await draw(state.properties.usps.toLowerCase(), counties.filter(county => county.properties.st === state.id), results, 900)

  const { default: images } = await import('../config/images')
  const { generateSocialCardSet } = await import('@stacksjs/image')
  const cards = await generateSocialCardSet(images, ROOT)
  return cards.length
}

if (import.meta.main) {
  const started = performance.now()
  const count = await buildCards()
  console.log(`[cards] ${count} cards written to public/social in ${((performance.now() - started) / 1000).toFixed(1)}s`)
  process.exit(0)
}
