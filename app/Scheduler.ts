import process from 'node:process'
import { schedule } from '@stacksjs/scheduler'

/**
 * **Scheduler**
 *
 * Define your scheduled tasks here. Jobs, actions, and shell commands
 * can all be scheduled with a fluent, expressive API.
 *
 * @see https://docs.stacksjs.com/scheduling
 */
export default function (): void {
  // The count goes on for weeks after election day: late ballots, Alaska's
  // ranked-choice rounds, runoffs, certification. Every six hours the results
  // are fetched and built again, where the site runs, and written over the
  // file the map reads. The page names that file by when it last changed, so
  // the next visitor gets the new numbers with no deploy.
  //
  // The build refuses to write anything it cannot account for (a county with
  // no shape, a state that does not add up), so a bad fetch leaves the last
  // good file in place. Stop this once every state has certified.
  schedule.command('bun scripts/build-results.ts --refresh')
    .cron('17 */6 * * *')
    .setTimeZone('UTC')
    .withoutOverlapping(30)
    .withName('votescape-results')
}

process.on('SIGINT', () => {
  schedule.gracefulShutdown().then(() => process.exit(0))
})
