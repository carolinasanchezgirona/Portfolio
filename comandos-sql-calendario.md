# Comandos SQL para gestionar tu calendario de citas

Todos se ejecutan en Supabase → **SQL Editor**, en el proyecto `portal-pacientes`.
Copia el bloque, sustituye los valores entre `<>` por los tuyos, y pulsa **Run**.

---

## Bloquear un día suelto (vacaciones, baja, festivo propio)

```sql
insert into public.appointment_date_exceptions (exception_date, reason)
values ('<AAAA-MM-DD>', '<motivo, p.ej. vacaciones>');
```

## Desbloquear un día que habías marcado como no disponible

```sql
delete from public.appointment_date_exceptions
where exception_date = '<AAAA-MM-DD>';
```

## Ver qué días tienes bloqueados actualmente

```sql
select * from public.appointment_date_exceptions
order by exception_date;
```

---

## Confirmar una cita de "paciente existente" (pasa de pending a confirmed)

Más fácil desde **Table Editor** (buscas la fila y cambias el campo a mano),
pero si prefieres hacerlo por SQL:

```sql
update public.appointment_bookings
set status = 'confirmed'
where id = '<id de la reserva>';
```

Esto dispara automáticamente el email de confirmación al paciente — no hace
falta avisarle tú por otro canal.

## Ver las reservas pendientes de confirmar ahora mismo

```sql
select id, patient_name, patient_email, patient_phone, starts_at
from public.appointment_bookings
where status = 'pending'
order by starts_at;
```

---

## Actualizar la versión de tu política de privacidad o consentimiento

Solo cuando cambies el contenido de `privacidad.html` o
`consentimiento-informado.html` en tu web. Recuerda actualizar también el
número que aparece escrito en el texto de `cita.html` (`versión 1.1`, etc.),
ya que ese es manual y no se lee de aquí.

```sql
update public.policy_versions
set privacy_version = '<nueva versión, p.ej. 1.2>',
    consent_version = '<nueva versión>',
    updated_at = now()
where id = true;
```

## Ver la versión vigente ahora mismo

```sql
select * from public.policy_versions;
```

---

## Cambiar tu horario de disponibilidad semanal (reglas recurrentes)

Ver las reglas actuales:
```sql
select * from public.appointment_availability_rules
order by iso_weekday, starts_at;
```

Añadir un nuevo bloque horario (`iso_weekday`: 1 = lunes ... 7 = domingo):
```sql
insert into public.appointment_availability_rules (iso_weekday, starts_at, ends_at)
values (<1-7>, '<HH:MM>', '<HH:MM>');
```

Desactivar un bloque sin borrarlo (por si lo quieres reactivar luego):
```sql
update public.appointment_availability_rules
set enabled = false
where iso_weekday = <1-7> and starts_at = '<HH:MM>';
```

---

## Comprobar si el recordatorio automático de 24h se está enviando bien

```sql
select id, patient_name, starts_at, reminder_sent_at
from public.appointment_bookings
where status = 'confirmed'
order by starts_at desc
limit 10;
```

Si una cita de mañana tiene `reminder_sent_at` en blanco pasadas las 10:00,
algo ha fallado — mira entonces:
```sql
select * from net._http_response order by created desc limit 5;
```

---

## Nota

Ninguno de estos comandos rompe nada si te equivocas de fecha o de hora —
lo peor que puede pasar es que bloquees o desbloquees el día equivocado, y
se corrige al momento con el comando contrario. Los únicos que no tienen
"deshacer" fácil son los que tocan `create_calendar_booking` o
`send-booking-emails` directamente (código de funciones) — esos, si alguna
vez hace falta cambiarlos, mejor hazlo conmigo.
