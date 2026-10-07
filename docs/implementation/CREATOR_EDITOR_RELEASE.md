# Creator editing and schema review

N06 adds delete/Undo, native keyboard move controls, stable session-local editor keys and HH:mm. Day reorder retains existing offset gaps. Server acknowledgements advance the saved revision without overwriting edits made during autosave or publication. Published metadata/snapshots remain unchanged until explicit publication. Conflict handling retains input and requires explicit review/replacement.

The existing private draft RPC rejected zero days/stops. Isolated RED evidence confirms invalid_draft. Migration 20261008000000_allow_empty_creator_editing_drafts.sql replaces only save_kinnso_guide_draft and changes those two lower bounds from 1 to 0; all actor, ownership, payload bounds, revision locks, idempotency receipts, publication checks and grants remain unchanged. It does not write existing data, create a fake stop or alter provider schemas.

Production application is pending specific authorization and recovery checks. Before application, verify the exact project, current function contract, migration history and backup/restore evidence; retain the existing function definition for review. Apply this one reviewed migration transactionally only after the release owner approves. Do not reset a target or repair unrelated history. Local ownership-verified container application and persistence/publish-rejection tests pass.

Rollback the UI independently. Empty drafts remain private and readable. Reinstating the old lower bounds would prevent saving an empty draft until it is repaired; prefer retaining the compatible validator and reverting only UI. Do not delete drafts or revert publication data. Full hosted creator/traveller acceptance remains pending.
