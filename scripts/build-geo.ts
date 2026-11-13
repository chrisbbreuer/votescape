#!/usr/bin/env bun
/**
 * Builds the map's geometry: `public/data/geo/counties.json` and
 * `public/data/geo/states.json`.
 *
 * Source is the Census Bureau's 2024 cartographic boundary files (public
 * domain), downloaded once into `storage/data/geo/` and reused after that.
 *
 * Three things here are not what a county map usually does, each for a
 * reason:
 *
 * 1. Alaska is drawn by state house district, not by borough, because that is
 *    how Alaska reports its results. Ids are `02HD01` to `02HD40`.
 * 2. Connecticut is drawn by its nine planning regions (the county
 *    equivalents since 2022), and a town-to-region table is written to
 *    `storage/data/geo/connecticut-towns.json` for the results build, because
 *    results arrive by town.
 * 3. Every coordinate is projected to the Albers USA layout (Alaska and
 *    Hawaii inset) and then written as a made-up longitude and latitude in a
 *    small box near the equator. ts-maps draws Web Mercator; near the equator
 *    Mercator is as good as flat, so the layout comes out exactly as
 *    projected and a prism's height means the same everywhere on the map.
 *    These are not real coordinates and nothing real can be drawn under them.
 */

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { geoAlbersUsa } from 'd3-geo'
import mapshaper from 'mapshaper'

const ROOT = resolve(import.meta.dir, '..')
const RAW = join(ROOT, 'storage/data/geo')
const OUT = join(ROOT, 'public/data/geo')
const CENSUS = 'https://www2.census.gov/geo/tiger/GENZ2024/shp'

const FILES = {
  counties: 'cb_2024_us_county_20m.zip',
  states: 'cb_2024_us_state_20m.zip',
  alaska: 'cb_2024_02_sldl_500k.zip',
  connecticutTowns: 'cb_2024_09_cousub_500k.zip',
}

/** American Samoa, Guam, Northern Marianas, Puerto Rico, Virgin Islands. */
const TERRITORIES = new Set(['60', '66', '69', '72', '78'])

// --- The made-up coordinate box ---------------------------------------------

/** The Albers USA layout d3 and us-atlas use: 975 × 610, Alaska and Hawaii inset. */
const albers = geoAlbersUsa().scale(1300).translate([487.5, 305])
const WIDTH = 975
const HEIGHT = 610
/** How many degrees of longitude the 975-wide layout is spread over. */
const SPAN = 20
/**
 * Where the middle of the layout goes. Off zero on both axes on purpose:
 * longitude 0 and the equator are tile edges at every zoom, and ts-maps
 * leaves out a wall that lies exactly along one.
 */
const CENTER = { lng: 10.3, lat: 4.7 }

const mercatorY = (lat: number): number => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)
const CENTER_V = mercatorY(CENTER.lat)

/** Layout pixels to made-up [lng, lat], rounded to about a 200,000th of the map's width. */
export function place(x: number, y: number): [number, number] {
  const lng = CENTER.lng + ((x - WIDTH / 2) / WIDTH) * SPAN
  // The same scale down the page as across it, in Mercator's own units, so
  // shapes are not stretched on their way through it.
  const v = CENTER_V + ((y - HEIGHT / 2) / WIDTH) * (SPAN / 360)
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * v))) * 180) / Math.PI
  return [Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4]
}

type Ring = Array<[number, number]>

/** Twice the signed area: positive when counter-clockwise with north up. */
function signedArea(ring: Ring): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1]
  return sum
}

/**
 * A polygon's rings, projected, with repeats dropped and wound as RFC 7946
 * has them: the outline counter-clockwise, holes clockwise. ts-maps tells a
 * hole from another part of the same feature by winding alone.
 */
function projectPolygon(polygon: number[][][]): Ring[] | null {
  const rings: Ring[] = []
  for (let n = 0; n < polygon.length; n++) {
    const ring: Ring = []
    for (const [lng, lat] of polygon[n]!) {
      const p = albers([lng!, lat!])
      // Outside every part of the composite projection.
      if (!p)
        continue
      const q = place(p[0], p[1])
      const last = ring.at(-1)
      if (!last || last[0] !== q[0] || last[1] !== q[1])
        ring.push(q)
    }
    if (ring.length > 1 && (ring[0]![0] !== ring.at(-1)![0] || ring[0]![1] !== ring.at(-1)![1]))
      ring.push([ring[0]![0], ring[0]![1]])
    // Too small to be a shape once rounded.
    if (ring.length < 4 || signedArea(ring) === 0) {
      if (n === 0)
        return null
      continue
    }
    const outer = n === 0
    if ((signedArea(ring) > 0) !== outer)
      ring.reverse()
    rings.push(ring)
  }
  return rings.length ? rings : null
}

function projectGeometry(geometry: any): { type: 'Polygon' | 'MultiPolygon', coordinates: any } | null {
  const polygons: number[][][][] = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const projected = polygons.map(projectPolygon).filter((p): p is Ring[] => p !== null)
  if (!projected.length)
    return null
  return projected.length === 1
    ? { type: 'Polygon', coordinates: projected[0] }
    : { type: 'MultiPolygon', coordinates: projected }
}

/** The centroid of a ring, by area. */
function centroid(ring: Ring): [number, number] {
  let x = 0
  let y = 0
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1]
    x += (ring[j]![0] + ring[i]![0]) * cross
    y += (ring[j]![1] + ring[i]![1]) * cross
    area += cross
  }
  return area ? [x / (3 * area), y / (3 * area)] : ring[0]!
}

/** Where a label for the shape goes: the middle of its largest part, as [lat, lng]. */
function labelPoint(geometry: { type: string, coordinates: any }): [number, number] {
  const polygons: Ring[][] = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const largest = polygons.reduce((a, b) => (Math.abs(signedArea(b[0]!)) > Math.abs(signedArea(a[0]!)) ? b : a))
  const [lng, lat] = centroid(largest[0]!)
  return [Math.round(lat * 1e4) / 1e4, Math.round(lng * 1e4) / 1e4]
}

function bounds(geometry: { type: string, coordinates: any }): [number, number, number, number] {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  const polygons: Ring[][] = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const polygon of polygons) {
    for (const [lng, lat] of polygon[0]!) {
      west = Math.min(west, lng)
      east = Math.max(east, lng)
      south = Math.min(south, lat)
      north = Math.max(north, lat)
    }
  }
  return [west, south, east, north]
}

// --- Reading the Census files -----------------------------------------------

async function download(name: string): Promise<string> {
  const path = join(RAW, name)
  if (existsSync(path))
    return path
  await mkdir(RAW, { recursive: true })
  console.error(`[data:geo] downloading ${name}`)
  const response = await fetch(`${CENSUS}/${name}`)
  if (!response.ok)
    throw new Error(`[data:geo] ${name}: HTTP ${response.status}`)
  await Bun.write(path, await response.arrayBuffer())
  return path
}

/** A zipped shapefile as GeoJSON features, after mapshaper `commands`. */
async function read(zip: string, commands = ''): Promise<any[]> {
  const output = await mapshaper.applyCommands(`-i ${zip} ${commands} -o format=geojson out.json`)
  return JSON.parse(new TextDecoder().decode(output['out.json'])).features
}

// --- Build ------------------------------------------------------------------

const [countiesZip, statesZip, alaskaZip, townsZip] = await Promise.all([
  download(FILES.counties),
  download(FILES.states),
  download(FILES.alaska),
  download(FILES.connecticutTowns),
])

const counties: any[] = []
const skipped: string[] = []

for (const feature of await read(countiesZip)) {
  const p = feature.properties
  // Alaska comes from its house districts, below.
  if (TERRITORIES.has(p.STATEFP) || p.STATEFP === '02')
    continue
  const geometry = projectGeometry(feature.geometry)
  if (!geometry) {
    skipped.push(p.GEOID)
    continue
  }
  counties.push({
    type: 'Feature',
    id: p.GEOID,
    properties: { n: p.NAME, l: p.NAMELSAD, st: p.STATEFP, a: Math.round(p.ALAND / 1e4) / 100, c: labelPoint(geometry) },
    geometry,
  })
}

// Alaska's forty house districts. Far more detailed than the map can show
// once they are in the inset, so simplified hard; `keep-shapes` stops a small
// district vanishing altogether.
for (const feature of await read(alaskaZip, '-simplify 2% keep-shapes')) {
  const p = feature.properties
  const number = Number(p.SLDLST)
  if (!Number.isInteger(number) || number < 1)
    continue
  const geometry = projectGeometry(feature.geometry)
  if (!geometry) {
    skipped.push(`02HD${p.SLDLST}`)
    continue
  }
  counties.push({
    type: 'Feature',
    id: `02HD${String(number).padStart(2, '0')}`,
    properties: { n: `House District ${number}`, l: `Alaska House District ${number}`, st: '02', a: Math.round(p.ALAND / 1e4) / 100, c: labelPoint(geometry) },
    geometry,
  })
}

counties.sort((a, b) => (a.id < b.id ? -1 : 1))

const states: any[] = []
for (const feature of await read(statesZip)) {
  const p = feature.properties
  if (TERRITORIES.has(p.STATEFP))
    continue
  const geometry = projectGeometry(feature.geometry)
  if (!geometry)
    continue
  states.push({
    type: 'Feature',
    id: p.STATEFP,
    properties: { n: p.NAME, usps: p.STUSPS, st: p.STATEFP, c: labelPoint(geometry), b: bounds(geometry) },
    geometry,
  })
}
states.sort((a, b) => (a.id < b.id ? -1 : 1))

// Connecticut: town name to planning region, as county FIPS.
const connecticutTowns: Record<string, string> = {}
for (const feature of await read(townsZip, '-drop geometry')) {
  const p = feature.properties
  // Undefined subdivisions (water) carry no name worth matching.
  if (p.COUSUBFP === '00000')
    continue
  connecticutTowns[p.NAME] = `${p.STATEFP}${p.COUNTYFP}`
}

// --- Checks -----------------------------------------------------------------

const fail = (message: string): never => {
  throw new Error(`[data:geo] ${message}`)
}
if (skipped.length)
  fail(`could not project: ${skipped.join(', ')}`)
const ids = new Set(counties.map(c => c.id))
if (ids.size !== counties.length)
  fail('duplicate county ids')
// 3,144 counties and equivalents, less Alaska's 30 boroughs, plus its 40 districts.
if (counties.length !== 3144 - 30 + 40)
  fail(`expected 3154 units, have ${counties.length}`)
if (states.length !== 51)
  fail(`expected 51 states, have ${states.length}`)
if (counties.filter(c => c.properties.st === '09').length !== 9)
  fail('expected Connecticut\'s nine planning regions')
if (Object.keys(connecticutTowns).length !== 169)
  fail(`expected Connecticut's 169 towns, have ${Object.keys(connecticutTowns).length}`)

let vertices = 0
for (const county of counties) {
  const polygons = county.geometry.type === 'Polygon' ? [county.geometry.coordinates] : county.geometry.coordinates
  for (const polygon of polygons) {
    for (const ring of polygon)
      vertices += ring.length
  }
}

await mkdir(OUT, { recursive: true })
const write = async (name: string, value: unknown): Promise<void> => {
  const text = JSON.stringify(value)
  await Bun.write(join(OUT, name), text)
  console.error(`[data:geo] ${name} ${Math.round(text.length / 1024)} KB`)
}
await write('counties.json', { type: 'FeatureCollection', features: counties })
await write('states.json', { type: 'FeatureCollection', features: states })
// Not for the browser: the results build reads it to put towns in regions.
await Bun.write(join(RAW, 'connecticut-towns.json'), JSON.stringify(connecticutTowns))
console.error(`[data:geo] ${counties.length} units, ${vertices} vertices, ${states.length} states`)
