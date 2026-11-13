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

/** The three files the map draws from. */
export function dataFiles(): { counties: string, states: string, results: string } {
  return {
    counties: versioned('/data/geo/counties.json'),
    states: versioned('/data/geo/states.json'),
    results: versioned('/data/results/2026.json'),
  }
}
