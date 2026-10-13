-- Customer V1 is additive. Existing tables, auth users and storage buckets remain intact.
begin;
create table if not exists public.mp_v1_profiles (
  id uuid primary key references auth.users(id),
  shop_name text not null default '' check (length(shop_name) <= 100),
  industry text not null default '' check (length(industry) <= 80),
  brand_note text not null default '' check (length(brand_note) <= 2000),
  updated_at timestamptz not null default now()
);
create table if not exists public.mp_v1_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  title text not null check (length(trim(title)) between 1 and 100),
  body text not null default '' check (length(body) <= 10000),
  channels text[] not null default '{}',
  video_path text not null,
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft','review','approved','cancelled')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  check (channels <@ array['youtube','instagram','tiktok','threads']::text[]),
  check (video_path like owner_id::text || '/%')
);
create index if not exists mp_v1_posts_owner_created on public.mp_v1_posts(owner_id,created_at desc);
create table if not exists public.mp_v1_events (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.mp_v1_posts(id),
  owner_id uuid not null references auth.users(id),
  action text not null,
  version integer not null,
  happened_at timestamptz not null default now()
);
create index if not exists mp_v1_events_owner on public.mp_v1_events(owner_id,post_id,id);
alter table public.mp_v1_profiles enable row level security;
alter table public.mp_v1_posts enable row level security;
alter table public.mp_v1_events enable row level security;
revoke all on public.mp_v1_profiles,public.mp_v1_posts,public.mp_v1_events from anon,authenticated;
grant select,insert,update on public.mp_v1_profiles to authenticated;
grant select on public.mp_v1_posts,public.mp_v1_events to authenticated;
drop policy if exists mp_v1_profile_read on public.mp_v1_profiles;
create policy mp_v1_profile_read on public.mp_v1_profiles for select to authenticated using (id=(select auth.uid()));
drop policy if exists mp_v1_profile_insert on public.mp_v1_profiles;
create policy mp_v1_profile_insert on public.mp_v1_profiles for insert to authenticated with check (id=(select auth.uid()));
drop policy if exists mp_v1_profile_update on public.mp_v1_profiles;
create policy mp_v1_profile_update on public.mp_v1_profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
drop policy if exists mp_v1_post_read on public.mp_v1_posts;
create policy mp_v1_post_read on public.mp_v1_posts for select to authenticated using (owner_id=(select auth.uid()));
drop policy if exists mp_v1_event_read on public.mp_v1_events;
create policy mp_v1_event_read on public.mp_v1_events for select to authenticated using (owner_id=(select auth.uid()));

create or replace function public.mp_v1_save_post(
  p_id uuid, p_version integer, p_title text, p_body text,
  p_channels text[], p_video_path text, p_scheduled_at timestamptz
) returns public.mp_v1_posts language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.mp_v1_posts; u uuid:=auth.uid();
begin
  if u is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  if p_title is null or length(trim(p_title)) not between 1 and 100 or p_body is null or length(p_body)>10000 then
    raise exception '제목과 내용을 확인해 주세요.'; end if;
  if p_channels is null or array_length(p_channels,1)>4 or not(p_channels <@ array['youtube','instagram','tiktok','threads']::text[]) then
    raise exception '게시 채널을 확인해 주세요.'; end if;
  if p_scheduled_at is not null and p_scheduled_at <= now() then raise exception '예약 시간은 현재보다 이후로 선택해 주세요.'; end if;
  if p_video_path is null or p_video_path not like u::text || '/%' or not exists(
    select 1 from storage.objects where bucket_id='mp-v1-videos' and name=p_video_path
      and metadata->>'mimetype' in ('video/mp4','video/webm','video/quicktime')
  ) then raise exception '내 계정에 업로드한 영상을 선택해 주세요.' using errcode='42501'; end if;
  select * into v from public.mp_v1_posts where id=p_id for update;
  if found then
    if v.owner_id<>u then raise exception '접근할 수 없는 콘텐츠입니다.' using errcode='42501'; end if;
    if v.version<>p_version then raise exception '다른 화면에서 변경됐어요. 목록을 새로 불러와 주세요.' using errcode='P0001'; end if;
    if v.status<>'draft' then raise exception '승인 요청을 회수한 뒤 수정해 주세요.'; end if;
    update public.mp_v1_posts set title=trim(p_title),body=p_body,channels=p_channels,
      video_path=p_video_path,scheduled_at=p_scheduled_at,version=version+1,updated_at=now()
      where id=p_id returning * into v;
  else
    if p_version<>0 then raise exception '콘텐츠를 찾지 못했어요.'; end if;
    insert into public.mp_v1_posts(id,owner_id,title,body,channels,video_path,scheduled_at)
      values(coalesce(p_id,gen_random_uuid()),u,trim(p_title),p_body,p_channels,p_video_path,p_scheduled_at) returning * into v;
  end if;
  insert into public.mp_v1_events(post_id,owner_id,action,version) values(v.id,u,'saved',v.version);
  return v;
end $$;

create or replace function public.mp_v1_transition(p_id uuid,p_version integer,p_action text)
returns public.mp_v1_posts language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.mp_v1_posts; target text; u uuid:=auth.uid();
begin
  if u is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  select * into v from public.mp_v1_posts where id=p_id and owner_id=u for update;
  if not found then raise exception '접근할 수 없는 콘텐츠입니다.' using errcode='42501'; end if;
  if v.version<>p_version then raise exception '다른 화면에서 변경됐어요. 목록을 새로 불러와 주세요.' using errcode='P0001'; end if;
  if p_action='submit' and v.status='draft' then target:='review';
  elsif p_action='approve' and v.status='review' then target:='approved';
  elsif p_action='withdraw' and v.status='review' then target:='draft';
  elsif p_action='cancel' and v.status in ('draft','review','approved') then target:='cancelled';
  else raise exception '현재 상태에서 실행할 수 없는 작업입니다.'; end if;
  if target in ('review','approved') and (v.scheduled_at is null or v.scheduled_at<=now() or cardinality(v.channels)=0) then
    raise exception '미래의 예약 시간과 게시 채널을 먼저 저장해 주세요.'; end if;
  update public.mp_v1_posts set status=target,version=version+1,updated_at=now(),
    approved_at=case when target='approved' then now() else approved_at end
    where id=v.id returning * into v;
  insert into public.mp_v1_events(post_id,owner_id,action,version) values(v.id,u,p_action,v.version);
  return v;
end $$;
revoke all on function public.mp_v1_save_post(uuid,integer,text,text,text[],text,timestamptz) from public,anon;
revoke all on function public.mp_v1_transition(uuid,integer,text) from public,anon;
grant execute on function public.mp_v1_save_post(uuid,integer,text,text,text[],text,timestamptz) to authenticated;
grant execute on function public.mp_v1_transition(uuid,integer,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mp-v1-videos','mp-v1-videos',false,104857600,array['video/mp4','video/webm','video/quicktime'])
on conflict(id) do nothing;
drop policy if exists mp_v1_video_read on storage.objects;
create policy mp_v1_video_read on storage.objects for select to authenticated using (
  bucket_id='mp-v1-videos' and (storage.foldername(name))[1]=(select auth.uid()::text)
);
drop policy if exists mp_v1_video_upload on storage.objects;
create policy mp_v1_video_upload on storage.objects for insert to authenticated with check (
  bucket_id='mp-v1-videos' and (storage.foldername(name))[1]=(select auth.uid()::text)
);
commit;
