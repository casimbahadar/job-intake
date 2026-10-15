/* CORE-START: pure functions, no page access. Tests call these through window.Jobs. */
const Jobs = (() => {
  const COMPANY = "Cedar & Copper Plumbing";
  const TYPES = [
    ["leak", "Leak or burst pipe", "a leak or burst pipe"],
    ["drain", "Blocked drain", "a blocked drain"],
    ["noheat", "No heat (furnace or boiler)", "no heat"],
    ["waterheater", "Water heater problem", "your water heater"],
    ["fixture", "Install a tap, toilet or sink", "installing a fixture"],
    ["estimate", "Estimate for a renovation", "a renovation estimate"]
  ];
  const WINDOWS = [["morning", "Morning, 8 to 12", 8, 12], ["afternoon", "Afternoon, 12 to 4", 12, 16], ["evening", "Evening, 4 to 7", 16, 19]];
  const STATUSES = ["New", "Scheduled", "In progress", "Done"];
  const CHECKLISTS = {
    leak: ["Confirm where the main shut-off valve is", "Bring pipe repair fittings and a leak kit", "Photograph any water damage before starting", "Test the repair under full pressure", "Explain drying and follow-up steps"],
    drain: ["Ask which drains are slow or backed up", "Bring an auger and the drain camera", "Protect the floor around the drain", "Run water to confirm it drains freely", "Note if it has happened before"],
    noheat: ["Check the thermostat settings with the customer", "Bring common furnace and boiler parts", "Check the filter and ignition", "Run a full heating cycle before leaving", "List any parts that need ordering"],
    waterheater: ["Note tank or tankless, gas or electric", "Read the model and age from the label", "Bring common parts for that model", "Test hot water at a tap", "Explain repair and replacement options"],
    fixture: ["Confirm the new fixture is on site", "Bring supply lines and sealant", "Shut off water at the fixture", "Test for leaks after install", "Remove the old fixture if asked"],
    estimate: ["Measure the space", "Photograph the existing plumbing", "Note any access problems", "List the fixtures the customer wants", "Agree when the estimate will be sent"]
  };
  const typeLabel = k => (TYPES.find(t => t[0] === k) || [k, k])[1];
  const typePhrase = k => (TYPES.find(t => t[0] === k) || [k, k, k])[2];
  const win = k => WINDOWS.find(w => w[0] === k);

  const pad = n => String(n).padStart(2, "0");
  const localToday = (d = new Date()) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const dayNum = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  const addDays = (s, n) => new Date((dayNum(s) + n) * 86400000).toISOString().slice(0, 10);
  const longDate = s => new Date(dayNum(s) * 86400000).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  function cleanPhone(raw) {
    const v = String(raw || "").trim();
    let d = v.replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") d = d.slice(1);
    if (/[a-z]/i.test(v) || !/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
    return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
  }
  const POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;
  function cleanPostal(raw) {
    const k = String(raw || "").toUpperCase().replace(/[\s-]/g, "");
    return POSTAL.test(k) ? k.slice(0, 3) + " " + k.slice(3) : null;
  }

  // input: raw form values. today: "YYYY-MM-DD". Returns { errors, job }.
  function validate(input, today) {
    const e = {}, t = s => String(s || "").trim().replace(/\s+/g, " ");
    const name = t(input.name), email = t(input.email), address = t(input.address), city = t(input.city), desc = String(input.desc || "").trim();
    if (name.length < 2) e.name = "Enter your name.";
    const phone = cleanPhone(input.phone);
    if (!t(input.phone)) e.phone = "Enter a phone number.";
    else if (!phone) e.phone = "Enter a 10-digit phone number, like 519-555-0142.";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = "Enter an email like name@example.com, or leave it empty.";
    if (!address) e.address = "Enter the street address for the visit.";
    if (!city) e.city = "Enter the city.";
    const postal = cleanPostal(input.postal);
    if (!t(input.postal)) e.postal = "Enter the postal code.";
    else if (!postal) e.postal = "Enter a Canadian postal code, like N2L 3G1.";
    if (!TYPES.some(x => x[0] === input.type)) e.type = "Choose what you need.";
    if (!desc) e.desc = "Describe the problem in a few words.";
    else if (desc.length < 10) e.desc = "Add a little more detail, at least 10 characters.";
    const date = String(input.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) e.date = "Choose a date.";
    else if (dayNum(date) < dayNum(today)) e.date = "Choose today or a later date.";
    else if (dayNum(date) - dayNum(today) > 180) e.date = "Choose a date within the next 6 months.";
    if (!win(input.window)) e.window = "Choose a time of day.";
    if (Object.keys(e).length) return { errors: e, job: null };
    return { errors: {}, job: { name, phone, email: email.toLowerCase(), address, city, postal, type: input.type, desc, date, window: input.window, leak: !!input.leak, sewage: !!input.sewage } };
  }

  // Rules run in order; the first that fits decides.
  function priority(job, receivedDay) {
    const month = +receivedDay.slice(5, 7);
    if (job.leak) return ["Urgent", "Water is leaking right now"];
    if (job.sewage) return ["Urgent", "Sewage is backing up"];
    if (job.type === "noheat" && (month >= 10 || month <= 4)) return ["Urgent", "No heat between October and April"];
    if (dayNum(job.date) - dayNum(receivedDay) <= 7) return ["Soon", "Visit wanted within 7 days"];
    return ["Routine", "No urgent signs and the visit is more than 7 days away"];
  }

  function message(job) {
    const first = job.name.split(" ")[0];
    const w = win(job.window);
    const next = job.priority === "Urgent" ? "Because this is urgent, we'll call you shortly to arrange the soonest visit." : "We'll confirm the exact arrival time the day before.";
    return "Hi " + first + ", thanks for contacting " + COMPANY + " about " + typePhrase(job.type) + ". We have your request for " + longDate(job.date) + ", " + w[1].toLowerCase() + ". " + next + " Your job number is " + job.id + ". Reply to this message if anything changes.";
  }

  // iCalendar (RFC 5545) with an America/Toronto time zone block.
  function icsText(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n"); }
  function fold(line) {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    const out = []; let cur = "", curBytes = 0, limit = 75;
    for (const ch of line) {
      const b = new TextEncoder().encode(ch).length;
      if (curBytes + b > limit) { out.push(cur); cur = ""; curBytes = 0; limit = 74; }
      cur += ch; curBytes += b;
    }
    out.push(cur);
    return out.join("\r\n ");
  }
  function ics(job, now = new Date()) {
    const w = win(job.window), d = job.date.replace(/-/g, "");
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Casim Bahadar//Job intake demo//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VTIMEZONE", "TZID:America/Toronto",
      "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
      "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:" + job.id + "-" + job.received.replace(/\D/g, "") + "@demo-job-intake",
      "DTSTAMP:" + stamp,
      "DTSTART;TZID=America/Toronto:" + d + "T" + pad(w[2]) + "0000",
      "DTEND;TZID=America/Toronto:" + d + "T" + pad(w[3]) + "0000",
      "SUMMARY:" + icsText(typeLabel(job.type) + " at " + job.address + " (" + job.id + ")"),
      "LOCATION:" + icsText(job.address + ", " + job.city + ", ON " + job.postal),
      "DESCRIPTION:" + icsText("Priority: " + job.priority + " (" + job.rule + ")\nCustomer: " + job.name + ", " + job.phone + (job.email ? ", " + job.email : "") + "\n\nRequest: " + job.desc + "\n\nChecklist:\n" + CHECKLISTS[job.type].map(c => "- " + c).join("\n")),
      "STATUS:" + (job.status === "New" ? "TENTATIVE" : "CONFIRMED"),
      "END:VEVENT", "END:VCALENDAR"
    ];
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  // CSV. Cells that start with = + - @ or a control character get a leading apostrophe,
  // so a spreadsheet shows them as text instead of running them as formulas.
  const CSV_HEAD = ["Job number", "Received", "Status", "Priority", "Priority rule", "Request type", "Name", "Phone", "Email", "Street address", "City", "Postal code", "Preferred date", "Time of day", "Visit start", "Visit end", "Description", "Checklist done"];
  function csvRow(job) {
    const w = win(job.window);
    return [job.id, job.received, job.status, job.priority, job.rule, typeLabel(job.type), job.name, job.phone, job.email, job.address, job.city, job.postal,
      job.date, w[1], job.date + " " + pad(w[2]) + ":00", job.date + " " + pad(w[3]) + ":00", job.desc, job.checks.filter(Boolean).length + " of " + job.checks.length];
  }
  function toCSV(rows) {
    const cell = v => {
      let s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [CSV_HEAD, ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
  }

  function makeJob(clean, id, receivedIso, status) {
    const job = Object.assign({}, clean, { id, received: receivedIso, status: status || "New" });
    [job.priority, job.rule] = priority(job, receivedIso.slice(0, 10));
    job.checks = CHECKLISTS[job.type].map(() => false);
    return job;
  }

  // Sample requests, dated relative to today so they never go stale.
  function sample(today) {
    const S = [
      [0, { name: "Maya Patel", phone: "519-555-0100", email: "maya.patel@example.com", address: "10 King St W", city: "Kitchener", postal: "N2G 1A1", type: "leak", leak: true, desc: "Pipe under the kitchen sink burst and water is on the floor.", window: "morning" }, 0, "New", 0],
      [0, { name: "Omar Haddad", phone: "519-555-0101", email: "", address: "17 Queen St S", city: "Kitchener", postal: "N2G 1V6", type: "drain", sewage: true, desc: "Basement floor drain is backing up with sewage.", window: "afternoon" }, 1, "Scheduled", 0],
      [-1, { name: "Grace Liu", phone: "519-555-0102", email: "grace.liu@example.net", address: "24 Erb St W", city: "Waterloo", postal: "N2L 1S7", type: "noheat", desc: "Furnace stopped working last night, no heat upstairs.", window: "morning" }, 2, "In progress", 2],
      [0, { name: "Liam Fraser", phone: "519-555-0103", email: "liam.fraser@example.org", address: "31 Weber St N", city: "Waterloo", postal: "N2J 3G5", type: "waterheater", desc: "Hot water runs out after a few minutes.", window: "evening" }, 3, "New", 0],
      [0, { name: "Sofia Rossi", phone: "519-555-0104", email: "sofia.rossi@example.com", address: "38 University Ave E", city: "Waterloo", postal: "N2K 1K6", type: "fixture", desc: "New bathroom faucet to install, already bought.", window: "afternoon" }, 7, "Scheduled", 0],
      [0, { name: "Yusuf Khan", phone: "226-555-0105", email: "", address: "45 Columbia St W", city: "Waterloo", postal: "N2L 3K7", type: "fixture", desc: "Replace a running toilet with a new low-flow one.", window: "morning" }, 8, "New", 0],
      [-8, { name: "Nadia Petrova", phone: "519-555-0106", email: "nadia.p@example.org", address: "52 Victoria St S", city: "Kitchener", postal: "N2G 2B2", type: "estimate", desc: "Quote for moving the laundry sink to the other wall.", window: "afternoon" }, -5, "Done", 5],
      [0, { name: "Owen Clarke", phone: "519-555-0107", email: "owen.clarke@example.com", address: "59 Belmont Ave W", city: "Kitchener", postal: "N2M 1L2", type: "estimate", desc: "Estimate for a full basement bathroom.", window: "evening" }, 20, "New", 0]
    ];
    return S.map(([recv, f, dateOff, status, done], i) => {
      const receivedDay = addDays(today, recv);
      const job = makeJob(Object.assign({ leak: false, sewage: false }, f, { date: addDays(receivedDay, dateOff - recv) }), "", receivedDay + "T09:" + pad(10 + i) + ":00", status);
      job.checks = job.checks.map((_, k) => k < done);
      job.sample = true;
      return job;
    });
  }

  return { CSV_HEAD, COMPANY, TYPES, WINDOWS, STATUSES, CHECKLISTS, typeLabel, localToday, addDays, longDate, validate, priority, message, ics, csvRow, toCSV, makeJob, sample, cleanPhone, cleanPostal };
})();
window.Jobs = Jobs;
/* CORE-END */

(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KEY = "demo-job-intake:v1";
  const S = Jobs.STATUSES;
  let data = { next: 1001, jobs: [] }, canSave = true, lastCleared = null;
  const ui = { show: "New", open: new Set(), more: new Set() };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); if (d && Array.isArray(d.jobs)) data = d; }
    } catch (e) { canSave = false; }
  }
  function save() {
    // any change after a clear retires the undo, so it can't wipe newer work
    if (lastCleared) { lastCleared = null; $("btn-clear").textContent = "Clear demo data"; delete $("btn-clear").dataset.undo; }
    if (!canSave) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { canSave = false; storageNote(); }
  }
  function storageNote() {
    $("storage-note").textContent = canSave
      ? "Jobs are saved in this browser only, under a key that belongs to this demo. Clear demo data removes them and nothing else."
      : "This browser isn't letting the page save, so jobs will disappear when you close it.";
  }
  const nextId = () => "CC-" + data.next++;

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const dlIcs = job => download(job.id + "-visit.ics", Jobs.ics(job), "text/calendar;charset=utf-8");
  const dlRow = job => download(job.id + "-row.csv", "\uFEFF" + Jobs.toCSV([Jobs.csvRow(job)]), "text/csv;charset=utf-8");

  // ---- form
  $("type-choices").innerHTML = Jobs.TYPES.map(([k, l]) => '<label class="choice"><input type="radio" name="type" value="' + k + '"> ' + esc(l) + "</label>").join("");
  $("window-choices").innerHTML = Jobs.WINDOWS.map(([k, l]) => '<label class="choice"><input type="radio" name="window" value="' + k + '"> ' + esc(l) + "</label>").join("");
  function setMinDate() { $("f-date").min = Jobs.localToday(); }
  setMinDate();

  const FIELDS = ["name", "phone", "email", "address", "city", "postal", "type", "desc", "date", "window"];
  const FIELD_EL = { type: "f-type", window: "f-window" };
  const FOCUS_EL = { type: () => document.querySelector('input[name="type"]'), window: () => document.querySelector('input[name="window"]') };

  function readForm() {
    const radio = n => (document.querySelector('#form input[name="' + n + '"]:checked') || {}).value || "";
    const v = id => $("f-" + id).value;
    return { name: v("name"), phone: v("phone"), email: v("email"), address: v("address"), city: v("city"), postal: v("postal"),
      type: radio("type"), desc: v("desc"), date: v("date"), window: radio("window"), leak: $("f-leak").checked, sewage: $("f-sewage").checked };
  }
  function showErrors(errors, only) {
    for (const k of FIELDS) {
      if (only && k !== only) continue;
      const msg = errors[k] || "";
      $("e-" + k).textContent = msg;
      const el = $(FIELD_EL[k] || "f-" + k);
      if (msg) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    }
  }
  // Errors appear when the person taps Send. After that, a field's message updates while they fix
  // that field. Nothing is checked on leaving a field, so the layout never shifts under a tap.
  let tried = false;
  function recheck(name) {
    const el = $(FIELD_EL[name] || "f-" + name);
    if (!tried || el.getAttribute("aria-invalid") !== "true") return;
    showErrors(Jobs.validate(readForm(), Jobs.localToday()).errors, name);
  }
  $("form").addEventListener("input", e => { if (FIELDS.includes(e.target.name) && e.target.type !== "radio") recheck(e.target.name); });
  $("form").addEventListener("change", e => { if (e.target.name === "type" || e.target.name === "window") recheck(e.target.name); });
  $("f-gas").addEventListener("change", () => { $("gas-warning").hidden = !$("f-gas").checked; });

  $("form").addEventListener("submit", e => {
    e.preventDefault();
    setMinDate();
    if ($("f-gas").checked) { $("gas-warning").hidden = false; $("gas-warning").scrollIntoView({ block: "center" }); $("f-gas").focus(); return; }
    tried = true;
    const today = Jobs.localToday();
    const { errors, job } = Jobs.validate(readForm(), today);
    showErrors(errors);
    const keys = FIELDS.filter(k => errors[k]);
    if (keys.length) {
      $("error-list").innerHTML = keys.map(k => '<li><a href="#' + (FIELD_EL[k] || "f-" + k) + '" data-focus="' + k + '">' + esc(errors[k]) + "</a></li>").join("");
      $("error-summary").hidden = false;
      $("error-summary").focus();
      return;
    }
    $("error-summary").hidden = true;
    const now = new Date();
    const created = Jobs.makeJob(job, nextId(), today + "T" + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + ":00", "New");
    data.jobs.push(created);
    save();
    renderOutput(created);
    renderBoard();
    $("form").reset();
    tried = false;
    showErrors({});
    $("gas-warning").hidden = true;
  });
  $("error-list").addEventListener("click", e => {
    const a = e.target.closest("[data-focus]");
    if (!a) return;
    e.preventDefault();
    const k = a.dataset.focus;
    (FOCUS_EL[k] ? FOCUS_EL[k]() : $("f-" + k)).focus();
  });

  $("btn-fill").addEventListener("click", () => {
    const set = (id, v) => { $("f-" + id).value = v; };
    set("name", "Jordan Lee"); set("phone", "(519) 555 0150"); set("email", "jordan.lee@example.com");
    set("address", "88 Weber St N"); set("city", "Waterloo"); set("postal", "n2j 3h1");
    document.querySelector('#form input[name="type"][value="drain"]').checked = true;
    set("desc", "Kitchen sink drains very slowly and gurgles.");
    set("date", Jobs.addDays(Jobs.localToday(), 3));
    document.querySelector('#form input[name="window"][value="afternoon"]').checked = true;
    $("f-leak").checked = false; $("f-sewage").checked = false; $("f-gas").checked = false; $("gas-warning").hidden = true;
    showErrors({}); $("error-summary").hidden = true;
    $("btn-send").focus();
  });

  // ---- one job's outputs (used after sending and inside board cards)
  function jobOutputs(job, headTag) {
    const h = headTag || "h4";
    return '<div class="out-part"><' + h + '>Priority</' + h + '><p><span class="prio prio-' + job.priority + '">' + job.priority + "</span> " + esc(job.rule) + ".</p></div>" +
      '<div class="out-part"><' + h + ">Checklist for this job</" + h + '><ul class="checklist">' +
      Jobs.CHECKLISTS[job.type].map((c, i) => '<li><label class="choice"><input type="checkbox" data-check="' + esc(job.id) + '" data-i="' + i + '"' + (job.checks[i] ? " checked" : "") + "> " + esc(c) + "</label></li>").join("") + "</ul></div>" +
      '<div class="out-part"><' + h + ">Message to the customer</" + h + '><textarea class="msg" readonly aria-label="Message draft for ' + esc(job.name) + '" data-msg="' + esc(job.id) + '">' + esc(Jobs.message(job)) + "</textarea>" +
      '<div class="actions"><button class="btn btn-quiet" type="button" data-copy="' + esc(job.id) + '">Copy message</button></div><p class="small muted" data-copied="' + esc(job.id) + '" role="status"></p></div>' +
      '<div class="out-part"><' + h + ">Calendar event</" + h + '><p class="small">' + esc(Jobs.longDate(job.date)) + ", " + esc(Jobs.WINDOWS.find(w => w[0] === job.window)[1].toLowerCase()) + ". Most calendar apps can open this file.</p>" +
      '<div class="actions"><button class="btn btn-quiet" type="button" data-ics="' + esc(job.id) + '">Download calendar event</button></div></div>' +
      '<div class="out-part"><' + h + ">Spreadsheet row</" + h + '><p class="small">One row with ' + Jobs.CSV_HEAD.length + " columns, ready to paste into the office sheet.</p>" +
      '<div class="actions"><button class="btn btn-quiet" type="button" data-row="' + esc(job.id) + '">Download spreadsheet row</button></div></div>';
  }
  function renderOutput(job) {
    $("output").innerHTML = "<h3>Request " + esc(job.id) + " received</h3><p>Everything below came from that one form. The job is also on the office board.</p>" + jobOutputs(job, "h4") +
      '<div class="actions"><button class="btn btn-primary" type="button" id="btn-again">Send another request</button></div>';
    $("output").hidden = false;
    fitMessages();
    $("output").focus();
  }
  // Grow message boxes to fit. Measuring briefly shrinks the page, which can pull the scroll position up,
  // so the position is put back afterwards.
  function fitMessages() {
    const y = window.scrollY;
    document.querySelectorAll(".msg").forEach(t => { t.style.height = "auto"; t.style.height = (t.scrollHeight + 4) + "px"; });
    if (window.scrollY !== y) window.scrollTo(0, y);
  }
  window.addEventListener("resize", fitMessages);
  const findJob = id => data.jobs.find(j => j.id === id);
  document.addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "btn-again") { $("output").hidden = true; $("f-name").focus(); $("form").scrollIntoView({ block: "start" }); return; }
    if (b.dataset.ics) dlIcs(findJob(b.dataset.ics));
    if (b.dataset.row) dlRow(findJob(b.dataset.row));
    if (b.dataset.copy) {
      const id = b.dataset.copy, text = Jobs.message(findJob(id));
      const out = [...document.querySelectorAll('[data-copied="' + id + '"]')];
      try { await navigator.clipboard.writeText(text); out.forEach(o => { o.textContent = "Copied."; }); }
      catch (err) {
        const ta = b.closest(".out-part").querySelector("textarea"); ta.focus(); ta.select();
        out.forEach(o => { o.textContent = "Copying isn't allowed here. The message is selected, so you can copy it yourself."; });
      }
    }
  });
  document.addEventListener("change", e => {
    const c = e.target.closest("[data-check]");
    if (!c) return;
    const job = findJob(c.dataset.check);
    job.checks[+c.dataset.i] = c.checked;
    save();
    document.querySelectorAll('[data-check="' + CSS.escape(job.id) + '"][data-i="' + c.dataset.i + '"]').forEach(x => { x.checked = c.checked; });
    const meta = document.querySelector('[data-progress="' + CSS.escape(job.id) + '"]');
    if (meta) meta.textContent = job.checks.filter(Boolean).length + " of " + job.checks.length + " checklist items done";
  });

  // ---- board
  function renderBoard() {
    const counts = S.map(s => data.jobs.filter(j => j.status === s).length);
    $("board-summary").textContent = data.jobs.length ? data.jobs.length + (data.jobs.length === 1 ? " job" : " jobs") + ": " + S.map((s, i) => counts[i] + " " + s.toLowerCase()).join(", ") + "." : "No jobs yet. Send a request above or load the sample data.";
    $("board-show").innerHTML = S.map((s, i) => '<option value="' + s + '">' + s + " (" + counts[i] + ")</option>").join("");
    $("board-show").value = ui.show;
    const order = { Urgent: 0, Soon: 1, Routine: 2 };
    $("board").innerHTML = S.map((s, si) => {
      const jobs = data.jobs.filter(j => j.status === s).sort((a, b) => order[a.priority] - order[b.priority] || a.date.localeCompare(b.date));
      const cap = ui.more.has(s) ? jobs.length : 50;
      const cards = jobs.slice(0, cap).map(j => card(j, si)).join("");
      const more = jobs.length > cap ? '<div class="actions"><button class="btn btn-quiet" type="button" data-more="' + s + '">Show all ' + jobs.length + "</button></div>" : "";
      return '<section class="col" aria-labelledby="col-' + si + '"' + (s === ui.show ? "" : " hidden") + '><h3 id="col-' + si + '" tabindex="-1">' + s + ' <span class="count">' + jobs.length + "</span></h3>" +
        (jobs.length ? '<ul class="cards">' + cards + "</ul>" : '<p class="empty-col">Nothing here.</p>') + more + "</section>";
    }).join("");
  }
  function card(j, si) {
    const open = ui.open.has(j.id);
    const w = Jobs.WINDOWS.find(x => x[0] === j.window);
    const fwd = si < S.length - 1 ? '<button class="btn btn-primary" type="button" data-move="' + esc(j.id) + '" data-to="' + (si + 1) + '">Move to ' + S[si + 1] + "</button>" : "";
    const back = si > 0 ? '<button class="btn btn-quiet" type="button" data-move="' + esc(j.id) + '" data-to="' + (si - 1) + '">Back to ' + S[si - 1] + "</button>" : "";
    return '<li class="card" id="card-' + esc(j.id) + '"><span class="prio prio-' + j.priority + '">' + j.priority + "</span>" +
      "<h4>" + esc(Jobs.typeLabel(j.type)) + "</h4>" +
      "<p>" + esc(j.name) + ", " + esc(j.city) + "</p>" +
      '<p class="meta">' + esc(j.id) + ". Visit " + esc(Jobs.longDate(j.date)) + ", " + esc(w[1].toLowerCase()) + ".</p>" +
      '<p class="meta" data-progress="' + esc(j.id) + '">' + j.checks.filter(Boolean).length + " of " + j.checks.length + " checklist items done</p>" +
      '<div class="actions">' + fwd + back + '<button class="btn btn-quiet" type="button" data-toggle="' + esc(j.id) + '" aria-expanded="' + open + '" aria-controls="det-' + esc(j.id) + '">' + (open ? "Hide details" : "Show details") + "</button></div>" +
      '<div class="details" id="det-' + esc(j.id) + '"' + (open ? "" : " hidden") + ">" + (open ? '<p class="small">' + esc(j.desc) + "</p>" + jobOutputs(j, "h5") : "") + "</div></li>";
  }
  $("board").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.more) { ui.more.add(b.dataset.more); renderBoard(); return; }
    if (b.dataset.toggle) {
      const id = b.dataset.toggle;
      ui.open.has(id) ? ui.open.delete(id) : ui.open.add(id);
      renderBoard();
      document.querySelector('[data-toggle="' + CSS.escape(id) + '"]').focus();
      return;
    }
    if (b.dataset.move) {
      const job = findJob(b.dataset.move), from = S.indexOf(job.status), to = +b.dataset.to;
      job.status = S[to];
      save();
      renderBoard();
      $("announce").textContent = job.id + " moved to " + S[to] + ".";
      const again = document.querySelector('#card-' + CSS.escape(job.id) + ' [data-move]');
      if (again && !again.closest(".col").hidden) again.focus();
      else $("col-" + from).focus();
    }
    fitMessages();
  });
  $("board-show").addEventListener("change", () => { ui.show = $("board-show").value; renderBoard(); });

  $("btn-sample-top").addEventListener("click", () => {
    $("btn-sample").click();
    $("h-board").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    $("h-board").focus({ preventScroll: true });
  });
  $("btn-sample").addEventListener("click", () => {
    data.jobs = data.jobs.filter(j => !j.sample);
    for (const j of Jobs.sample(Jobs.localToday())) { j.id = nextId(); data.jobs.push(j); }
    save(); renderBoard();
    $("announce").textContent = "Loaded 8 sample jobs.";
  });
  $("btn-export").addEventListener("click", () => {
    if (!data.jobs.length) { $("announce").textContent = "There are no jobs to export yet."; $("board-summary").textContent = "There are no jobs to export yet. Send a request above or load the sample data."; return; }
    download("cedar-and-copper-jobs.csv", "\uFEFF" + Jobs.toCSV(data.jobs.map(Jobs.csvRow)), "text/csv;charset=utf-8");
  });
  // Undo beats confirm: clearing is immediate, with one undo.
  $("btn-clear").addEventListener("click", () => {
    if ($("btn-clear").dataset.undo) {
      data = lastCleared; lastCleared = null; save(); renderBoard();
      $("btn-clear").textContent = "Clear demo data"; delete $("btn-clear").dataset.undo;
      $("announce").textContent = "Demo data restored.";
      return;
    }
    lastCleared = JSON.parse(JSON.stringify(data));
    try { Object.keys(localStorage).filter(k => k.startsWith("demo-job-intake:")).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    data = { next: 1001, jobs: [] };
    ui.open.clear();
    $("output").hidden = true;
    renderBoard();
    $("btn-clear").textContent = "Undo clear"; $("btn-clear").dataset.undo = "1";
    $("announce").textContent = "Demo data cleared.";
  });

  load();
  storageNote();
  renderBoard();
})();
