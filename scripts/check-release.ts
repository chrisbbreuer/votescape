/**
 * Is this checkout fit to deploy? `bun run deploy` asks before it ships.
 *
 * A deploy sends the working tree, and the results are not in git, so nothing
 * else stands between a checkout that never built them, or built them a week
 * ago, and a live site showing an empty or stale map. This fails for what
 * would break the site and warns for what would only date it.
 *
 *   bun scripts/check-release.ts
 *   bun scripts/check-release.ts --max-age 24   # hours; the default is 72
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const root = join(import.meta.dir, '..')
const problems: string[] = []
const warnings: string[] = []

const flag = process.argv.indexOf('--max-age')
const maxAgeHours = flag > 0 ? Number(process.argv[flag + 1]) : 72

async function read<T>(path: string): Promise<T | null> {
  const full = join(root, path)
  if (!existsSync(full)) {
    problems.push(`${path} is missing`)
    return null
  }
  try {
    return await Bun.file(full).json() as T
  }
  catch {
    problems.push(`${path} is not valid JSON`)
    return null
  }
}

for (const path of ['public/js/ts-maps.mjs', 'public/css/ts-maps.css', 'public/favicon.svg', 'public/images/share.jpg', 'public/images/apple-touch-icon.png', 'public/site.webmanifest', 'public/social/og.jpg', 'public/social/about.jpg', 'public/social/state-tx.jpg', 'public/social/state-dc.jpg']) {
  if (!existsSync(join(root, path)))
    problems.push(`${path} is missing`)
}

interface Geo { features: Array<{ id: string, properties: { st: string } }> }
interface Results {
  meta: { builtAt: string, updatedAt: string, official: boolean, contests: number }
  house: { counties: Record<string, unknown>, states: Record<string, unknown> }
  senate: { states: Record<string, unknown> }
  governor: { states: Record<string, unknown> }
}

const counties = await read<Geo>('public/data/geo/counties.json')
const states = await read<Geo>('public/data/geo/states.json')
const results = await read<Results>('public/data/results/2026.json')

if (counties && counties.features.length !== 3153)
  problems.push(`counties.json has ${counties.features.length} shapes, not 3,153: run \`bun run data:geo\``)
if (states && states.features.length !== 51)
  problems.push(`states.json has ${states.features.length} shapes, not 51`)

if (counties && results) {
  const drawn = new Set(counties.features.map(f => f.id))
  const orphans = Object.keys(results.house.counties).filter(id => !drawn.has(id))
  if (orphans.length)
    problems.push(`${orphans.length} result rows have no shape to stand on (${orphans.slice(0, 5).join(', ')}): the results were built against other shapes, run \`bun run data:results\``)
  // The House is on every ballot but D.C.'s, so nearly every shape has a row.
  const covered = counties.features.filter(f => f.id in results.house.counties).length
  if (covered < drawn.size - 5)
    problems.push(`only ${covered} of ${drawn.size} shapes have House results`)
  if (Object.keys(results.house.states).length !== 50)
    problems.push(`House results cover ${Object.keys(results.house.states).length} states, not 50`)

  const ageHours = (Date.now() - new Date(results.meta.builtAt).getTime()) / 36e5
  if (!Number.isFinite(ageHours))
    problems.push('the results do not say when they were built')
  else if (!results.meta.official && ageHours > maxAgeHours)
    warnings.push(`the results were built ${Math.round(ageHours)} hours ago and the count is not final: \`bun run data:results --refresh\` first`)
}

for (const warning of warnings)
  console.error(`[check] warning: ${warning}`)
if (problems.length) {
  for (const problem of problems)
    console.error(`[check] ${problem}`)
  process.exit(1)
}
console.error(`[check] ready to deploy${results ? `: results from ${results.meta.updatedAt.slice(0, 10)}, ${results.meta.contests} contests` : ''}`)
