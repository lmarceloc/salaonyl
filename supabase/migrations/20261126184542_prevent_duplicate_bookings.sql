-- Impede novas reservas concorrentes para o mesmo slot sem alterar reservas existentes.
create or replace function public.prevent_duplicate_active_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare already_booked uuid;
begin
  if new.slot_id is null or lower(coalesce(new.status, 'pending')) in ('cancelled', 'canceled') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.slot_id::text, 0));
  select b.id into already_booked from public.bookings b
   where b.slot_id = new.slot_id and b.id <> new.id
     and lower(coalesce(b.status, 'pending')) not in ('cancelled', 'canceled') limit 1;
  if already_booked is not null then raise exception using errcode = '23505', message = 'Este horário já está reservado.'; end if;
  return new;
end; $$;
drop trigger if exists bookings_prevent_duplicate_active on public.bookings;
create trigger bookings_prevent_duplicate_active before insert or update of slot_id, status on public.bookings
for each row execute function public.prevent_duplicate_active_booking();
