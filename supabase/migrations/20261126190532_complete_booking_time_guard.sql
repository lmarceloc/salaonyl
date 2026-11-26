-- Mantém booked_at coerente com o slot e protege também reservas sem slot.
create or replace function public.prevent_duplicate_active_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  already_booked uuid;
  slot_time timestamptz;
  booking_time timestamptz;
begin
  select s.slot_datetime
    into slot_time
    from public.available_slots s
   where s.id = new.slot_id;

  if new.slot_id is not null and slot_time is null then
    raise exception using
      errcode = '23503',
      message = 'O horário da reserva não está disponível.';
  end if;

  if new.slot_id is not null and new.booked_at is distinct from slot_time then
    raise exception using
      errcode = '23514',
      message = 'O horário da reserva não corresponde ao slot selecionado.';
  end if;

  booking_time := coalesce(slot_time, new.booked_at);
  if booking_time is null
     or lower(coalesce(new.status, 'pending')) in ('cancelled', 'canceled') then
    return new;
  end if;

  -- Usa a mesma chave do site_create_booking para serializar painel e site.
  perform pg_advisory_xact_lock(hashtext('nyl-slot-' || booking_time::text));

  select b.id
    into already_booked
    from public.bookings b
    left join public.available_slots s on s.id = b.slot_id
   where coalesce(s.slot_datetime, b.booked_at) = booking_time
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
before insert or update of slot_id, status, booked_at on public.bookings
for each row execute function public.prevent_duplicate_active_booking();
