(() => {
  "use strict";
  const REST_URL = "https://grgyvdxkjdstdyumdfyg.supabase.co/rest/v1";
  const KEY = "sb_publishable_b2MRfP0bPti87V2FXCzHGw_Y9vvcbii";
  const ZONE = "Europe/Madrid";
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json"
  };
  const $ = (selector) => document.querySelector(selector);
  const form = $("#booking-form");
  if (!form) return;

  const state = { duration: 60, slots: [], selected: null, month: null, selectedDate: null };
  const els = {
    status: $("#slots-status"), first: $("#first-available"), toggle: $("#toggle-calendar"), calendar: $("#calendar-section"),
    title: $("#calendar-title"), grid: $("#calendar-grid"), times: $("#day-times"), prev: $("#calendar-prev"), next: $("#calendar-next"),
    selected: $("#selected-slot"), summary: $("#selection-summary"), submit: $("#booking-submit"), message: $("#form-message")
  };
  const dateFmt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: ZONE });
  const timeFmt = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONE });
  const monthFmt = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

  function dateKey(iso) {
    const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: ZONE }).formatToParts(new Date(iso));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  const sentenceCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);
  const price = () => 60;
  const formatSlot = (slot) => `${sentenceCase(dateFmt.format(new Date(slot.starts_at)))}, ${timeFmt.format(new Date(slot.starts_at))}–${timeFmt.format(new Date(slot.ends_at))}`;
  function showMessage(text, type = "") {
    els.message.textContent = text;
    els.message.className = `form-message${type ? ` form-message-${type}` : ""}`;
  }
  function selectSlot(slot) {
    state.selected = slot;
    els.selected.value = slot.starts_at;
    els.summary.innerHTML = `<strong>${formatSlot(slot)}</strong><span>${state.duration} minutos · ${price()} €</span>`;
    els.submit.disabled = false;
    showMessage("");
    document.querySelectorAll(".time-option, .first-slot-button").forEach((button) => {
      const selected = button.dataset.startsAt === slot.starts_at;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }
  function slotButton(slot, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.startsAt = slot.starts_at;
    button.setAttribute("aria-pressed", "false");
    button.textContent = className === "time-option" ? timeFmt.format(new Date(slot.starts_at)) : formatSlot(slot);
    button.addEventListener("click", () => selectSlot(slot));
    return button;
  }
  function renderFirst() {
    els.first.replaceChildren();
    if (!state.slots.length) {
      els.status.textContent = "No hay citas disponibles en los próximos 30 días. Puedes contactar por correo electrónico.";
      els.first.hidden = true; els.toggle.hidden = true; els.calendar.hidden = true;
      return;
    }
    els.status.textContent = "Primera cita disponible";
    const label = document.createElement("span");
    label.textContent = `${state.duration} minutos · ${price()} €`;
    els.first.append(slotButton(state.slots[0], "first-slot-button"), label);
    els.first.hidden = false; els.toggle.hidden = false;
  }
  function slotsByDate() {
    return state.slots.reduce((map, slot) => {
      const key = dateKey(slot.starts_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(slot);
      return map;
    }, new Map());
  }
  function renderTimes(key) {
    state.selectedDate = key;
    const daySlots = slotsByDate().get(key) || [];
    els.times.replaceChildren();
    const heading = document.createElement("h4");
    heading.textContent = daySlots.length ? sentenceCase(dateFmt.format(new Date(daySlots[0].starts_at))) : "Sin horarios";
    const options = document.createElement("div");
    options.className = "time-options";
    daySlots.forEach((slot) => options.append(slotButton(slot, "time-option")));
    els.times.append(heading, options);
    renderCalendar();
  }
  function renderCalendar() {
    const available = slotsByDate();
    const year = state.month.getUTCFullYear();
    const month = state.month.getUTCMonth();
    const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    els.title.textContent = sentenceCase(monthFmt.format(state.month));
    els.grid.replaceChildren();
    for (let i = 0; i < firstWeekday; i += 1) {
      const empty = document.createElement("span"); empty.className = "calendar-empty"; els.grid.append(empty);
    }
    for (let day = 1; day <= totalDays; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const button = document.createElement("button");
      button.type = "button"; button.className = "calendar-day"; button.textContent = day; button.disabled = !available.has(key);
      button.classList.toggle("has-slots", available.has(key)); button.classList.toggle("is-selected", state.selectedDate === key);
      button.setAttribute("aria-label", available.has(key) ? `${day}, con citas disponibles` : `${day}, sin disponibilidad`);
      if (available.has(key)) button.addEventListener("click", () => renderTimes(key));
      els.grid.append(button);
    }
    const firstDate = new Date(state.slots[0].starts_at);
    const lastDate = new Date(state.slots[state.slots.length - 1].starts_at);
    const firstMonth = new Date(Date.UTC(firstDate.getFullYear(), firstDate.getMonth(), 1));
    const lastMonth = new Date(Date.UTC(lastDate.getFullYear(), lastDate.getMonth(), 1));
    els.prev.disabled = state.month <= firstMonth; els.next.disabled = state.month >= lastMonth;
  }
  async function loadSlots() {
    state.selected = null; els.selected.value = ""; els.submit.disabled = true;
    els.summary.textContent = "Todavía no has elegido un horario."; els.status.textContent = "Consultando disponibilidad…";
    els.first.hidden = true; els.toggle.hidden = true; els.times.replaceChildren();
    try {
      const response = await fetch(`${REST_URL}/rpc/get_public_appointment_starts`, {
        method: "POST",
        headers,
        body: "{}"
      });
      if (!response.ok) throw new Error("No se ha podido consultar la disponibilidad.");
      state.slots = await response.json();
      if (state.slots.length) {
        const first = new Date(state.slots[0].starts_at);
        state.month = new Date(Date.UTC(first.getFullYear(), first.getMonth(), 1));
      }
      renderFirst();
    } catch (error) {
      els.status.textContent = "No hemos podido cargar los horarios. Inténtalo de nuevo dentro de unos minutos.";
      console.error(error);
    }
  }

  els.toggle.addEventListener("click", () => {
    els.calendar.hidden = !els.calendar.hidden;
    els.toggle.textContent = els.calendar.hidden ? "Elegir otra fecha" : "Ocultar calendario";
    if (!els.calendar.hidden) renderCalendar();
  });
  els.prev.addEventListener("click", () => { state.month = new Date(Date.UTC(state.month.getUTCFullYear(), state.month.getUTCMonth() - 1, 1)); renderCalendar(); });
  els.next.addEventListener("click", () => { state.month = new Date(Date.UTC(state.month.getUTCFullYear(), state.month.getUTCMonth() + 1, 1)); renderCalendar(); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("patient_name") || "").trim();
    const email = String(data.get("patient_email") || "").trim();
    const phone = String(data.get("patient_phone") || "").trim();
    const signer = String(data.get("signer_name") || "").trim();
    if (!state.selected) return showMessage("Selecciona primero una fecha y una hora.", "error");
    if (!name) return showMessage("Escribe tu nombre y apellidos.", "error");
    if (!email) return showMessage("Escribe tu correo electrónico.", "error");
    if (email && !form.elements.patient_email.checkValidity()) return showMessage("Comprueba que el correo electrónico sea válido.", "error");
    if (!phone) return showMessage("Escribe tu número de teléfono.", "error");
    if (!data.get("privacy_acknowledged") || !data.get("informed_consent_accepted") || !data.get("cancellation_accepted")) return showMessage("Debes leer y marcar las tres casillas de aceptación.", "error");
    if (!signer) return showMessage("Escribe tu nombre y apellidos en el campo de firma electrónica.", "error");
    if (signer.toLocaleLowerCase("es") !== name.toLocaleLowerCase("es")) return showMessage("La firma debe coincidir con el nombre y apellidos indicados.", "error");

    els.submit.disabled = true; els.submit.textContent = "Registrando…";
    try {
      const response = await fetch(`${REST_URL}/rpc/create_calendar_booking`, {
        method: "POST", headers,
        body: JSON.stringify({ p_starts_at: state.selected.starts_at, p_duration_minutes: state.duration, p_patient_name: name,
          p_patient_email: email || null, p_patient_phone: phone || null, p_privacy_acknowledged: true,
          p_cancellation_accepted: true, p_informed_consent_accepted: true, p_signer_name: signer })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(String(body.message || "").includes("ya no está disponible") ? "Ese horario acaba de reservarse. Elige otro." : "No se ha podido registrar la reserva.");
      }
      form.reset(); state.duration = 60;
      showMessage("Reserva registrada correctamente. Recibirás la confirmación por el canal indicado.", "success");
      await loadSlots();
    } catch (error) {
      showMessage(`${error.message} Inténtalo de nuevo o contacta por correo electrónico.`, "error"); els.submit.disabled = false;
    } finally {
      els.submit.innerHTML = 'Confirmar reserva <span aria-hidden="true">→</span>';
    }
  });
  loadSlots();
})();
