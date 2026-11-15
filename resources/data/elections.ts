/**
 * The elections the map can show, oldest first.
 *
 * Shared by the results build, which writes one file for each
 * (`public/data/results/2024.json`), and by the page, which lists them and
 * asks for a file when its year is chosen.
 */

export type OfficeKey = 'president' | 'house' | 'senate' | 'governor' | 'top'

export interface Election {
  year: number
  /** Election day, `2024-11-05`. */
  date: string
  kind: 'presidential' | 'midterm'
  /** In a sentence: `the 2024 presidential election`. */
  name: string
  /** As a label: `2024 presidential`. */
  label: string
  /** The offices shown, the first being the one a visit opens on. */
  offices: OfficeKey[]
}

const presidential = (year: number, date: string, offices: OfficeKey[] = ['president', 'senate', 'house', 'governor']): Election => ({
  year,
  date,
  kind: 'presidential',
  name: `the ${year} presidential election`,
  label: `${year} presidential`,
  offices,
})

const midterm = (year: number, date: string): Election => ({
  year,
  date,
  kind: 'midterm',
  name: `the ${year} midterms`,
  label: `${year} midterms`,
  offices: ['house', 'senate', 'governor', 'top'],
})

export const ELECTIONS: Election[] = [
  // County returns for 2016 are for the presidency alone.
  presidential(2016, '2016-11-08', ['president']),
  midterm(2018, '2018-11-06'),
  presidential(2020, '2020-11-03'),
  midterm(2022, '2022-11-08'),
  presidential(2024, '2024-11-05'),
  midterm(2026, '2026-11-03'),
]

/** The most recent election: what the site opens on, and the one still being counted. */
export const LATEST: Election = ELECTIONS[ELECTIONS.length - 1]!

export function electionFor(year: number | string | null | undefined): Election | undefined {
  const wanted = Number(year)
  return ELECTIONS.find(e => e.year === wanted)
}
