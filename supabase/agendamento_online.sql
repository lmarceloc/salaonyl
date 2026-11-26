-- ════════════════════════════════════════════════════════════════
-- Agendamento online (site) — Nyl Hair Design
-- Rodar uma vez no SQL Editor do Supabase.
--
-- O site público NÃO lê nem escreve direto nas tabelas: ele só chama
-- as três funções abaixo (SECURITY DEFINER). Assim nenhum visitante
-- consegue ver nome/telefone/e-mail de outros clientes.
-- ════════════════════════════════════════════════════════════════

-- 1) Novas colunas ------------------------------------------------
alter table public.bookings  add column if not exists client_email text;
alter table public.bookings  add column if not exists source text not null default 'painel';
alter table public.services  add column if not exists self_booking boolean not null default false;

-- Serviços que o próprio cliente agenda pelo site (30 min cada).
-- Estética & Beleza continua pelo WhatsApp (self_booking = false).
update public.services
   set self_booking = true,
       duration_minutes = 30
 where name ilike any (array['%prótese%', '%protese%', '%corte%', '%barba%']);

-- Confira o resultado; ajuste manualmente se algum nome não bateu:
-- select id, name, duration_minutes, active, self_booking from public.services order by name;


-- 2) Serviços disponíveis para o site ----------------------------
create or replace function public.site_booking_services()
returns table (id text, name text, duration_minutes int)
language sql
stable
security definer
set search_path = public
as $$
  select s.id::text, s.name::text, coalesce(s.duration_minutes, 30)::int
    from services s
   where s.active = true
     and s.self_booking = true
   order by s.name;
$$;


-- 3) Horários livres de um serviço --------------------------------
-- Usa os horários abertos em available_slots (gerados por create_slots.sql)
-- e remove os que já têm qualquer agendamento ativo no mesmo horário
-- (uma agenda só: barba às 13:30 também ocupa o corte das 13:30).
create or replace function public.site_available_slots(p_service_id text)
returns table (slot_datetime timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct a.slot_datetime
    from available_slots a
    join services s on s.id = a.service_id
   where a.service_id::text = p_service_id
     and s.active = true
     and s.self_booking = true
     and coalesce(a.is_booked, false) = false
     and a.slot_datetime > now() + interval '1 hour'
     and a.slot_datetime < now() + interval '30 days'
     and not exists (
       select 1 from bookings b
        where b.booked_at = a.slot_datetime
          and coalesce(b.status, '') <> 'cancelled'
     )
   order by a.slot_datetime;
$$;


-- 4) Criar o agendamento -----------------------------------------
create or replace function public.site_create_booking(
  p_service_id    text,
  p_slot_datetime timestamptz,
  p_name          text,
  p_phone         text,
  p_email         text
)
returns table (booking_id text, booked_at timestamptz, service_name text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_name   text := btrim(coalesce(p_name, ''));
  v_phone  text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_slot_id text;
  v_svc    text;
  v_id     text;
begin
  -- validações
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'Informe seu nome completo.' using errcode = 'P0001';
  end if;
  if length(v_phone) < 10 or length(v_phone) > 13 then
    raise exception 'Telefone inválido. Use DDD + número.' using errcode = 'P0001';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or length(v_email) > 200 then
    raise exception 'E-mail inválido.' using errcode = 'P0001';
  end if;

  select s.name into v_svc
    from services s
   where s.id::text = p_service_id and s.active and s.self_booking;
  if v_svc is null then
    raise exception 'Serviço indisponível para agendamento online.' using errcode = 'P0001';
  end if;

  if p_slot_datetime <= now() + interval '1 hour' then
    raise exception 'Esse horário não está mais disponível.' using errcode = 'P0001';
  end if;

  -- trava o horário para dois clientes não pegarem o mesmo ao mesmo tempo
  perform pg_advisory_xact_lock(hashtext('nyl-slot-' || p_slot_datetime::text));

  select a.id::text into v_slot_id
    from available_slots a
   where a.service_id::text = p_service_id
     and a.slot_datetime = p_slot_datetime
     and coalesce(a.is_booked, false) = false
   limit 1;
  if v_slot_id is null then
    raise exception 'Esse horário não está mais disponível.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from bookings b
     where b.booked_at = p_slot_datetime
       and coalesce(b.status, '') <> 'cancelled'
  ) then
    raise exception 'Esse horário acabou de ser reservado. Escolha outro.' using errcode = 'P0001';
  end if;

  -- anti-abuso: no máximo 3 agendamentos futuros por e-mail/telefone
  if (select count(*) from bookings b
       where (b.client_email = v_email or regexp_replace(b.client_phone, '\D', '', 'g') = v_phone)
         and b.booked_at > now()
         and coalesce(b.status, '') <> 'cancelled') >= 3 then
    raise exception 'Você já tem agendamentos em aberto. Fale com a gente pelo WhatsApp.' using errcode = 'P0001';
  end if;

  insert into bookings (service_id, slot_id, booked_at, client_name, client_phone, client_email, source)
  select s.id, a.id, p_slot_datetime, v_name, v_phone, v_email, 'site'
    from services s, available_slots a
   where s.id::text = p_service_id and a.id::text = v_slot_id
  returning bookings.id::text into v_id;

  update available_slots set is_booked = true where id::text = v_slot_id;

  return query select v_id, p_slot_datetime, v_svc;
end;
$$;


-- 5) Cancelou no painel? Libera o horário de novo -----------------
create or replace function public.release_slot_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and coalesce(old.status, '') <> 'cancelled' and new.slot_id is not null then
    update available_slots set is_booked = false where id = new.slot_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_release_slot_on_cancel on public.bookings;
create trigger trg_release_slot_on_cancel
  after update of status on public.bookings
  for each row execute function public.release_slot_on_cancel();


-- 6) Permissões: o site (anon) só pode chamar as funções ----------
revoke all on function public.site_booking_services()                                   from public;
revoke all on function public.site_available_slots(text)                                from public;
revoke all on function public.site_create_booking(text, timestamptz, text, text, text)  from public;

grant execute on function public.site_booking_services()                                  to anon, authenticated;
grant execute on function public.site_available_slots(text)                               to anon, authenticated;
grant execute on function public.site_create_booking(text, timestamptz, text, text, text) to anon, authenticated;
