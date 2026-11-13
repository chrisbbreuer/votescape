/**
 * The New York Times' election results pages, as a results source.
 *
 * Each results page on nytimes.com is drawn from one JSON file. Three summary
 * files list every House, Senate and governor's race with the address of its
 * page; the file behind that page has the count for every county (or town, or
 * Alaska house district) in it.
 *
 * READ THIS BEFORE PUBLISHING ANYTHING BUILT FROM IT. These are the Times'
 * files and the counts in them are licensed from The Associated Press. They
 * are fetched here for private, local use while no openly licensed county
 * returns exist for this election. Nothing fetched is committed: the cache
 * (`storage/data/results/nyt`) and the built results (`public/data/results`)
 * are both gitignored. Replace this source with certified returns — the MIT
 * Election Lab publishes them a few months after an election — before the
 * site is anything but private.
 *
 * Fetched one at a time with a pause between, and only once: a contest's
 * file is cut down to the fields used below and kept, and read from there
 * until `--refresh` asks for it again.
 */

import type { Candidate, Contest, ContestRef, Office, Party, ResultsSource, UnitCount } from './types'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const ELECTION = '2026-11-03'
const BASE = `https://static01.nyt.com/elections-assets/pages/data/${ELECTION}`
const CACHE = resolve(import.meta.dir, '../../storage/data/results/nyt')
/** Between requests, in milliseconds. */
const PAUSE = 350

const SUMMARIES: Record<Office, string> = {
  house: 'results-house',
  senate: 'results-senate',
  governor: 'results-governor',
}

/** The fields of a race kept from a file; the rest is the page's furniture. */
interface KeptRace {
  nyt_id: string
  type: string | null
  seat_number: string | null
  uncontested: boolean
  tabulation_method: string | null
  race_call_status: string | null
  updated_at: string
  url: string | null
  outcome: { won?: string[] } | null
  candidate_metadata: Record<string, { first_name: string | null, last_name: string | null, incumbent: boolean, party: { nyt_id: string, name: string } | null }>
  reporting_units: Array<{
    name: string
    level: string
    fips_state: string | null
    fips_county: string | null
    fips_suffix: string | null
    total_votes: number | null
    eevp: number | null
    candidates: Array<{ nyt_id: string, votes: { total: number | null } }>
  }>
}

function keep(race: any): KeptRace {
  const metadata: KeptRace['candidate_metadata'] = {}
  for (const [id, c] of Object.entries<any>(race.candidate_metadata ?? {})) {
    metadata[id] = {
      first_name: c.first_name ?? null,
      last_name: c.last_name ?? null,
      incumbent: !!c.incumbent,
      party: c.party ? { nyt_id: c.party.nyt_id, name: c.party.name } : null,
    }
  }
  return {
    nyt_id: race.nyt_id,
    type: race.type ?? null,
    seat_number: race.seat_number ?? null,
    uncontested: !!race.uncontested,
    tabulation_method: race.tabulation_method ?? null,
    race_call_status: race.race_call_status ?? null,
    updated_at: race.updated_at,
    url: race.url ?? null,
    outcome: race.outcome ? { won: race.outcome.won ?? [] } : null,
    candidate_metadata: metadata,
    reporting_units: (race.reporting_units ?? []).map((u: any) => ({
      name: u.name,
      level: u.level,
      fips_state: u.fips_state ?? null,
      fips_county: u.fips_county ?? null,
      fips_suffix: u.fips_suffix ?? null,
      total_votes: u.total_votes ?? null,
      eevp: u.eevp ?? null,
      candidates: (u.candidates ?? []).map((c: any) => ({ nyt_id: c.nyt_id, votes: { total: c.votes?.total ?? null } })),
    })),
  }
}

let lastRequest = 0

/** One of the feed's files, parsed. Waits its turn after the request before. */
async function fetchFile(slug: string): Promise<any> {
  const wait = lastRequest + PAUSE - Date.now()
  if (wait > 0)
    await Bun.sleep(wait)
  lastRequest = Date.now()
  const response = await fetch(`${BASE}/${slug}.json`, { headers: { 'user-agent': 'Mozilla/5.0 (votescape results build)' } })
  if (!response.ok)
    throw new Error(`[nyt] ${slug}: HTTP ${response.status}`)
  return response.json()
}

/** The races in a file, cut down, from the cache or fetched into it. */
async function races(slug: string, refresh: boolean): Promise<KeptRace[]> {
  const path = join(CACHE, `${slug}.json`)
  if (!refresh && existsSync(path))
    return Bun.file(path).json()
  const file = await fetchFile(slug)
  const kept = (file.races ?? []).map(keep)
  await mkdir(CACHE, { recursive: true })
  await Bun.write(path, JSON.stringify(kept))
  return kept
}

const PARTIES: Record<string, Party> = { DEM: 'D', GOP: 'R' }

const LEVELS: Record<string, UnitCount['level']> = {
  state: 'state',
  county: 'county',
  township: 'town',
  state_house_district: 'district',
}

/** A race as kept, in the shape the build works with. */
export function contestFrom(ref: ContestRef, race: KeptRace): Contest {
  const candidates: Candidate[] = Object.entries(race.candidate_metadata).map(([id, c]) => ({
    id,
    name: [c.first_name, c.last_name].filter(Boolean).join(' ') || id,
    party: PARTIES[c.party?.nyt_id ?? ''] ?? 'O',
    partyLabel: c.party?.name ?? 'Other',
    incumbent: c.incumbent,
  }))

  const units: UnitCount[] = race.reporting_units.map((u) => {
    const level = LEVELS[u.level] ?? 'other'
    const votes: Record<string, number> = {}
    for (const c of u.candidates)
      votes[c.nyt_id] = c.votes.total ?? 0
    return {
      level,
      stateFips: u.fips_state ?? '',
      ...(u.fips_county ? { countyFips: u.fips_county } : {}),
      // `008` for State House District 8.
      ...(level === 'district' && u.fips_suffix ? { district: String(Number(u.fips_suffix)) } : {}),
      name: u.name,
      votes,
      total: u.total_votes ?? 0,
      pctReporting: u.eevp,
    }
  })

  const perParty = (party: Party): number => candidates.filter(c => c.party === party).length
  const kind: Contest['kind'] = race.tabulation_method === 'ranked-choice'
    ? 'ranked-choice'
    : perParty('D') > 1 || perParty('R') > 1 ? 'all-party' : 'general'

  return {
    ...ref,
    stateFips: units.find(u => u.level === 'state')?.stateFips ?? '',
    kind,
    uncontested: race.uncontested,
    status: race.race_call_status === 'called' ? 'called' : race.race_call_status === 'runoff' ? 'runoff' : 'uncalled',
    winners: race.outcome?.won ?? [],
    candidates,
    units,
    updatedAt: race.updated_at,
  }
}

/** A race in a summary file as a reference to its own file. */
export function refFrom(office: Office, race: Pick<KeptRace, 'nyt_id' | 'type' | 'seat_number' | 'url'>): ContestRef | null {
  // The House summary leads with a national total that is no contest.
  if (!race.url || race.nyt_id.startsWith('US-'))
    return null
  const slug = basename(race.url, '.html')
  return {
    id: race.nyt_id,
    office,
    state: race.nyt_id.slice(0, 2),
    ...(office === 'house' ? { district: slug.endsWith('-at-large') ? '0' : String(Number(race.seat_number)) } : {}),
    special: /special/i.test(race.type ?? ''),
    slug,
  }
}

export const nyt: ResultsSource = {
  id: 'nyt',
  label: 'The New York Times / The Associated Press',
  official: false,

  async list({ refresh }) {
    const refs: ContestRef[] = []
    for (const office of Object.keys(SUMMARIES) as Office[]) {
      for (const race of await races(SUMMARIES[office], refresh)) {
        const ref = refFrom(office, race)
        if (ref)
          refs.push(ref)
      }
    }
    return refs
  },

  async load(ref, { refresh }) {
    const all = await races(ref.slug, refresh)
    const race = all.find(r => r.nyt_id === ref.id) ?? all[0]
    if (!race)
      throw new Error(`[nyt] ${ref.slug}: no race in the file`)
    return contestFrom(ref, race)
  },
}
