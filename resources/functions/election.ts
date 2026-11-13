/**
 * What the map page works out from the data: how a county's row becomes a
 * colour and a height, how numbers are written, and where the camera goes.
 *
 * Pure, with no DOM and no map in it, so it can be tested on its own. The
 * part that drives the map is `resources/composables/useElectionMap.ts`.
 */

import type { Row, StateSummary } from '../../scripts/lib/rollup'
import { FLAG } from '../../scripts/lib/rollup'

export type OfficeKey = 'house' | 'senate' | 'governor' | 'top'
export type Metric = 'votes' | 'density'

export const OFFICE_KEYS: OfficeKey[] = ['house', 'senate', 'governor', 'top']

export const OFFICE_LABELS: Record<OfficeKey, string> = {
  house: 'U.S. House',
  senate: 'U.S. Senate',
  governor: 'Governor',
  top: 'Top of ticket',
}

export interface ResultsFile {
  meta: { election: string, source: string, sourceLabel: string, official: boolean, updatedAt: string, builtAt: string, contests: number }
  house: OfficeData
  senate: OfficeData
  governor: OfficeData
  top: OfficeData & { office: Record<string, 'house' | 'senate' | 'governor'> }
}

export interface OfficeData {
  counties: Record<string, Row>
  states: Record<string, StateSummary>
}

export interface CountyFeature {
  type: 'Feature'
  id: string
  properties: Record<string, any> & { n: string, l: string, st: string, a: number, c: [number, number] }
  geometry: unknown
}

export interface StateFeature {
  type: 'Feature'
  id: string
  properties: { n: string, usps: string, st: string, c: [number, number], b: [number, number, number, number] }
  geometry: unknown
}

/** Square kilometres to a square mile. */
const KM2_PER_MI2 = 2.589988

/**
 * How a county is drawn for an office, as numbers a style expression can
 * read: `v_` votes, `d_` votes per square mile, `m_` margin, and `f_` — 0
 * where the office was not on the ballot there, 1 where the margin colours
 * it, 2 where votes were cast but the margin says nothing.
 */
export function joinResults(counties: CountyFeature[], results: ResultsFile): void {
  for (const county of counties) {
    const p = county.properties
    for (const office of OFFICE_KEYS) {
      const row = results[office].counties[county.id]
      const votes = row?.[2] ?? 0
      p[`v_${office}`] = votes
      p[`d_${office}`] = p.a > 0 ? Math.round((votes / (p.a / KM2_PER_MI2)) * 100) / 100 : 0
      p[`m_${office}`] = row?.[5] ?? 0
      p[`f_${office}`] = !row || votes === 0 ? 0 : row[5] === null ? 2 : 1
    }
  }
}

/** The margin's colours, from a Republican lead of 50 points to a Democratic one. */
export const MARGIN_STOPS: Array<[number, string]> = [
  [-0.5, '#a50f15'],
  [-0.25, '#de2d26'],
  [-0.08, '#fb9a8a'],
  [0, '#e8dce4'],
  [0.08, '#9ab8ef'],
  [0.25, '#3b82f6'],
  [0.5, '#1e40af'],
]

/** A county with votes but no margin worth colouring. */
export const NEUTRAL_COLOR = '#7c8597'

/** `fill-extrusion-color` for an office. */
export function colorExpression(office: OfficeKey): unknown {
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false],
    '#fde047',
    ['boolean', ['feature-state', 'hover'], false],
    '#ffffff',
    ['==', ['get', `f_${office}`], 2],
    NEUTRAL_COLOR,
    ['interpolate', ['linear'], ['get', `m_${office}`], ...MARGIN_STOPS.flat()],
  ]
}

/**
 * `fill-extrusion-height` for an office: `metres` to each unit of
 * `heightValue`. With `focus`, a state's FIPS code, every other state lies
 * flat.
 */
export function heightExpression(office: OfficeKey, metric: Metric, metres: number, focus?: string): unknown {
  const value = metric === 'density' ? ['sqrt', ['get', `d_${office}`]] : ['get', `v_${office}`]
  const raised = ['*', metres, value]
  return focus ? ['case', ['==', ['get', 'st'], focus], raised, 0] : raised
}

/** A county's value for the metric being shown: votes, or votes per square mile. */
export function metricValue(county: CountyFeature, office: OfficeKey, metric: Metric): number {
  return Number(county.properties[`${metric === 'density' ? 'd' : 'v'}_${office}`]) || 0
}

/**
 * What a county's height is in proportion to.
 *
 * Votes, as they are. Density by its square root: Manhattan cast 21,000
 * votes to the square mile and the median county about ten, and drawn in
 * proportion one needle stands over a flat country. The square root keeps
 * the order and lets the rest be seen. The label on a roof gives the real
 * figure.
 */
export function heightValue(county: CountyFeature, office: OfficeKey, metric: Metric): number {
  const value = metricValue(county, office, metric)
  return metric === 'density' ? Math.sqrt(value) : value
}

/** Screen pixels to a metre of height at `zoom`, near the equator, where this map is. */
export function pixelsPerMetre(zoom: number): number {
  return (256 * 2 ** zoom) / 40075016.686
}

/** Metres to give each unit of value, for the largest to stand `pixels` tall at `zoom`. */
export function metresPerUnit(largest: number, zoom: number, pixels: number): number {
  return largest > 0 ? pixels / (pixelsPerMetre(zoom) * largest) : 0
}

const mercatorY = (lat: number): number => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)
const latitudeAt = (y: number): number => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI

/**
 * Where to put the camera to see `bounds` ([west, south, east, north]) in a
 * view `width` by `height`, tilted by `pitch` degrees.
 *
 * Tilted, the ground is foreshortened down the screen by about the cosine of
 * the pitch, and what stands on it needs room above. So the bounds are fitted
 * across into `across` of the width, and down into `down` of the height.
 */
export function viewFor(bounds: [number, number, number, number], width: number, height: number, pitch: number, across = 0.72, down = 0.5): { center: [number, number], zoom: number } {
  const [west, south, east, north] = bounds
  const top = mercatorY(north)
  const bottom = mercatorY(south)
  const spanX = Math.max((east - west) / 360, 1e-9) * 256
  const spanY = Math.max(bottom - top, 1e-9) * 256 * Math.cos((pitch * Math.PI) / 180)
  const zoom = Math.log2(Math.min((width * across) / spanX, (height * down) / spanY))
  return { center: [latitudeAt((top + bottom) / 2), (west + east) / 2], zoom: Math.round(zoom * 100) / 100 }
}

/** The bounds of several states together. */
export function unionBounds(states: StateFeature[]): [number, number, number, number] {
  return states.reduce<[number, number, number, number]>(
    (all, s) => [Math.min(all[0], s.properties.b[0]), Math.min(all[1], s.properties.b[1]), Math.max(all[2], s.properties.b[2]), Math.max(all[3], s.properties.b[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
}

// --- Words ------------------------------------------------------------------

/** 1,382,875 as `1.38M`, 784,213 as `784K`, 932 as `932`. */
export function formatVotes(n: number): string {
  if (n >= 1e6)
    return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`
  if (n >= 1e4)
    return `${Math.round(n / 1e3)}K`
  if (n >= 1e3)
    return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** A margin as `D+12.4`, `R+3.0`, or `Even`; an empty string where there is none. */
export function formatMargin(margin: number | null | undefined): string {
  if (margin === null || margin === undefined)
    return ''
  const points = Math.abs(margin) * 100
  if (points < 0.05)
    return 'Even'
  return `${margin > 0 ? 'D' : 'R'}+${points.toFixed(1)}`
}

/** What a reader should be told about a row, in sentences. */
export function flagNotes(flags: number, office: OfficeKey): string[] {
  const notes: string[] = []
  if (flags & FLAG.notComparable) {
    notes.push(office === 'house' || office === 'top'
      ? 'Most votes here were cast in a district with no Democrat against a Republican, so no margin is shown.'
      : 'No margin is shown for this race.')
  }
  if (flags & FLAG.standIn)
    notes.push('One major party had no candidate. Its side is the leading candidate against the other.')
  if (flags & FLAG.allParty)
    notes.push('Several candidates of one party shared the ballot. Each side is its party\'s total.')
  if (flags & FLAG.firstRound)
    notes.push('Ranked-choice voting: these are first choices.')
  if (flags & FLAG.undecided)
    notes.push('Not called yet, or headed to a runoff.')
  return notes
}

/** Text safe to put inside markup. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
}
