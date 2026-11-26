# Votescape Changelog

## v0.0.1

## ✨ Features

- Votescape's own mailbox, hello@votescape.org, made by the deploy ([a1c7d7c](https://github.com/chrisbbreuer/votescape/commit/a1c7d7c)) _(by Chris)_
- connected to StatusHQ and CommsHQ, with a signup for word of new results ([36e4090](https://github.com/chrisbbreuer/votescape/commit/36e4090)) _(by Chris)_
- move votescape.org's zone to Cloudflare ([9671f15](https://github.com/chrisbbreuer/votescape/commit/9671f15)) _(by Chris)_
- a page on how many people a House seat stands for, from 1910 to now ([0873bf0](https://github.com/chrisbbreuer/votescape/commit/0873bf0)) _(by Chris)_
- what each race decided with its Wikipedia article, and a phone layout that gives the map its room ([426b5c2](https://github.com/chrisbbreuer/votescape/commit/426b5c2)) _(by Chris)_
- serve the zone and the edge cache from Cloudflare, as a dry run first ([94b1052](https://github.com/chrisbbreuer/votescape/commit/94b1052)) _(by Chris)_
- every election from 2016 to 2026, a trackpad that pans and pinches, and a phone layout that stacks ([4d935cc](https://github.com/chrisbbreuer/votescape/commit/4d935cc)) _(by Chris)_
- a link preview card for every page, and fuller meta tags ([b1a7a42](https://github.com/chrisbbreuer/votescape/commit/b1a7a42)) _(by Chris)_
- a share menu, and a map that fits a phone either way up ([d3cfe15](https://github.com/chrisbbreuer/votescape/commit/d3cfe15)) _(by Chris)_
- wire error reporting, analytics and a refresh heartbeat, off until keys are set ([cc31a2f](https://github.com/chrisbbreuer/votescape/commit/cc31a2f)) _(by Chris)_
- find a county, read the results as a table, link to a county ([a57bf7a](https://github.com/chrisbbreuer/votescape/commit/a57bf7a)) _(by Chris)_
- every state's page in the sitemap, and room for the Pacific towers ([f8d9a63](https://github.com/chrisbbreuer/votescape/commit/f8d9a63)) _(by Chris)_
- a page fit for phones, with controls, a share card and an about page ([690fa8a](https://github.com/chrisbbreuer/votescape/commit/690fa8a)) _(by Chris)_
- the 3D map, for the country and for each state ([eca7de1](https://github.com/chrisbbreuer/votescape/commit/eca7de1)) _(by Chris)_
- build the map's geometry and the 2026 results ([8a1c6db](https://github.com/chrisbbreuer/votescape/commit/8a1c6db)) _(by Chris)_

## 🐛 Bug Fixes

- record Votescape as the Bun lockfile workspace root ([47b682d](https://github.com/chrisbbreuer/votescape/commit/47b682d)) _(by Chris)_
- use first-round statewide results for ranked-choice races ([61cdb32](https://github.com/chrisbbreuer/votescape/commit/61cdb32)) _(by Chris)_
- drop the empty API routes file, which the deploy rightly refuses ([4f01cf9](https://github.com/chrisbbreuer/votescape/commit/4f01cf9)) _(by Chris)_
- allow Cloudflare's Web Analytics beacon, which the edge adds to every page ([baf1557](https://github.com/chrisbbreuer/votescape/commit/baf1557)) _(by Chris)_
- keep the results file for five minutes, not for good ([1c24195](https://github.com/chrisbbreuer/votescape/commit/1c24195)) _(by Chris)_

## 📝 Documentation

- the site is public, and how it is deployed ([4e122db](https://github.com/chrisbbreuer/votescape/commit/4e122db)) _(by Chris)_

## 🔧 Chores

- **deps**: stacks 0.75.628 ([1bbea4c](https://github.com/chrisbbreuer/votescape/commit/1bbea4c)) _(by Chris Breuer)_
- **deps**: stacks 0.75.616 ([57b1652](https://github.com/chrisbbreuer/votescape/commit/57b1652)) _(by Chris)_
- **deps**: stacks 0.75.615, which reaches the app's own mail host unprompted ([345c57e](https://github.com/chrisbbreuer/votescape/commit/345c57e)) _(by Chris)_
- **deps**: one ts-cloud for every framework package ([4a5e5e3](https://github.com/chrisbbreuer/votescape/commit/4a5e5e3)) _(by Chris)_
- **deps**: ts-cloud 0.16.139, which finds the DNS provider that serves the zone ([af334a7](https://github.com/chrisbbreuer/votescape/commit/af334a7)) _(by Chris)_
- say in the production env where the site is and who its mail is from ([4e92ee4](https://github.com/chrisbbreuer/votescape/commit/4e92ee4)) _(by Chris)_
- bring the pantry lockfile and the generated database types up to date ([305d84e](https://github.com/chrisbbreuer/votescape/commit/305d84e)) _(by Chris)_
- **deps**: move to stacks 0.75.604 ([5322806](https://github.com/chrisbbreuer/votescape/commit/5322806)) _(by Chris)_
- **deps**: move to stacks 0.75.602 ([1a338c0](https://github.com/chrisbbreuer/votescape/commit/1a338c0)) _(by Chris)_
- the BugHQ, LogHQ and AnalyticsHQ keys for production, encrypted ([d0c35d3](https://github.com/chrisbbreuer/votescape/commit/d0c35d3)) _(by Chris)_
- the Hetzner token the deploy reads the server with, encrypted ([b5eac86](https://github.com/chrisbbreuer/votescape/commit/b5eac86)) _(by Chris)_
- the Cloudflare and Porkbun keys the deploy moves the zone with, encrypted ([38e3c3e](https://github.com/chrisbbreuer/votescape/commit/38e3c3e)) _(by Chris)_
- drop the scaffold's sample API routes ([7c6152e](https://github.com/chrisbbreuer/votescape/commit/7c6152e)) _(by Chris)_
- **deps**: ts-maps 0.5.9, and commit the map chunk built from it ([ecd9e64](https://github.com/chrisbbreuer/votescape/commit/ecd9e64)) _(by Chris)_
- **deploy**: votescape.org on the shared box, DNS at Porkbun ([65dbf0b](https://github.com/chrisbbreuer/votescape/commit/65dbf0b)) _(by Chris)_
- scaffold Votescape with buddy new ([23ebaaf](https://github.com/chrisbbreuer/votescape/commit/23ebaaf)) _(by Chris)_

## Contributors

- _Chris_
- _Chris Breuer_
