-- Run once in the Supabase SQL Editor to connect authenticated email accounts
-- to the existing public.users and registrations tables.

alter table public.users enable row level security;
alter table public.registrations enable row level security;
alter table public.events enable row level security;

grant select on public.events to anon, authenticated;
revoke all on public.users, public.registrations from anon;
grant select, insert on public.users to authenticated;
grant select on public.registrations to authenticated;

drop policy if exists "EventPulse users can find their own profile" on public.users;
create policy "EventPulse users can find their own profile"
on public.users for select to authenticated
using (
  id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "EventPulse users can create their own profile" on public.users;
create policy "EventPulse users can create their own profile"
on public.users for insert to authenticated
with check (
  id = auth.uid()
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "EventPulse events are readable" on public.events;
create policy "EventPulse events are readable"
on public.events for select to anon, authenticated
using (true);

drop policy if exists "EventPulse attendees read their registrations" on public.registrations;
create policy "EventPulse attendees read their registrations"
on public.registrations for select to authenticated
using (
  user_id = auth.uid()
  or user_id in (
    select id from public.users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  or exists (
    select 1 from public.events e
    where e.id = registrations.event_id
      and e.organizer_id in (
        select id from public.users
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

drop function if exists public.register_for_event(uuid);
create function public.register_for_event(p_event_id uuid)
returns public.registrations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_capacity integer;
  v_status text;
  v_registration public.registrations;
begin
  if auth.uid() is null then
    raise exception 'Sign in to register for events';
  end if;

  select u.id into v_user_id
  from public.users u
  where u.id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by (u.id = auth.uid()) desc
  limit 1;

  if v_user_id is null then
    raise exception 'No attendee profile exists for this email';
  end if;

  select e.capacity, e.status into v_capacity, v_status
  from public.events e
  where e.id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found';
  end if;
  if lower(coalesce(v_status, '')) not in ('open', 'published', 'active') then
    raise exception 'Event is not open for registration';
  end if;
  if exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id and r.user_id = v_user_id
  ) then
    raise exception 'You are already registered for this event';
  end if;
  if v_capacity is not null and (
    select count(*) from public.registrations r where r.event_id = p_event_id
  ) >= v_capacity then
    raise exception 'Event is full';
  end if;

  insert into public.registrations(user_id, event_id)
  values (v_user_id, p_event_id)
  returning * into v_registration;
  return v_registration;
end;
$$;

revoke all on function public.register_for_event(uuid) from public, anon;
grant execute on function public.register_for_event(uuid) to authenticated;
