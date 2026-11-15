/**
 * What a results source has to give the build, whatever it reads from.
 *
 * The map is built from these shapes and nothing else, so replacing the
 * source — a news feed now, certified returns later — is a new file in this
 * folder and one line in `scripts/build-results.ts`.
 */

export type Office = 'president' | 'house' | 'senate' | 'governor'

/** Democratic, Republican, or anyone else. */
export type Party = 'D' | 'R' | 'O'

export interface ContestRef {
  /** The source's own id for the contest. */
  id: string
  office: Office
  /** Postal abbreviation, `TX`. */
  state: string
  /** A House seat's district number; `0` for a state's one seat at large. */
  district?: string
  /** An election to finish someone else's term. */
  special: boolean
  /** The file or page the source keeps it under. */
  slug: string
}

export interface Candidate {
  id: string
  name: string
  party: Party
  /** The party as the ballot has it: `Libertarian`, `Nonpartisan`. */
  partyLabel: string
  incumbent: boolean
}

export interface UnitCount {
  /**
   * What kind of place the count is for. Most states report by county; New
   * England by town; Alaska by state house district. `other` is anything
   * that is part of one of those or of none: a city ward, overseas ballots.
   */
  level: 'state' | 'county' | 'town' | 'district' | 'other'
  /** Two digits. */
  stateFips: string
  /** Three digits: the county a county or town count belongs to. */
  countyFips?: string
  /** A state house district's number, where the level is `district`. */
  district?: string
  name: string
  /** Votes by candidate id. */
  votes: Record<string, number>
  total: number
  /** How much of the expected vote is counted, 0 to 100, where the source says. */
  pctReporting: number | null
}

export interface Contest extends ContestRef {
  stateFips: string
  /**
   * `general` is one candidate a party. `all-party` has several of a party
   * on one ballot: Louisiana's primary, a California top-two with two
   * Democrats. `ranked-choice` counts are first choices only.
   */
  kind: 'general' | 'all-party' | 'ranked-choice'
  /** No votes are counted for a candidate with no opponent. */
  uncontested: boolean
  status: 'called' | 'uncalled' | 'runoff'
  /** Candidate ids. */
  winners: string[]
  candidates: Candidate[]
  units: UnitCount[]
  /** ISO time the source last changed it. */
  updatedAt: string
  /**
   * The source has this contest for the state as a whole and for no county
   * the map draws: Alaska before its present districts, a state reported by
   * counties that no longer exist. Its votes count towards the state and
   * stand on no county.
   */
  countyless?: boolean
}

export interface ResultsSource {
  id: string
  /** Election day, `2024-11-05`. */
  election: string
  /** For the line under the map: where these numbers come from. */
  label: string
  /** Whether the numbers are certified returns. */
  official: boolean
  /** Every contest the source has for the election. */
  list: (options: { refresh: boolean }) => Promise<ContestRef[]>
  load: (ref: ContestRef, options: { refresh: boolean }) => Promise<Contest>
}
