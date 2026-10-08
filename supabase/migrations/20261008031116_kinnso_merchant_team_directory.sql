-- Owner-scoped existing-member metadata only. No global account search.
create function public.get_kinnso_merchant_team(p_merchant_id uuid,p_after uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kinnso_internal.actor();v_members jsonb;v_cursor uuid;
begin
 perform kinnso_internal.merchant_role(p_merchant_id,v_actor,null,array['owner']);
 if p_after is not null and not exists(select 1 from kinnso_internal.merchant_members where merchant_id=p_merchant_id and user_id=p_after) then raise exception 'invalid_cursor';end if;
 with bounded as (
  select m.*,c.display_name,row_number()over(order by m.user_id)n
  from kinnso_internal.merchant_members m left join public.creators c on c.id=m.user_id
  where m.merchant_id=p_merchant_id and (p_after is null or m.user_id>p_after)
  order by m.user_id limit 51
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'userId',m.user_id,
   'name',left(coalesce(nullif(btrim(m.display_name),''),'Member '||right(m.user_id::text,8)),120),
   'role',m.role,'active',m.active,'branchIds',m.branch_ids,
   'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'active',b.active) order by b.id) from kinnso_internal.merchant_branches b where b.merchant_id=p_merchant_id and b.id=any(m.branch_ids)),'[]')
  ) order by m.user_id) filter(where m.n<=50),'[]'),case when count(*)>50 then (array_agg(m.user_id order by m.user_id))[50] else null end
 into v_members,v_cursor from bounded m;
 return jsonb_build_object('merchantId',p_merchant_id,'members',v_members,'nextCursor',v_cursor);
end $$;
revoke all on function public.get_kinnso_merchant_team(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_merchant_team(uuid,uuid) to authenticated;
