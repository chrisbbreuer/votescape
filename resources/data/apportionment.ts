/**
 * The House's seats and the people behind each one, census by census.
 *
 * Written by scripts/build-apportionment.ts from the U.S. Census Bureau's
 * table of apportionment, 1910 to 2020. Do not edit by hand.
 *
 * `perSeat` is the bureau's own figure: a state's apportionment population,
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
  /** Seats from the 2020 census, and the people to each. */
  seats: number
  perSeat: number
  /** The same from the 1910 census. Zero where it was not yet a state. */
  seatsThen: number
  perSeatThen: number
  /** The most seats it has held since 1910, and the census that first gave them. */
  mostSeats: number
  mostSeatsYear: number
}

export const FIRST_CENSUS = 1910
export const LAST_CENSUS = 2020

export const CENSUSES: CensusYear[] = [
  {
    year: 1910,
    population: 92228531,
    seats: 433,
    perSeat: 210328
  },
  {
    year: 1920,
    population: 106021568,
    seats: 435,
    perSeat: 241864
  },
  {
    year: 1930,
    population: 123202660,
    seats: 435,
    perSeat: 280675
  },
  {
    year: 1940,
    population: 132165129,
    seats: 435,
    perSeat: 301164
  },
  {
    year: 1950,
    population: 151325798,
    seats: 435,
    perSeat: 344587
  },
  {
    year: 1960,
    population: 179323175,
    seats: 435,
    perSeat: 410481
  },
  {
    year: 1970,
    population: 203211926,
    seats: 435,
    perSeat: 469088
  },
  {
    year: 1980,
    population: 226545805,
    seats: 435,
    perSeat: 519235
  },
  {
    year: 1990,
    population: 248709873,
    seats: 435,
    perSeat: 572466
  },
  {
    year: 2000,
    population: 281421906,
    seats: 435,
    perSeat: 646952
  },
  {
    year: 2010,
    population: 308745538,
    seats: 435,
    perSeat: 710767
  },
  {
    year: 2020,
    population: 331449281,
    seats: 435,
    perSeat: 761169
  }
]

export const STATE_SEATS: StateSeats[] = [
  {
    code: 'al',
    name: 'Alabama',
    seats: 7,
    perSeat: 718579,
    seatsThen: 10,
    perSeatThen: 213809,
    mostSeats: 10,
    mostSeatsYear: 1910
  },
  {
    code: 'ak',
    name: 'Alaska',
    seats: 1,
    perSeat: 736081,
    seatsThen: 0,
    perSeatThen: 0,
    mostSeats: 1,
    mostSeatsYear: 2020
  },
  {
    code: 'az',
    name: 'Arizona',
    seats: 9,
    perSeat: 795436,
    seatsThen: 0,
    perSeatThen: 0,
    mostSeats: 9,
    mostSeatsYear: 2020
  },
  {
    code: 'ar',
    name: 'Arkansas',
    seats: 4,
    perSeat: 753439,
    seatsThen: 7,
    perSeatThen: 224921,
    mostSeats: 7,
    mostSeatsYear: 1910
  },
  {
    code: 'ca',
    name: 'California',
    seats: 52,
    perSeat: 761091,
    seatsThen: 11,
    perSeatThen: 216051,
    mostSeats: 53,
    mostSeatsYear: 2000
  },
  {
    code: 'co',
    name: 'Colorado',
    seats: 8,
    perSeat: 722771,
    seatsThen: 4,
    perSeatThen: 199643,
    mostSeats: 8,
    mostSeatsYear: 2020
  },
  {
    code: 'ct',
    name: 'Connecticut',
    seats: 5,
    perSeat: 721660,
    seatsThen: 5,
    perSeatThen: 222951,
    mostSeats: 6,
    mostSeatsYear: 1930
  },
  {
    code: 'de',
    name: 'Delaware',
    seats: 1,
    perSeat: 990837,
    seatsThen: 1,
    perSeatThen: 202322,
    mostSeats: 1,
    mostSeatsYear: 2020
  },
  {
    code: 'fl',
    name: 'Florida',
    seats: 28,
    perSeat: 770376,
    seatsThen: 4,
    perSeatThen: 188155,
    mostSeats: 28,
    mostSeatsYear: 2020
  },
  {
    code: 'ga',
    name: 'Georgia',
    seats: 14,
    perSeat: 766091,
    seatsThen: 12,
    perSeatThen: 217427,
    mostSeats: 14,
    mostSeatsYear: 2020
  },
  {
    code: 'hi',
    name: 'Hawaii',
    seats: 2,
    perSeat: 730069,
    seatsThen: 0,
    perSeatThen: 0,
    mostSeats: 2,
    mostSeatsYear: 2020
  },
  {
    code: 'id',
    name: 'Idaho',
    seats: 2,
    perSeat: 920689,
    seatsThen: 2,
    perSeatThen: 161720,
    mostSeats: 2,
    mostSeatsYear: 2020
  },
  {
    code: 'il',
    name: 'Illinois',
    seats: 17,
    perSeat: 754279,
    seatsThen: 27,
    perSeatThen: 208837,
    mostSeats: 27,
    mostSeatsYear: 1910
  },
  {
    code: 'in',
    name: 'Indiana',
    seats: 9,
    perSeat: 754476,
    seatsThen: 13,
    perSeatThen: 207760,
    mostSeats: 13,
    mostSeatsYear: 1910
  },
  {
    code: 'ia',
    name: 'Iowa',
    seats: 4,
    perSeat: 798102,
    seatsThen: 11,
    perSeatThen: 202252,
    mostSeats: 11,
    mostSeatsYear: 1910
  },
  {
    code: 'ks',
    name: 'Kansas',
    seats: 4,
    perSeat: 735216,
    seatsThen: 8,
    perSeatThen: 211369,
    mostSeats: 8,
    mostSeatsYear: 1910
  },
  {
    code: 'ky',
    name: 'Kentucky',
    seats: 6,
    perSeat: 751557,
    seatsThen: 11,
    perSeatThen: 208173,
    mostSeats: 11,
    mostSeatsYear: 1910
  },
  {
    code: 'la',
    name: 'Louisiana',
    seats: 6,
    perSeat: 776911,
    seatsThen: 8,
    perSeatThen: 207049,
    mostSeats: 8,
    mostSeatsYear: 1910
  },
  {
    code: 'me',
    name: 'Maine',
    seats: 2,
    perSeat: 681791,
    seatsThen: 4,
    perSeatThen: 185593,
    mostSeats: 4,
    mostSeatsYear: 1910
  },
  {
    code: 'md',
    name: 'Maryland',
    seats: 8,
    perSeat: 773160,
    seatsThen: 6,
    perSeatThen: 215891,
    mostSeats: 8,
    mostSeatsYear: 2020
  },
  {
    code: 'ma',
    name: 'Massachusetts',
    seats: 9,
    perSeat: 781497,
    seatsThen: 16,
    perSeatThen: 210401,
    mostSeats: 16,
    mostSeatsYear: 1910
  },
  {
    code: 'mi',
    name: 'Michigan',
    seats: 13,
    perSeat: 775726,
    seatsThen: 13,
    perSeatThen: 216167,
    mostSeats: 19,
    mostSeatsYear: 1960
  },
  {
    code: 'mn',
    name: 'Minnesota',
    seats: 8,
    perSeat: 713719,
    seatsThen: 10,
    perSeatThen: 207438,
    mostSeats: 10,
    mostSeatsYear: 1910
  },
  {
    code: 'ms',
    name: 'Mississippi',
    seats: 4,
    perSeat: 740979,
    seatsThen: 8,
    perSeatThen: 224639,
    mostSeats: 8,
    mostSeatsYear: 1910
  },
  {
    code: 'mo',
    name: 'Missouri',
    seats: 8,
    perSeat: 770035,
    seatsThen: 16,
    perSeatThen: 205833,
    mostSeats: 16,
    mostSeatsYear: 1910
  },
  {
    code: 'mt',
    name: 'Montana',
    seats: 2,
    perSeat: 542704,
    seatsThen: 2,
    perSeatThen: 183169,
    mostSeats: 2,
    mostSeatsYear: 2020
  },
  {
    code: 'ne',
    name: 'Nebraska',
    seats: 3,
    perSeat: 654444,
    seatsThen: 6,
    perSeatThen: 198702,
    mostSeats: 6,
    mostSeatsYear: 1910
  },
  {
    code: 'nv',
    name: 'Nevada',
    seats: 4,
    perSeat: 777116,
    seatsThen: 1,
    perSeatThen: 80293,
    mostSeats: 4,
    mostSeatsYear: 2020
  },
  {
    code: 'nh',
    name: 'New Hampshire',
    seats: 2,
    perSeat: 689545,
    seatsThen: 2,
    perSeatThen: 215286,
    mostSeats: 2,
    mostSeatsYear: 2020
  },
  {
    code: 'nj',
    name: 'New Jersey',
    seats: 12,
    perSeat: 774541,
    seatsThen: 12,
    perSeatThen: 211431,
    mostSeats: 15,
    mostSeatsYear: 1960
  },
  {
    code: 'nm',
    name: 'New Mexico',
    seats: 3,
    perSeat: 706740,
    seatsThen: 0,
    perSeatThen: 0,
    mostSeats: 3,
    mostSeatsYear: 2020
  },
  {
    code: 'ny',
    name: 'New York',
    seats: 26,
    perSeat: 777529,
    seatsThen: 43,
    perSeatThen: 211836,
    mostSeats: 45,
    mostSeatsYear: 1930
  },
  {
    code: 'nc',
    name: 'North Carolina',
    seats: 14,
    perSeat: 746711,
    seatsThen: 10,
    perSeatThen: 220629,
    mostSeats: 14,
    mostSeatsYear: 2020
  },
  {
    code: 'nd',
    name: 'North Dakota',
    seats: 1,
    perSeat: 779702,
    seatsThen: 3,
    perSeatThen: 191468,
    mostSeats: 3,
    mostSeatsYear: 1910
  },
  {
    code: 'oh',
    name: 'Ohio',
    seats: 15,
    perSeat: 787257,
    seatsThen: 22,
    perSeatThen: 216687,
    mostSeats: 24,
    mostSeatsYear: 1930
  },
  {
    code: 'ok',
    name: 'Oklahoma',
    seats: 5,
    perSeat: 792703,
    seatsThen: 8,
    perSeatThen: 207144,
    mostSeats: 9,
    mostSeatsYear: 1930
  },
  {
    code: 'or',
    name: 'Oregon',
    seats: 6,
    perSeat: 706917,
    seatsThen: 3,
    perSeatThen: 224255,
    mostSeats: 6,
    mostSeatsYear: 2020
  },
  {
    code: 'pa',
    name: 'Pennsylvania',
    seats: 17,
    perSeat: 765403,
    seatsThen: 36,
    perSeatThen: 212920,
    mostSeats: 36,
    mostSeatsYear: 1910
  },
  {
    code: 'ri',
    name: 'Rhode Island',
    seats: 2,
    perSeat: 549082,
    seatsThen: 3,
    perSeatThen: 180870,
    mostSeats: 3,
    mostSeatsYear: 1910
  },
  {
    code: 'sc',
    name: 'South Carolina',
    seats: 7,
    perSeat: 732102,
    seatsThen: 7,
    perSeatThen: 216486,
    mostSeats: 7,
    mostSeatsYear: 2020
  },
  {
    code: 'sd',
    name: 'South Dakota',
    seats: 1,
    perSeat: 887770,
    seatsThen: 3,
    perSeatThen: 191892,
    mostSeats: 3,
    mostSeatsYear: 1910
  },
  {
    code: 'tn',
    name: 'Tennessee',
    seats: 9,
    perSeat: 768544,
    seatsThen: 10,
    perSeatThen: 218479,
    mostSeats: 10,
    mostSeatsYear: 1910
  },
  {
    code: 'tx',
    name: 'Texas',
    seats: 38,
    perSeat: 767981,
    seatsThen: 18,
    perSeatThen: 216475,
    mostSeats: 38,
    mostSeatsYear: 2020
  },
  {
    code: 'ut',
    name: 'Utah',
    seats: 4,
    perSeat: 818813,
    seatsThen: 2,
    perSeatThen: 185932,
    mostSeats: 4,
    mostSeatsYear: 2020
  },
  {
    code: 'vt',
    name: 'Vermont',
    seats: 1,
    perSeat: 643503,
    seatsThen: 2,
    perSeatThen: 177978,
    mostSeats: 2,
    mostSeatsYear: 1910
  },
  {
    code: 'va',
    name: 'Virginia',
    seats: 11,
    perSeat: 786777,
    seatsThen: 10,
    perSeatThen: 206161,
    mostSeats: 11,
    mostSeatsYear: 2020
  },
  {
    code: 'wa',
    name: 'Washington',
    seats: 10,
    perSeat: 771595,
    seatsThen: 5,
    perSeatThen: 228027,
    mostSeats: 10,
    mostSeatsYear: 2020
  },
  {
    code: 'wv',
    name: 'West Virginia',
    seats: 2,
    perSeat: 897523,
    seatsThen: 6,
    perSeatThen: 203520,
    mostSeats: 6,
    mostSeatsYear: 1910
  },
  {
    code: 'wi',
    name: 'Wisconsin',
    seats: 8,
    perSeat: 737184,
    seatsThen: 11,
    perSeatThen: 212078,
    mostSeats: 11,
    mostSeatsYear: 1910
  },
  {
    code: 'wy',
    name: 'Wyoming',
    seats: 1,
    perSeat: 577719,
    seatsThen: 1,
    perSeatThen: 144658,
    mostSeats: 1,
    mostSeatsYear: 2020
  }
]
