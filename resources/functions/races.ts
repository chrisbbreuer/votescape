/**
 * What a race is, in a sentence, and where to read about it.
 *
 * The map shows who led where. This says what was being decided: how many
 * seats were up, who ran for the presidency and how the Electoral College
 * fell, and when the election was held, with the Wikipedia article for the
 * race itself. A state's page names that state's own race and the national
 * one it was part of.
 *
 * The facts here are the ones that do not depend on the count: what was on
 * the ballot, and for a presidential election since certified, how it ended.
 */

import type { Election, OfficeKey } from '../data/elections'

export interface RaceLink {
  /** What the link is to: `Wikipedia`, or `The national race`. */
  label: string
  /** The article's title, as Wikipedia has it. */
  title: string
  href: string
}

export interface RaceInfo {
  /** One or two sentences on what was decided. */
  text: string
  /** Election day, written out: `November 5, 2024`. */
  date: string
  links: RaceLink[]
}

/** A presidential election since certified: who ran, and the electors each was given. */
interface Presidency { winner: string, loser: string, won: number, lost: number }

const PRESIDENCIES: Record<number, Presidency> = {
  2016: { winner: 'Donald Trump', loser: 'Hillary Clinton', won: 304, lost: 227 },
  2020: { winner: 'Joe Biden', loser: 'Donald Trump', won: 306, lost: 232 },
  2024: { winner: 'Donald Trump', loser: 'Kamala Harris', won: 312, lost: 226 },
}

/** Senate seats on the ballot, special elections among them. */
const SENATE_SEATS: Record<number, number> = { 2018: 35, 2020: 35, 2022: 35, 2024: 34, 2026: 35 }

/** States that chose a governor. */
const GOVERNORS: Record<number, number> = { 2018: 36, 2020: 11, 2022: 36, 2024: 11, 2026: 36 }

/** States with one seat in the House, whose article is for an election, not elections. */
const ONE_SEAT = new Set(['Alaska', 'Delaware', 'North Dakota', 'South Dakota', 'Vermont', 'Wyoming'])

/** Montana had one seat until the 2022 election. */
function oneSeat(state: string, year: number): boolean {
  return ONE_SEAT.has(state) || (state === 'Montana' && year < 2022)
}

/** The office a label names: `U.S. Senate (special)` is the Senate. */
export function officeFromLabel(label: string): OfficeKey | undefined {
  const plain = label.replace(/\s*\(.*\)$/, '')
  const labels: Record<string, OfficeKey> = { 'President': 'president', 'U.S. House': 'house', 'U.S. Senate': 'senate', 'Governor': 'governor', 'Top of ticket': 'top' }
  return labels[plain]
}

/** A state as an article's title ends with it: `in the District of Columbia`. */
function inState(state: string, office: OfficeKey): string {
  if (state === 'District of Columbia')
    return 'the District of Columbia'
  // Only the presidential articles tell the state from the city.
  if (state === 'Washington' && office === 'president')
    return 'Washington (state)'
  return state
}

/** The title of the Wikipedia article for a race: the country's, or a state's. */
export function articleTitle(year: number, office: OfficeKey, state = ''): string {
  if (!state) {
    switch (office) {
      case 'president': return `${year} United States presidential election`
      case 'house': return `${year} United States House of Representatives elections`
      case 'senate': return `${year} United States Senate elections`
      case 'governor': return `${year} United States gubernatorial elections`
      default: return `${year} United States elections`
    }
  }
  switch (office) {
    case 'president': return `${year} United States presidential election in ${inState(state, office)}`
    case 'house': return `${year} United States House of Representatives ${oneSeat(state, year) ? 'election' : 'elections'} in ${inState(state, office)}`
    case 'senate': return `${year} United States Senate election in ${inState(state, office)}`
    case 'governor': return `${year} ${state} gubernatorial election`
    default: return `${year} ${state} elections`
  }
}

/** Where a title leads: the article itself. Every title this makes was checked against Wikipedia. */
export function articleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function link(label: string, title: string): RaceLink {
  return { label, title, href: articleUrl(title) }
}

function writtenDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${months[(month ?? 1) - 1]} ${day}, ${year}`
}

function presidency(year: number): string {
  const p = PRESIDENCIES[year]
  return p ? `${p.winner} beat ${p.loser}, ${p.won} electoral votes to ${p.lost}.` : ''
}

/**
 * What a race was, for the country or for one state.
 *
 * `state` is the state's name, empty for the country. `office` is the office
 * as shown: for a state, the one its top of the ticket turned out to be.
 */
export function raceInfo(election: Election, office: OfficeKey, state = ''): RaceInfo {
  const { year } = election
  const date = writtenDate(election.date)
  const national = link(state ? 'The national race' : 'Wikipedia', articleTitle(year, office))

  if (!state) {
    const text = {
      president: `The vote for president, which is decided state by state in the Electoral College. ${presidency(year)}`.trim(),
      house: 'All 435 seats in the House of Representatives, which are on the ballot every two years. A county can be split between districts: its votes here are for whichever seats it helped choose.',
      senate: `${SENATE_SEATS[year] ?? 'About a third'} of the Senate's 100 seats. A senator serves six years, so only some states voted for one.`,
      governor: `${GOVERNORS[year] ?? 'Some'} states chose a governor. The rest are flat: there was no such race there.`,
      top: 'The race at the top of each state\'s ballot: for governor where there was one, else for the Senate. It puts a statewide race on nearly every state at once.',
    }[office]
    return { text, date, links: [national] }
  }

  const text = {
    president: `${state}'s vote for president. ${presidency(year)}`.trim(),
    house: oneSeat(state, year) ? `${state}'s one seat in the House of Representatives.` : `${state}'s seats in the House of Representatives, added up across its districts.`,
    senate: `One of ${state}'s two seats in the Senate, for a term of six years.`,
    governor: `The election of ${state}'s governor.`,
    top: `The most prominent statewide race in ${state} that year.`,
  }[office]
  // D.C. has no senator, governor or voting member: only its presidential vote has an article.
  const own = office === 'top' ? [] : [link('Wikipedia', articleTitle(year, office, state))]
  return { text, date, links: [...own, national] }
}
