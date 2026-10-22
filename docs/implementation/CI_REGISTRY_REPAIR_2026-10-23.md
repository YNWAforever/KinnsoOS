# KinnsoOS CI registry repair — 2026-10-23

## Baseline and failure boundary

- Base candidate: `ed47c6cf18d37d8f00ffbeb30d645ebea8221b97`, draft PR86; no merge or production deployment.
- Journeys PR run `39818756157`, attempt1: verify and workspace-fixtures passed. Connected, Auth-mailbox and operations-performance failed downloading GHCR images before database startup. The single connected-job retry (attempt2, job `119967783008`) repeated `toomanyrequests` after the CLI's 4s/8s retries. These original FAIL records remain evidence.
- CI run `39818756136`: quality failed pulling pinned `ghcr.io/supabase/postgres-meta:v0.96.1`; Scan worker image passed; dependent e2e was SKIPPED. Runner eligibility had recovered; the older zero-step billing blocker does not describe these runs.
- Preparation's 717 unit / browser results on the older candidate do not prove a new candidate. Registry errors do not prove a database assertion or performance regression either.

## Bounded repair

Five jobs that start owned ephemeral CI databases now authenticate to GHCR before image acquisition. `docker/login-action` is pinned to `c94ce9fb468520275223c153574b00df6fe4bcc9` (the verified v3 ref). Each affected job grants only `contents:read` and `packages:read`, uses its ephemeral `GITHUB_TOKEN`, initializes `DOCKER_CONFIG` below `$RUNNER_TEMP/kinnso-ghcr` in a preceding step via `GITHUB_ENV`, and requests post-job logout. `runner.temp` is deliberately absent from job-level env because that context is unavailable there. Non-database jobs retain contents-only permissions. No PAT, new secret, package publication, repository/branch-protection setting, billing, external provider, cloud target or business-role change is needed.

Keep Supabase CLI2.107.0, all service versions and the exact pg-meta GHCR-to-ECR local tag workaround. Keep every test, source/build/type gate, migration/seed/target-ownership guard, health check, performance assessment, event and concurrency rule. Do not retry `supabase start`, ignore startup failures or substitute the original shared project for CI. A registry login is a candidate repair; actual image download and downstream assertions must be observed on its exact head before calling CI recovered.

## Evidence and rollback

Local regression: five required-auth tests initially FAIL with the original anonymous jobs; the unchanged non-database-permission test PASS. After the change all six registry contracts plus four existing owned-workflow contracts PASS. Independent review additionally caught invalid job-level `runner.temp` usage before publication; five RED context regressions reproduced it, and all ten contracts passed after moving initialization into a step. These tests prove configuration constraints only; the local Docker daemon is unavailable, so they do not claim real image pulls, database/Auth/mail or a restore rehearsal.

Publish the reviewed branch using the existing push/draft-PR authorization and follow both push and PR checks to terminal states. Record each actual run/job/head, original failure, count, skipped scope and limits in `apps/journeys/evidence/pd-decisions-ci-20261023/`. Retain earlier evidence folders. Source revert is the rollback for this CI configuration; logout and runner disposal remove ephemeral registry credentials. No database migration rollback is introduced.

## Primary references

- [Supabase CLI2.107.0 Docker authentication implementation](https://github.com/supabase/cli/blob/v2.107.0/apps/cli-go/internal/utils/docker.go): `GetRegistryAuth` loads Docker registry credentials, and `DockerImagePull` passes them to the Docker API. This supports using the job's Docker configuration; it does not itself prove the shared-runner rate limit is resolved.
- [GitHub Container registry authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [package permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages) and [job token permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions): use ephemeral read permission for image downloads.
- [Pinned Docker Login action metadata](https://github.com/docker/login-action/blob/c94ce9fb468520275223c153574b00df6fe4bcc9/action.yml): supports registry, username, password and logout; post-job entry point is present.
- [Supabase CLI issue5785](https://github.com/supabase/cli/issues/5785): preserve the pinned type-generation image workaround rather than reverting to unverified ECR downloads.
