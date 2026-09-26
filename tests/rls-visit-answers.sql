-- Run against the existing project using an administrative SQL session.
-- All fixtures are temporary and rolled back. No existing users/data are modified.
begin;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  va uuid := gen_random_uuid(); vb uuid := gen_random_uuid();
  aa uuid := gen_random_uuid(); ab uuid := gen_random_uuid();
  n integer; t timestamptz := now();
begin
  insert into auth.users(id) values(a),(b);
  insert into public.properties(id,user_id,address,municipality,province) values
    (pa,a,'QA temporal A','Zaragoza','Zaragoza'),(pb,b,'QA temporal B','Zaragoza','Zaragoza');
  insert into public.visits(id,property_id,user_id,device_id,schema_version) values
    (va,pa,a,'rls-transaction','0.2.0'),(vb,pb,b,'rls-transaction','0.2.0');
  insert into public.visit_answers(id,visit_id,user_id,question_id,value_json,updated_at)
    values(ab,vb,b,'secret','"B"',t);
  perform set_config('request.jwt.claim.sub',a::text,true);
  set local role authenticated;
  if auth.uid() <> a then raise exception 'Auth identity setup failed'; end if;
  insert into public.visit_answers(id,visit_id,user_id,question_id,section_id,value_json,source_type,verified,notes,updated_at)
    values(aa,va,a,'height','height','2.8','observed',true,'Measured with tape',t);
  select count(*) into n from public.visit_answers where id=aa and source_type='observed' and verified and notes='Measured with tape';
  if n <> 1 then raise exception 'Own INSERT/SELECT/provenance failed'; end if;
  select count(*) into n from public.visit_answers where id=ab;
  if n <> 0 then raise exception 'Cross-user SELECT leaked'; end if;
  begin
    insert into public.visit_answers(visit_id,user_id,question_id) values(vb,a,'cross-visit');
    raise exception 'Cross-visit INSERT was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.visit_answers(visit_id,user_id,question_id) values(vb,b,'spoof');
    raise exception 'Spoofed INSERT was allowed';
  exception when insufficient_privilege then null; end;
  update public.visit_answers set notes='unauthorized',updated_at=t+interval '1 second' where id=ab;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-user UPDATE was allowed'; end if;
  delete from public.visit_answers where id=ab;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-user DELETE was allowed'; end if;
  begin
    update public.visit_answers set visit_id=vb,updated_at=t+interval '1 second' where id=aa;
    raise exception 'Answer reparent was allowed';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    update public.visit_answers set user_id=b,updated_at=t+interval '1 second' where id=aa;
    raise exception 'Owner reassignment was allowed';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    insert into public.visit_answers(visit_id,user_id,question_id) values(va,a,'height');
    raise exception 'Duplicate question was allowed';
  exception when unique_violation then null; end;
  update public.visit_answers set value_json='2.9',source_type='seller_claim',verified=false,notes='Updated',updated_at=t+interval '2 seconds' where id=aa;
  if not exists(select 1 from public.visit_answers where id=aa and value_json='2.9'::jsonb and not verified and source_type='seller_claim' and notes='Updated') then raise exception 'Own UPDATE failed'; end if;
  insert into public.visit_answers(visit_id,user_id,question_id,value_json,updated_at) values(va,a,'height','1',t)
    on conflict (visit_id,question_id) do update set value_json=excluded.value_json,updated_at=excluded.updated_at;
  if not exists(select 1 from public.visit_answers where id=aa and value_json='2.9'::jsonb) then raise exception 'Stale write overwrote newer answer'; end if;
  delete from public.visit_answers where id=aa;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Own DELETE failed'; end if;
  insert into public.visit_answers(visit_id,user_id,question_id,value_json) values(va,a,'openings','[{"width":1.2,"height":2.1}]');
  delete from public.visits where id=va;
  if exists(select 1 from public.visit_answers where visit_id=va) then raise exception 'Cascade failed'; end if;
  reset role;
  if not exists(select 1 from public.visit_answers where id=ab and value_json='"B"'::jsonb and notes='') then raise exception 'User B data changed'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  set local role authenticated;
  if not exists(select 1 from public.visit_answers where id=ab) then raise exception 'User B cannot read own row'; end if;
  reset role;
end;
$$;
rollback;
select 'PASS: authenticated A/B SELECT INSERT UPDATE DELETE; own CRUD; forged owner; cross-visit; immutable identity; unique question; JSON; LWW; cascade; rolled back' as result;
