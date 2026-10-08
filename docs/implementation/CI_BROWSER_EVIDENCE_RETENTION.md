# Browser evidence for each CI surface

Root CI runs Booking OFF, profile enquiries and Booking ON sequentially. They use the same Playwright output and report directories. The previous final upload could retain only the last report, losing evidence from an earlier failure or retry.

Code commit: `6c2c728b4cb1561086d3b1bcf897703c989e1d05`. Each completed surface now uploads those directories immediately under a separate artifact name. Success and failure both preserve evidence. A skipped surface does not relabel the previous surface's report. The original final artifact remains for existing consumers; provider retention policy is unchanged.

All original workflow commands, targets, environment mappings, conditions, retries, timeouts and failure gates are unchanged. The upload action remains pinned to the existing version. In particular, fixture Booking ON is confined to the existing CI test configuration; this change activates no production booking or payment capability.

Native verification: three new retention contracts reproduced RED on the original workflow, then29 focused contracts passed, including the unchanged product-state tests. A full parsed YAML comparison confirms that removing only the three new IDs/uploads restores the original workflow exactly. The29 cases also pass at the clean code SHA.

Two real local Playwright fixture runs reproduced report overwriting: the first deliberately had an initial failure and one configured successful retry; the second passed and replaced the shared report. The saved first-surface copy contains its failure and retry trace, while the final shared report contains only the second case. This is synthetic artifact-retention evidence. The trace is from the configured first retry, not the initial attempt. The lost historical PR40 trace remains unavailable; this change cannot reconstruct it.

Exact-head Linux CI must verify the separate artifacts and their actual reports before merge. N18 remains partial: formal release, hosted roles, mailbox/content and physical-device acceptance are separate. Local connected testing remains blocked by the documented Windows port exclusion. No source ZIP includes the private replay, reports, credentials or audit material.
