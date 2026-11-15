#!/usr/bin/env bun
/**
 * Builds `public/data/results/2026.json`: the votes the map draws.
 *
 *   bun run data:results             from what is cached, fetching what is not
 *   bun run data:results --refresh   fetch everything again
 *
 * Counting goes on for weeks after an election — Alaska's ranked-choice
 * tabulation, Louisiana's runoffs, each state's certification — so this is
 * meant to be run again, and what it writes says when it was last run.
 *
 * The source is one line below. See `scripts/sources/nyt.ts` for why the
 * present one is not for publishing.
 */

import type { Contest } from './sources/types'
import { existsSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { rollup } from './lib/rollup'
import { nyt } from './sources/nyt'

const source = nyt

const ROOT = resolve(import.meta.dir, '..')
const OUT = join(ROOT, 'public/data/results')
const refresh = Bun.argv.includes('--refresh')

const countiesPath = join(ROOT, 'public/data/geo/counties.json')
const townsPath = join(ROOT, 'scripts/sources/connecticut-towns.json')
if (!existsSync(countiesPath) || !existsSync(townsPath))
  throw new Error('[data:results] the map\'s geometry is not built. Run `bun run data:geo` first.')

const known = new Set<string>((await Bun.file(countiesPath).json()).features.map((f: { id: string }) => f.id))
const towns: Record<string, string> = await Bun.file(townsPath).json()

const refs = await source.list({ refresh })
console.error(`[data:results] ${refs.length} contests from ${source.label}`)

const contests: Contest[] = []
for (const [n, ref] of refs.entries()) {
  contests.push(await source.load(ref, { refresh }))
  if ((n + 1) % 50 === 0)
    console.error(`[data:results] ${n + 1} of ${refs.length}`)
}

const { results, problems } = rollup(contests, towns, known)

for (const problem of problems)
  console.error(`[data:results] ${problem.contest}: ${problem.message}`)
if (problems.length)
  throw new Error(`[data:results] ${problems.length} problem(s) above. Nothing written.`)

const count = (office: 'house' | 'senate' | 'governor'): string => {
  const states = Object.values(results[office].states)
  const dem = states.reduce((n, s) => n + s.dem, 0)
  const rep = states.reduce((n, s) => n + s.rep, 0)
  const total = states.reduce((n, s) => n + s.total, 0)
  return `${office}: ${states.length} states, ${Object.keys(results[office].counties).length} counties, D ${dem.toLocaleString()} R ${rep.toLocaleString()} of ${total.toLocaleString()}`
}
for (const office of ['house', 'senate', 'governor'] as const)
  console.error(`[data:results] ${count(office)}`)

const updatedAt = contests.reduce((latest, c) => (c.updatedAt > latest ? c.updatedAt : latest), '')
const file = {
  meta: {
    election: '2026-11-03',
    source: source.id,
    sourceLabel: source.label,
    official: source.official,
    /** When the source last changed any contest, and when this was built. */
    updatedAt,
    builtAt: new Date().toISOString(),
    contests: contests.length,
  },
  ...results,
}

await mkdir(OUT, { recursive: true })
const text = JSON.stringify(file)
// Written beside the file and moved over it, so a page asking for the
// results while they are rebuilt gets the old ones whole, never half of the new.
const pending = join(OUT, `2026.json.${process.pid}.tmp`)
await Bun.write(pending, text)
await rename(pending, join(OUT, '2026.json'))
console.error(`[data:results] 2026.json ${Math.round(text.length / 1024)} KB`)

// The link preview cards quote these numbers, so they are drawn again with
// them. A card that cannot be drawn is not a reason to fail the results.
try {
  const { buildCards } = await import('./build-cards')
  console.error(`[data:results] ${await buildCards()} link preview cards`)
}
catch (error) {
  console.error(`[data:results] cards not built: ${(error as Error).message}`)
}

// Where the scheduled refresh runs, tell the uptime monitor it finished. The
// monitor expects to hear every six hours and raises an incident when it does
// not, which is how a refresh that has quietly stopped gets noticed.
const heartbeat = process.env.RESULTS_HEARTBEAT_URL
if (heartbeat) {
  try {
    await fetch(heartbeat, { method: 'POST', signal: AbortSignal.timeout(10_000) })
  }
  catch (error) {
    console.error(`[data:results] heartbeat not delivered: ${(error as Error).message}`)
  }
}
