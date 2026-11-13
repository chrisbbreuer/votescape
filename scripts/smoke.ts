/**
 * Is the site up and whole? Asks a running site for every page and file the
 * map needs, and checks each answer is what a browser would need it to be.
 *
 *   bun scripts/smoke.ts                       # https://votescape.org
 *   bun scripts/smoke.ts http://localhost:3290
 *
 * It does not draw the map: that needs a browser. It catches what goes wrong
 * around the map, which is most of what does: a page that errors, a file that
 * did not ship, results that are not the shape the page reads.
 */
import process from 'node:process'

const base = (process.argv[2] ?? 'https://votescape.org').replace(/\/+$/, '')
const failures: string[] = []
let checks = 0

async function get(path: string, redirect: 'follow' | 'manual' = 'follow'): Promise<Response | null> {
  try {
    return await fetch(`${base}${path}`, { redirect, headers: { 'user-agent': 'votescape-smoke' } })
  }
  catch (error) {
    failures.push(`${path}: ${(error as Error).message}`)
    return null
  }
}

function expect(ok: boolean, message: string): void {
  checks++
  if (!ok)
    failures.push(message)
}

async function page(path: string, mustContain: string[]): Promise<void> {
  const response = await get(path)
  if (!response)
    return
  expect(response.status === 200, `${path}: HTTP ${response.status}`)
  expect((response.headers.get('content-type') ?? '').includes('text/html'), `${path}: not HTML`)
  const html = await response.text()
  for (const text of mustContain)
    expect(html.includes(text), `${path}: does not contain ${JSON.stringify(text)}`)
}

async function file(path: string, type: string, minBytes: number): Promise<Response | null> {
  const response = await get(path)
  if (!response)
    return null
  expect(response.status === 200, `${path}: HTTP ${response.status}`)
  expect((response.headers.get('content-type') ?? '').includes(type), `${path}: is ${response.headers.get('content-type')}, not ${type}`)
  const copy = response.clone()
  const size = (await copy.arrayBuffer()).byteLength
  expect(size >= minBytes, `${path}: only ${size} bytes`)
  return response
}

await page('/', ['id="election-map"', 'Votescape', 'og:image'])
await page('/about', ['Land does not vote'])
await page('/state/tx', ['id="election-map"', 'data-focus="tx"', 'Texas'])
await page('/state/ak?office=senate', ['data-focus="ak"'])

const missing = await get('/state/zz')
if (missing)
  expect(missing.status === 404, `/state/zz: HTTP ${missing.status}, expected 404`)
const nowhere = await get('/no-such-page')
if (nowhere)
  expect(nowhere.status === 404, `/no-such-page: HTTP ${nowhere.status}, expected 404`)

// The addresses the page itself names for its files, versions and all.
const home = await (await get('/'))?.text() ?? ''
const named = (attribute: string, fallback: string): string => new RegExp(`${attribute}="([^"]+)"`).exec(home)?.[1]?.replace(/&amp;/g, '&') ?? fallback

await file('/js/ts-maps.mjs', 'javascript', 200_000)
await file('/css/ts-maps.css', 'css', 5_000)
await file('/favicon.svg', 'svg', 100)
await file('/images/share.jpg', 'jpeg', 10_000)
await file('/robots.txt', 'text/plain', 20)
const sitemap = await file('/sitemap.xml', 'xml', 500)
if (sitemap)
  expect((await sitemap.text()).split('<loc>').length - 1 >= 53, '/sitemap.xml: fewer than 53 pages')

const counties = await file(named('data-counties', '/data/geo/counties.json'), 'json', 500_000)
if (counties)
  expect((await counties.json() as { features: unknown[] }).features.length === 3153, 'counties.json: not 3,153 shapes')
const states = await file(named('data-states', '/data/geo/states.json'), 'json', 50_000)
if (states)
  expect((await states.json() as { features: unknown[] }).features.length === 51, 'states.json: not 51 shapes')
const results = await file(named('data-results', '/data/results/2026.json'), 'json', 100_000)
if (results) {
  const data = await results.json() as { meta: { updatedAt: string }, house: { counties: Record<string, unknown>, states: Record<string, unknown> } }
  expect(Object.keys(data.house.states).length === 50, 'results: House does not cover 50 states')
  expect(Object.keys(data.house.counties).length > 3100, 'results: too few House county rows')
  expect(!!data.meta?.updatedAt, 'results: no update time')
}

const www = await get('/about', 'manual')
if (www && base === 'https://votescape.org') {
  const redirect = await fetch('https://www.votescape.org/about', { redirect: 'manual' }).catch(() => null)
  expect(redirect?.status === 301 && redirect.headers.get('location') === 'https://votescape.org/about', 'www does not redirect to the apex')
}

if (failures.length) {
  for (const failure of failures)
    console.error(`[smoke] ${failure}`)
  console.error(`[smoke] ${failures.length} of ${checks} checks failed against ${base}`)
  process.exit(1)
}
console.error(`[smoke] ${checks} checks passed against ${base}`)
