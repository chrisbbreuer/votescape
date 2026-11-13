# Votescape

How every county in every state voted in the 2026 midterms, as a 3D map: each
county is a prism as tall as the votes cast there and coloured by who led. `/`
is the country; `/state/tx` is one state on its own.

A [Stacks](https://stacksjs.com) application, drawn with
[ts-maps](https://github.com/stacksjs/ts-maps).

## Getting started

The county and state shapes and the map library are committed. The results
are not, so a fresh checkout builds them before the map has numbers to show.

```bash
# The results. See "Where the results come from" below.
bun run data:results

./buddy dev
```

Two more scripts rebuild what is committed, when its source changes:

```bash
# The map library, as a chunk in public/js, from the installed ts-maps
# (0.5.9 or newer). Run it after upgrading ts-maps. To try an unreleased
# ts-maps, point TS_MAPS_SOURCE at a checkout of it.
bun run build:maps

# County and state shapes, from the Census Bureau.
bun run data:geo
```

`./buddy doctor` checks your setup if anything does not start.

## Where the results come from

No openly licensed county-level returns exist yet for this election. Until
they do, `bun run data:results` reads the New York Times' results pages, whose
counts are licensed from The Associated Press. The site shows them as
unofficial and credits the source in its legend.

Nothing the script fetches is committed: `storage/data` and
`public/data/results` are gitignored, so a fresh checkout has to run it, and a
deploy ships the results built on the machine it runs from.

That feed is a stopgap, and publishing from it is a risk the site is carrying
knowingly. A source is one file in `scripts/sources/` that implements
`ResultsSource`, and one line in `scripts/build-results.ts`; replace it with
certified returns (the MIT Election Lab publishes them a few months after an
election) as soon as they exist.

The count is not finished. Run `bun run data:results --refresh` again after
Alaska's ranked-choice tabulation, Louisiana's December runoffs and each
state's certification. The page says when its numbers were last updated.

## Deploying

votescape.org runs on the shared `stacks` server, with its DNS at Porkbun
(`config/cloud.ts`). One command fetches the results again, checks the
checkout is fit to ship, deploys it, and then asks the live site for every
page and file the map needs:

```bash
bun run deploy
```

The steps on their own are `bun run check:release`, `./buddy deploy --prod --yes`
and `bun run smoke` (which takes an address: `bun run smoke http://localhost:3290`).

The deploy publishes DNS only when `PORKBUN_API_KEY` and `PORKBUN_SECRET_KEY`
are in the environment, and skips it otherwise, which is fine once the records
exist. It needed `HCLOUD_TOKEN` once, to find the server; `storage/cloud` on
the machine that first deployed remembers it.

Between deploys the server keeps the numbers current itself: `app/Scheduler.ts`
runs the results build every six hours and writes over the file the map reads.

The GitHub deploy workflow does nothing until its secrets are set, and a
checkout in CI has no results to ship, so deploys are run from a machine.

## How the map is put together

- `scripts/build-geo.ts` projects every county to the Albers USA layout
  (Alaska and Hawaii inset) and writes it as made-up coordinates near the
  equator, which is why there is no basemap under the map. Alaska is drawn by
  state house district and Connecticut by planning region, because that is how
  each reports.
- `scripts/lib/rollup.ts` turns contests into a row per county for the House,
  the Senate, governor, and each state's most prominent race.
- `resources/composables/useElectionMap.ts` is everything that touches
  ts-maps; `resources/functions/election.ts` is what the numbers mean.
- `resources/components/ElectionMap.stx` is the page.

## Everyday commands

| Command | What it does |
|---|---|
| `./buddy dev` | Start the development servers |
| `./buddy migrate` | Apply pending database migrations |
| `./buddy test` | Run the test suite |
| `./buddy typecheck` | Type check `app/`, `config/`, `resources/` and `routes/` |
| `./buddy lint` | Lint, and `./buddy lint:fix` to fix what can be fixed |
| `./buddy upgrade` | Move to the latest Stacks release |
| `./buddy list` | Every other command |

## Where things live

- `app/`, `resources/`, `routes/`, `database/`: your application.
- `config/`: every setting, one typed file per subsystem. System dependencies
  are declared in `config/deps.ts`, and `deps.yaml` is generated from it.
- `storage/framework/defaults`: the framework's default models, actions, views
  and routes. It is a gitignored link to `node_modules/@stacksjs/defaults`, so
  it upgrades with the `stacks` dependency. Override any default by creating the
  same path under `app/` or `resources/`, or run `./buddy publish:defaults` to
  commit a copy of the whole tree instead.

Read more at [stacksjs.com/docs](https://stacksjs.com/docs).
