/**
 * From contests as a source reports them to what the map draws: for each
 * office, a row of votes for every county, and a summary for every state.
 *
 * Pure, so it can be tested with a few made-up contests.
 */

import type { Candidate, Contest, Office, UnitCount } from '../sources/types'

/** Things about a row a reader should be told. Combined with `|`. */
export const FLAG = {
  /**
   * The margin says nothing here: most of the votes were cast where there
   * was no Democrat against a Republican to choose between.
   */
  notComparable: 1,
  /** One side is not a major party's candidate but the main opponent of the other's. */
  standIn: 2,
  /** Several candidates of a party on one ballot; sides are parties' totals. */
  allParty: 4,
  /** First choices in a ranked-choice count. */
  firstRound: 8,
  /** Not called yet, or going to a runoff. */
  undecided: 16,
} as const

/** A county's row: `[dem, rep, total, pctReporting, flags, margin]`. */
export type Row = [dem: number, rep: number, total: number, pct: number | null, flags: number, margin: number | null]

export interface StateSummary {
  /** Postal abbreviation. */
  state: string
  dem: number
  rep: number
  total: number
  pct: number | null
  flags: number
  /** (dem − rep) / (dem + rep), over the votes where there were both; null where there were none. */
  margin: number | null
  /** Who stands on each side, for a statewide race. */
  demName?: string
  repName?: string
  /** The party label of a side that is a stand-in: `Independent`. */
  demParty?: string
  repParty?: string
  special?: boolean
  status?: Contest['status']
  /** The winner's side, once called. */
  winner?: 'dem' | 'rep' | 'other'
  winnerName?: string
  /** House seats by who won them; `open` is not called yet. */
  seats?: { dem: number, rep: number, other: number, open: number }
  /** Counted for the state as a whole, with no county on the map to stand on. */
  countyless?: boolean
}

export interface OfficeResults {
  counties: Record<string, Row>
  states: Record<string, StateSummary>
}

export type TopOffice = Exclude<Office, 'president'>

export interface Results {
  /** In a presidential year. */
  president?: OfficeResults
  house: OfficeResults
  senate: OfficeResults
  governor: OfficeResults
  /**
   * Each state's most prominent race: Senate, else governor, else House. Left
   * out of a presidential year, where that is the presidency everywhere.
   */
  top?: OfficeResults & { office: Record<string, TopOffice> }
}

/** Who is counted on each side of a contest. */
export interface Sides {
  dem: string[]
  rep: string[]
  /** The side that is a stand-in, and who. */
  standIn?: { side: 'dem' | 'rep', candidate: Candidate }
}

/**
 * The two sides of a contest.
 *
 * Democrats on one, Republicans on the other, every one of them where a
 * ballot has several. A statewide race with only one major party on the
 * ballot is still a contest between two sides — Nebraska's Senate race was a
 * Republican against an independent — so there the other side is the leading
 * candidate who is not of that party, and the row is flagged. A House seat is
 * given no stand-in: one district's independent is not a party, and a county
 * is in several districts.
 */
export function sides(contest: Contest): Sides {
  const dem = contest.candidates.filter(c => c.party === 'D').map(c => c.id)
  const rep = contest.candidates.filter(c => c.party === 'R').map(c => c.id)
  if (contest.office === 'house' || (dem.length > 0) === (rep.length > 0))
    return { dem, rep }

  const statewide = contest.units.find(u => u.level === 'state')
  const missing: 'dem' | 'rep' = dem.length ? 'rep' : 'dem'
  const present = missing === 'dem' ? 'R' : 'D'
  const candidate = contest.candidates
    .filter(c => c.party !== present)
    .sort((a, b) => (statewide?.votes[b.id] ?? 0) - (statewide?.votes[a.id] ?? 0))[0]
  if (!candidate)
    return { dem, rep }
  return missing === 'dem'
    ? { dem: [candidate.id], rep, standIn: { side: 'dem', candidate } }
    : { dem, rep: [candidate.id], standIn: { side: 'rep', candidate } }
}

/** Whether a contest is a Democrat against a Republican, so its margin means what the map's colours say. */
export function comparable(contest: Contest, s: Sides = sides(contest)): boolean {
  return !contest.uncontested && s.dem.length > 0 && s.rep.length > 0
}

/**
 * Which of a contest's units are its counties.
 *
 * A source may report a state at several levels at once — Illinois by county
 * with Chicago and the Cook suburbs again beside it, New Hampshire by town
 * with a city's wards as well — so one level is chosen and the rest left out,
 * or votes would be counted twice.
 */
export function countyUnits(contest: Contest): UnitCount[] {
  for (const level of ['county', 'district', 'town'] as const) {
    const units = contest.units.filter(u => u.level === level)
    if (units.length)
      return units
  }
  return []
}

/**
 * The map's id for the county a unit is, or is in. `towns` is Connecticut's
 * town-to-planning-region table: its towns are reported under the eight
 * counties the state abolished, which are not on the map.
 */
export function countyId(unit: UnitCount, towns: Record<string, string>): string | null {
  if (unit.level === 'district')
    return unit.district ? `${unit.stateFips}HD${unit.district.padStart(2, '0')}` : null
  if (unit.level === 'town' && unit.stateFips === '09')
    return towns[unit.name] ?? null
  if ((unit.level === 'county' || unit.level === 'town') && unit.countyFips)
    return `${unit.stateFips}${unit.countyFips}`
  return null
}

const sum = (votes: Record<string, number>, ids: string[]): number => ids.reduce((n, id) => n + (votes[id] ?? 0), 0)

const marginOf = (dem: number, rep: number): number | null => (dem + rep > 0 ? Math.round(((dem - rep) / (dem + rep)) * 1e4) / 1e4 : null)

/** Votes counted towards a place, before they are a row. */
interface Running {
  dem: number
  rep: number
  total: number
  /** Of `total`, the votes cast where there were both sides to choose between. */
  comparableTotal: number
  comparableDem: number
  comparableRep: number
  /** Sum of pct × total, for an average weighted by votes. */
  pctWeighted: number
  pctTotal: number
  flags: number
}

const empty = (): Running => ({ dem: 0, rep: 0, total: 0, comparableTotal: 0, comparableDem: 0, comparableRep: 0, pctWeighted: 0, pctTotal: 0, flags: 0 })

function add(into: Running, unit: UnitCount, contest: Contest, s: Sides, flags: number): void {
  const dem = sum(unit.votes, s.dem)
  const rep = sum(unit.votes, s.rep)
  into.dem += dem
  into.rep += rep
  into.total += unit.total
  if (comparable(contest, s)) {
    into.comparableTotal += unit.total
    into.comparableDem += dem
    into.comparableRep += rep
  }
  if (unit.pctReporting !== null) {
    // A place with nothing counted yet still says how far along it is.
    const weight = Math.max(unit.total, 1)
    into.pctWeighted += unit.pctReporting * weight
    into.pctTotal += weight
  }
  into.flags |= flags
}

function finish(r: Running): { dem: number, rep: number, total: number, pct: number | null, flags: number, margin: number | null } {
  // Where less than half the votes were cast with both sides on the ballot,
  // the margin of the rest is not the place's.
  const lopsided = r.total > 0 && r.comparableTotal < r.total / 2
  return {
    dem: r.dem,
    rep: r.rep,
    total: r.total,
    pct: r.pctTotal ? Math.round((r.pctWeighted / r.pctTotal) * 10) / 10 : null,
    flags: r.flags | (lopsided ? FLAG.notComparable : 0),
    margin: lopsided ? null : marginOf(r.comparableDem, r.comparableRep),
  }
}

function contestFlags(contest: Contest, s: Sides): number {
  return (s.standIn ? FLAG.standIn : 0)
    | (contest.kind === 'all-party' ? FLAG.allParty : 0)
    | (contest.kind === 'ranked-choice' ? FLAG.firstRound : 0)
    | (contest.status === 'called' ? 0 : FLAG.undecided)
}

export interface RollupProblem {
  contest: string
  message: string
}

/**
 * Roll one office's contests up to counties and states.
 *
 * `known` is the set of county ids on the map. A count for a county that is
 * not on it, or county counts that do not add up to the state's, are
 * reported in `problems` rather than papered over.
 */
export function rollupOffice(contests: Contest[], towns: Record<string, string>, known: Set<string>): OfficeResults & { problems: RollupProblem[] } {
  const counties = new Map<string, Running>()
  const states = new Map<string, Running>()
  const summaries: Record<string, StateSummary> = {}
  const problems: RollupProblem[] = []

  for (const contest of contests) {
    const s = sides(contest)
    const flags = contestFlags(contest, s)
    const statewide = contest.units.find(u => u.level === 'state')
    if (!statewide) {
      problems.push({ contest: contest.slug, message: 'no statewide count' })
      continue
    }
    const fips = contest.stateFips

    // The state's own count, which includes ballots no county is given.
    const state = states.get(fips) ?? empty()
    add(state, statewide, contest, s, flags)
    states.set(fips, state)

    const summary = summaries[fips] ??= { state: contest.state, dem: 0, rep: 0, total: 0, pct: null, flags: 0, margin: null }
    const name = (ids: string[]): string | undefined => (ids.length === 1 ? contest.candidates.find(c => c.id === ids[0])?.name : undefined)
    const winner = contest.winners[0]
    const side: StateSummary['winner'] = winner === undefined ? undefined : s.dem.includes(winner) ? 'dem' : s.rep.includes(winner) ? 'rep' : 'other'
    if (contest.office === 'house') {
      summary.seats ??= { dem: 0, rep: 0, other: 0, open: 0 }
      summary.seats[contest.status === 'called' && side ? side : 'open']++
    }
    else {
      summary.demName = name(s.dem)
      summary.repName = name(s.rep)
      if (s.standIn)
        summary[s.standIn.side === 'dem' ? 'demParty' : 'repParty'] = s.standIn.candidate.partyLabel
      summary.special = contest.special
      summary.status = contest.status
      if (contest.status === 'called' && side) {
        summary.winner = side
        summary.winnerName = contest.candidates.find(c => c.id === winner)?.name
      }
    }

    let counted = 0
    for (const unit of countyUnits(contest)) {
      const id = countyId(unit, towns)
      if (!id || !known.has(id)) {
        problems.push({ contest: contest.slug, message: `${unit.name} (${unit.level}) is not a county on the map` })
        continue
      }
      const county = counties.get(id) ?? empty()
      add(county, unit, contest, s, flags)
      counties.set(id, county)
      counted += unit.total
    }
    // A state is counted as a whole only where none of its contests is by county.
    summary.countyless = (summary.countyless ?? true) && !!contest.countyless && counted === 0
    if (contest.countyless && counted === 0)
      continue
    // Overseas and other ballots given to no county are a fraction of a
    // percent; more than that missing means a level was misread.
    if (statewide.total > 0 && Math.abs(statewide.total - counted) > Math.max(50, statewide.total * 0.02))
      problems.push({ contest: contest.slug, message: `counties add up to ${counted}, the state to ${statewide.total}` })
  }

  const rows: Record<string, Row> = {}
  for (const [id, running] of counties) {
    const f = finish(running)
    rows[id] = [f.dem, f.rep, f.total, f.pct, f.flags, f.margin]
  }
  for (const [fips, running] of states) {
    Object.assign(summaries[fips]!, finish(running))
    if (!summaries[fips]!.countyless)
      delete summaries[fips]!.countyless
  }

  return { counties: rows, states: summaries, problems }
}

/**
 * One contest a state for an office that fills one seat.
 *
 * A state can have two Senate elections on one ballot, the regular one and a
 * special one for the other seat. Added together they would count every voter
 * twice, so the regular one stands for the state; of two alike, the larger.
 */
export function oneEach(contests: Contest[]): Contest[] {
  const total = (c: Contest): number => c.units.find(u => u.level === 'state')?.total ?? 0
  const kept = new Map<string, Contest>()
  for (const contest of contests) {
    const held = kept.get(contest.stateFips)
    if (!held || (held.special && !contest.special) || (held.special === contest.special && total(contest) > total(held)))
      kept.set(contest.stateFips, contest)
  }
  return contests.filter(c => kept.get(c.stateFips) === c)
}

/** The whole election: each office, and each state's most prominent race. */
export function rollup(contests: Contest[], towns: Record<string, string>, known: Set<string>): { results: Results, problems: RollupProblem[] } {
  const by = (office: Office): Contest[] => contests.filter(c => c.office === office)
  const president = by('president').length ? rollupOffice(oneEach(by('president')), towns, known) : null
  const house = rollupOffice(by('house'), towns, known)
  const senate = rollupOffice(oneEach(by('senate')), towns, known)
  const governor = rollupOffice(oneEach(by('governor')), towns, known)
  const offices = { house, senate, governor }
  const strip = ({ counties, states }: OfficeResults): OfficeResults => ({ counties, states })
  const problems = [...(president?.problems ?? []), ...house.problems, ...senate.problems, ...governor.problems]

  if (president)
    return { results: { president: strip(president), house: strip(house), senate: strip(senate), governor: strip(governor) }, problems }

  const top: NonNullable<Results['top']> = { counties: {}, states: {}, office: {} }
  const all = new Set([...Object.keys(house.states), ...Object.keys(senate.states), ...Object.keys(governor.states)])
  for (const fips of all) {
    const office: TopOffice = senate.states[fips] ? 'senate' : governor.states[fips] ? 'governor' : 'house'
    top.office[fips] = office
    top.states[fips] = offices[office].states[fips]!
  }
  for (const office of ['senate', 'governor', 'house'] as const) {
    for (const [id, row] of Object.entries(offices[office].counties)) {
      if (top.office[id.slice(0, 2)] === office)
        top.counties[id] = row
    }
  }

  return { results: { house: strip(house), senate: strip(senate), governor: strip(governor), top }, problems }
}
