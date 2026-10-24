-- PD11: absent tracked provider profit remains JSON null, distinct from a confirmed zero.
-- Retains existing fresh actor/profile guard, cursor, decimal strings, scope and totals.
-- Original shared Remix target: NOT APPLIED under A0. Owned isolated tests only.
create or replace function public.get_kinnso_creator_earnings(p_section text default 'settled',p_after text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();totals jsonb;items jsonb;cursor text;after_id uuid;after_kind text;
begin
 if not exists(select 1 from public.creators where id=actor and status='active') then raise exception 'creator_required';end if;
 if p_section is null or p_section not in ('settled','tracked','payouts') then raise exception 'invalid_section';end if;
 if p_after is not null then
  if p_after!~'^(mission|booking|affiliate|payout_batch):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_cursor';end if;
  after_kind:=split_part(p_after,':',1);after_id:=split_part(p_after,':',2)::uuid;
  if p_section='settled' and after_kind not in ('mission','booking') or p_section='tracked' and after_kind<>'affiliate' or p_section='payouts' and after_kind<>'payout_batch' then raise exception 'invalid_cursor';end if;
 end if;
 with payable as (
  select upper(s.amount_currency)currency,coalesce(s.creator_commission_amount,0)+coalesce(s.paid_fee_amount,0)amount,s.creator_payout_status='paid' paid
  from public.mission_settlements s join public.mission_participants p on p.id=s.mission_participant_id where p.creator_id=actor
  union all select upper(s.currency),s.creator_commission_amount,s.creator_commission_status='paid'
  from public.booking_settlements s join public.bookings b on b.id=s.booking_id where b.creator_id=actor and s.creator_commission_amount is not null
 ), grouped as(select currency,coalesce(sum(amount)filter(where paid),0)::text paid,coalesce(sum(amount)filter(where not coalesce(paid,false)),0)::text pending from payable group by currency)
 select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'paid',paid,'pending',pending)order by currency),'[]')into totals from grouped;
 with records as (
  select s.id,'mission'::text kind,m.title,m.id mission_id,(coalesce(s.creator_commission_amount,0)+coalesce(s.paid_fee_amount,0))::text amount,upper(s.amount_currency)currency,
   coalesce(s.creator_payout_status,'pending')status,s.updated_at,null::timestamptz target_at
  from public.mission_settlements s join public.mission_participants p on p.id=s.mission_participant_id join public.missions m on m.id=s.mission_id where p.creator_id=actor and p_section='settled'
  union all
  select s.id,'booking',e.title,null,s.creator_commission_amount::text,upper(s.currency),coalesce(s.creator_commission_status,'pending'),s.updated_at,null
  from public.booking_settlements s join public.bookings b on b.id=s.booking_id join public.experiences e on e.id=b.experience_id where b.creator_id=actor and s.creator_commission_amount is not null and p_section='settled'
  union all
  select e.id,'affiliate',coalesce(m.title,''),m.id,e.profit_amount::text,upper(e.currency),e.event_state,e.external_updated_at,null
  from public.affiliate_network_events e left join public.missions m on m.id=e.mission_id where e.creator_id=actor and e.event_state in ('processing','paid') and p_section='tracked'
   and not exists(select 1 from public.mission_settlements s where s.affiliate_network_event_id=e.id)
  union all
  select b.id,'payout_batch','Recorded payout batch',null,b.amount::text,upper(b.currency),b.status,b.created_at,b.target_at
  from public.creator_payout_batches b where b.creator_id=actor and p_section='payouts'
 ), bounded as(select *,row_number()over(order by id,kind)n from records where p_after is null or (id,kind)>(after_id,after_kind) order by id,kind limit 31)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'missionId',mission_id,'amount',amount,'currency',currency,'status',status,'updatedAt',updated_at,'targetAt',target_at)order by id,kind)filter(where n<=30),'[]'),
  case when count(*)>30 then (array_agg(kind||':'||id::text order by id,kind))[30] else null end into items,cursor from bounded;
 return jsonb_build_object('section',p_section,'totals',totals,'items',items,'nextCursor',cursor);
end $$;

revoke all on function public.get_kinnso_creator_earnings(text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_creator_earnings(text,text) to authenticated;
