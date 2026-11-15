#!/usr/bin/env bun
/**
 * Builds the votes the map draws: a file for each election in
 * `public/data/results`, `2016.json` to `2026.json`.
 *
 *   bun run data:results             the election being counted now
 *   bun run data:results --refresh   the same, fetching everything again
 *   bun run data:history             the elections before it, which are over
 *   bun scripts/build-results.ts --year 2020
 *   bun scripts/build-results.ts --all
 *
 * Counting goes on for weeks after an election (Alaska's ranked-choice
 * tabulation, Louisiana's runoffs, each state's certification), so the
 * present one is meant to be run again, and what it writes says when it was
 * last run. The ones before it are built once.
 *
 * Each election's source is one line below. See `scripts/sources/nyt.ts` for
 * why the Times' files are not for publishing.
 */

import type { Election } from '../resources/data/elections'
import type { Contest, ResultsSource } from './sources/types'
import { existsSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { ELECTIONS, LATEST } from '../resources/data/elections'
import { STATES } from '../resources/data/states'
import { rollup } from './lib/rollup'
import { counties2016 } from './sources/counties-2016'
import { nyt, nytPages, nytStates } from './sources/nyt'
import { nyt2018, nyt2020 } from './sources/nyt-legacy'

const SOURCES: Record<number, () => ResultsSource> = {
  2016: () => counties2016(STATES),
  2018: () => nyt2018(STATES),
  2020: () => nyt2020(STATES),
  2022: () => nytStates('2022-11-08', STATES, 'nyt-2022'),
  2024: () => nytPages('2024-11-05', ['president', 'senate', 'house', 'governor'], 'nyt-2024'),
  2026: () => nyt,
}

const ROOT = resolve(import.meta.dir, '..')
const OUT = join(ROOT, 'public/data/results')
const args = Bun.argv.slice(2)
const refresh = args.includes('--refresh')

/** The elections asked for: by `--year`, all of them, those that are over, or the present one. */
function chosen(): Election[] {
  const years = args.flatMap((arg, n) => (arg === '--year' ? [Number(args[n + 1])] : []))
  if (years.length) {
    const unknown = years.filter(year => !ELECTIONS.some(e => e.year === year))
    if (unknown.length)
      throw new Error(`[data:results] no election in ${unknown.join(', ')}: there is ${ELECTIONS.map(e => e.year).join(', ')}`)
    return ELECTIONS.filter(e => years.includes(e.year))
  }
  if (args.includes('--all'))
    return ELECTIONS
  return args.includes('--history') ? ELECTIONS.filter(e => e !== LATEST) : [LATEST]
}

const countiesPath = join(ROOT, 'public/data/geo/counties.json')
const townsPath = join(ROOT, 'scripts/sources/connecticut-towns.json')
if (!existsSync(countiesPath) || !existsSync(townsPath))
  throw new Error('[data:results] the map\'s geometry is not built. Run `bun run data:geo` first.')

const known = new Set<string>((await Bun.file(countiesPath).json()).features.map((f: { id: string }) => f.id))
const towns: Record<string, string> = await Bun.file(townsPath).json()

async function build(election: Election): Promise<void> {
  const tag = `[data:results ${election.year}]`
  const source = SOURCES[election.year]!()
  const refs = await source.list({ refresh })
  console.error(`${tag} ${refs.length} contests from ${source.label}`)

  const contests: Contest[] = []
  for (const [n, ref] of refs.entries()) {
    contests.push(await source.load(ref, { refresh }))
    if ((n + 1) % 100 === 0)
      console.error(`${tag} ${n + 1} of ${refs.length}`)
  }

  const { results, problems } = rollup(contests, towns, known)

  for (const problem of problems)
    console.error(`${tag} ${problem.contest}: ${problem.message}`)
  if (problems.length)
    throw new Error(`${tag} ${problems.length} problem(s) above. Nothing written.`)

  for (const office of ['president', 'house', 'senate', 'governor'] as const) {
    const data = results[office]
    if (!data)
      continue
    const states = Object.values(data.states)
    const sum = (key: 'dem' | 'rep' | 'total'): string => states.reduce((n, s) => n + s[key], 0).toLocaleString()
    console.error(`${tag} ${office}: ${states.length} states, ${Object.keys(data.counties).length} counties, D ${sum('dem')} R ${sum('rep')} of ${sum('total')}`)
  }

  const updatedAt = contests.reduce((latest, c) => (c.updatedAt > latest ? c.updatedAt : latest), '')
  const file = {
    meta: {
      election: election.date,
      year: election.year,
      source: source.id,
      sourceLabel: source.label,
      official: source.official,
      /** The count is over: nothing more is expected to change. */
      final: election !== LATEST,
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
  const pending = join(OUT, `${election.year}.json.${process.pid}.tmp`)
  await Bun.write(pending, text)
  await rename(pending, join(OUT, `${election.year}.json`))
  console.error(`${tag} ${election.year}.json ${Math.round(text.length / 1024)} KB`)
}

const elections = chosen()
for (const election of elections)
  await build(election)

// What follows is for the election being counted now.
if (!elections.includes(LATEST))
  process.exit(0)

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
