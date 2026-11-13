/**
 * The 3D map: every county a prism, as tall as its votes and coloured by its
 * margin.
 *
 * Everything that touches ts-maps or the DOM is in this file. The page gives
 * it an element and a few callbacks and gets back a handle to change what is
 * shown; what the numbers mean is in `resources/functions/election.ts`.
 *
 * The coordinates are not real. The counties are projected to the Albers USA
 * layout when the geometry is built (`scripts/build-geo.ts`) and written as
 * made-up longitudes and latitudes near the equator, which is why there is no
 * basemap: nothing real lines up with them.
 */

import type { StateSummary } from '../../scripts/lib/rollup'
import type { CountyFeature, Metric, OfficeKey, ResultsFile, StateFeature } from '../functions/election'
import { MAP_CSS, MAP_JS } from '../assets/scripts/map-assets'
import {
  colorExpression,
  escapeHtml,
  flagNotes,
  formatVotes,
  heightExpression,
  heightValue,
  joinResults,
  metresPerUnit,
  metricValue,
  OFFICE_LABELS,
  unionBounds,
  viewFor,
} from '../functions/election'

type TsMaps = typeof import('ts-maps')

const PITCH = 58
const BEARING = -14
const MAX_PITCH = 78
const SOURCE = 'counties'
const PRISMS = 'counties-3d'
const GROUND = 'counties-ground'

/** What the page is told about a county under the pointer, or selected. */
export interface CountyInfo {
  id: string
  name: string
  state: string
  /** Postal abbreviation, lower case, as the state's page is addressed. */
  code: string
  /** The office the numbers are for: under "Top of ticket", the one that was on the ballot. */
  office: string
  /** False where that office was not on the ballot there. */
  hasRace: boolean
  dem: number
  rep: number
  total: number
  margin: number | null
  pct: number | null
  demName: string
  repName: string
  notes: string[]
}

/** The nation's, or a state's, totals for the office being shown. */
export interface Summary {
  title: string
  office: string
  hasRace: boolean
  dem: number
  rep: number
  total: number
  margin: number | null
  demName: string
  repName: string
  /** `Called for …`, `Not called yet`, or seats won. */
  status: string
  notes: string[]
  /** House seats by who won them, where the office is the House. */
  seats?: { dem: number, rep: number, open: number }
}

export interface ElectionMapOptions {
  office: OfficeKey
  metric: Metric
  /**
   * A state's postal abbreviation to show alone. Left out, it is read from
   * the container's `data-focus`, which the server writes; empty is the
   * whole country.
   */
  focus?: string
  onHover: (county: CountyInfo | null) => void
  onSelect: (county: CountyInfo | null) => void
  /** Once the data is in. `meta` is null where no results have been built. */
  onReady: (ready: { meta: ResultsFile['meta'] | null, webgl: boolean }) => void
  /** The first time the reader moves the map themselves. */
  onExplore?: () => void
}

export interface ElectionMapHandle {
  setOffice: (office: OfficeKey) => void
  setMetric: (metric: Metric) => void
  summary: () => Summary | null
  resetView: () => void
  /** Zoom by `levels`: positive is closer. */
  zoom: (levels: number) => void
  /** Turn the view by `degrees`, clockwise as seen from above. */
  turn: (degrees: number) => void
  /** Let go of the county that was clicked. */
  clearSelection: () => void
  destroy: () => void
}

/** Open a state's page, or the country's for an empty code. */
export function openState(code: string): void {
  location.assign(code ? `/state/${code}` : '/')
}

// --- Loading ts-maps --------------------------------------------------------

let mapsLoad: Promise<TsMaps> | null = null

/** The map library, from its own chunk in `public/`, with its stylesheet. */
function ensureTsMaps(): Promise<TsMaps> {
  mapsLoad ??= (async () => {
    if (!document.querySelector('link[data-ts-maps-css]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = MAP_CSS
      link.dataset.tsMapsCss = '1'
      document.head.appendChild(link)
    }
    return await import(/* @vite-ignore */ MAP_JS) as TsMaps
  })()
  return mapsLoad
}

/**
 * Wait for the container to be in the page and have a height, then mount.
 * Returns a function that gives up waiting.
 */
export function runWhenMapReady(containerId: string, mount: () => void | Promise<void>): () => void {
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let cancelled = false
  const attempt = (): void => {
    if (cancelled)
      return
    const el = document.getElementById(containerId)
    if ((!el || el.offsetHeight < 2) && ++attempts < 40) {
      timer = setTimeout(attempt, 100)
      return
    }
    void Promise.resolve(mount()).catch(error => console.error('[votescape] map failed to mount:', error))
  }
  timer = setTimeout(attempt, 0)
  return () => {
    cancelled = true
    if (timer)
      clearTimeout(timer)
  }
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url)
    return response.ok ? await response.json() as T : null
  }
  catch {
    return null
  }
}

function webglAvailable(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl')
  }
  catch {
    return false
  }
}

// --- The map ----------------------------------------------------------------

export async function mountElectionMap(containerId: string, options: ElectionMapOptions): Promise<ElectionMapHandle | null> {
  const [maps, countiesFile, statesFile, results] = await Promise.all([
    ensureTsMaps(),
    json<{ features: CountyFeature[] }>('/data/geo/counties.json'),
    json<{ features: StateFeature[] }>('/data/geo/states.json'),
    json<ResultsFile>('/data/results/2026.json'),
  ])
  // Loading yields to the page's own start-up; find the element after it.
  const el = document.getElementById(containerId)
  if (!el?.isConnected || !countiesFile || !statesFile)
    return null

  const counties = countiesFile.features
  const states = statesFile.features
  const stateByFips = new Map(states.map(s => [s.id, s]))
  const countyById = new Map(counties.map(c => [c.id, c]))
  const wanted = (options.focus ?? el.dataset.focus ?? '').toLowerCase()
  const focus = states.find(s => s.properties.usps.toLowerCase() === wanted) ?? null
  if (results)
    joinResults(counties, results)

  let office = options.office
  let metric = options.metric

  /** A phone held upright: the panels stack above and below the map, not beside it. */
  const narrow = (): boolean => el.clientWidth < 720

  const home = (): { center: [number, number], zoom: number } => {
    const bounds = focus ? focus.properties.b : unionBounds(states)
    if (narrow()) {
      // Fitted across nearly the whole width, and looked at a little north of
      // its middle, which sets it lower on screen: clear of the totals above.
      const view = viewFor(bounds, el.clientWidth, el.clientHeight, PITCH, focus ? 0.8 : 0.96, 0.34)
      return { center: [view.center[0] + (bounds[3] - bounds[1]) * (focus ? 0.2 : 0.48), view.center[1]], zoom: view.zoom }
    }
    // A state alone is given more room above it: its towers are taller on
    // screen than the country's.
    const view = viewFor(bounds, el.clientWidth, el.clientHeight, PITCH, focus ? 0.6 : 0.64, focus ? 0.42 : 0.5)
    if (focus)
      return view
    // The country is looked at a little north-west of its middle, which sets
    // it down and right on screen: the totals sit over its north-west corner,
    // where the tallest towers on the Pacific would otherwise stand behind them.
    // A wide window leaves room at both sides, and there it stays in the middle.
    const east = el.clientWidth / el.clientHeight > 1.75 ? 0.02 : -0.035
    return { center: [view.center[0] + (bounds[3] - bounds[1]) * 0.05, view.center[1] + (bounds[2] - bounds[0]) * east], zoom: view.zoom }
  }
  const start = home()

  const map: any = new (maps as any).TsMap(el, {
    center: start.center,
    zoom: start.zoom,
    minZoom: 4,
    maxZoom: 12,
    zoomSnap: 0,
    zoomControl: false,
    pitch: PITCH,
    bearing: BEARING,
    maxPitch: MAX_PITCH,
    theme: 'dark',
    attributionControl: false,
    style: { version: 8, sources: {}, layers: [{ id: 'night', type: 'background', paint: { 'background-color': '#0b0f17' } }] },
  })

  /** The counties whose prisms are in view: the state's, or all of them. */
  const scope = (): CountyFeature[] => (focus ? counties.filter(c => c.properties.st === focus.id) : counties)

  /** Metres to a unit of the metric, for the tallest prism to stand a share of the view's height. */
  const scale = (): number => {
    const largest = scope().reduce((max, c) => Math.max(max, heightValue(c, office, metric)), 0)
    return metresPerUnit(largest, home().zoom, el.clientHeight * (narrow() ? 0.22 : focus ? 0.34 : 0.27))
  }

  // --- Roof labels ---

  let labels: any[] = []

  function label(): void {
    for (const marker of labels)
      marker.remove()
    labels = []
    const metres = scale()
    const unit = metric === 'density' ? ' / sq mi' : ' votes'
    // The largest first, each one kept if its label would not sit on one
    // already kept. Measured on screen, where the labels are: two towers a
    // long way apart on the ground can stand one behind the other.
    const wanted = narrow() ? 5 : focus ? 7 : 14
    const chosen: CountyFeature[] = []
    const placed: Array<{ x: number, y: number }> = []
    const ranked = [...scope()].sort((a, b) => metricValue(b, office, metric) - metricValue(a, office, metric)).slice(0, wanted * 4)
    for (const county of ranked) {
      const value = metricValue(county, office, metric)
      if (chosen.length >= wanted || value <= 0)
        break
      const at = map.latLngToContainerPoint(county.properties.c, heightValue(county, office, metric) * metres)
      if (placed.some(p => Math.abs(p.x - at.x) < 96 && Math.abs(p.y - at.y) < 34))
        continue
      chosen.push(county)
      placed.push({ x: at.x, y: at.y })
    }
    for (const county of chosen) {
      const value = metricValue(county, office, metric)
      const html = `<div style="transform:translate(-50%,-100%);padding-bottom:6px;white-space:nowrap;text-align:center;font:600 12px/1.25 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 2px rgba(0,0,0,.8);pointer-events:none">${escapeHtml(county.properties.n)}<div style="font-weight:500;font-size:11px;opacity:.82">${formatVotes(value)}${unit}</div></div>`
      labels.push((maps as any).marker(county.properties.c, {
        // The number the layer's height expression gives this prism.
        altitude: heightValue(county, office, metric) * metres,
        interactive: false,
        keyboard: false,
        icon: (maps as any).divIcon({ className: '', iconSize: [0, 0], html }),
      }).addTo(map))
    }
  }

  // --- Style ---

  function paint(): void {
    if (!map.getStyleLayer?.(PRISMS))
      return
    map.setPaintProperty(PRISMS, 'fill-extrusion-height', heightExpression(office, metric, scale(), focus?.id))
    map.setPaintProperty(PRISMS, 'fill-extrusion-color', colorExpression(office))
    map.setPaintProperty(GROUND, 'fill-color', groundColor())
    label()
  }

  /** Lighter where the office was on the ballot, so a state without it reads as absent. */
  const groundColor = (): unknown => {
    const lit = ['case', ['==', ['get', `f_${office}`], 0], '#121826', '#1c2434']
    return focus ? ['case', ['==', ['get', 'st'], focus.id], lit, '#0f141f'] : lit
  }

  map.on('style.load', () => {
    map.addSource(SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: counties },
      // Indexed no deeper: zooming in to a state cuts these tiles up rather
      // than meshing every prism again.
      maxzoom: 5,
      buffer: 16,
    })
    map.addSource('states', { type: 'geojson', data: { type: 'FeatureCollection', features: states }, maxzoom: 5 })
    map.addStyleLayer({ id: GROUND, type: 'fill', source: SOURCE, paint: { 'fill-color': groundColor(), 'fill-outline-color': '#0b0f17' } })
    map.addStyleLayer({ id: 'state-lines', type: 'line', source: 'states', paint: { 'line-color': '#5b6880', 'line-width': 1, 'line-opacity': 0.7 } })
    map.addStyleLayer({
      id: PRISMS,
      type: 'fill-extrusion',
      source: SOURCE,
      paint: {
        'fill-extrusion-height': heightExpression(office, metric, scale(), focus?.id),
        'fill-extrusion-color': colorExpression(office),
        // Roofs exactly the legend's colours, and nothing fading with
        // distance: the far side of the country is as much the map as the near.
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-fade-range': [0, 0],
      },
    })
    label()
  })

  // --- Describing a place ---

  /** The office a county's numbers are for: under "Top of ticket", whichever the state had. */
  const officeIn = (fips: string): Exclude<OfficeKey, 'top'> => (office === 'top' ? results?.top.office[fips] ?? 'house' : office)

  function describe(id: string): CountyInfo | null {
    const county = countyById.get(id)
    if (!county)
      return null
    const state = stateByFips.get(county.properties.st)
    const actual = officeIn(county.properties.st)
    const row = results?.[office].counties[id]
    const summary = results?.[office].states[county.properties.st]
    return {
      id,
      name: county.properties.l,
      state: state?.properties.n ?? '',
      code: state?.properties.usps.toLowerCase() ?? '',
      office: OFFICE_LABELS[actual],
      hasRace: !!row,
      dem: row?.[0] ?? 0,
      rep: row?.[1] ?? 0,
      total: row?.[2] ?? 0,
      pct: row?.[3] ?? null,
      margin: row?.[5] ?? null,
      demName: sideName(summary, 'dem'),
      repName: sideName(summary, 'rep'),
      notes: row ? flagNotes(row[4], office) : [],
    }
  }

  function summary(): Summary | null {
    if (!results)
      return null
    const data = results[office]
    if (focus) {
      const s = data.states[focus.id]
      const actual = officeIn(focus.id)
      if (!s)
        return { title: focus.properties.n, office: OFFICE_LABELS[actual], hasRace: false, dem: 0, rep: 0, total: 0, margin: null, demName: 'Democratic', repName: 'Republican', status: '', notes: [] }
      return {
        title: focus.properties.n,
        office: OFFICE_LABELS[actual] + (s.special ? ' (special)' : ''),
        hasRace: true,
        dem: s.dem,
        rep: s.rep,
        total: s.total,
        margin: s.margin,
        demName: sideName(s, 'dem'),
        repName: sideName(s, 'rep'),
        status: statusOf(s),
        notes: flagNotes(s.flags, office),
        seats: s.seats ? { dem: s.seats.dem, rep: s.seats.rep, open: s.seats.open + s.seats.other } : undefined,
      }
    }
    const all = Object.values(data.states)
    const add = (key: 'dem' | 'rep' | 'total'): number => all.reduce((n, s) => n + s[key], 0)
    const dem = add('dem')
    const rep = add('rep')
    const seats = all.reduce((n, s) => ({ dem: n.dem + (s.seats?.dem ?? 0), rep: n.rep + (s.seats?.rep ?? 0), open: n.open + (s.seats?.open ?? 0) + (s.seats?.other ?? 0) }), { dem: 0, rep: 0, open: 0 })
    const won = (side: 'dem' | 'rep'): number => all.filter(s => s.winner === side).length
    return {
      title: 'United States',
      office: OFFICE_LABELS[office],
      hasRace: all.length > 0,
      dem,
      rep,
      total: add('total'),
      margin: dem + rep > 0 ? (dem - rep) / (dem + rep) : null,
      demName: 'Democrats',
      repName: 'Republicans',
      status: office === 'house'
        ? `Seats: ${seats.dem} Democratic, ${seats.rep} Republican${seats.open ? `, ${seats.open} not called` : ''}`
        : office === 'top'
          ? `${all.length} states, each by its most prominent race`
          : `${all.length} states voted. Called: ${won('dem')} Democratic, ${won('rep')} Republican`,
      notes: office === 'top' ? ['Senate where there was a race, otherwise governor, otherwise U.S. House.'] : [],
      seats: office === 'house' ? seats : undefined,
    }
  }

  // --- Pointer ---

  let hovered: string | undefined
  let selected: string | undefined

  /** The county the pointer is on: the prism it shows, else the ground under it. */
  function countyAt(point: unknown): string | undefined {
    const [prism] = map.queryRenderedFeatures(point, { layers: [PRISMS] })
    const hit = prism ?? map.queryRenderedFeatures(point, { layers: [GROUND] })[0]
    return hit?.feature.id as string | undefined
  }

  map.on('pointermove', (e: any) => {
    const id = countyAt(e.containerPoint)
    el.style.cursor = id ? 'pointer' : ''
    if (id === hovered)
      return
    if (hovered !== undefined)
      map.setFeatureState({ source: SOURCE, id: hovered }, { hover: false })
    hovered = id
    if (id !== undefined)
      map.setFeatureState({ source: SOURCE, id }, { hover: true })
    options.onHover(id === undefined ? null : describe(id))
  })

  map.on('pointerout', () => {
    if (hovered !== undefined)
      map.setFeatureState({ source: SOURCE, id: hovered }, { hover: false })
    hovered = undefined
    options.onHover(null)
  })

  map.on('click', (e: any) => {
    explored()
    const id = countyAt(e.containerPoint)
    if (selected !== undefined)
      map.setFeatureState({ source: SOURCE, id: selected }, { selected: false })
    selected = id === selected ? undefined : id
    if (selected !== undefined)
      map.setFeatureState({ source: SOURCE, id: selected }, { selected: true })
    options.onSelect(selected === undefined ? null : describe(selected))
  })

  // --- Turning and tilting ---
  //
  // The library pans with a drag and turns with two fingers, which leaves a
  // mouse with no way to look at the towers from another side. A drag with
  // the right button, or with Alt held, orbits: across turns, up and down tilts.

  let orbit: { x: number, y: number, bearing: number, pitch: number, pointer: number } | null = null

  const onOrbitStart = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || !(e.button === 2 || (e.button === 0 && e.altKey)))
      return
    e.preventDefault()
    e.stopImmediatePropagation()
    orbit = { x: e.clientX, y: e.clientY, bearing: map.getBearing(), pitch: map.getPitch(), pointer: e.pointerId }
    el.setPointerCapture(e.pointerId)
    explored()
  }
  const onOrbitMove = (e: PointerEvent): void => {
    if (!orbit || e.pointerId !== orbit.pointer)
      return
    e.stopImmediatePropagation()
    map.setBearing(orbit.bearing + (e.clientX - orbit.x) * 0.3)
    map.setPitch(Math.max(0, Math.min(MAX_PITCH, orbit.pitch - (e.clientY - orbit.y) * 0.25)))
  }
  const onOrbitEnd = (e: PointerEvent): void => {
    if (!orbit || e.pointerId !== orbit.pointer)
      return
    orbit = null
    if (el.hasPointerCapture(e.pointerId))
      el.releasePointerCapture(e.pointerId)
    relabel()
  }
  const onContextMenu = (e: Event): void => e.preventDefault()

  el.addEventListener('pointerdown', onOrbitStart, true)
  el.addEventListener('pointermove', onOrbitMove, true)
  el.addEventListener('pointerup', onOrbitEnd, true)
  el.addEventListener('pointercancel', onOrbitEnd, true)
  el.addEventListener('contextmenu', onContextMenu)

  // Which labels fit depends on where the towers stand on screen, so they
  // are chosen again once the view comes to rest.
  let relabelTimer: ReturnType<typeof setTimeout> | null = null
  function relabel(): void {
    if (relabelTimer)
      clearTimeout(relabelTimer)
    relabelTimer = setTimeout(() => {
      relabelTimer = null
      if (map.getStyleLayer?.(PRISMS))
        label()
    }, 160)
  }
  map.on('moveend', relabel)
  map.on('zoomend', relabel)

  let hasExplored = false
  function explored(): void {
    if (hasExplored)
      return
    hasExplored = true
    options.onExplore?.()
  }
  map.on('dragstart', explored)
  map.on('zoomstart', explored)

  options.onReady({ meta: results?.meta ?? null, webgl: webglAvailable() })

  return {
    setOffice(next) {
      office = next
      paint()
      options.onSelect(selected === undefined ? null : describe(selected))
    },
    setMetric(next) {
      metric = next
      paint()
    },
    summary,
    resetView() {
      const view = home()
      map.flyTo(view.center, view.zoom, { pitch: PITCH, bearing: BEARING, duration: 0.8 })
    },
    zoom(levels) {
      explored()
      map.setZoom(map.getZoom() + levels, { animate: true })
    },
    turn(degrees) {
      explored()
      map.rotateTo(map.getBearing() + degrees, { animate: true, duration: 450 })
      relabel()
    },
    clearSelection() {
      if (selected !== undefined)
        map.setFeatureState({ source: SOURCE, id: selected }, { selected: false })
      selected = undefined
      options.onSelect(null)
    },
    destroy() {
      if (relabelTimer)
        clearTimeout(relabelTimer)
      el.removeEventListener('pointerdown', onOrbitStart, true)
      el.removeEventListener('pointermove', onOrbitMove, true)
      el.removeEventListener('pointerup', onOrbitEnd, true)
      el.removeEventListener('pointercancel', onOrbitEnd, true)
      el.removeEventListener('contextmenu', onContextMenu)
      for (const marker of labels)
        marker.remove()
      labels = []
      map.remove()
    },
  }
}

// --- What is shown, in the address ------------------------------------------

/** The office and metric the address asks for, or the defaults. */
export function readView(): { office: OfficeKey, metric: Metric } {
  const query = new URLSearchParams(location.search)
  const office = query.get('office')
  return {
    office: office === 'senate' || office === 'governor' || office === 'top' ? office : 'house',
    metric: query.get('by') === 'density' ? 'density' : 'votes',
  }
}

/** Keep the address in step, so a view can be linked to. The defaults are left out of it. */
export function writeView(office: OfficeKey, metric: Metric): void {
  const query = new URLSearchParams(location.search)
  if (office === 'house')
    query.delete('office')
  else
    query.set('office', office)
  if (metric === 'votes')
    query.delete('by')
  else
    query.set('by', metric)
  const text = query.toString()
  history.replaceState(history.state, '', `${location.pathname}${text ? `?${text}` : ''}`)
}

function sideName(summary: StateSummary | undefined, side: 'dem' | 'rep'): string {
  const name = summary?.[side === 'dem' ? 'demName' : 'repName']
  const party = summary?.[side === 'dem' ? 'demParty' : 'repParty']
  if (name)
    return party ? `${name} (${party})` : name
  return side === 'dem' ? 'Democratic' : 'Republican'
}

function statusOf(summary: StateSummary): string {
  if (summary.seats) {
    const { dem, rep, open, other } = summary.seats
    const undecided = open + other
    return `Seats: ${dem} Democratic, ${rep} Republican${undecided ? `, ${undecided} not called` : ''}`
  }
  if (summary.status === 'called' && summary.winnerName)
    return `Called for ${summary.winnerName}`
  if (summary.status === 'runoff')
    return 'Headed to a runoff'
  return 'Not called yet'
}
