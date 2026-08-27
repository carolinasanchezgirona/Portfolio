-- v2.5 + v2.6: bloqueo de días sueltos y recordatorio automático 24h antes.

-- ============================================================
-- v2.5 — Excepciones de calendario (días bloqueados sueltos)
-- ============================================================

create table if not exists public.appointment_date_exceptions (
  exception_date date primary key,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.appointment_date_exceptions enable row level security;
revoke all on table public.appointment_date_exceptions from anon, authenticated;

create or replace function public.get_available_appointment_starts(
  p_duration_minutes integer,
  p_days integer default 30
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with params as (
    select
      case when p_duration_minutes = 60 then 60 else null end as duration_minutes,
      least(greatest(coalesce(p_days, 30), 1), 60) as days_to_show
  ),
  local_days as (
    select d::date as local_date
    from params p
    cross join generate_series(
      (now() at time zone 'Europe/Madrid')::date,
      (now() at time zone 'Europe/Madrid')::date + (p.days_to_show - 1),
      interval '1 day'
    ) d
    where p.duration_minutes is not null
      and not exists (
        select 1 from public.appointment_date_exceptions e
        where e.exception_date = d::date
      )
  ),
  candidates as (
    select
      (g.local_start at time zone 'Europe/Madrid') as candidate_start,
      ((g.local_start + interval '60 minutes') at time zone 'Europe/Madrid') as candidate_end
    from local_days d
    join public.appointment_availability_rules r
      on r.iso_weekday = extract(isodow from d.local_date)::smallint
     and r.enabled
    cross join lateral generate_series(
      d.local_date + r.starts_at,
      d.local_date + r.ends_at - interval '60 minutes',
      interval '60 minutes'
    ) g(local_start)
  )
  select c.candidate_start, c.candidate_end
  from candidates c
  where c.candidate_start >= now() + interval '24 hours'
    and not exists (
      select 1
      from public.appointment_bookings b
      where b.status in ('confirmed', 'pending')
        and b.starts_at is not null
        and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(c.candidate_start, c.candidate_end, '[)')
    )
  order by c.candidate_start;
$$;

revoke all on function public.get_available_appointment_starts(integer, integer) from public;
grant execute on function public.get_available_appointment_starts(integer, integer) to anon;

-- ============================================================
-- v2.6 — Recordatorio automático 24h antes (requiere extensión pg_cron)
-- ============================================================

create extension if not exists pg_cron with schema extensions;

alter table public.appointment_bookings
  add column if not exists reminder_sent_at timestamptz;

create or replace function public.send_appointment_reminders()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_webhook_secret text;
  v_booking record;
  v_request_id bigint;
begin
  select decrypted_secret
    into v_webhook_secret
  from vault.decrypted_secrets
  where name = 'booking_webhook_secret'
  limit 1;

  if nullif(v_webhook_secret, '') is null then
    raise warning 'No se ha encontrado booking_webhook_secret en Vault';
    return;
  end if;

  for v_booking in
    select *
    from public.appointment_bookings b
    where b.status = 'confirmed'
      and b.reminder_sent_at is null
      and b.starts_at::date = ((now() at time zone 'Europe/Madrid')::date + 1)
  loop
    select net.http_post(
      url := 'https://grgyvdxkjdstdyumdfyg.supabase.co/functions/v1/send-booking-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-booking-webhook-secret', v_webhook_secret
      ),
      body := jsonb_build_object(
        'type', 'REMINDER',
        'table', 'appointment_bookings',
        'schema', 'public',
        'record', to_jsonb(v_booking),
        'old_record', null
      ),
      timeout_milliseconds := 10000
    ) into v_request_id;

    update public.appointment_bookings
    set reminder_sent_at = now()
    where id = v_booking.id;
  end loop;
end;
$function$;

-- 08:00 UTC ≈ 09:00-10:00 hora de Madrid según horario de verano/invierno.
select cron.schedule(
  'send-appointment-reminders-daily',
  '0 8 * * *',
  $$ select public.send_appointment_reminders(); $$
);

-- ------------------------------------------------------------
-- La Edge Function send-booking-emails (fichero send-booking-emails.ts
-- en este mismo commit) añade el manejo de type = 'REMINDER': envía
-- "Recordatorio: tu cita es mañana" solo al paciente.
-- ------------------------------------------------------------
