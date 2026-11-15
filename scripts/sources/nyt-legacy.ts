/**
 * The New York Times' results files for 2018 and 2020, as results sources.
 *
 * Those two years' pages were drawn from files in an older shape than
 * `nyt.ts` reads: a race carries its counties as a list, each with votes by
 * candidate. 2018 is one file for the whole country; 2020 is a file a state.
 *
 * The note at the top of `nyt.ts` about whose numbers these are applies here
 * as much. Nothing fetched is committed.
 *
 * Two states are not drawn as they were counted:
 *
 * - Alaska is given by the house districts of the time, which were redrawn in
 *   2022 and are not the ones on the map. Its votes count towards the state
 *   and stand on no district.
 * - Connecticut is given by town as well as by its old counties. The towns are
 *   used, and added up into today's planning regions.
 */

import type { Candidate, Contest, ContestRef, Office, Party, ResultsSource, UnitCount } from './types'
import { cached } from './nyt'

/** The fields of a race kept from a file. */
interface LegacyRace {
  race_id: string
  race_type: string
  election_type: string
  seat: string | number | null
  state_id: string
  uncontested: boolean
  result: string | null
  votes: number
  last_updated: string | null
  candidates: Array<{ candidate_key: string, name_display: string, party_id: string, incumbent: boolean, winner: boolean, votes: number }>
  counties: Array<{ fips: string, name: string, votes: number, results: Record<string, number> }>
  townships: Array<{ name: string, votes: number, results: Record<string, number> }>
}

const OFFICES: Record<string, Office> = { president: 'president', senate: 'senate', house: 'house', governor: 'governor' }

function keep(race: any): LegacyRace {
  const place = (p: any): { name: string, votes: number, results: Record<string, number> } => ({ name: p.name, votes: p.votes ?? 0, results: p.results ?? {} })
  return {
    race_id: race.race_id,
    race_type: race.race_type,
    election_type: race.election_type,
    seat: race.seat ?? null,
    state_id: race.state_id,
    uncontested: !!race.uncontested,
    result: race.result ?? null,
    votes: race.votes ?? 0,
    last_updated: race.last_updated ?? null,
    candidates: (race.candidates ?? []).map((c: any) => ({
      candidate_key: c.candidate_key,
      name_display: c.name_display ?? c.candidate_key,
      party_id: c.party_id ?? '',
      incumbent: !!c.incumbent,
      winner: !!c.winner,
      votes: c.votes ?? 0,
    })),
    counties: (race.counties ?? []).map((c: any) => ({ fips: String(c.fips ?? ''), ...place(c) })),
    // Only Connecticut's towns are needed: every other state has counties on the map.
    townships: race.state_id === 'CT' ? (race.townships ?? []).map(place) : [],
  }
}

/** A general election for an office the map shows, in a state it draws. */
function wanted(race: any, states: Map<string, string>): boolean {
  if (!(race.race_type in OFFICES) || !/general/.test(race.election_type ?? '') || !states.has(race.state_id))
    return false
  // D.C. sends a delegate, who has no vote: not a seat.
  if (race.race_type === 'house' && race.state_id === 'DC')
    return false
  // Maine's and Nebraska's districts for the presidency are the state's votes again.
  return race.race_type !== 'president' || !race.seat
}

const PARTIES: Record<string, Party> = { democrat: 'D', republican: 'R' }

const titled = (text: string): string => text.replace(/(^|[\s-])([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase())

function contestFrom(ref: ContestRef, race: LegacyRace, stateFips: string, election: string): Contest {
  const candidates: Candidate[] = race.candidates.map(c => ({
    id: c.candidate_key,
    name: c.name_display,
    party: PARTIES[c.party_id] ?? 'O',
    partyLabel: titled(c.party_id || 'other'),
    incumbent: c.incumbent,
  }))

  const statewide: Record<string, number> = {}
  for (const c of race.candidates)
    statewide[c.candidate_key] = c.votes
  const units: UnitCount[] = [{ level: 'state', stateFips, name: ref.state, votes: statewide, total: race.votes, pctReporting: null }]

  const towns = race.state_id === 'CT' && race.townships.length > 0
  if (towns) {
    for (const town of race.townships)
      units.push({ level: 'town', stateFips, name: titled(town.name.toLowerCase()), votes: town.results, total: town.votes, pctReporting: null })
  }
  else if (race.state_id === 'DC') {
    // Given by ward. The District is one county on the map.
    units.push({ level: 'county', stateFips, countyFips: '001', name: 'District of Columbia', votes: statewide, total: race.votes, pctReporting: null })
  }
  else if (race.state_id !== 'AK' && race.state_id !== 'CT') {
    for (const county of race.counties) {
      // A race with no count by county is given as one row for the state: `48000`.
      if (county.fips.length !== 5 || county.fips.endsWith('000'))
        continue
      units.push({ level: 'county', stateFips: county.fips.slice(0, 2), countyFips: county.fips.slice(2), name: county.name, votes: county.results, total: county.votes, pctReporting: null })
    }
  }

  const perParty = (party: Party): number => candidates.filter(c => c.party === party).length
  return {
    ...ref,
    stateFips,
    kind: perParty('D') > 1 || perParty('R') > 1 ? 'all-party' : 'general',
    uncontested: race.uncontested,
    status: race.result === 'winner' ? 'called' : race.result === 'runoff' ? 'runoff' : 'uncalled',
    winners: race.candidates.filter(c => c.winner).map(c => c.candidate_key),
    candidates,
    units,
    updatedAt: race.last_updated ?? `${election}T00:00:00Z`,
    ...(units.length === 1 ? { countyless: true } : {}),
  }
}

export interface LegacyOptions {
  election: string
  /** Where its files are kept under `storage/data/results`. */
  folder: string
  states: Array<{ code: string, name: string, fips: string }>
  /** The files to read: one for the country, or one a state. */
  files: Array<{ name: string, url: string }>
  /** Where the races are in a file. */
  races: (file: any) => any[]
}

function legacy(options: LegacyOptions): ResultsSource {
  const fips = new Map(options.states.map(s => [s.code.toUpperCase(), s.fips]))
  const read = (file: { name: string, url: string }, refresh: boolean): Promise<LegacyRace[]> =>
    cached(options.folder, file.name, file.url, refresh, raw => options.races(raw).filter(r => wanted(r, fips)).map(keep))

  return {
    id: 'nyt',
    election: options.election,
    label: 'The New York Times / The Associated Press',
    official: false,

    async list({ refresh }) {
      const refs: ContestRef[] = []
      for (const file of options.files) {
        for (const race of await read(file, refresh)) {
          const office = OFFICES[race.race_type]!
          refs.push({
            id: race.race_id,
            office,
            state: race.state_id,
            ...(office === 'house' ? { district: String(Number(race.seat) || 0) } : {}),
            special: /special/.test(race.election_type),
            slug: file.name,
          })
        }
      }
      return refs
    },

    async load(ref, { refresh }) {
      const file = options.files.find(f => f.name === ref.slug)
      const race = file ? (await read(file, refresh)).find(r => r.race_id === ref.id) : undefined
      if (!race)
        throw new Error(`[nyt] ${ref.slug}: no race ${ref.id} in the file`)
      return contestFrom(ref, race, fips.get(ref.state) ?? '', options.election)
    },
  }
}

type States = LegacyOptions['states']

/** The 2018 midterms: the House, the Senate and governors, in one file. */
export function nyt2018(states: States): ResultsSource {
  return legacy({
    election: '2018-11-06',
    folder: 'nyt-2018',
    states,
    files: [{ name: 'races', url: 'https://int.nyt.com/applications/elections/2018/api/1/races/2018-11-06.json' }],
    races: file => file.races ?? [],
  })
}

/** The 2020 election: the presidency, the Senate, the House and governors, a file a state. */
export function nyt2020(states: States): ResultsSource {
  return legacy({
    election: '2020-11-03',
    folder: 'nyt-2020',
    states,
    files: states.map((state) => {
      const name = state.name.toLowerCase().replace(/[^a-z]+/g, '-')
      return { name, url: `https://static01.nyt.com/elections-assets/2020/data/api/2020-11-03/state-page/${name}.json` }
    }),
    races: file => file.data?.races ?? [],
  })
}
