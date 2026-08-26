(() => {
  "use strict";

  const SUPABASE_REST_URL = "https://grgyvdxkjdstdyumdfyg.supabase.co/rest/v1";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_b2MRfP0bPti87V2FXCzHGw_Y9vvcbii";

  const slotsList = document.querySelector("#slots-list");
  const slotsStatus = document.querySelector("#slots-status");
  const bookingForm = document.querySelector("#booking-form");
  const selectedSlotInput = document.querySelector("#selected-slot");
  const submitButton = document.querySelector("#booking-submit");
  const formMessage = document.querySelector("#form-message");

  if (!slotsList || !slotsStatus || !bookingForm || !selectedSlotInput || !submitButton || !formMessage) {
    return;
  }

  const apiHeaders = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json"
  };

  const dateFormatter = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Madrid"
  });

  const timeFormatter = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid"
  });

  function formatSlot(slot) {
    const startsAt = new Date(slot.starts_at);
    const endsAt = new Date(slot.ends_at);
    const date = dateFormatter.format(startsAt);

    return {
      date: date.charAt(0).toUpperCase() + date.slice(1),
      time: `${timeFormatter.format(startsAt)}–${timeFormatter.format(endsAt)}`
    };
  }

  function showFormMessage(message, type = "") {
    formMessage.textContent = message;
    formMessage.className = `form-message${type ? ` form-message-${type}` : ""}`;
  }

  function renderSlots(slots) {
    slotsList.replaceChildren();

    if (!slots.length) {
      slotsStatus.textContent = "Ahora mismo no hay horarios disponibles. Puedes volver a consultarlo próximamente o contactar por correo electrónico.";
      return;
    }

    slotsStatus.textContent = `${slots.length} ${slots.length === 1 ? "horario disponible" : "horarios disponibles"}`;

    slots.forEach((slot) => {
      const formatted = formatSlot(slot);
      const label = document.createElement("label");
      label.className = "slot-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "available_slot";
      input.value = slot.id;
      input.setAttribute("aria-label", `${formatted.date}, de ${formatted.time}`);

      const copy = document.createElement("span");
      copy.className = "slot-copy";

      const date = document.createElement("strong");
      date.textContent = formatted.date;

      const time = document.createElement("span");
      time.textContent = formatted.time;

      copy.append(date, time);
      label.append(input, copy);

      input.addEventListener("change", () => {
        selectedSlotInput.value = slot.id;
        submitButton.disabled = false;
        showFormMessage("");
      });

      slotsList.append(label);
    });
  }

  async function loadSlots() {
    slotsStatus.textContent = "Consultando horarios disponibles…";

    const query = new URLSearchParams({
      select: "id,starts_at,ends_at",
      available: "eq.true",
      starts_at: `gt.${new Date().toISOString()}`,
      order: "starts_at.asc"
    });

    try {
      const response = await fetch(`${SUPABASE_REST_URL}/appointment_slots?${query}`, {
        headers: apiHeaders
      });

      if (!response.ok) {
        throw new Error("No se ha podido consultar la disponibilidad.");
      }

      const slots = await response.json();
      renderSlots(slots);
    } catch (error) {
      slotsStatus.textContent = "No hemos podido cargar los horarios. Inténtalo de nuevo dentro de unos minutos.";
      console.error(error);
    }
  }

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormMessage("");

    const formData = new FormData(bookingForm);
    const patientName = String(formData.get("patient_name") || "").trim();
    const patientEmail = String(formData.get("patient_email") || "").trim();
    const patientPhone = String(formData.get("patient_phone") || "").trim();
    const privacyAccepted = formData.get("privacy_accepted") === "on";
    const slotId = selectedSlotInput.value;

    if (!slotId) {
      showFormMessage("Selecciona primero un horario.", "error");
      return;
    }

    if (!patientName) {
      showFormMessage("Escribe tu nombre y apellidos.", "error");
      return;
    }

    if (!patientEmail && !patientPhone) {
      showFormMessage("Indica un correo electrónico o un teléfono.", "error");
      return;
    }

    if (patientEmail && !bookingForm.elements.patient_email.checkValidity()) {
      showFormMessage("Comprueba que el correo electrónico sea válido.", "error");
      return;
    }

    if (!privacyAccepted) {
      showFormMessage("Es necesario leer y aceptar la información sobre privacidad.", "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Registrando…";

    try {
      const response = await fetch(`${SUPABASE_REST_URL}/rpc/create_appointment_booking`, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          p_slot_id: slotId,
          p_patient_name: patientName,
          p_patient_email: patientEmail || null,
          p_patient_phone: patientPhone || null,
          p_privacy_accepted: privacyAccepted
        })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const unavailable = String(errorBody.message || "").includes("ya no está disponible");
        throw new Error(unavailable ? "Ese horario acaba de dejar de estar disponible. Elige otro." : "No se ha podido registrar la solicitud.");
      }

      bookingForm.reset();
      selectedSlotInput.value = "";
      showFormMessage("Tu solicitud se ha registrado correctamente. Conserva esta pantalla como confirmación provisional.", "success");
      await loadSlots();
    } catch (error) {
      showFormMessage(`${error.message} Inténtalo de nuevo o contacta por correo electrónico.`, "error");
      submitButton.disabled = false;
    } finally {
      submitButton.replaceChildren("Confirmar solicitud", Object.assign(document.createElement("span"), {
        textContent: "→"
      }));
    }
  });

  loadSlots();
})();
