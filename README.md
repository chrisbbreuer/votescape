# Votescape

How every county in every state voted in the 2026 midterms, as a 3D map: each
county is a prism as tall as the votes cast there and coloured by who led. `/`
is the country; `/state/tx` is one state on its own.

A [Stacks](https://stacksjs.com) application, drawn with
[ts-maps](https://github.com/stacksjs/ts-maps).

## Getting started

The map needs three things built before it has anything to show. None of them
is built by `./buddy dev`.

```bash
# 1. The map library, as a chunk in public/js. The 3D map uses ts-maps
#    features newer than 0.5.8, so until a release has them, build from a
#    checkout of ts-maps.
TS_MAPS_SOURCE=~/Code/Libraries/ts-maps bun run build:maps

# 2. County and state shapes, from the Census Bureau.
bun run data:geo

# 3. The results. See "The results are not ours to publish" below.
bun run data:results

./buddy dev
```

`./buddy doctor` checks your setup if anything does not start.

## The results are not ours to publish

No openly licensed county-level returns exist yet for this election. Until
they do, `bun run data:results` reads the New York Times' results pages, whose
counts are licensed from The Associated Press. That is for private, local use.
Nothing it fetches is committed: `storage/data` and `public/data/results` are
gitignored, so a fresh checkout has to run it.

**Do not deploy this publicly while that is the source.** A source is one file
in `scripts/sources/` that implements `ResultsSource`, and one line in
`scripts/build-results.ts`; replace it with certified returns (the MIT Election
Lab publishes them a few months after an election) before the site is public.

The count is not finished. Run `bun run data:results --refresh` again after
Alaska's ranked-choice tabulation, Louisiana's December runoffs and each
state's certification. The page says when its numbers were last updated.

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
