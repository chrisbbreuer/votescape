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
import type { Election } from '../data/elections'
import type { CountyFeature, Metric, OfficeKey, ResultsFile, StateFeature, View } from '../functions/election'
import { MAP_CSS, MAP_JS } from '../assets/scripts/map-assets'
import { electionFor, LATEST } from '../data/elections'
import { FLAG } from '../../scripts/lib/rollup'
import {
  colorExpression,
  escapeHtml,
  flagNotes,
  fromTrackpad,
  formatMargin,
  formatVotes,
  heightExpression,
  heightValue,
  joinResults,
  metresPerUnit,
  metricValue,
  OFFICE_LABELS,
  officeData,
  parseView,
  unionBounds,
  viewFor,
  viewQuery,
} from '../functions/election'

type TsMaps = typeof import('ts-maps')

const PITCH = 58
const BEARING = -14
const MAX_PITCH = 78
const MIN_ZOOM = 4
const MAX_ZOOM = 12
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
  /** The office was on the ballot, but that election's count is for the state as a whole. */
  stateOnly: boolean
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

/** What the page is told about the results being shown. */
export interface ElectionInfo {
  election: Election
  /** Null where that election's results have not been built. */
  meta: ResultsFile['meta'] | null
  office: OfficeKey
}

export interface ElectionMapOptions {
  /** The election to open on, by year. */
  year: number
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
  onReady: (ready: ElectionInfo & { webgl: boolean }) => void
  /** The first time the reader moves the map themselves. */
  onExplore?: () => void
  /** A county to open with, by id: the one a shared link names. */
  county?: string
  /**
   * The page's own elements this fills and listens to, by id: the search
   * field and its list of suggestions, the popover they are in, and the
   * element the table of results is written into.
   */
  ids?: { search: string, places: string, popover: string, table: string }
}

export interface ElectionMapHandle {
  /**
   * Show another election, by year, fetching its results if they are not
   * here yet. Resolves to what is then shown, or to null where its results
   * could not be had, and the map is left as it was.
   */
  setElection: (year: number) => Promise<ElectionInfo | null>
  /** Fetch an election's results ahead of their being asked for. */
  warm: (year: number) => void
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
  /** Pin a county by id, and bring it into view. */
  select: (id: string) => void
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
  // The server names each file with a version, so a browser may keep it for
  // good and still get the new one the moment it changes.
  const named = document.getElementById(containerId)?.dataset ?? {}
  // Each election's file, by year, as the server named them.
  let files: Record<string, string> = {}
  try {
    files = JSON.parse(named.years || '{}') as Record<string, string>
  }
  catch {
    // Unnamed: each is asked for plainly.
  }
  const loads = new Map<number, Promise<ResultsFile | null>>()
  const load = (year: number): Promise<ResultsFile | null> => {
    let pending = loads.get(year)
    if (!pending) {
      pending = json<ResultsFile>(files[year] || (year === LATEST.year && named.results) || `/data/results/${year}.json`)
      loads.set(year, pending)
      // One that did not arrive is asked for again the next time.
      void pending.then(file => file || loads.delete(year))
    }
    return pending
  }

  let election = electionFor(options.year) ?? LATEST
  const [maps, countiesFile, statesFile, first] = await Promise.all([
    ensureTsMaps(),
    json<{ features: CountyFeature[] }>(named.counties || '/data/geo/counties.json'),
    json<{ features: StateFeature[] }>(named.states || '/data/geo/states.json'),
    load(election.year),
  ])
  let results = first
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

  let office = election.offices.includes(options.office) ? options.office : election.offices[0]!
  let metric = options.metric
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  /** A phone on its side, or a window as short: the panels are small and sit in the corners. */
  const short = (): boolean => el.clientHeight < 520

  /** A phone held upright: the panels stack above and below the map, not beside it. */
  const narrow = (): boolean => el.clientWidth < 720 && !short()

  const home = (): { center: [number, number], zoom: number } => {
    const bounds = focus ? focus.properties.b : unionBounds(states)
    if (narrow()) {
      // Fitted across nearly the whole width, and looked at a little north of
      // its middle, which sets it lower on screen: clear of the totals above.
      const view = viewFor(bounds, el.clientWidth, el.clientHeight, PITCH, focus ? 0.72 : 0.96, 0.34)
      return { center: [view.center[0] + (bounds[3] - bounds[1]) * (focus ? 0.14 : 0.38), view.center[1]], zoom: view.zoom }
    }
    if (short()) {
      // Little height to give: fitted to it, and set to the right of the
      // totals, which take the top left corner.
      const view = viewFor(bounds, el.clientWidth, el.clientHeight, PITCH, 0.5, focus ? 0.5 : 0.62)
      return { center: [view.center[0] + (bounds[3] - bounds[1]) * 0.2, view.center[1] - (bounds[2] - bounds[0]) * 0.06], zoom: view.zoom }
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
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomSnap: 0,
    // The wheel and the trackpad are read below, where they can be told apart.
    scrollWheelZoom: false,
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
    return metresPerUnit(largest, home().zoom, el.clientHeight * (narrow() ? 0.21 : focus ? 0.34 : 0.27))
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
    const wanted = narrow() || short() ? 5 : focus ? 7 : 14
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

  /** Another election's numbers on the same counties: joined, handed to the map, and drawn. */
  function redraw(): void {
    if (results)
      joinResults(counties, results)
    if (!map.getStyleLayer?.(PRISMS))
      return
    map.setSourceData(SOURCE, { type: 'FeatureCollection', features: counties })
    // New data starts with no county marked.
    if (selected !== undefined)
      map.setFeatureState({ source: SOURCE, id: selected }, { selected: true })
    hovered = undefined
    paint()
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
  const officeIn = (fips: string): Exclude<OfficeKey, 'top'> => (office === 'top' ? results?.top?.office[fips] ?? 'house' : office)

  function describe(id: string): CountyInfo | null {
    const county = countyById.get(id)
    if (!county)
      return null
    const state = stateByFips.get(county.properties.st)
    const actual = officeIn(county.properties.st)
    const row = officeData(results, office).counties[id]
    const summary = officeData(results, office).states[county.properties.st]
    return {
      id,
      name: county.properties.l,
      state: state?.properties.n ?? '',
      code: state?.properties.usps.toLowerCase() ?? '',
      office: OFFICE_LABELS[actual],
      hasRace: !!row,
      stateOnly: !row && !!summary?.countyless,
      dem: row?.[0] ?? 0,
      rep: row?.[1] ?? 0,
      total: row?.[2] ?? 0,
      pct: row?.[3] ?? null,
      margin: row?.[5] ?? null,
      demName: sideName(summary, 'dem'),
      repName: sideName(summary, 'rep'),
      notes: row ? flagNotes(row[4] & ~(results?.meta.final ? FLAG.undecided : 0), office) : [],
    }
  }

  function summary(): Summary | null {
    if (!results)
      return null
    const data = officeData(results, office)
    const final = results.meta.final === true
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
        status: statusOf(s, final),
        notes: [...flagNotes(s.flags & ~(final ? FLAG.undecided : 0), office), ...(s.countyless ? [`${focus.properties.n}'s ${election.year} count is for the state as a whole: it was not reported by the ${focus.id === '02' ? 'districts' : 'regions'} drawn here.`] : [])],
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
          : office === 'president'
            ? `Carried: ${won('dem')} Democratic, ${won('rep')} Republican, of 50 states and D.C.`
            : `${all.length} states voted. ${final ? 'Won' : 'Called'}: ${won('dem')} Democratic, ${won('rep')} Republican`,
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

  // Finding the county under the pointer reads back what was drawn, so it is
  // done once a frame, for where the pointer then is, however often it moved.
  let pointerAt: unknown = null
  let pointerFrame = 0
  let moving = false
  const hover = (): void => {
    pointerFrame = 0
    if (pointerAt === null || moving)
      return
    const id = countyAt(pointerAt)
    el.style.cursor = id ? 'pointer' : ''
    if (id === hovered)
      return
    if (hovered !== undefined)
      map.setFeatureState({ source: SOURCE, id: hovered }, { hover: false })
    hovered = id
    if (id !== undefined)
      map.setFeatureState({ source: SOURCE, id }, { hover: true })
    options.onHover(id === undefined ? null : describe(id))
  }

  map.on('pointermove', (e: any) => {
    // A finger on the glass is moving the map, not pointing at a county: a
    // tap is what chooses one there, and it arrives as a click.
    if (e.originalEvent?.pointerType === 'touch')
      return
    pointerAt = e.containerPoint
    pointerFrame ||= requestAnimationFrame(hover)
  })
  // Nothing is under the pointer worth finding while the map is dragged.
  map.on('dragstart', () => {
    moving = true
  })
  map.on('dragend', () => {
    moving = false
  })

  map.on('pointerout', () => {
    pointerAt = null
    if (hovered !== undefined)
      map.setFeatureState({ source: SOURCE, id: hovered }, { hover: false })
    hovered = undefined
    options.onHover(null)
  })

  map.on('click', (e: any) => {
    explored()
    const id = countyAt(e.containerPoint)
    pin(id === selected ? undefined : id)
  })

  // Turning and tilting with a mouse is the library's own `dragRotate`: a drag
  // with the right button, or with Alt held. It ends in a `moveend`, which is
  // when the labels are chosen again, below.

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
  map.on('rotatestart', explored)
  map.on('pitchstart', explored)

  /** Pin a county, as a click on it would, and report it. */
  function pin(id: string | undefined): void {
    if (selected !== undefined)
      map.setFeatureState({ source: SOURCE, id: selected }, { selected: false })
    selected = id !== undefined && countyById.has(id) ? id : undefined
    if (selected !== undefined)
      map.setFeatureState({ source: SOURCE, id: selected }, { selected: true })
    options.onSelect(selected === undefined ? null : describe(selected))
  }

  /** Pin a county and move to it, closer than the whole view where that is the country. */
  function show(id: string): void {
    const county = countyById.get(id)
    if (!county)
      return
    pin(id)
    explored()
    const zoom = Math.max(map.getZoom(), home().zoom + (focus ? 0.6 : 1.6))
    map.flyTo(county.properties.c, zoom, { pitch: map.getPitch(), bearing: map.getBearing(), duration: 0.9 })
  }

  // --- Finding a place by name ---
  //
  // A text field with the browser's own list of suggestions: every county as
  // `Harris County, Texas`. Choosing one in this view's scope shows it; one in
  // another state opens that state's page with the county pinned.

  const ids = options.ids
  const search = ids ? document.getElementById(ids.search) as HTMLInputElement | null : null
  const places = ids ? document.getElementById(ids.places) : null
  const byPlaceName = new Map<string, CountyFeature>()
  if (search && places) {
    const sorted = [...counties].sort((a, b) => a.properties.l.localeCompare(b.properties.l))
    const html: string[] = []
    for (const county of sorted) {
      const name = `${county.properties.l}, ${stateByFips.get(county.properties.st)?.properties.n ?? ''}`
      byPlaceName.set(name.toLowerCase(), county)
      html.push(`<option value="${escapeHtml(name)}"></option>`)
    }
    places.innerHTML = html.join('')
  }

  function goToPlace(): void {
    if (!search)
      return
    const text = search.value.trim().toLowerCase()
    if (!text)
      return
    // The name in full, else the only place that starts with what was typed.
    let county = byPlaceName.get(text)
    if (!county) {
      const starts = [...byPlaceName.entries()].filter(([name]) => name.startsWith(text))
      county = starts.length === 1 ? starts[0]![1] : undefined
    }
    if (!county) {
      search.setCustomValidity('Choose a county from the list')
      search.reportValidity()
      return
    }
    search.setCustomValidity('')
    if (focus && county.properties.st !== focus.id) {
      const code = stateByFips.get(county.properties.st)?.properties.usps.toLowerCase() ?? ''
      location.assign(`/state/${code}${viewQuery({ year: election.year, office, metric, county: county.id })}`)
      return
    }
    search.value = ''
    const popover = ids ? document.getElementById(ids.popover) as (HTMLElement & { hidePopover?: () => void }) | null : null
    try {
      popover?.hidePopover?.()
    }
    catch {
      // Not open.
    }
    show(county.id)
  }
  const onSearchInput = (): void => search?.setCustomValidity('')
  const onSearchChange = (): void => {
    // A suggestion picked from the list arrives as a change with a full name.
    if (search && byPlaceName.has(search.value.trim().toLowerCase()))
      goToPlace()
  }
  const onSearchKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      goToPlace()
    }
  }
  search?.addEventListener('input', onSearchInput)
  search?.addEventListener('change', onSearchChange)
  search?.addEventListener('keydown', onSearchKey)

  // --- The same numbers as a table ---
  //
  // For a reader who cannot use the map, or would rather read a list: every
  // state for the country, every county for a state, largest first. Written
  // when the table is opened, and again when what is shown changes under it.

  const table = ids ? document.getElementById(ids.table) : null

  function fillTable(): void {
    if (!table || !results)
      return
    const data = officeData(results, office)
    const cell = (text: string, numeric = false): string => `<td${numeric ? ' class="is-num"' : ''}>${text}</td>`
    const marginCell = (margin: number | null | undefined): string => {
      const text = formatMargin(margin)
      const side = !text || text === 'Even' ? '' : (margin ?? 0) > 0 ? ' is-dem' : ' is-rep'
      return `<td class="is-num${side}">${text || 'n/a'}</td>`
    }
    // The count in full, and in short for a screen too narrow for it.
    const votesCell = (votes: number): string => `<td class="is-num"><span class="vs-full">${Math.round(votes).toLocaleString('en-US')}</span><span class="vs-brief">${formatVotes(votes)}</span></td>`
    const share = (side: number, other: number): string => (side + other > 0 ? `${((side / (side + other)) * 100).toFixed(1)}%` : '')
    const rows: string[] = []
    if (focus) {
      const list = scope()
        .map(county => ({ county, row: data.counties[county.id] }))
        .filter((entry): entry is { county: CountyFeature, row: NonNullable<typeof entry.row> } => !!entry.row)
        .sort((a, b) => b.row[2] - a.row[2])
      for (const { county, row } of list) {
        rows.push(`<tr><th scope="row"><button type="button" data-county="${escapeHtml(county.id)}">${escapeHtml(county.properties.l)}</button></th>${marginCell(row[5])}${cell(share(row[0], row[1]), true)}${cell(share(row[1], row[0]), true)}${votesCell(row[2])}</tr>`)
      }
    }
    else {
      const list = states
        .map(state => ({ state, row: data.states[state.id] }))
        .filter((entry): entry is { state: StateFeature, row: StateSummary } => !!entry.row)
        .sort((a, b) => b.row.total - a.row.total)
      for (const { state, row } of list) {
        rows.push(`<tr><th scope="row"><a href="/state/${state.properties.usps.toLowerCase()}${viewQuery({ year: election.year, office, metric, county: '' })}">${escapeHtml(state.properties.n)}</a></th>${marginCell(row.margin)}${cell(share(row.dem, row.rep), true)}${cell(share(row.rep, row.dem), true)}${votesCell(row.total)}</tr>`)
      }
    }
    const what = focus ? 'County' : 'State'
    const title = `${OFFICE_LABELS[office]} ${election.year}, ${focus ? focus.properties.n : 'by state'}`
    const none = focus && data.states[focus.id]?.countyless
      ? `${escapeHtml(focus.properties.n)}'s ${election.year} count is for the state as a whole, so there are no rows to list.`
      : `This office was not on the ballot here in ${election.year}.`
    table.innerHTML = rows.length
      ? `<table><caption>${escapeHtml(title)}</caption><thead><tr><th scope="col">${what}</th><th scope="col" class="is-num">Margin</th><th scope="col" class="is-num">Dem.</th><th scope="col" class="is-num">Rep.</th><th scope="col" class="is-num">Votes</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
      : `<p>${none}</p>`
  }

  const tablePopover = table?.closest('[popover]') as (HTMLElement & { hidePopover?: () => void }) | null
  const onTableToggle = (e: Event): void => {
    if ((e as Event & { newState?: string }).newState === 'open')
      fillTable()
  }
  const onTableClick = (e: Event): void => {
    const id = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-county]')?.dataset.county
    if (!id)
      return
    try {
      tablePopover?.hidePopover?.()
    }
    catch {
      // Not open.
    }
    show(id)
  }
  tablePopover?.addEventListener('toggle', onTableToggle)
  table?.addEventListener('click', onTableClick)

  // Escape lets go of the pinned county, unless it is closing a popover.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && selected !== undefined && !document.querySelector(':popover-open'))
      pin(undefined)
  }
  document.addEventListener('keydown', onKey)

  // --- The wheel, the trackpad and a pinch ---
  //
  // All three arrive as wheel events and want different things. Two fingers
  // drawn across a trackpad move the map, as they move anything else on a Mac.
  // A pinch zooms about the pointer, as far as the fingers went. A mouse's
  // wheel zooms about the pointer too, by a fixed step a notch, eased.
  //
  // The map library has one answer for all three, at a rate set for a wheel,
  // so its own handler is off and they are read here.

  const pointOf = (e: { clientX: number, clientY: number }): [number, number] => {
    const box = el.getBoundingClientRect()
    return [e.clientX - box.left, e.clientY - box.top]
  }

  let zoomTarget: number | null = null
  let zoomAnchor: unknown = null
  let zoomFrame = 0
  let zoomEase = 0
  let zoomTime = 0

  function zoomStep(now: number): void {
    zoomFrame = 0
    if (zoomTarget === null)
      return
    const from = map.getZoom() as number
    const left = zoomTarget - from
    const dt = zoomTime ? Math.min((now - zoomTime) / 1000, 0.1) : 1 / 60
    zoomTime = now
    const done = zoomEase <= 0 || Math.abs(left) < 0.004
    map.setZoomAround(zoomAnchor, done ? zoomTarget : from + left * (1 - Math.exp(-dt / zoomEase)), { animate: false })
    if (done) {
      zoomTarget = null
      zoomAnchor = null
      zoomTime = 0
      return
    }
    zoomFrame = requestAnimationFrame(zoomStep)
  }

  /** Zoom by `levels` about where `e` is, reaching it over about `ease` seconds: 0 is at once. */
  function zoomAbout(e: { clientX: number, clientY: number }, levels: number, ease: number): void {
    if (zoomTarget === null) {
      zoomTarget = map.getZoom() as number
      zoomAnchor = map.containerPointToLatLng(pointOf(e))
    }
    zoomTarget = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomTarget + levels))
    zoomEase = calm ? 0 : ease
    zoomFrame ||= requestAnimationFrame(zoomStep)
  }

  let panX = 0
  let panY = 0
  let panFrame = 0
  function panStep(): void {
    panFrame = 0
    const by: [number, number] = [panX, panY]
    panX = 0
    panY = 0
    if (by[0] || by[1])
      map.panBy(by, { animate: false })
  }

  /** What a run of wheel events is, decided by its first and kept until it pauses. */
  let wheelKind: 'pan' | 'zoom' | null = null
  let wheelAt = 0

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    e.stopImmediatePropagation()
    explored()
    // A pinch is a wheel event with Control down; Command with a scroll asks for the same.
    if (e.ctrlKey || e.metaKey) {
      zoomAbout(e, -Math.max(-60, Math.min(60, e.deltaY)) / 100, 0)
      return
    }
    if (e.timeStamp - wheelAt > 200)
      wheelKind = null
    wheelAt = e.timeStamp
    wheelKind ??= fromTrackpad(e) ? 'pan' : 'zoom'
    if (wheelKind === 'pan') {
      panX += e.deltaX
      panY += e.deltaY
      panFrame ||= requestAnimationFrame(panStep)
      return
    }
    // A notch is 120 in the old measure, where a browser still gives it; else
    // lines and pixels are sized to come to about the same.
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY
    const notches = legacy ? legacy / 120 : -e.deltaY / (e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 1 : 100)
    zoomAbout(e, Math.max(-2, Math.min(2, notches)) * 0.5, 0.11)
  }
  el.addEventListener('wheel', onWheel, { capture: true, passive: false })

  // Safari tells of a pinch on a trackpad in events of its own, with how far
  // the fingers have turned as well. On a touch screen the same events come
  // beside the touches the library already reads, and are left to it.
  const touchScreen = navigator.maxTouchPoints > 0
  let gesture: { zoom: number, bearing: number } | null = null
  const onGestureStart = (e: Event): void => {
    if (touchScreen)
      return
    e.preventDefault()
    explored()
    gesture = { zoom: map.getZoom(), bearing: map.getBearing() }
  }
  const onGestureChange = (e: Event): void => {
    if (touchScreen || !gesture)
      return
    e.preventDefault()
    const g = e as Event & { scale: number, rotation: number, clientX: number, clientY: number }
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gesture.zoom + Math.log2(g.scale || 1)))
    map.setZoomAround(map.containerPointToLatLng(pointOf(g)), zoom, { animate: false })
    // A pinch is never quite straight: a turn counts once it is clearly meant.
    if (Math.abs(g.rotation) > 6)
      map.setBearing(gesture.bearing - g.rotation)
  }
  const onGestureEnd = (e: Event): void => {
    if (touchScreen)
      return
    e.preventDefault()
    gesture = null
    relabel()
  }
  el.addEventListener('gesturestart', onGestureStart)
  el.addEventListener('gesturechange', onGestureChange)
  el.addEventListener('gestureend', onGestureEnd)

  // A phone turned on its side, or a window resized: until the reader has
  // moved the map themselves, it is fitted again to the room it now has.
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  const onResize = (): void => {
    if (resizeTimer)
      clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      resizeTimer = null
      map.invalidateSize?.()
      if (!hasExplored) {
        const view = home()
        map.setView(view.center, view.zoom, { animate: false })
      }
      paint()
    }, 200)
  }
  window.addEventListener('resize', onResize)

  options.onReady({ election, meta: results?.meta ?? null, office, webgl: webglAvailable() })

  // A link that names a county opens with it pinned.
  if (options.county && countyById.has(options.county) && (!focus || countyById.get(options.county)!.properties.st === focus.id))
    pin(options.county)

  /** The latest election asked for: an earlier one that arrives after it is let go. */
  let asked = election.year

  return {
    async setElection(year) {
      const next = electionFor(year)
      if (!next)
        return null
      asked = year
      const file = await load(year)
      if (!file || asked !== year || !el.isConnected)
        return null
      // An election opens on its own leading office when the one before was
      // on its own: the House in 2022 gives way to the presidency in 2024. An
      // office that was chosen is kept, where the election has it.
      if (office === election.offices[0] || !next.offices.includes(office))
        office = next.offices[0]!
      election = next
      results = file
      redraw()
      if (tablePopover?.matches(':popover-open'))
        fillTable()
      options.onSelect(selected === undefined ? null : describe(selected))
      return { election, meta: file.meta, office }
    },
    warm(year) {
      if (electionFor(year))
        void load(year)
    },
    setOffice(next) {
      office = next
      paint()
      if (tablePopover?.matches(':popover-open'))
        fillTable()
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
      pin(undefined)
    },
    select(id) {
      show(id)
    },
    destroy() {
      if (relabelTimer)
        clearTimeout(relabelTimer)
      if (resizeTimer)
        clearTimeout(resizeTimer)
      for (const frame of [pointerFrame, zoomFrame, panFrame])
        cancelAnimationFrame(frame)
      el.removeEventListener('wheel', onWheel, { capture: true })
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
      el.removeEventListener('gestureend', onGestureEnd)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      search?.removeEventListener('input', onSearchInput)
      search?.removeEventListener('change', onSearchChange)
      search?.removeEventListener('keydown', onSearchKey)
      tablePopover?.removeEventListener('toggle', onTableToggle)
      table?.removeEventListener('click', onTableClick)
      for (const marker of labels)
        marker.remove()
      labels = []
      map.remove()
    },
  }
}

// --- What is shown, in the address ------------------------------------------

/** The election, office, metric and county the address asks for, or the defaults. */
export function readView(): View {
  return parseView(location.search)
}

/** Keep the address in step, so a view can be linked to. The defaults are left out of it. */
export function writeView(view: View): void {
  history.replaceState(history.state, '', `${location.pathname}${viewQuery(view, location.search)}`)
}

function sideName(summary: StateSummary | undefined, side: 'dem' | 'rep'): string {
  const name = summary?.[side === 'dem' ? 'demName' : 'repName']
  const party = summary?.[side === 'dem' ? 'demParty' : 'repParty']
  if (name)
    return party ? `${name} (${party})` : name
  return side === 'dem' ? 'Democratic' : 'Republican'
}

function statusOf(summary: StateSummary, final: boolean): string {
  if (summary.seats) {
    const { dem, rep, open, other } = summary.seats
    const undecided = open + other
    return `Seats: ${dem} Democratic, ${rep} Republican${undecided ? `, ${undecided} not called` : ''}`
  }
  if (summary.status === 'called' && summary.winnerName)
    return final ? `Won by ${summary.winnerName}` : `Called for ${summary.winnerName}`
  if (final && summary.winnerName)
    return `Won by ${summary.winnerName}`
  if (summary.status === 'runoff')
    return final ? 'Went to a runoff' : 'Headed to a runoff'
  return final ? '' : 'Not called yet'
}
