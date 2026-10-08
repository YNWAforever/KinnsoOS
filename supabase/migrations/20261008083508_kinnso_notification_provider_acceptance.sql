-- Apply atomically through the migration runner / psql --single-transaction.
-- A provider receipt proves acceptance only. No provider, scheduler or data backfill is enabled here.
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$ begin
 if to_regclass('kinnso_internal.notification_outbox') is null
  or to_regprocedure('public.finish_kinnso_notification_delivery(uuid,uuid,boolean,text)') is null
  or to_regprocedure('public.claim_kinnso_notification_delivery()') is null
  or not exists(select 1 from pg_constraint where conrelid='kinnso_internal.notification_outbox'::regclass and conname='notification_outbox_state_check' and contype='c')
 then raise exception 'notification_delivery_contract_missing';end if;
 if has_function_privilege('anon','public.finish_kinnso_notification_delivery(uuid,uuid,boolean,text)','execute')
  or has_function_privilege('authenticated','public.finish_kinnso_notification_delivery(uuid,uuid,boolean,text)','execute')
  or not has_function_privilege('service_role','public.finish_kinnso_notification_delivery(uuid,uuid,boolean,text)','execute')
  or has_function_privilege('anon','public.claim_kinnso_notification_delivery()','execute')
  or has_function_privilege('authenticated','public.claim_kinnso_notification_delivery()','execute')
  or not has_function_privilege('service_role','public.claim_kinnso_notification_delivery()','execute')
 then raise exception 'notification_delivery_grants_drift';end if;
end $$;

alter table kinnso_internal.notification_outbox drop constraint notification_outbox_state_check;
alter table kinnso_internal.notification_outbox add constraint notification_outbox_state_check
 check(state in ('queued','retry','sending','accepted','delivered','dead_letter','suppressed'));

-- Lease expiry only permits reclaim before send-start. A sending row has an
-- uncertain provider outcome and must retain its token for exact completion.
create or replace function public.claim_kinnso_notification_delivery() returns jsonb language plpgsql security definer set search_path='' as $$
declare o kinnso_internal.notification_outbox;token uuid:=gen_random_uuid();begin
 update kinnso_internal.notification_outbox outbox set state='suppressed',lease_token=null,lease_until=null where state in ('queued','retry') and not exists(select 1 from kinnso_internal.notification_preferences p join kinnso_internal.delivery_channels c on c.channel=p.channel and c.approved where p.actor_id=outbox.recipient_id and p.channel=outbox.channel and p.enabled);
 update kinnso_internal.notification_outbox set state='dead_letter',revision=revision+1,lease_token=null,lease_until=null where state in ('queued','retry') and attempts>=5 and (lease_until is null or lease_until<now());
 select * into o from kinnso_internal.notification_outbox outbox where state in ('queued','retry') and attempts<5 and next_attempt_at<=now() and (lease_until is null or lease_until<now()) and exists(select 1 from public.creators where id=outbox.recipient_id and status='active') order by next_attempt_at,id for update skip locked limit 1;if not found then return null;end if;
 update kinnso_internal.notification_outbox set state='retry',lease_token=token,lease_until=now()+interval '5 minutes',attempts=attempts+1,revision=revision+1,updated_at=now() where id=o.id;
 return (select jsonb_build_object('id',o.id,'eventId',o.event_id,'recipientId',o.recipient_id,'channel',o.channel,'type',n.notification_type,'entityType',n.entity_type,'entityId',n.entity_id,'templateVersion',c.template_version,'provider',c.provider,'attempts',o.attempts+1,'leaseToken',token) from public.notifications n join kinnso_internal.delivery_channels c on c.channel=o.channel where n.id=o.event_id);
end $$;
revoke all on function public.claim_kinnso_notification_delivery() from public,anon,authenticated;
grant execute on function public.claim_kinnso_notification_delivery() to service_role;

-- Keep argument names and digest material stable for exact pending-completion retries.
-- p_delivered is a legacy API name: true now records provider acceptance, never recipient delivery.
create or replace function public.finish_kinnso_notification_delivery(p_id uuid,p_lease_token uuid,p_delivered boolean,p_receipt text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o kinnso_internal.notification_outbox;v_state text;v_digest text;prior kinnso_internal.delivery_completions;result jsonb;begin
 if p_id is null or p_lease_token is null or p_delivered is null or (p_delivered and (p_receipt is null or length(p_receipt)not between 1 and 200))or(not p_delivered and p_receipt is not null)then raise exception 'invalid_delivery';end if;
 v_digest:=kinnso_internal.request_digest(jsonb_build_array(p_id,p_lease_token,p_delivered,p_receipt)::text);
 perform pg_advisory_xact_lock(hashtextextended('delivery_completion:'||p_id::text||p_lease_token::text,0));
 select * into prior from kinnso_internal.delivery_completions where delivery_id=p_id and lease_token=p_lease_token;
 if found then
  if prior.digest<>v_digest then raise exception 'idempotency_conflict';end if;
  -- Normalize historic acknowledgement responses only. Do not rewrite immutable history or resend.
  if prior.result->>'state'='delivered' then return jsonb_set(prior.result,'{state}','"accepted"'::jsonb);end if;
  return prior.result;
 end if;
 -- No new claimant can replace a sending token. A known completion under that
 -- exact token can be acknowledged after expiry without another provider call.
 select * into o from kinnso_internal.notification_outbox where id=p_id and lease_token=p_lease_token and lease_until is not null and(lease_until>now()or state='sending')for update;if not found then raise exception 'invalid_lease';end if;
 if o.state not in ('queued','retry','sending')or(p_delivered and o.state<>'sending')then raise exception 'invalid_lease';end if;
 v_state:=case when p_delivered then 'accepted' when o.attempts>=5 then 'dead_letter' else 'retry' end;
 update kinnso_internal.notification_outbox set state=v_state,revision=revision+1,provider_receipt=case when p_delivered then p_receipt else null end,lease_token=null,lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,(30*power(2,o.attempts))::integer)),updated_at=now() where id=p_id;
 result:=jsonb_build_object('id',p_id,'state',v_state,'attempts',o.attempts);
 insert into kinnso_internal.delivery_completions(delivery_id,lease_token,digest,result)values(p_id,p_lease_token,v_digest,result);return result;
end $$;
revoke all on function public.finish_kinnso_notification_delivery(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.finish_kinnso_notification_delivery(uuid,uuid,boolean,text) to service_role;
