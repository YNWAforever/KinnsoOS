import { parseArgs, run } from './cli'

// Separate from cli.ts so importing the CLI in unit tests has no side effects.
run(parseArgs(process.argv.slice(2), process.env))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(2)
  })
