/**
 * The 2016 presidential election by county, as a results source.
 *
 * One table: every county's votes for Hillary Clinton, for Donald Trump, and
 * for everyone else. It is the MIT Election Data and Science Lab's County
 * Presidential Election Returns, taken from states' official records, kept
 * at github.com/MEDSL/county-returns and fetched once into
 * `storage/data/results/2016`. These are certified returns.
 *
 * Two states are not drawn as they were counted:
 *
 * - Alaska is by the house districts of the time, which were redrawn in 2022
 *   and are not the ones on the map. Its votes count towards the state and
 *   stand on no district.
 * - Connecticut is by the eight counties it has since abolished. They are
 *   added up for the state and stand on none of today's planning regions.
 */

import type { Contest, ContestRef, ResultsSource, UnitCount } from './types'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ELECTION = '2016-11-08'
const URL = 'https://raw.githubusercontent.com/MEDSL/county-returns/master/countypres_2000-2016.csv'
const CACHE = resolve(import.meta.dir, '../../storage/data/results/2016')

/**
 * Rows that are not under a county's present code. Shannon County, S.D., is
 * Oglala Lakota. Kansas City counts its own votes apart from Jackson County,
 * Mo., which it is in.
 */
const MOVED: Record<string, string> = { 46113: '46102', 36000: '29095' }

/** Bedford, Va., stopped being a city of its own in 2013. Its row is empty but for a total that is the county's. */
const GONE = new Set(['51515'])

export interface CountyRow {
  /** The state's name, as the table has it. */
  state: string
  /** Five digits, or empty for votes given to no county: overseas ballots, write-ins. */
  fips: string
  name: string
  dem: number
  rep: number
  total: number
}

/** A line of the table as its fields. A field in quotes may have commas in it. */
export function fields(line: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (const char of line) {
    if (char === '"')
      quoted = !quoted
    else if (char === ',' && !quoted)
      (out.push(field), field = '')
    else
      field += char
  }
  out.push(field)
  return out
}

/** The table's rows for 2016, one a county, by its own column names. */
export function parse(text: string): CountyRow[] {
  const [head, ...lines] = text.trim().split(/\r?\n/)
  const columns = fields(head ?? '').map(c => c.trim())
  const at = (name: string): number => columns.indexOf(name)
  const number = (text: string | undefined): number => Math.round(Number(text)) || 0
  const rows = new Map<string, CountyRow>()
  for (const line of lines) {
    const f = fields(line)
    if (f[at('year')] !== '2016' || GONE.has((f[at('FIPS')] ?? '').padStart(5, '0')))
      continue
    const code = /^\d+$/.test(f[at('FIPS')] ?? '') ? f[at('FIPS')]!.padStart(5, '0') : ''
    const fips = MOVED[code] ?? code
    const state = f[at('state')] ?? ''
    const key = `${state}|${fips || f[at('county')]}`
    const row = rows.get(key) ?? { state, fips, name: f[at('county')] ?? '', dem: 0, rep: 0, total: 0 }
    const votes = number(f[at('candidatevotes')])
    if (f[at('party')] === 'democrat')
      row.dem += votes
    else if (f[at('party')] === 'republican')
      row.rep += votes
    // Every candidate's row carries the county's total; Kansas City's is added to Jackson County's.
    if (f[at('party')] === 'democrat')
      row.total += number(f[at('totalvotes')])
    rows.set(key, row)
  }
  return [...rows.values()]
}

/** A state's rows as its contest. */
export function contestFrom(ref: ContestRef, stateFips: string, rows: CountyRow[]): Contest {
  const countyless = ref.state === 'AK' || ref.state === 'CT'
  const sum = (key: 'dem' | 'rep' | 'total'): number => rows.reduce((n, r) => n + r[key], 0)
  const votes = (r: { dem: number, rep: number, total: number }): Record<string, number> => ({ clinton: r.dem, trump: r.rep, others: Math.max(0, r.total - r.dem - r.rep) })
  const state = { dem: sum('dem'), rep: sum('rep'), total: sum('total') }

  const units: UnitCount[] = [{ level: 'state', stateFips, name: ref.state, votes: votes(state), total: state.total, pctReporting: null }]
  if (!countyless) {
    for (const row of rows) {
      // Votes given to no county, or a city that has none of its own, count for the state alone.
      if (row.fips && row.total > 0)
        units.push({ level: 'county', stateFips, countyFips: row.fips.slice(2), name: row.name, votes: votes(row), total: row.total, pctReporting: null })
    }
  }

  return {
    ...ref,
    stateFips,
    kind: 'general',
    uncontested: false,
    status: 'called',
    winners: [state.dem > state.rep ? 'clinton' : 'trump'],
    candidates: [
      { id: 'clinton', name: 'Hillary Clinton', party: 'D', partyLabel: 'Democratic', incumbent: false },
      { id: 'trump', name: 'Donald J. Trump', party: 'R', partyLabel: 'Republican', incumbent: false },
      { id: 'others', name: 'Others', party: 'O', partyLabel: 'Other', incumbent: false },
    ],
    units,
    updatedAt: `${ELECTION}T00:00:00Z`,
    ...(countyless ? { countyless } : {}),
  }
}

export function counties2016(states: Array<{ code: string, name: string, fips: string }>): ResultsSource {
  let table: Promise<CountyRow[]> | null = null
  const rows = (refresh: boolean): Promise<CountyRow[]> => table ??= (async () => {
    const path = join(CACHE, 'countypres_2000-2016.csv')
    if (refresh || !existsSync(path)) {
      const response = await fetch(URL)
      if (!response.ok)
        throw new Error(`[2016] ${URL}: HTTP ${response.status}`)
      await mkdir(CACHE, { recursive: true })
      await Bun.write(path, await response.text())
    }
    return parse(await Bun.file(path).text())
  })()

  return {
    id: 'medsl',
    election: ELECTION,
    label: 'MIT Election Data and Science Lab',
    official: true,

    async list({ refresh }) {
      const present = new Set((await rows(refresh)).map(r => r.state))
      return states
        .filter(s => present.has(s.name))
        .map(s => ({ id: `${s.code.toUpperCase()}-P-2016`, office: 'president' as const, state: s.code.toUpperCase(), special: false, slug: 'counties' }))
    },

    async load(ref, { refresh }) {
      const state = states.find(s => s.code.toUpperCase() === ref.state)
      return contestFrom(ref, state?.fips ?? '', (await rows(refresh)).filter(r => r.state === state?.name))
    },
  }
}
