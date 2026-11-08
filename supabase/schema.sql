-- TECHFORCE WORKSPACE V1
-- Run this entire file in Supabase Dashboard > SQL Editor.
-- Then create/sign in to business.techforce@gmail.com and run the ADMIN BOOTSTRAP
-- statement at the bottom separately.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  message text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

create unique index if not exists one_pending_request_per_user
on public.access_requests(user_id) where status = 'pending';

create table if not exists public.access_grants (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  active boolean not null default false,
  granted_at timestamptz,
  expires_at timestamptz,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles(id),
  target_user_id uuid references public.profiles(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists access_requests_user_created_idx on public.access_requests(user_id, created_at desc);
create index if not exists admin_logs_created_idx on public.admin_logs(created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.profiles(id,email,full_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do update set email=excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_workspace_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.access_requests enable row level security;
alter table public.access_grants enable row level security;
alter table public.admin_logs enable row level security;

drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_workspace_admin());

-- Profile changes are intentionally not exposed to browser clients in V1.
-- Role changes are performed only by the trusted project owner in SQL.

drop policy if exists "users read own requests and admins read all" on public.access_requests;
create policy "users read own requests and admins read all" on public.access_requests for select to authenticated
using (user_id = auth.uid() or public.is_workspace_admin());

drop policy if exists "users create own requests" on public.access_requests;
create policy "users create own requests" on public.access_requests for insert to authenticated
with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null and reviewed_at is null);

-- Request review is performed only through the admin-only SECURITY DEFINER RPCs below.

drop policy if exists "users read own grant and admins read all" on public.access_grants;
create policy "users read own grant and admins read all" on public.access_grants for select to authenticated
using (user_id = auth.uid() or public.is_workspace_admin());

drop policy if exists "admins read logs" on public.admin_logs;
create policy "admins read logs" on public.admin_logs for select to authenticated
using (public.is_workspace_admin());

-- Users submit a request. Existing pending request is reused.
create or replace function public.request_workspace_access()
returns text language plpgsql security definer set search_path = public, auth as $$
declare v_status text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if exists(select 1 from public.access_grants where user_id=auth.uid() and active=true and expires_at>now()) then
    return 'active';
  end if;
  insert into public.access_requests(user_id,status)
  values(auth.uid(),'pending')
  on conflict (user_id) where status='pending' do nothing;
  select status into v_status from public.access_requests
  where user_id=auth.uid() order by created_at desc limit 1;
  return coalesce(v_status,'pending');
end; $$;

-- Returns the current user's access status without exposing another user's record.
create or replace function public.get_my_workspace_access()
returns table(status text, expires_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
declare v_active boolean; v_expiry timestamptz; v_request text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select g.active,g.expires_at into v_active,v_expiry
  from public.access_grants g where g.user_id=auth.uid();
  if coalesce(v_active,false) and v_expiry>now() then
    return query select 'active'::text,v_expiry; return;
  end if;
  select r.status into v_request from public.access_requests r
  where r.user_id=auth.uid() order by r.created_at desc limit 1;
  if v_request='pending' then return query select 'pending'::text,v_expiry;
  elsif v_request='rejected' then return query select 'rejected'::text,v_expiry;
  elsif v_active and v_expiry<=now() then return query select 'expired'::text,v_expiry;
  elsif v_active=false and v_expiry is not null then return query select 'revoked'::text,v_expiry;
  else return query select 'not_requested'::text,null::timestamptz;
  end if;
end; $$;

-- Use this RPC in future protected workspace operations / CodeSpace entry.
create or replace function public.has_workspace_access(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() is not null and p_user_id=auth.uid()
  and exists(select 1 from public.access_grants g
    where g.user_id=auth.uid() and g.active=true and g.expires_at>now());
$$;

create or replace function public.admin_grant_workspace_access(p_user_id uuid,p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_workspace_admin() then raise exception 'Administrator permission required'; end if;
  if p_expires_at is null or p_expires_at<=now() then raise exception 'Expiry must be in the future'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'User not found'; end if;
  insert into public.access_grants(user_id,active,granted_at,expires_at,updated_by,updated_at)
  values(p_user_id,true,now(),p_expires_at,auth.uid(),now())
  on conflict(user_id) do update set active=true,granted_at=now(),expires_at=excluded.expires_at,updated_by=auth.uid(),updated_at=now();
  update public.access_requests set status='approved',reviewed_at=now(),reviewed_by=auth.uid()
  where user_id=p_user_id and status='pending';
  insert into public.admin_logs(admin_id,target_user_id,action,details)
  values(auth.uid(),p_user_id,'grant_or_extend',jsonb_build_object('expires_at',p_expires_at));
end; $$;

create or replace function public.admin_revoke_workspace_access(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_workspace_admin() then raise exception 'Administrator permission required'; end if;
  update public.access_grants set active=false,updated_by=auth.uid(),updated_at=now() where user_id=p_user_id;
  insert into public.admin_logs(admin_id,target_user_id,action)
  values(auth.uid(),p_user_id,'revoke');
end; $$;

create or replace function public.admin_reject_access_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid;
begin
  if not public.is_workspace_admin() then raise exception 'Administrator permission required'; end if;
  update public.access_requests set status='rejected',reviewed_at=now(),reviewed_by=auth.uid()
  where id=p_request_id and status='pending' returning user_id into v_user;
  if v_user is null then raise exception 'Pending request not found'; end if;
  insert into public.admin_logs(admin_id,target_user_id,action,details)
  values(auth.uid(),v_user,'reject_request',jsonb_build_object('request_id',p_request_id));
end; $$;

revoke all on function public.is_workspace_admin() from public;
revoke all on function public.request_workspace_access() from public;
revoke all on function public.get_my_workspace_access() from public;
revoke all on function public.has_workspace_access(uuid) from public;
revoke all on function public.admin_grant_workspace_access(uuid,timestamptz) from public;
revoke all on function public.admin_revoke_workspace_access(uuid) from public;
revoke all on function public.admin_reject_access_request(uuid) from public;

grant execute on function public.is_workspace_admin() to authenticated;
grant execute on function public.request_workspace_access() to authenticated;
grant execute on function public.get_my_workspace_access() to authenticated;
grant execute on function public.has_workspace_access(uuid) to authenticated;
grant execute on function public.admin_grant_workspace_access(uuid,timestamptz) to authenticated;
grant execute on function public.admin_revoke_workspace_access(uuid) to authenticated;
grant execute on function public.admin_reject_access_request(uuid) to authenticated;

grant select on public.profiles,public.access_requests,public.access_grants to authenticated;
-- No direct UPDATE permission on profiles, requests, grants or audit logs.
-- Admin state changes are available only through the protected RPC functions.
grant select on public.admin_logs to authenticated;

-- ADMIN BOOTSTRAP: Run only AFTER business.techforce@gmail.com has registered
-- and confirmed the email. Replace nothing; execute this exact statement.
-- update public.profiles set role='admin' where lower(email)='business.techforce@gmail.com';
