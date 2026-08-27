-- v2.3: email automático al confirmar una cita 'pending' de paciente existente.
--
-- CONTEXTO: hasta ahora, cuando una cita de "paciente existente" pasaba de
-- pending a confirmed (revisión manual en Table Editor), el paciente no
-- recibía ningún aviso — había que avisarle a mano por otro canal. Este
-- cambio añade un segundo disparador que reutiliza el mismo mecanismo de
-- notify_booking_created (Vault + Edge Function + Brevo) pero para UPDATE.
-- Ejecutar una sola vez en Supabase > SQL Editor.

create or replace function public.notify_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_webhook_secret text;
  v_request_id bigint;
begin
  select decrypted_secret
    into v_webhook_secret
  from vault.decrypted_secrets
  where name = 'booking_webhook_secret'
  limit 1;

  if nullif(v_webhook_secret, '') is null then
    raise warning 'No se ha encontrado booking_webhook_secret en Vault';
    return new;
  end if;

  select net.http_post(
    url := 'https://grgyvdxkjdstdyumdfyg.supabase.co/functions/v1/send-booking-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-booking-webhook-secret', v_webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    ),
    timeout_milliseconds := 10000
  ) into v_request_id;

  return new;
exception
  when others then
    raise warning 'No se pudo encolar el correo de confirmación: %', sqlerrm;
    return new;
end;
$function$;

drop trigger if exists booking_confirmed_email on public.appointment_bookings;

-- Solo se dispara en la transición exacta pending -> confirmed (confirmación
-- manual de un paciente existente). Otros cambios de estado (p.ej. a
-- 'cancelled') no envían este email.
create trigger booking_confirmed_email
after update of status on public.appointment_bookings
for each row
when (old.status = 'pending' and new.status = 'confirmed')
execute function public.notify_booking_status_change();

-- ------------------------------------------------------------
-- La Edge Function send-booking-emails (código en send-booking-emails.ts,
-- fichero aparte en este mismo commit) se actualizó para manejar dos casos:
--   - type = 'INSERT'  -> email al paciente (nueva reserva) + aviso interno.
--     El aviso interno ahora incluye una nota cuando el paciente es
--     "existente", recordando confirmar la cita en Table Editor.
--   - type = 'UPDATE', old_record.status = 'pending' y record.status =
--     'confirmed' -> email de "Tu cita ha sido confirmada" solo al paciente.
-- ------------------------------------------------------------
