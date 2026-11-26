-- Impede reservas ativas no mesmo horário, mesmo quando os serviços têm slots distintos.
create or replace function public.prevent_duplicate_active_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  already_booked uuid;
  booked_time timestamptz;
begin
  if new.slot_id is null
     or lower(coalesce(new.status, 'pending')) in ('cancelled', 'canceled') then
    return new;
  end if;

  select s.slot_datetime
    into booked_time
    from public.available_slots s
   where s.id = new.slot_id;

  if booked_time is null then
    return new;
  end if;

  -- O lock é por instante, não por slot/service, portanto cobre toda a agenda.
  perform pg_advisory_xact_lock(
    hashtextextended((extract(epoch from booked_time))::text, 0)
  );

  select b.id
    into already_booked
    from public.bookings b
    join public.available_slots s on s.id = b.slot_id
   where s.slot_datetime = booked_time
     and b.id <> new.id
     and lower(coalesce(b.status, 'pending')) not in ('cancelled', 'canceled')
   limit 1;

  if already_booked is not null then
    raise exception using
      errcode = '23505',
      message = 'Este horário já está reservado.';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_prevent_duplicate_active on public.bookings;
create trigger bookings_prevent_duplicate_active
before insert or update of slot_id, status on public.bookings
for each row execute function public.prevent_duplicate_active_booking();
