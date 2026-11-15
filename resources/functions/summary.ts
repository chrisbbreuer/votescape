/**
 * A place's result in a few words, for the things that describe a page
 * before anyone opens it: its link preview card and its description.
 *
 * Server and build only: it reads the results file from disk, and reads it
 * again when the file changes.
 */

import type { ResultsFile } from './election'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { STATES } from '../data/states'
import { formatMargin, formatVotes, OFFICE_LABELS } from './election'

export interface PlaceSummary {
  /** The office and the election: `U.S. Senate, 2026 midterms`. */
  eyebrow: string
  /** The headline: `Texas went D+12.3`. */
  title: string
  /** Who got what share, and how many voted. */
  subtitle: string
  /** One sentence for a page's description. */
  description: string
}

let cached: { at: number, results: ResultsFile | null } | null = null

function results(): ResultsFile | null {
  const file = join(process.cwd(), 'public/data/results/2026.json')
  try {
    const at = statSync(file).mtimeMs
    if (cached?.at !== at)
      cached = { at, results: JSON.parse(readFileSync(file, 'utf8')) as ResultsFile }
    return cached.results
  }
  catch {
    return null
  }
}

const percent = (side: number, other: number): string => `${((side / (side + other)) * 100).toFixed(1)}%`

/** The country's result for the House, the one office on every ballot. */
export function countrySummary(): PlaceSummary {
  const fallback: PlaceSummary = {
    eyebrow: '2026 midterms',
    title: 'Land does not vote. People do.',
    subtitle: 'Every county as a tower, as tall as the votes cast there.',
    description: 'How every county in every state voted in the 2026 midterm elections, as a 3D map: height is votes cast, colour is the margin.',
  }
  const all = Object.values(results()?.house.states ?? {})
  const dem = all.reduce((n, s) => n + s.dem, 0)
  const rep = all.reduce((n, s) => n + s.rep, 0)
  const total = all.reduce((n, s) => n + s.total, 0)
  if (dem + rep === 0)
    return fallback
  const margin = formatMargin((dem - rep) / (dem + rep))
  return {
    ...fallback,
    subtitle: `Every county, as tall as its votes. House: ${margin} on ${formatVotes(total)} votes.`,
    description: `How every county in every state voted in the 2026 midterm elections, as a 3D map: height is votes cast, colour is the margin. The national House vote stands at ${margin} with ${formatVotes(total)} votes counted.`,
  }
}

/** A state's result for its most prominent race, by postal code. Null for a code that names no state. */
export function stateSummary(code: string): PlaceSummary | null {
  const state = STATES.find(s => s.code === code.toLowerCase())
  if (!state)
    return null
  const data = results()
  const row = data?.top.states[state.fips]
  const office = OFFICE_LABELS[data?.top.office[state.fips] ?? 'house']
  const plain: PlaceSummary = {
    eyebrow: '2026 midterms',
    title: `${state.name}, county by county`,
    subtitle: 'Every county as a tower, as tall as the votes cast there.',
    description: `How every county in ${state.name} voted in the 2026 midterm elections, as a 3D map: height is votes cast, colour is the margin.`,
  }
  if (!row || row.dem + row.rep === 0)
    return plain
  const margin = formatMargin(row.margin)
  const sides = `${row.demName ?? 'Democrats'} ${percent(row.dem, row.rep)}, ${row.repName ?? 'Republicans'} ${percent(row.rep, row.dem)}`
  const went = margin === 'Even' ? 'split evenly' : `went ${margin}`
  return {
    eyebrow: `${office}${row.special ? ' (special)' : ''}, 2026 midterms`,
    title: `${state.name} ${went}`,
    subtitle: `${sides}. ${formatVotes(row.total)} votes.`,
    description: `How every county in ${state.name} voted in the 2026 midterm elections, as a 3D map. ${office}: ${sides}, ${margin === 'Even' ? 'even' : margin} on ${formatVotes(row.total)} votes. Unofficial results.`,
  }
}
