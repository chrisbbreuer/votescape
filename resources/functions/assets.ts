/**
 * Addresses for the files the map reads, each with a version that changes
 * when the file does.
 *
 * With one, a browser can be told to keep the file for a year and still fetch
 * the new one the moment it is replaced, because the page then names a
 * different address. Server only: it reads the files' details from disk.
 */
import { statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { ELECTIONS, LATEST } from '../data/elections'

/** `path` under public/, with `?v=` from when it last changed and how big it is. */
export function versioned(path: string): string {
  try {
    const stat = statSync(join(process.cwd(), 'public', path))
    return `${path}?v=${Math.round(stat.mtimeMs).toString(36)}${stat.size.toString(36)}`
  }
  catch {
    // Not built yet. The page asks for it plainly and says what is missing.
    return path
  }
}

/**
 * The files the map draws from: the shapes, the present election's results,
 * and every election whose results have been built, by year.
 */
export function dataFiles(): { counties: string, states: string, results: string, years: Record<number, string> } {
  const years: Record<number, string> = {}
  for (const election of ELECTIONS) {
    const file = versioned(`/data/results/${election.year}.json`)
    if (file.includes('?v='))
      years[election.year] = file
  }
  return {
    counties: versioned('/data/geo/counties.json'),
    states: versioned('/data/geo/states.json'),
    results: versioned(`/data/results/${LATEST.year}.json`),
    years,
  }
}
