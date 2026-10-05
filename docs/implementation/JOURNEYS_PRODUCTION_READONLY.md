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

It also checks English/Chinese server-rendered pages, anonymous trip/bookmark
denials, private/no-store responses, disabled or unauthenticated role APIs, and
safe callback returns. Redirects cannot leave the selected origin. Responses and
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
