import type { CountyFeature, ResultsFile } from '../../resources/functions/election'
import { describe, expect, test } from 'bun:test'
import { colorExpression, flagNotes, formatMargin, formatVotes, heightExpression, heightValue, joinResults, metresPerUnit, metricValue, pixelsPerMetre, unionBounds, viewFor } from '../../resources/functions/election'
import { FLAG } from '../../scripts/lib/rollup'

const county = (id: string, area: number): CountyFeature => ({ type: 'Feature', id, properties: { n: id, l: id, st: id.slice(0, 2), a: area, c: [0, 0] }, geometry: null })

function results(counties: ResultsFile['house']['counties']): ResultsFile {
  const none = { counties: {}, states: {} }
  return { meta: {} as ResultsFile['meta'], house: { counties, states: {} }, senate: none, governor: none, top: { ...none, office: {} } }
}

describe('joining results to counties', () => {
  test('votes, density, margin and how to draw it, per office', () => {
    const counties = [county('48201', 2589.988), county('48301', 100), county('06037', 100)]
    joinResults(counties, results({
      '48201': [600, 400, 1000, 99, 0, 0.2],
      '48301': [90, 0, 100, 100, FLAG.notComparable, null],
    }))
    // 1,000 votes over 1,000 square miles.
    expect(counties[0]!.properties).toMatchObject({ v_house: 1000, d_house: 1, m_house: 0.2, f_house: 1 })
    // Votes, but no margin to colour by.
    expect(counties[1]!.properties).toMatchObject({ v_house: 100, m_house: 0, f_house: 2 })
    // Nothing on the ballot there.
    expect(counties[2]!.properties).toMatchObject({ v_house: 0, f_house: 0 })
    expect(counties[0]!.properties).toMatchObject({ v_senate: 0, f_senate: 0 })
  })
})

describe('style expressions', () => {
  test('height is the office\'s votes, or its density, times a scale', () => {
    expect(heightExpression('senate', 'votes', 0.5)).toEqual(['*', 0.5, ['get', 'v_senate']])
    // Density by its square root, or one needle stands over a flat country.
    expect(heightExpression('senate', 'density', 2)).toEqual(['*', 2, ['sqrt', ['get', 'd_senate']]])
  })

  test('with a state in focus the others lie flat', () => {
    expect(heightExpression('house', 'votes', 0.5, '48')).toEqual(['case', ['==', ['get', 'st'], '48'], ['*', 0.5, ['get', 'v_house']], 0])
  })

  test('colour reads the office\'s own margin and flag', () => {
    const text = JSON.stringify(colorExpression('governor'))
    expect(text).toContain('m_governor')
    expect(text).toContain('f_governor')
    expect(text).toContain('feature-state')
  })
})

describe('what a height is in proportion to', () => {
  test('votes as they are, density by its square root', () => {
    const c = county('36061', 100)
    c.properties.v_house = 400
    c.properties.d_house = 10000
    expect(heightValue(c, 'house', 'votes')).toBe(400)
    expect(metricValue(c, 'house', 'density')).toBe(10000)
    expect(heightValue(c, 'house', 'density')).toBe(100)
  })
})

describe('scale and camera', () => {
  test('the largest value stands the height asked for', () => {
    const metres = metresPerUnit(1_000_000, 6, 200)
    expect(metres * 1_000_000 * pixelsPerMetre(6)).toBeCloseTo(200, 6)
    expect(metresPerUnit(0, 6, 200)).toBe(0)
  })

  test('a wide area is fitted across the view, a tall one down it', () => {
    const wide = viewFor([0, 0, 20, 2], 1000, 800, 0, 1, 1)
    // 20 degrees over 1,000 pixels.
    expect(wide.zoom).toBeCloseTo(Math.log2(1000 / ((20 / 360) * 256)), 1)
    expect(wide.center[1]).toBe(10)

    const tall = viewFor([0, 0, 2, 20], 1000, 800, 0, 1, 1)
    expect(tall.zoom).toBeLessThan(wide.zoom + 1)
    // Tilting foreshortens the ground, so it can be shown larger.
    expect(viewFor([0, 0, 2, 20], 1000, 800, 60, 1, 1).zoom).toBeGreaterThan(tall.zoom)
  })

  test('bounds of several states', () => {
    const s = (b: [number, number, number, number]): any => ({ properties: { b } })
    expect(unionBounds([s([1, 2, 3, 4]), s([0, 3, 2, 9])])).toEqual([0, 2, 3, 9])
  })
})

describe('words', () => {
  test('vote counts', () => {
    expect(formatVotes(1_382_875)).toBe('1.38M')
    expect(formatVotes(12_400_000)).toBe('12.4M')
    expect(formatVotes(784_213)).toBe('784K')
    expect(formatVotes(4_321)).toBe('4.3K')
    expect(formatVotes(932)).toBe('932')
  })

  test('margins', () => {
    expect(formatMargin(0.1237)).toBe('D+12.4')
    expect(formatMargin(-0.03)).toBe('R+3.0')
    expect(formatMargin(0)).toBe('Even')
    expect(formatMargin(null)).toBe('')
  })

  test('notes for what a row is flagged with', () => {
    expect(flagNotes(0, 'house')).toEqual([])
    expect(flagNotes(FLAG.firstRound | FLAG.undecided, 'senate')).toHaveLength(2)
    expect(flagNotes(FLAG.notComparable, 'house')[0]).toContain('no Democrat against a Republican')
  })
})
