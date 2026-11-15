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
import { STATES } from '../../resources/data/states'

const STORE = resolve(import.meta.dir, '../../storage/data/results')
/** Between requests, in milliseconds. */
const PAUSE = 350

const SUMMARIES: Record<Office, string> = {
  president: 'results-president',
  house: 'results-house',
  senate: 'results-senate',
  governor: 'results-governor',
}

/** The fields of a race kept from a file; the rest is the page's furniture. */
export interface KeptRace {
  nyt_id: string
  type: string | null
  /** `U.S. House`, where a file holds every office of a state. */
  office?: string | null
  seat_number: string | null
  uncontested: boolean
  tabulation_method: string | null
  race_call_status: string | null
  updated_at: string
  url: string | null
  outcome: { won?: string[], advanced_to_runoff?: string[] } | null
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

export function keep(race: any): KeptRace {
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
    office: race.office ?? null,
    seat_number: race.seat_number ?? null,
    uncontested: !!race.uncontested,
    tabulation_method: race.tabulation_method ?? null,
    race_call_status: race.race_call_status ?? null,
    updated_at: race.updated_at,
    url: race.url ?? null,
    outcome: race.outcome ? { won: race.outcome.won ?? [], advanced_to_runoff: race.outcome.advanced_to_runoff ?? [] } : null,
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

/** A file of the Times', parsed. Waits its turn after the request before. */
export async function fetchJson(url: string): Promise<any> {
  const wait = lastRequest + PAUSE - Date.now()
  if (wait > 0)
    await Bun.sleep(wait)
  lastRequest = Date.now()
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (votescape results build)' } })
  if (!response.ok)
    throw new Error(`[nyt] ${url}: HTTP ${response.status}`)
  return response.json()
}

/**
 * What `cut` keeps of the file at `url`, from `storage/data/results/<folder>`
 * or fetched into it.
 */
export async function cached<T>(folder: string, name: string, url: string, refresh: boolean, cut: (file: any) => T): Promise<T> {
  const path = join(STORE, folder, `${name}.json`)
  if (!refresh && existsSync(path))
    return Bun.file(path).json()
  const kept = cut(await fetchJson(url))
  await mkdir(join(STORE, folder), { recursive: true })
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

  // Three places are not always given by what the map draws them as. The
  // District of Columbia is one county, and is sometimes given as a state
  // alone. Alaska, where it is not given by house district, is given whole,
  // and Connecticut, where it is not given by town, by the counties it has
  // abolished: their votes then count for the state and stand on no place.
  // So do those of a race whose places are listed with nothing counted in
  // them, as a ranked-choice count decided at the state's level is.
  const whole = units.find(u => u.level === 'state')
  const parts = units.filter(u => u.level !== 'state' && u.level !== 'other')
  let countyless = false
  if (whole?.stateFips === '11' && !parts.length) {
    units.push({ ...whole, level: 'county', countyFips: '001', name: 'District of Columbia' })
  }
  else if (whole && ((whole.stateFips === '02' && !parts.some(u => u.level === 'district')) || (whole.stateFips === '09' && !parts.some(u => u.level === 'town')) || (whole.total > 0 && parts.length > 0 && parts.every(u => u.total === 0)))) {
    units.splice(0, units.length, whole)
    countyless = true
  }

  // A state counted by town is sometimes given by county as well, and then
  // only in part, or, in Connecticut, by counties that are gone. Whichever
  // of the two accounts for more of the vote is the one to count.
  const cast = (level: UnitCount['level']): number => parts.reduce((n, u) => n + (u.level === level ? u.total : 0), 0)
  if (cast('county') > 0 && cast('town') > 0) {
    const drop = cast('town') > cast('county') || whole?.stateFips === '09' ? 'county' : 'town'
    units.splice(0, units.length, ...units.filter(u => u.level !== drop))
  }

  const perParty = (party: Party): number => candidates.filter(c => c.party === party).length
  const kind: Contest['kind'] = race.tabulation_method === 'ranked-choice'
    ? 'ranked-choice'
    : perParty('D') > 1 || perParty('R') > 1 ? 'all-party' : 'general'

  return {
    ...ref,
    stateFips: units.find(u => u.level === 'state')?.stateFips ?? '',
    kind,
    uncontested: race.uncontested,
    status: statusOf(race),
    winners: race.outcome?.won ?? [],
    candidates,
    units,
    updatedAt: race.updated_at,
    ...(countyless ? { countyless } : {}),
  }
}

/**
 * Whether a race is decided. The files of 2024 on say so outright; those of
 * 2022 only name who won, or who went on to a runoff.
 */
function statusOf(race: KeptRace): Contest['status'] {
  if (race.race_call_status)
    return race.race_call_status === 'called' ? 'called' : race.race_call_status === 'runoff' ? 'runoff' : 'uncalled'
  if (race.outcome?.won?.length)
    return 'called'
  return race.outcome?.advanced_to_runoff?.length ? 'runoff' : 'uncalled'
}

/** A race in a summary file as a reference to its own file. */
export function refFrom(office: Office, race: Pick<KeptRace, 'nyt_id' | 'type' | 'seat_number' | 'url'>): ContestRef | null {
  // The House summary leads with a national total that is no contest.
  // The presidency's has Maine's and Nebraska's districts beside each state:
  // the same votes again.
  if (!race.url || race.nyt_id.startsWith('US-') || race.nyt_id.includes('-CD_'))
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

/**
 * The page of a race the summary gives no address for, which it does not for
 * the House seats of a state counted by town. Their files are there all the same.
 */
function pageOf(office: Office, race: KeptRace): string | null {
  const state = STATES.find(s => s.code === race.nyt_id.slice(0, 2).toLowerCase())
  if (office !== 'house' || !state || !race.seat_number)
    return null
  return `results-${state.name.toLowerCase().replace(/[^a-z]+/g, '-')}-us-house-${Number(race.seat_number)}.html`
}

/**
 * The results pages of an election from 2024 on: a summary file for each
 * office, and a file for each race. `folder` is where its files are kept
 * under `storage/data/results`.
 */
export function nytPages(election: string, offices: Office[], folder: string): ResultsSource {
  const base = `https://static01.nyt.com/elections-assets/pages/data/${election}`
  const races = (slug: string, refresh: boolean): Promise<KeptRace[]> =>
    cached(folder, slug, `${base}/${slug}.json`, refresh, file => (file.races ?? []).map(keep))

  return {
    id: 'nyt',
    election,
    label: 'The New York Times / The Associated Press',
    official: false,

    async list({ refresh }) {
      const refs: ContestRef[] = []
      for (const office of offices) {
        for (const race of await races(SUMMARIES[office], refresh)) {
          const ref = refFrom(office, race.url ? race : { ...race, url: pageOf(office, race) })
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
}

/** Whether a race is counted by anything smaller than its state. */
const byCounty = (race: KeptRace): boolean => race.reporting_units.some(u => u.level in LEVELS && u.level !== 'state')

const OFFICES_2022: Record<string, Office> = { 'U.S. House': 'house', 'U.S. Senate': 'senate', 'Governor': 'governor' }

/**
 * The results pages of 2022: one file a state, holding every race in it. The
 * races are in the shape of the later years', so they are read the same way.
 *
 * Alaska is there for the state as a whole only, so its votes stand on no
 * district.
 */
export function nytStates(election: string, states: Array<{ code: string, name: string }>, folder: string): ResultsSource {
  const base = `https://static01.nyt.com/elections-assets/${election.slice(0, 4)}/data/${election}`
  // Louisiana's November election is an open primary: everyone on one ballot,
  // and a runoff only where no one has a majority.
  const wanted = (race: any): boolean => race.office in OFFICES_2022 && /general|open primary/i.test(race.type ?? '') && !/runoff/i.test(race.type ?? '')
  const races = (slug: string, refresh: boolean): Promise<KeptRace[]> =>
    cached(folder, slug, `${base}/${slug}.json`, refresh, file => (file.races ?? []).filter(wanted).map(keep))

  return {
    id: 'nyt',
    election,
    label: 'The New York Times / The Associated Press',
    official: false,

    async list({ refresh }) {
      const refs: ContestRef[] = []
      for (const state of states) {
        // D.C. sends a delegate, who has no vote: not a seat.
        if (state.code === 'dc')
          continue
        const slug = `results-${state.name.toLowerCase().replace(/[^a-z]+/g, '-')}`
        for (const race of await races(slug, refresh)) {
          const office = OFFICES_2022[race.office ?? '']!
          refs.push({
            id: race.nyt_id,
            office,
            state: state.code.toUpperCase(),
            ...(office === 'house' ? { district: String(Number(race.seat_number) || 0) } : {}),
            special: /special/i.test(race.type ?? ''),
            slug,
          })
        }
      }
      return refs
    },

    async load(ref, { refresh }) {
      let race = (await races(ref.slug, refresh)).find(r => r.nyt_id === ref.id)
      if (!race)
        throw new Error(`[nyt] ${ref.slug}: no race ${ref.id} in the file`)
      // A state's file has a House seat's total and no more. Its counties are
      // in the file behind the seat's own page.
      if (!byCounty(race) && race.url) {
        const own = basename(race.url, '.html')
        const page = await cached<KeptRace[]>(folder, own, `${base}/${own}.json`, refresh, file => (file.races ?? []).map(keep))
        race = page.find(r => r.nyt_id === ref.id) ?? race
      }
      const contest = contestFrom(ref, race)
      return byCounty(race) ? contest : { ...contest, countyless: true }
    },
  }
}

/** The election being counted now. */
export const nyt: ResultsSource = nytPages('2026-11-03', ['house', 'senate', 'governor'], 'nyt')
