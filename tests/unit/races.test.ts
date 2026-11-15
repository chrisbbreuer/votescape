import { describe, expect, test } from 'bun:test'
import { electionFor } from '../../resources/data/elections'
import { articleTitle, articleUrl, officeFromLabel, raceInfo } from '../../resources/functions/races'

describe('the article for a race', () => {
  test('the country\'s races are named as Wikipedia names them', () => {
    expect(articleTitle(2024, 'president')).toBe('2024 United States presidential election')
    expect(articleTitle(2022, 'house')).toBe('2022 United States House of Representatives elections')
    expect(articleTitle(2018, 'senate')).toBe('2018 United States Senate elections')
    expect(articleTitle(2026, 'governor')).toBe('2026 United States gubernatorial elections')
    expect(articleTitle(2026, 'top')).toBe('2026 United States elections')
  })

  test('a state\'s races are named for the state', () => {
    expect(articleTitle(2020, 'president', 'Georgia')).toBe('2020 United States presidential election in Georgia')
    expect(articleTitle(2022, 'senate', 'Ohio')).toBe('2022 United States Senate election in Ohio')
    expect(articleTitle(2022, 'governor', 'Texas')).toBe('2022 Texas gubernatorial election')
    expect(articleTitle(2024, 'house', 'Texas')).toBe('2024 United States House of Representatives elections in Texas')
  })

  test('a state with one seat has an election, not elections', () => {
    expect(articleTitle(2024, 'house', 'Wyoming')).toBe('2024 United States House of Representatives election in Wyoming')
    expect(articleTitle(2020, 'house', 'Montana')).toBe('2020 United States House of Representatives election in Montana')
    expect(articleTitle(2022, 'house', 'Montana')).toBe('2022 United States House of Representatives elections in Montana')
  })

  test('the state of Washington and the District are told apart from the city', () => {
    expect(articleTitle(2024, 'president', 'Washington')).toBe('2024 United States presidential election in Washington (state)')
    expect(articleTitle(2024, 'senate', 'Washington')).toBe('2024 United States Senate election in Washington')
    expect(articleTitle(2024, 'president', 'District of Columbia')).toBe('2024 United States presidential election in the District of Columbia')
  })

  test('a link opens the article of that title', () => {
    expect(articleUrl('2024 Texas gubernatorial election')).toBe('https://en.wikipedia.org/wiki/2024_Texas_gubernatorial_election')
    expect(articleUrl('2024 United States presidential election in Washington (state)')).toBe('https://en.wikipedia.org/wiki/2024_United_States_presidential_election_in_Washington_(state)')
  })
})

describe('what a race was', () => {
  test('an office is read back from its label, special or not', () => {
    expect(officeFromLabel('U.S. Senate (special)')).toBe('senate')
    expect(officeFromLabel('Top of ticket')).toBe('top')
    expect(officeFromLabel('Mayor')).toBeUndefined()
  })

  test('the country\'s race links to its article and says when it was held', () => {
    const info = raceInfo(electionFor(2024)!, 'president')
    expect(info.date).toBe('November 5, 2024')
    expect(info.text).toContain('Donald Trump beat Kamala Harris, 312 electoral votes to 226.')
    expect(info.links.map(l => l.label)).toEqual(['Wikipedia'])
  })

  test('a state\'s race links to its own article and the national one', () => {
    const info = raceInfo(electionFor(2022)!, 'senate', 'Georgia')
    expect(info.links.map(l => l.title)).toEqual(['2022 United States Senate election in Georgia', '2022 United States Senate elections'])
    expect(info.links[1]!.label).toBe('The national race')
  })

  test('an election still being counted is given no ending', () => {
    for (const office of ['house', 'senate', 'governor', 'top'] as const)
      expect(raceInfo(electionFor(2026)!, office).text).not.toMatch(/beat|won/)
  })

  test('nothing said has a dash a reader would see as a tell', () => {
    for (const year of [2016, 2018, 2020, 2022, 2024, 2026]) {
      const election = electionFor(year)!
      for (const office of election.offices) {
        expect(raceInfo(election, office).text).not.toMatch(/[–—]/)
        expect(raceInfo(election, office, 'Ohio').text).not.toMatch(/[–—]/)
      }
    }
  })
})
