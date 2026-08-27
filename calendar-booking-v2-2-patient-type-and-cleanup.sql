-- v2.2: Sincroniza el repositorio con el estado real de producción en Supabase
-- y limpia código muerto/duplicado descubierto en la auditoría del 27/08/2026.
--
-- CONTEXTO (para quien lea esto después, incluida yo misma dentro de un año):
-- Entre v2.1 y hoy, la función create_calendar_booking se modificó directamente
-- en el SQL Editor de Supabase para añadir el flujo "paciente existente"
-- (p_patient_type), sin que ese cambio se guardara nunca en este repositorio.
-- Esto generó una función duplicada (misma firma antigua conviviendo con la
-- nueva) y dejó sin revocar el acceso público a una función de un diseño
-- anterior (create_appointment_booking) que no exigía consentimiento
-- informado ni firma. Este archivo deja registrado el estado real y corrige
-- ambos problemas. Ejecutar una sola vez en Supabase > SQL Editor.

-- ============================================================
-- 1. Función vigente: create_calendar_booking (con patient_type)
-- ============================================================
-- Esta es la definición REAL que ejecuta booking.js en producción.
-- Se re-declara aquí con create or replace para que el repo sea la fuente
-- de verdad a partir de ahora; no cambia el comportamiento actual.

create or replace function public.create_calendar_booking(
  p_starts_at timestamp with time zone,
  p_duration_minutes integer,
  p_patient_name text,
  p_patient_email text,
  p_patient_phone text,
  p_patient_type text,
  p_privacy_acknowledged boolean,
  p_cancellation_accepted boolean,
  p_informed_consent_accepted boolean,
  p_signer_name text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_booking_id uuid;
  v_ends_at timestamptz;
  v_local_start timestamp;
  v_rule_matches boolean;
  v_existing boolean := p_patient_type = 'existing';
begin
  if p_patient_type not in ('new', 'existing') then
    raise exception 'Tipo de paciente no válido';
  end if;

  if p_duration_minutes <> 60 then
    raise exception 'Duración no válida';
  end if;

  if p_starts_at < now() + interval '24 hours' then
    raise exception 'La cita debe reservarse con al menos 24 horas de antelación';
  end if;

  if p_starts_at > now() + interval '60 days' then
    raise exception 'La cita solicitada está fuera del periodo de reserva';
  end if;

  if nullif(btrim(p_patient_name), '') is null then
    raise exception 'Falta el nombre';
  end if;

  if nullif(btrim(p_patient_email), '') is null
     or nullif(btrim(p_patient_phone), '') is null then
    raise exception 'Correo y teléfono son obligatorios';
  end if;

  if not coalesce(p_cancellation_accepted, false) then
    raise exception 'Debe confirmarse la lectura de la política de cancelación';
  end if;

  if not v_existing
     and (
       not coalesce(p_privacy_acknowledged, false)
       or not coalesce(p_informed_consent_accepted, false)
       or nullif(btrim(p_signer_name), '') is null
     ) then
    raise exception 'Faltan consentimientos o firma';
  end if;

  v_ends_at := p_starts_at + interval '60 minutes';
  v_local_start := p_starts_at at time zone 'Europe/Madrid';

  select exists (
    select 1
    from public.appointment_availability_rules r
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
    select 1
    from public.appointment_bookings b
    where b.status in ('confirmed', 'pending')
      and b.starts_at is not null
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'Ese horario ya no está disponible';
  end if;

  -- Paciente existente: se reserva en 'pending' hasta comprobación manual
  -- por parte de la profesional; no se pide firma ni versión de consentimiento
  -- porque ya se recogieron cuando el paciente se dio de alta la primera vez.
  -- Paciente nuevo: se exige firma + versión de privacidad/consentimiento y
  -- la cita queda 'confirmed' de inmediato.
  insert into public.appointment_bookings (
    patient_name, patient_email, patient_phone, patient_type, status,
    starts_at, ends_at, duration_minutes, price_eur, service_code,
    privacy_accepted, cancellation_accepted, informed_consent_accepted,
    signer_name, privacy_version, consent_version, cancellation_version, accepted_at
  ) values (
    left(btrim(p_patient_name), 120),
    left(btrim(p_patient_email), 254),
    left(btrim(p_patient_phone), 30),
    p_patient_type,
    case when v_existing then 'pending' else 'confirmed' end,
    p_starts_at, v_ends_at, 60, 60.00, 'session_60',
    not v_existing,
    true,
    not v_existing,
    case when v_existing then null else left(btrim(p_signer_name), 120) end,
    case when v_existing then null else '1.1' end,
    case when v_existing then null else '1.1' end,
    '1.2',
    now()
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$function$;

grant execute on function public.create_calendar_booking(
  timestamptz, integer, text, text, text, text, boolean, boolean, boolean, text
) to anon;

-- ============================================================
-- 2. Elimina la versión duplicada de create_calendar_booking (v2.1, sin
--    patient_type). Código muerto: PostgREST resuelve siempre a la versión
--    de 10 parámetros de arriba porque booking.js siempre envía p_patient_type.
-- ============================================================

drop function if exists public.create_calendar_booking(
  timestamptz, integer, text, text, text, boolean, boolean, boolean, text
);

-- ============================================================
-- 3. Cierra el acceso público a la función del diseño v1
--    (create_appointment_booking). No la usa ningún frontend actual, pero
--    tenía permiso de ejecución para "anon" y permitía crear citas sin
--    consentimiento informado ni firma electrónica. Se revoca el acceso;
--    no se elimina todavía por si hay alguna reserva histórica real
--    (no de prueba) que dependa de appointment_slots.
-- ============================================================

revoke all on function public.create_appointment_booking(
  uuid, text, text, text, boolean
) from anon, authenticated;

-- Pendiente de decidir (no ejecutar sin confirmar antes que no hay reservas
-- reales apoyadas en appointment_slots):
--   drop function if exists public.create_appointment_booking(uuid, text, text, text, boolean);
--   drop table if exists public.appointment_slots;

-- ============================================================
-- 4. Documentación de los secretos usados por el flujo de email
--    (no son valores, solo referencia de dónde vive cada uno).
-- ============================================================
-- - Vault (Supabase, tabla vault.secrets): nombre "booking_webhook_secret".
--   Lo lee notify_booking_created() para autenticar la llamada saliente.
-- - Edge Function "send-booking-emails" > Custom secrets:
--     BOOKING_WEBHOOK_SECRET  -> debe ser EXACTAMENTE el mismo valor que el
--                                secreto de Vault de arriba.
--     BREVO_API_KEY           -> clave de API de Brevo (cuenta de envío de
--                                emails transaccionales), formato "xkeysib-...".
-- Si algún día se rota alguno de los dos, hay que actualizar los DOS sitios
-- a la vez o el envío de emails empieza a fallar con 401 en silencio
-- (visible solo en `select * from net._http_response order by created desc`).
