const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER_EMAIL = "contact@carolinasanchezgirona.com";
const SENDER_NAME = "Carolina Sánchez Girona";
const ADMIN_EMAIL = "contact@carolinasanchezgirona.com";
const ZONE = "Europe/Madrid";

type BookingRecord = {
  id: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  patient_type: "new" | "existing";
  status: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  price_eur: number | string;
};

type DatabaseWebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE" | "REMINDER";
  table: string;
  schema: string;
  record: BookingRecord | null;
  old_record: BookingRecord | null;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONE,
  }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONE,
  }).format(new Date(iso));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function sendEmail(options: {
  toEmail: string;
  toName: string;
  replyToEmail: string;
  replyToName: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  tag: string;
}): Promise<void> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY no está configurada");

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: options.toEmail, name: options.toName }],
      replyTo: {
        email: options.replyToEmail,
        name: options.replyToName,
      },
      subject: options.subject,
      htmlContent: options.htmlContent,
      textContent: options.textContent,
      tags: [options.tag],
      headers: {
        "X-Mailin-Track-Opens": "0",
        "X-Mailin-Track-Clicks": "0",
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo ${response.status}: ${detail.slice(0, 500)}`);
  }
}

function buildPatientEmail(
  booking: BookingRecord,
  kind: "new_booking" | "existing_pending" | "existing_confirmed" | "reminder"
) {
  const patientName = escapeHtml(booking.patient_name);
  const date = capitalize(formatDate(booking.starts_at));
  const startTime = formatTime(booking.starts_at);
  const endTime = formatTime(booking.ends_at);

  const subject =
    kind === "existing_pending"
      ? "Hemos recibido tu solicitud de cita"
      : kind === "existing_confirmed"
      ? "Tu cita ha sido confirmada"
      : kind === "reminder"
      ? "Recordatorio: tu cita es mañana"
      : "Confirmación de tu cita con Carolina Sánchez Girona";

  const heading =
    kind === "existing_pending"
      ? "Hemos recibido tu solicitud"
      : kind === "reminder"
      ? "Tu cita es mañana"
      : "Tu cita está confirmada";

  const statusText =
    kind === "existing_pending"
      ? "Comprobaremos que ya estás en seguimiento y recibirás la confirmación definitiva. Mientras tanto, el horario queda reservado."
      : kind === "existing_confirmed"
      ? "Tu cita ha sido revisada y queda confirmada."
      : kind === "reminder"
      ? "Este es un recordatorio de tu cita de mañana."
      : "La reserva se ha registrado correctamente.";

  const html = `
    <!doctype html>
    <html lang="es">
      <body style="margin:0;background:#f4f7f8;font-family:Arial,sans-serif;color:#24343d">
        <div style="max-width:620px;margin:0 auto;padding:32px 18px">
          <div style="background:#ffffff;border-radius:18px;padding:32px;border:1px solid #dce5e8">
            <p style="margin:0 0 8px;color:#2f5d73;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Reserva online</p>
            <h1 style="margin:0 0 22px;font-size:26px;line-height:1.25">${heading}</h1>
            <p>Hola, ${patientName}:</p>
            <p>${statusText}</p>
            <div style="margin:24px 0;padding:20px;border-radius:14px;background:#edf5f7">
              <p style="margin:0 0 8px"><strong>${escapeHtml(date)}</strong></p>
              <p style="margin:0 0 8px">${escapeHtml(startTime)}–${escapeHtml(endTime)} · 60 minutos</p>
              <p style="margin:0">Sesión de psicología o neuropsicología · 60 €</p>
            </div>
            <h2 style="margin:26px 0 10px;font-size:18px">Cambios y cancelaciones</h2>
            <p>Si no puedes acudir, te agradecemos que solicites un cambio o canceles con al menos 24 horas de antelación. Si surge un imprevisto, avísanos lo antes posible.</p>
            <p>Puedes responder directamente a este correo o escribir a <a href="mailto:${SENDER_EMAIL}" style="color:#2f5d73">${SENDER_EMAIL}</a>.</p>
            <p style="margin-top:28px">Carolina Sánchez Girona</p>
          </div>
          <p style="margin:16px 6px 0;color:#667983;font-size:12px;line-height:1.5">Este mensaje contiene únicamente información administrativa de la cita. No respondas incluyendo información clínica sensible.</p>
        </div>
      </body>
    </html>`;

  const text = `${heading}\n\nHola, ${booking.patient_name}:\n\n${statusText}\n\n${date}\n${startTime}–${endTime} · 60 minutos\nSesión de psicología o neuropsicología · 60 €\n\nSi no puedes acudir, te agradecemos que solicites un cambio o canceles con al menos 24 horas de antelación. Si surge un imprevisto, avísanos lo antes posible.\n\nContacto: ${SENDER_EMAIL}\n\nCarolina Sánchez Girona`;

  return { subject, html, text };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  const expectedSecret = Deno.env.get("BOOKING_WEBHOOK_SECRET") ?? "";
  const receivedSecret = request.headers.get("x-booking-webhook-secret") ?? "";

  if (!expectedSecret || !safeEqual(expectedSecret, receivedSecret)) {
    return json({ error: "No autorizado" }, 401);
  }

  let payload: DatabaseWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "JSON no válido" }, 400);
  }

  if (payload.schema !== "public" || payload.table !== "appointment_bookings" || !payload.record) {
    return json({ skipped: true });
  }

  const booking = payload.record;
  if (!booking.id || !booking.patient_name || !booking.patient_email || !booking.starts_at || !booking.ends_at) {
    return json({ error: "La reserva no contiene los datos necesarios" }, 400);
  }

  // Caso 1: nueva reserva (INSERT) — email al paciente + aviso interno.
  if (payload.type === "INSERT") {
    const patientName = escapeHtml(booking.patient_name);
    const patientEmail = escapeHtml(booking.patient_email);
    const patientPhone = escapeHtml(booking.patient_phone);
    const date = capitalize(formatDate(booking.starts_at));
    const startTime = formatTime(booking.starts_at);
    const endTime = formatTime(booking.ends_at);
    const existingPatient = booking.patient_type === "existing";
    const typeLabel = existingPatient ? "Paciente actual" : "Primera visita";
    const statusLabel = existingPatient ? "Pendiente de comprobación" : "Confirmada";

    const patientEmailContent = buildPatientEmail(booking, existingPatient ? "existing_pending" : "new_booking");

    const adminSubject = `Nueva reserva · ${date} · ${startTime}`;
    const adminHtml = `
      <!doctype html>
      <html lang="es">
        <body style="margin:0;background:#f4f7f8;font-family:Arial,sans-serif;color:#24343d">
          <div style="max-width:620px;margin:0 auto;padding:32px 18px">
            <div style="background:#ffffff;border-radius:18px;padding:32px;border:1px solid #dce5e8">
              <p style="margin:0 0 8px;color:#2f5d73;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Nueva reserva</p>
              <h1 style="margin:0 0 22px;font-size:26px">${escapeHtml(date)} · ${escapeHtml(startTime)}</h1>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#667983">Paciente</td><td style="padding:8px 0"><strong>${patientName}</strong></td></tr>
                <tr><td style="padding:8px 0;color:#667983">Tipo</td><td style="padding:8px 0">${typeLabel}</td></tr>
                <tr><td style="padding:8px 0;color:#667983">Estado</td><td style="padding:8px 0">${statusLabel}</td></tr>
                <tr><td style="padding:8px 0;color:#667983">Horario</td><td style="padding:8px 0">${escapeHtml(startTime)}–${escapeHtml(endTime)}</td></tr>
                <tr><td style="padding:8px 0;color:#667983">Correo</td><td style="padding:8px 0"><a href="mailto:${patientEmail}" style="color:#2f5d73">${patientEmail}</a></td></tr>
                <tr><td style="padding:8px 0;color:#667983">Teléfono</td><td style="padding:8px 0">${patientPhone}</td></tr>
              </table>
              ${
                existingPatient
                  ? '<p style="margin:20px 0 0;padding:12px 16px;border-radius:10px;background:#fff4e5;color:#8a5a00;font-size:13px">Esta reserva es de un paciente que se declara "actual". Confírmala en Table Editor cambiando su estado a <strong>confirmed</strong> cuando compruebes que está en seguimiento — el paciente recibirá entonces su email de confirmación automáticamente.</p>'
                  : ""
              }
              <p style="margin:26px 0 0;color:#667983;font-size:13px">Identificador administrativo: ${escapeHtml(booking.id)}</p>
            </div>
          </div>
        </body>
      </html>`;

    const adminText = `Nueva reserva\n\nPaciente: ${booking.patient_name}\nTipo: ${typeLabel}\nEstado: ${statusLabel}\nFecha: ${date}\nHorario: ${startTime}–${endTime}\nCorreo: ${booking.patient_email}\nTeléfono: ${booking.patient_phone}\nIdentificador: ${booking.id}`;

    try {
      await sendEmail({
        toEmail: ADMIN_EMAIL,
        toName: SENDER_NAME,
        replyToEmail: booking.patient_email,
        replyToName: booking.patient_name,
        subject: adminSubject,
        htmlContent: adminHtml,
        textContent: adminText,
        tag: "booking-admin-notification",
      });

      await sendEmail({
        toEmail: booking.patient_email,
        toName: booking.patient_name,
        replyToEmail: SENDER_EMAIL,
        replyToName: SENDER_NAME,
        subject: patientEmailContent.subject,
        htmlContent: patientEmailContent.html,
        textContent: patientEmailContent.text,
        tag: "booking-patient-confirmation",
      });

      return json({ ok: true, booking_id: booking.id });
    } catch (error) {
      console.error("Error al enviar los correos de reserva", error);
      return json({ error: "No se han podido enviar los correos" }, 502);
    }
  }

  // Caso 2: una reserva 'pending' de paciente existente pasa a 'confirmed'.
  if (payload.type === "UPDATE" && payload.old_record?.status === "pending" && booking.status === "confirmed") {
    const patientEmailContent = buildPatientEmail(booking, "existing_confirmed");
    try {
      await sendEmail({
        toEmail: booking.patient_email,
        toName: booking.patient_name,
        replyToEmail: SENDER_EMAIL,
        replyToName: SENDER_NAME,
        subject: patientEmailContent.subject,
        htmlContent: patientEmailContent.html,
        textContent: patientEmailContent.text,
        tag: "booking-patient-confirmed",
      });
      return json({ ok: true, booking_id: booking.id });
    } catch (error) {
      console.error("Error al enviar el correo de confirmación", error);
      return json({ error: "No se ha podido enviar el correo de confirmación" }, 502);
    }
  }

  // Caso 3: recordatorio programado 24h antes de una cita confirmada.
  if (payload.type === "REMINDER" && booking.status === "confirmed") {
    const patientEmailContent = buildPatientEmail(booking, "reminder");
    try {
      await sendEmail({
        toEmail: booking.patient_email,
        toName: booking.patient_name,
        replyToEmail: SENDER_EMAIL,
        replyToName: SENDER_NAME,
        subject: patientEmailContent.subject,
        htmlContent: patientEmailContent.html,
        textContent: patientEmailContent.text,
        tag: "booking-reminder",
      });
      return json({ ok: true, booking_id: booking.id });
    } catch (error) {
      console.error("Error al enviar el recordatorio", error);
      return json({ error: "No se ha podido enviar el recordatorio" }, 502);
    }
  }

  return json({ skipped: true });
});
