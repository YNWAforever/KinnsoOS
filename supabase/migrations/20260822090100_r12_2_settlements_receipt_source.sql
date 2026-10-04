-- supabase/migrations/20260822090100_r12_2_settlements_receipt_source.sql
--
-- Adds a submission-scoped settlement source for repeatable receipt cashback. The existing
-- mission_settlements_participant_fee_uniq index (source='mission_fee', scoped per
-- participant) and the visit_redemption source (R12.0, unconstrained by that index) are both
-- completely untouched -- receipt_cashback gets its OWN uniqueness guarantee, scoped per
-- submission (mission_milestone_submission_id), since a repeatable milestone can and should
-- produce many settlements for the same participant over time, but the SAME approved
-- submission must never mint two settlements (e.g. a stale re-review retry).

-- Deliberately "on delete set null", NOT "on delete cascade" like the same-named
-- mission_milestone_submission_id / submission_id columns on mission_social_snapshots,
-- mission_verification_jobs, and mission_review_events.submission_id. Those three are
-- subordinate evidence records that rightly disappear along with the submission they
-- document. mission_settlements is different: it's ledger/financial data that must survive
-- even if the submission explaining how it was minted is ever deleted. This matches this
-- same table's own existing convention -- affiliate_network_event_id and
-- updated_by_ops_member_id are also "set null" for the same reason -- while its true
-- ownership FKs, mission_id and mission_participant_id, correctly "cascade".
alter table public.mission_settlements
  add column mission_milestone_submission_id uuid references public.mission_milestone_submissions(id) on delete set null;

alter table public.mission_settlements
  drop constraint mission_settlements_source_check,
  add constraint mission_settlements_source_check check (source in ('mission_fee', 'visit_redemption', 'receipt_cashback'));

create unique index mission_settlements_submission_receipt_uniq
  on public.mission_settlements (mission_milestone_submission_id)
  where source = 'receipt_cashback';
