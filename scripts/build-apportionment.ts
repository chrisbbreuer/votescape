/**
 * The House's seats and the people behind each one, census by census.
 *
 * Reads the Census Bureau's own table of apportionment since 1910
 * (`apportionment.csv`, from its 2020 apportionment release) and writes
 * `resources/data/apportionment.ts`, which the page at `/representation`
 * shows. The table is fetched once into `storage/data/apportionment`; the
 * file written from it is committed, since it changes once in ten years.
 *
 *   bun scripts/build-apportionment.ts [--refresh]
 */

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { STATES } from '../resources/data/states'
import { fields } from './sources/counties-2016'

const URL = 'https://www2.census.gov/programs-surveys/decennial/2020/data/apportionment/apportionment.csv'
const CACHE = resolve(import.meta.dir, '../storage/data/apportionment')
const OUT = resolve(import.meta.dir, '../resources/data/apportionment.ts')

const path = join(CACHE, 'apportionment.csv')
if (process.argv.includes('--refresh') || !existsSync(path)) {
  const response = await fetch(URL)
  if (!response.ok)
    throw new Error(`[apportionment] ${URL}: HTTP ${response.status}`)
  await mkdir(CACHE, { recursive: true })
  await Bun.write(path, await response.text())
}

const [head, ...lines] = (await Bun.file(path).text()).trim().split(/\r?\n/)
const columns = fields(head ?? '').map(c => c.trim())
const at = (name: string): number => {
  const index = columns.indexOf(name)
  if (index < 0)
    throw new Error(`[apportionment] the table has no column "${name}"`)
  return index
}
const number = (text: string | undefined): number => Number((text ?? '').replace(/,/g, '')) || 0

interface Row { name: string, type: string, year: number, population: number, seats: number, perSeat: number }
const rows: Row[] = lines.map(fields).map(f => ({
  name: (f[at('Name')] ?? '').trim(),
  type: (f[at('Geography Type')] ?? '').trim(),
  year: number(f[at('Year')]),
  population: number(f[at('Resident Population')]),
  seats: number(f[at('Number of Representatives')]),
  perSeat: number(f[at('Average Apportionment Population Per Representative')]),
}))

const nation = rows.filter(r => r.type === 'Nation').sort((a, b) => a.year - b.year).map(r => ({ year: r.year, population: r.population, seats: r.seats, perSeat: r.perSeat }))
if (nation.length < 12 || nation.some(r => !r.seats || !r.perSeat))
  throw new Error('[apportionment] the national rows are not all there')

const years = nation.map(r => r.year)
const first = years[0]!
const last = years[years.length - 1]!

const states = STATES.filter(s => s.code !== 'dc').map((s) => {
  const own = rows.filter(r => r.type === 'State' && r.name === s.name)
  const of = (year: number): Row | undefined => own.find(r => r.year === year && r.seats > 0)
  const now = of(last)
  if (!now)
    throw new Error(`[apportionment] no ${last} row for ${s.name}`)
  const then = of(first)
  // The most seats the state has held since the first of these censuses, and when it first held them.
  const most = own.filter(r => r.seats > 0).reduce((best, r) => (r.seats > best.seats ? r : best), now)
  return {
    code: s.code,
    name: s.name,
    seats: now.seats,
    perSeat: now.perSeat,
    seatsThen: then?.seats ?? 0,
    perSeatThen: then?.perSeat ?? 0,
    mostSeats: most.seats,
    mostSeatsYear: most.year,
  }
})

const seats = states.reduce((n, s) => n + s.seats, 0)
if (seats !== nation[nation.length - 1]!.seats)
  throw new Error(`[apportionment] the states' seats add up to ${seats}, not ${nation[nation.length - 1]!.seats}`)

const body = `/**
 * The House's seats and the people behind each one, census by census.
 *
 * Written by scripts/build-apportionment.ts from the U.S. Census Bureau's
 * table of apportionment, ${first} to ${last}. Do not edit by hand.
 *
 * \`perSeat\` is the bureau's own figure: a state's apportionment population,
 * which counts its residents overseas in federal service, over its seats.
 */

export interface CensusYear {
  year: number
  /** Residents of the fifty states and D.C. */
  population: number
  seats: number
  /** People to a representative, across the country. */
  perSeat: number
}

export interface StateSeats {
  code: string
  name: string
  /** Seats from the ${last} census, and the people to each. */
  seats: number
  perSeat: number
  /** The same from the ${first} census. Zero where it was not yet a state. */
  seatsThen: number
  perSeatThen: number
  /** The most seats it has held since ${first}, and the census that first gave them. */
  mostSeats: number
  mostSeatsYear: number
}

export const FIRST_CENSUS = ${first}
export const LAST_CENSUS = ${last}

export const CENSUSES: CensusYear[] = ${JSON.stringify(nation, null, 2)}

export const STATE_SEATS: StateSeats[] = ${JSON.stringify(states, null, 2)}
`
await Bun.write(OUT, body.replace(/"(\w+)":/g, '$1:').replace(/"/g, '\''))
console.log(`[apportionment] ${nation.length} censuses, ${states.length} states, ${seats} seats -> ${OUT}`)
