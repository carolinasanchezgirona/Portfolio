-- Ajuste v2.1: una única sesión de 60 minutos por 60 €,
-- con inicios en horas cerradas para evitar fragmentar la agenda.

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

create or replace function public.create_calendar_booking(
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_patient_name text,
  p_patient_email text,
  p_patient_phone text,
  p_privacy_acknowledged boolean,
  p_cancellation_accepted boolean,
  p_informed_consent_accepted boolean,
  p_signer_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_ends_at timestamptz;
  v_local_start timestamp;
  v_rule_matches boolean;
begin
  if p_duration_minutes <> 60 then
    raise exception 'Duración no válida';
  end if;
  if p_starts_at < now() + interval '24 hours' then
    raise exception 'La cita debe reservarse con al menos 24 horas de antelación';
  end if;
  if p_starts_at > now() + interval '60 days' then
    raise exception 'La cita solicitada está fuera del periodo de reserva';
  end if;
  if nullif(btrim(p_patient_name), '') is null or nullif(btrim(p_signer_name), '') is null then
    raise exception 'Faltan el nombre o la firma';
  end if;
  if nullif(btrim(coalesce(p_patient_email, '')), '') is null
     and nullif(btrim(coalesce(p_patient_phone, '')), '') is null then
    raise exception 'Debe indicarse un canal de contacto';
  end if;
  if not coalesce(p_privacy_acknowledged, false)
     or not coalesce(p_cancellation_accepted, false)
     or not coalesce(p_informed_consent_accepted, false) then
    raise exception 'Deben aceptarse las condiciones y consentimientos';
  end if;

  v_ends_at := p_starts_at + interval '60 minutes';
  v_local_start := p_starts_at at time zone 'Europe/Madrid';
  select exists (
    select 1 from public.appointment_availability_rules r
    where r.enabled
      and r.iso_weekday = extract(isodow from v_local_start)::smallint
      and v_local_start::time >= r.starts_at
      and (v_ends_at at time zone 'Europe/Madrid')::time <= r.ends_at
      and extract(minute from v_local_start) = 0
      and extract(second from v_local_start) = 0
  ) into v_rule_matches;
  if not v_rule_matches then
    raise exception 'El horario solicitado no pertenece a la agenda disponible';
  end if;

  perform pg_advisory_xact_lock(81726354);
  if exists (
    select 1 from public.appointment_bookings b
    where b.status in ('confirmed', 'pending')
      and b.starts_at is not null
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'Ese horario ya no está disponible';
  end if;

  insert into public.appointment_bookings (
    patient_name, patient_email, patient_phone, status,
    starts_at, ends_at, duration_minutes, price_eur, service_code,
    privacy_accepted, cancellation_accepted, informed_consent_accepted,
    signer_name, privacy_version, consent_version, cancellation_version, accepted_at
  ) values (
    left(btrim(p_patient_name), 120),
    nullif(left(btrim(coalesce(p_patient_email, '')), 254), ''),
    nullif(left(btrim(coalesce(p_patient_phone, '')), 30), ''),
    'confirmed', p_starts_at, v_ends_at, 60, 60.00, 'session_60',
    true, true, true, left(btrim(p_signer_name), 120), '1.1', '1.1', '1.0', now()
  ) returning id into v_booking_id;
  return v_booking_id;
end;
$$;

revoke all on function public.get_available_appointment_starts(integer, integer) from public;
revoke all on function public.create_calendar_booking(timestamptz, integer, text, text, text, boolean, boolean, boolean, text) from public;
grant execute on function public.get_available_appointment_starts(integer, integer) to anon;
grant execute on function public.create_calendar_booking(timestamptz, integer, text, text, text, boolean, boolean, boolean, text) to anon;
