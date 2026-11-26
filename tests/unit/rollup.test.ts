import type { Candidate, Contest, UnitCount } from '../../scripts/sources/types'
import { describe, expect, test } from 'bun:test'
import { comparable, oneEach, countyId, countyUnits, FLAG, rollup, rollupOffice, sides } from '../../scripts/lib/rollup'
import { contestFrom, keep } from '../../scripts/sources/nyt'

// Small made-up contests. The numbers are chosen to be easy to add up, not to
// resemble any real count.

const D = (id: string): Candidate => ({ id, name: `Dem ${id}`, party: 'D', partyLabel: 'Democrat', incumbent: false })
const R = (id: string): Candidate => ({ id, name: `Rep ${id}`, party: 'R', partyLabel: 'Republican', incumbent: false })
const O = (id: string, label = 'Independent'): Candidate => ({ id, name: `Other ${id}`, party: 'O', partyLabel: label, incumbent: false })

function unit(level: UnitCount['level'], name: string, votes: Record<string, number>, extra: Partial<UnitCount> = {}): UnitCount {
  return { level, stateFips: '48', name, votes, total: Object.values(votes).reduce((a, b) => a + b, 0), pctReporting: 100, ...extra }
}

function contest(over: Partial<Contest> & Pick<Contest, 'candidates' | 'units'>): Contest {
  return {
    id: 'TX-test',
    office: 'senate',
    state: 'TX',
    special: false,
    slug: 'results-texas-test',
    stateFips: '48',
    kind: 'general',
    uncontested: false,
    status: 'called',
    winners: [],
    updatedAt: '2026-11-10T00:00:00Z',
    ...over,
  }
}

const KNOWN = new Set(['48001', '48003', '02HD08', '09110', '25025'])
const TOWNS = { Stamford: '09110' }

describe('sides', () => {
  test('Democrats on one, Republicans on the other', () => {
    const c = contest({ candidates: [D('a'), R('b'), O('c')], units: [] })
    expect(sides(c)).toEqual({ dem: ['a'], rep: ['b'] })
    expect(comparable(c)).toBe(true)
  })

  test('every candidate of a party, where a ballot has several', () => {
    const c = contest({ candidates: [D('a'), D('a2'), R('b')], units: [] })
    expect(sides(c).dem).toEqual(['a', 'a2'])
  })

  test('a statewide race with no Democrat takes the leading other candidate as that side', () => {
    const c = contest({
      candidates: [R('b'), O('ind'), O('lib', 'Libertarian')],
      units: [unit('state', 'Nebraska', { b: 500, ind: 450, lib: 50 })],
    })
    const s = sides(c)
    expect(s.dem).toEqual(['ind'])
    expect(s.standIn).toEqual({ side: 'dem', candidate: O('ind') })
    expect(comparable(c)).toBe(true)
  })

  test('a House seat is given no stand-in, and is not comparable without both parties', () => {
    const c = contest({ office: 'house', candidates: [D('a'), O('ind')], units: [unit('state', 'Texas', { a: 60, ind: 40 })] })
    expect(sides(c)).toEqual({ dem: ['a'], rep: [] })
    expect(comparable(c)).toBe(false)
  })

  test('an uncontested seat is not comparable', () => {
    expect(comparable(contest({ uncontested: true, candidates: [D('a'), R('b')], units: [] }))).toBe(false)
  })
})

describe('which units are counties', () => {
  test('counties, where a state reports them, and not their parts again', () => {
    const c = contest({
      candidates: [D('a'), R('b')],
      units: [
        unit('state', 'Illinois', { a: 100, b: 80 }),
        unit('county', 'Cook', { a: 70, b: 30 }, { countyFips: '031' }),
        unit('other', 'Chicago', { a: 50, b: 10 }, { countyFips: '031' }),
      ],
    })
    expect(countyUnits(c).map(u => u.name)).toEqual(['Cook'])
  })

  test('towns where there are no counties, and house districts in Alaska', () => {
    const towns = contest({ candidates: [], units: [unit('state', 'Vermont', {}), unit('town', 'Burlington', {}), unit('other', 'Ward 1', {})] })
    expect(countyUnits(towns).map(u => u.name)).toEqual(['Burlington'])
    const districts = contest({ candidates: [], units: [unit('state', 'Alaska', {}), unit('district', 'State House District 8', {}), unit('other', 'Overseas absentee', {})] })
    expect(countyUnits(districts).map(u => u.name)).toEqual(['State House District 8'])
  })

  test('ids: a county, a town in its county, a Connecticut town in its region, an Alaska district', () => {
    expect(countyId(unit('county', 'Anderson', {}, { countyFips: '001' }), TOWNS)).toBe('48001')
    expect(countyId(unit('town', 'Boston', {}, { stateFips: '25', countyFips: '025' }), TOWNS)).toBe('25025')
    // Reported under Fairfield County, which Connecticut no longer has.
    expect(countyId(unit('town', 'Stamford', {}, { stateFips: '09', countyFips: '001' }), TOWNS)).toBe('09110')
    expect(countyId(unit('town', 'Nowhere', {}, { stateFips: '09', countyFips: '001' }), TOWNS)).toBeNull()
    expect(countyId(unit('district', 'State House District 8', {}, { stateFips: '02', district: '8' }), TOWNS)).toBe('02HD08')
    expect(countyId(unit('other', 'Overseas absentee', {}), TOWNS)).toBeNull()
  })
})

describe('rolling an office up', () => {
  test('a statewide race: a row per county and a summary for the state', () => {
    const c = contest({
      winners: ['a'],
      candidates: [D('a'), R('b'), O('c')],
      units: [
        unit('state', 'Texas', { a: 600, b: 380, c: 20 }, { pctReporting: 99 }),
        unit('county', 'Anderson', { a: 100, b: 300, c: 0 }, { countyFips: '001', pctReporting: 100 }),
        unit('county', 'Andrews', { a: 500, b: 80, c: 20 }, { countyFips: '003', pctReporting: 98 }),
      ],
    })
    const { counties, states, problems } = rollupOffice([c], TOWNS, KNOWN)
    expect(problems).toEqual([])
    expect(counties['48001']).toEqual([100, 300, 400, 100, 0, -0.5])
    expect(counties['48003']).toEqual([500, 80, 600, 98, 0, 0.7241])
    expect(states['48']).toMatchObject({ state: 'TX', dem: 600, rep: 380, total: 1000, pct: 99, demName: 'Dem a', repName: 'Rep b', winner: 'dem', winnerName: 'Dem a', status: 'called' })
  })

  test('House seats: a county in two districts gets both, and a state counts its seats', () => {
    const tx1 = contest({
      id: 'TX-1',
      office: 'house',
      district: '1',
      winners: ['b'],
      candidates: [D('a'), R('b')],
      units: [unit('state', 'Texas', { a: 150, b: 250 }), unit('county', 'Anderson', { a: 100, b: 200 }, { countyFips: '001' }), unit('county', 'Andrews', { a: 50, b: 50 }, { countyFips: '003' })],
    })
    const tx2 = contest({
      id: 'TX-2',
      office: 'house',
      district: '2',
      winners: ['c'],
      candidates: [D('c'), R('d')],
      units: [unit('state', 'Texas', { c: 300, d: 100 }), unit('county', 'Andrews', { c: 300, d: 100 }, { countyFips: '003' })],
    })
    const { counties, states } = rollupOffice([tx1, tx2], TOWNS, KNOWN)
    expect(counties['48003']).toEqual([350, 150, 500, 100, 0, 0.4])
    expect(states['48']!.seats).toEqual({ dem: 1, rep: 1, other: 0, open: 0 })
    expect(states['48']).toMatchObject({ dem: 450, rep: 350, total: 800 })
  })

  test('a county whose votes were mostly cast with no Republican to choose is flagged, and has no margin', () => {
    const contested = contest({
      id: 'TX-1',
      office: 'house',
      candidates: [D('a'), R('b')],
      units: [unit('state', 'Texas', { a: 60, b: 40 }), unit('county', 'Anderson', { a: 60, b: 40 }, { countyFips: '001' })],
    })
    const sameParty = contest({
      id: 'TX-2',
      office: 'house',
      kind: 'all-party',
      candidates: [D('c'), D('d')],
      units: [unit('state', 'Texas', { c: 500, d: 400 }), unit('county', 'Anderson', { c: 500, d: 400 }, { countyFips: '001' })],
    })
    const [dem, rep, total, , flags, margin] = rollupOffice([contested, sameParty], TOWNS, KNOWN).counties['48001']!
    expect([dem, rep, total]).toEqual([960, 40, 1000])
    expect(flags & FLAG.notComparable).toBe(FLAG.notComparable)
    expect(flags & FLAG.allParty).toBe(FLAG.allParty)
    expect(margin).toBeNull()
  })

  test('where most votes were contested, the margin is that of the contested part', () => {
    const contested = contest({
      id: 'TX-1',
      office: 'house',
      candidates: [D('a'), R('b')],
      units: [unit('state', 'Texas', { a: 600, b: 400 }), unit('county', 'Anderson', { a: 600, b: 400 }, { countyFips: '001' })],
    })
    const noRepublican = contest({
      id: 'TX-2',
      office: 'house',
      candidates: [D('c'), O('ind')],
      units: [unit('state', 'Texas', { c: 80, ind: 20 }), unit('county', 'Anderson', { c: 80, ind: 20 }, { countyFips: '001' })],
    })
    const row = rollupOffice([contested, noRepublican], TOWNS, KNOWN).counties['48001']!
    expect(row[4] & FLAG.notComparable).toBe(0)
    // 600 against 400, not 680 against 400.
    expect(row[5]).toBe(0.2)
  })

  test('flags carry what kind of count it is', () => {
    const ranked = contest({
      kind: 'ranked-choice',
      status: 'uncalled',
      candidates: [R('b'), O('ind')],
      units: [unit('state', 'Alaska', { b: 50, ind: 45 }, { stateFips: '02' }), unit('district', 'State House District 8', { b: 50, ind: 45 }, { stateFips: '02', district: '8' })],
      stateFips: '02',
      state: 'AK',
    })
    const { counties, states } = rollupOffice([ranked], TOWNS, KNOWN)
    const flags = counties['02HD08']![4]
    expect(flags).toBe(FLAG.standIn | FLAG.firstRound | FLAG.undecided)
    expect(states['02']).toMatchObject({ demParty: 'Independent', demName: 'Other ind', status: 'uncalled' })
    expect(states['02']!.winner).toBeUndefined()
  })

  test('ranked-choice statewide and district counts use the same first round', () => {
    const ref = { id: 'AK-test', state: 'AK', office: 'house', district: '0', special: false, slug: 'results-alaska-test' } as const
    const candidateVotes = (a: number, b: number, c: number) => [
      { nyt_id: 'a', nyt_candidate_race_id: 1, votes: { total: a } },
      { nyt_id: 'b', nyt_candidate_race_id: 2, votes: { total: b } },
      { nyt_id: 'c', nyt_candidate_race_id: 3, votes: { total: c } },
    ]
    const race = contestFrom(ref, keep({
      nyt_id: ref.id,
      tabulation_method: 'ranked-choice',
      race_call_status: 'called',
      outcome: { won: ['b'] },
      candidate_metadata: {
        a: { nyt_candidate_race_id: 1, party: { nyt_id: 'DEM', name: 'Democrat' } },
        b: { nyt_candidate_race_id: 2, party: { nyt_id: 'GOP', name: 'Republican' } },
        c: { nyt_candidate_race_id: 3 },
      },
      rounds: [
        { round_type: 'initial', total_votes: 2000, candidates: [{ nyt_candidate_race_id: 3, total: 280 }, { nyt_candidate_race_id: 1, total: 880 }, { nyt_candidate_race_id: 2, total: 840 }] },
        { round_type: 'final', total_votes: 1830, candidates: [{ nyt_candidate_race_id: 1, total: 900 }, { nyt_candidate_race_id: 2, total: 930 }] },
      ],
      reporting_units: [
        { name: 'Alaska', level: 'state', fips_state: '02', total_votes: 1830, candidates: candidateVotes(900, 930, 0) },
        { name: 'State House District 8', level: 'state_house_district', fips_state: '02', fips_suffix: '008', total_votes: 1990, candidates: candidateVotes(880, 840, 270) },
      ],
    }))
    const { counties, states, problems } = rollupOffice([race], TOWNS, KNOWN)
    expect(problems).toEqual([])
    expect(states['02']).toMatchObject({ dem: 880, rep: 840, total: 2000, seats: { dem: 0, rep: 1 } })
    expect(counties['02HD08']?.slice(0, 3)).toEqual([880, 840, 1990])
  })

  test('a county that is not on the map, or counties that do not add up, are problems', () => {
    const stray = contest({
      candidates: [D('a'), R('b')],
      units: [unit('state', 'Texas', { a: 100, b: 100 }), unit('county', 'Atlantis', { a: 100, b: 100 }, { countyFips: '999' })],
    })
    expect(rollupOffice([stray], TOWNS, KNOWN).problems.map(p => p.message)).toEqual([
      'Atlantis (county) is not a county on the map',
      'counties add up to 0, the state to 200',
    ])

    const short = contest({
      candidates: [D('a'), R('b')],
      units: [unit('state', 'Texas', { a: 5000, b: 5000 }), unit('county', 'Anderson', { a: 4000, b: 4000 }, { countyFips: '001' })],
    })
    expect(rollupOffice([short], TOWNS, KNOWN).problems).toHaveLength(1)

    // A few overseas ballots given to no county are not one.
    const overseas = contest({
      candidates: [D('a'), R('b')],
      units: [unit('state', 'Texas', { a: 5010, b: 5000 }), unit('county', 'Anderson', { a: 5000, b: 5000 }, { countyFips: '001' })],
    })
    expect(rollupOffice([overseas], TOWNS, KNOWN).problems).toEqual([])
  })
})

describe('the top of the ticket', () => {
  test('Senate where there was one, else governor, else House', () => {
    const state = (fips: string, usps: string, office: Contest['office']): Contest => contest({
      id: `${usps}-${office}`,
      office,
      state: usps,
      stateFips: fips,
      candidates: [D('a'), R('b')],
      units: [unit('state', usps, { a: 10, b: 20 }, { stateFips: fips }), unit('county', 'One', { a: 10, b: 20 }, { stateFips: fips, countyFips: '001' })],
    })
    const known = new Set(['48001', '06001', '53001'])
    const { results, problems } = rollup(
      [state('48', 'TX', 'senate'), state('48', 'TX', 'governor'), state('48', 'TX', 'house'), state('06', 'CA', 'governor'), state('06', 'CA', 'house'), state('53', 'WA', 'house')],
      {},
      known,
    )
    expect(problems).toEqual([])
    expect(results.top.office).toEqual({ '48': 'senate', '06': 'governor', '53': 'house' })
    expect(Object.keys(results.top.counties).sort()).toEqual(['06001', '48001', '53001'])
    expect(Object.keys(results.senate.counties)).toEqual(['48001'])
    expect(Object.keys(results.governor.counties).sort()).toEqual(['06001', '48001'])
  })
})

describe('a presidential year', () => {
  test('the presidency is rolled up, and there is no top of the ticket', () => {
    const { results, problems } = rollup([
      contest({ office: 'president', candidates: [D('h'), R('t')], units: [unit('state', 'Texas', { h: 60, t: 40 }), unit('county', 'Harris', { h: 60, t: 40 }, { countyFips: '201' })] }),
    ], {}, new Set(['48201']))
    expect(problems).toEqual([])
    expect(results.president?.counties['48201']).toEqual([60, 40, 100, 100, 0, 0.2])
    expect(results.top).toBeUndefined()
  })
})

describe('a contest counted for the state alone', () => {
  test('its votes count for the state, stand on no county, and are no problem', () => {
    const whole = contest({ office: 'president', countyless: true, candidates: [D('h'), R('t')], units: [unit('state', 'Texas', { h: 60, t: 40 })] })
    const { results, problems } = rollup([whole], {}, new Set(['48201']))
    expect(problems).toEqual([])
    expect(results.president?.counties).toEqual({})
    expect(results.president?.states['48']).toMatchObject({ dem: 60, rep: 40, total: 100, countyless: true })
  })

  test('one uncontested seat with no counties does not make a state of them', () => {
    const { results } = rollup([
      contest({ id: 'a', office: 'house', district: '1', candidates: [D('a'), R('b')], units: [unit('state', 'Texas', { a: 60, b: 40 }), unit('county', 'Harris', { a: 60, b: 40 }, { countyFips: '201' })] }),
      contest({ id: 'b', office: 'house', district: '2', countyless: true, uncontested: true, candidates: [D('c')], units: [unit('state', 'Texas', {})] }),
    ], {}, new Set(['48201']))
    expect(results.house.states['48']?.countyless).toBeUndefined()
  })
})

describe('two elections for one office in a state', () => {
  test('the regular one stands for the state, not both added together', () => {
    const regular = contest({ id: 'regular', office: 'senate', candidates: [D('a'), R('b')], units: [unit('state', 'Texas', { a: 60, b: 40 })], countyless: true })
    const special = contest({ id: 'special', office: 'senate', special: true, candidates: [D('c'), R('d')], units: [unit('state', 'Texas', { c: 500, d: 400 })], countyless: true })
    expect(oneEach([special, regular]).map(c => c.id)).toEqual(['regular'])
    expect(rollup([special, regular], {}, new Set()).results.senate.states['48']?.total).toBe(100)
  })
})
