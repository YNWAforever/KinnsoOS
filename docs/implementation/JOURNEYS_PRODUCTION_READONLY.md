# Journeys deployment checks

`Journeys production read-only` runs after a successful production deployment
from this repository to the Journeys Vercel project. Preview and legacy web/sync
deployments retain their separate checks. A manual run is restricted to main.

The runner uses the fixed public alias `https://kinnso-os.vercel.app`, sends only
credential-free GET requests, and requires the deployment commit to belong to
main. It compares the downloaded source archive's revision, explicit file list,
hashes and bytes with the deployment commit's Journeys Git objects, independent
of working-tree edits or Windows line endings. It records the packaging
workspace's dirty flag without hiding it. Wrong or stale source fails the check.

It also checks English/Chinese server-rendered homepage discovery forms, rejects
rendered error/not-found headings, and checks anonymous trip/bookmark
denials, private/no-store responses, disabled or unauthenticated role APIs, and
safe callback returns with the sanitized `/en/trips` fallback. Redirects cannot
leave the selected origin. Responses and
archives have size/time bounds; archives are read in memory and never extracted
or executed. The JSON artifact contains statuses and source hashes, without API
response bodies or credentials.

Run on a checkout of the deployed commit:

```sh
python scripts/verify-journeys-production.py --expected-sha <full-deployed-commit>
```

The loopback option is for a locally owned HTTP fixture only. CI never supplies it.
The runner does not sign in, publish content, create fixtures, mutate business
data, send telemetry or email, or call paid providers. A passing public check
does not close signed-in U01/U02, role acceptance, physical-device accessibility,
field performance, backup/Storage recovery or payment gates.

On failure, retain the artifact and inspect the named boundary. Reconcile a
revision mismatch with deployment/alias metadata before rerunning; do not replace
the expected revision with whichever archive is currently served to obtain a pass.

## Deployment eligibility records

`Deployment scope (metadata only)` independently records the current Journeys,
legacy production web and legacy preview guard results. Each event receives a
`deployment-scope-metadata` artifact and a table in the job summary with
`SELECTED` or `NOT_APPLICABLE` and a specific reason. Original runtime workflows
keep their existing conditions and neutral skipped outcomes.

`SELECTED` means that the existing guard would select a check for that event;
runtime acceptance in this record is always `NOT_RUN_METADATA_ONLY`. Read the
separate production read-only artifact to verify source/target checks. A manual
metadata run records eligibility only; execute the checker workflow separately
for an actual check. GitHub does not create a workflow run for an `inactive`
deployment status. See [GitHub deployment events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#deployment_status).

The artifact records workflow source SHA, expected deployment SHA, condition
fingerprints and a sanitized deployment origin. It excludes raw event payloads,
URL credentials/path/query/fragment, API responses and account data. Changed or
missing workflow conditions produce `UNKNOWN_POLICY` and a failed metadata job;
review the current guards and update the classifier instead of guessing a reason.

The existing Python unittest runner exercises 20 native synthetic metadata cases
in Journeys CI; its successful or failed log is retained in
`journeys-verification-summary`. These tests make no DB or target HTTP requests
and do not provide hosted role UAT evidence.
