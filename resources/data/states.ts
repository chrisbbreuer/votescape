/**
 * The fifty states and D.C., for the links to each one's page.
 *
 * Written out rather than read from the geometry so a page can list them
 * without loading it. `code` is the postal abbreviation in lower case, which
 * is how a state's page is addressed: `/state/tx`.
 */
export interface StateLink {
  code: string
  name: string
  fips: string
}

export const STATES: StateLink[] = [
  { code: 'al', name: 'Alabama', fips: '01' },
  { code: 'ak', name: 'Alaska', fips: '02' },
  { code: 'az', name: 'Arizona', fips: '04' },
  { code: 'ar', name: 'Arkansas', fips: '05' },
  { code: 'ca', name: 'California', fips: '06' },
  { code: 'co', name: 'Colorado', fips: '08' },
  { code: 'ct', name: 'Connecticut', fips: '09' },
  { code: 'de', name: 'Delaware', fips: '10' },
  { code: 'dc', name: 'District of Columbia', fips: '11' },
  { code: 'fl', name: 'Florida', fips: '12' },
  { code: 'ga', name: 'Georgia', fips: '13' },
  { code: 'hi', name: 'Hawaii', fips: '15' },
  { code: 'id', name: 'Idaho', fips: '16' },
  { code: 'il', name: 'Illinois', fips: '17' },
  { code: 'in', name: 'Indiana', fips: '18' },
  { code: 'ia', name: 'Iowa', fips: '19' },
  { code: 'ks', name: 'Kansas', fips: '20' },
  { code: 'ky', name: 'Kentucky', fips: '21' },
  { code: 'la', name: 'Louisiana', fips: '22' },
  { code: 'me', name: 'Maine', fips: '23' },
  { code: 'md', name: 'Maryland', fips: '24' },
  { code: 'ma', name: 'Massachusetts', fips: '25' },
  { code: 'mi', name: 'Michigan', fips: '26' },
  { code: 'mn', name: 'Minnesota', fips: '27' },
  { code: 'ms', name: 'Mississippi', fips: '28' },
  { code: 'mo', name: 'Missouri', fips: '29' },
  { code: 'mt', name: 'Montana', fips: '30' },
  { code: 'ne', name: 'Nebraska', fips: '31' },
  { code: 'nv', name: 'Nevada', fips: '32' },
  { code: 'nh', name: 'New Hampshire', fips: '33' },
  { code: 'nj', name: 'New Jersey', fips: '34' },
  { code: 'nm', name: 'New Mexico', fips: '35' },
  { code: 'ny', name: 'New York', fips: '36' },
  { code: 'nc', name: 'North Carolina', fips: '37' },
  { code: 'nd', name: 'North Dakota', fips: '38' },
  { code: 'oh', name: 'Ohio', fips: '39' },
  { code: 'ok', name: 'Oklahoma', fips: '40' },
  { code: 'or', name: 'Oregon', fips: '41' },
  { code: 'pa', name: 'Pennsylvania', fips: '42' },
  { code: 'ri', name: 'Rhode Island', fips: '44' },
  { code: 'sc', name: 'South Carolina', fips: '45' },
  { code: 'sd', name: 'South Dakota', fips: '46' },
  { code: 'tn', name: 'Tennessee', fips: '47' },
  { code: 'tx', name: 'Texas', fips: '48' },
  { code: 'ut', name: 'Utah', fips: '49' },
  { code: 'vt', name: 'Vermont', fips: '50' },
  { code: 'va', name: 'Virginia', fips: '51' },
  { code: 'wa', name: 'Washington', fips: '53' },
  { code: 'wv', name: 'West Virginia', fips: '54' },
  { code: 'wi', name: 'Wisconsin', fips: '55' },
  { code: 'wy', name: 'Wyoming', fips: '56' },
]

/** The state a code names, whatever its case; undefined for none. */
export function stateByCode(code: string): StateLink | undefined {
  const wanted = code.toLowerCase()
  return STATES.find(s => s.code === wanted)
}
