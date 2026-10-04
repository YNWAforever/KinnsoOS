export const VERSION = '0.0.0'

export type {
  CheckResult,
  CheckStatus,
  PublishedArticle,
  NewStackSource,
  LegacySource,
  CheckContext,
  Check,
  ParityReport,
} from './types'
export { parseArgs, run } from './cli'
export { buildReport, renderTable } from './report'
export { createNewStackSource } from './sources/newstack'
export { createLegacySource } from './sources/legacy'
