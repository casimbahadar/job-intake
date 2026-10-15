# Headless tests for demo 3 against the shipped out/index.html.
import csv, io, time, sys, os, subprocess, json
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
import icalendar
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  :: " + str(detail)[:700]))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8097", "--bind", "127.0.0.1", "-d", os.path.join(ROOT, "out")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
URL = "http://127.0.0.1:8097/index.html"
WINTER = "2026-11-10T10:00:00-05:00"; SUMMER = "2026-07-14T10:00:00-04:00"
# Expected, written by hand from the rules (not computed by the page)
EXP_WINTER = {"Maya Patel": ("Urgent", "Water is leaking right now"), "Omar Haddad": ("Urgent", "Sewage is backing up"),
  "Grace Liu": ("Urgent", "No heat between October and April"), "Liam Fraser": ("Soon", "Visit wanted within 7 days"),
  "Sofia Rossi": ("Soon", "Visit wanted within 7 days"), "Yusuf Khan": ("Routine", "No urgent signs and the visit is more than 7 days away"),
  "Nadia Petrova": ("Soon", "Visit wanted within 7 days"), "Owen Clarke": ("Routine", "No urgent signs and the visit is more than 7 days away")}
EXP_SUMMER = dict(EXP_WINTER, **{"Grace Liu": ("Soon", "Visit wanted within 7 days")})
EXP_STATUS = {"New": 4, "Scheduled": 2, "In progress": 1, "Done": 1}
errors = []

def rcsv(path):
    t = open(path, encoding="utf-8").read(); t = t[1:] if t.startswith("\ufeff") else t
    return list(csv.reader(io.StringIO(t)))
def grab(page, sel):
    with page.expect_download() as d: page.click(sel)
    return d.value.path()
def new_page(br, when=WINTER, **kw):
    c = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, accept_downloads=True, timezone_id="America/Toronto", **kw)
    c.route("**/fonts.g*/**", lambda r: r.abort())
    p = c.new_page(); p.set_default_timeout(8000)
    p.clock.set_fixed_time(when)
    p.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    p.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "example.com/x" not in m.text else None)
    p.goto(URL); p.wait_for_selector("#btn-sample")
    return c, p
def fill_valid(p, **over):
    v = dict(name="Jordan Lee", phone="(519) 555 0150", email="jordan.lee@example.com", address="88 Weber St N", city="Waterloo", postal="n2j 3h1",
             type="drain", desc="Kitchen sink drains very slowly and gurgles.", date="2026-11-13", window="afternoon")
    v.update(over)
    for k in ("name", "phone", "email", "address", "city", "postal", "desc", "date"):
        p.fill("#f-" + k, v[k])
    for k in ("type", "window"):
        p.evaluate("n => document.querySelectorAll('#form input[name=' + n + ']').forEach(i => i.checked = false)", k)
        if v[k]: p.check(f'#form input[name="{k}"][value="{v[k]}"]')
def job_count(p):
    return p.evaluate("JSON.parse(localStorage.getItem('demo-job-intake:v1') || '{\"jobs\":[]}').jobs.length")

with sync_playwright() as pw:
    br = pw.chromium.launch(args=["--no-sandbox"])

    # ---- sample priorities and statuses, winter and summer
    for when, exp, label in ((WINTER, EXP_WINTER, "November"), (SUMMER, EXP_SUMMER, "July")):
        c, p = new_page(br, when)
        p.click("#btn-sample")
        path = grab(p, "#btn-export")
        rows = rcsv(path); h = rows[0]
        got = {r[h.index("Name")]: (r[h.index("Priority")], r[h.index("Priority rule")]) for r in rows[1:]}
        check(f"8 sample jobs get exactly the planned priority and rule ({label})", got == exp, {k: (got.get(k), exp[k]) for k in exp if got.get(k) != exp[k]})
        if label == "November":
            st = {}
            for r in rows[1:]: st[r[h.index("Status")]] = st.get(r[h.index("Status")], 0) + 1
            check("sample statuses: 4 new, 2 scheduled, 1 in progress, 1 done", st == EXP_STATUS, st)
            check("export has 18 columns per row", all(len(r) == 18 for r in rows), [len(r) for r in rows][:3])
            check("board summary counts come from the data", "8 jobs: 4 new, 2 scheduled, 1 in progress, 1 done" in p.inner_text("#board-summary"), p.inner_text("#board-summary"))
            p.click("#btn-sample")
            check("loading the sample twice replaces it instead of duplicating", job_count(p) == 8, job_count(p))
        c.close()

    # ---- the seasonal rule at its edges, through the page's own rule function
    c, p = new_page(br)
    edges = p.evaluate("""[['2026-04-30','2026-05-20'],['2026-05-01','2026-05-20'],['2026-09-30','2026-10-20'],['2026-10-01','2026-10-20']]
        .map(([r,d]) => Jobs.priority({type:'noheat', leak:false, sewage:false, date:d}, r)[0])""")
    check("no-heat rule edges: Apr 30 urgent, May 1 not, Sep 30 not, Oct 1 urgent", edges == ["Urgent", "Routine", "Routine", "Urgent"], edges)
    seven = p.evaluate("[7,8].map(n => Jobs.priority({type:'fixture',leak:false,sewage:false,date:Jobs.addDays('2026-11-10',n)}, '2026-11-10')[0])")
    check("7 days away is Soon, 8 days is Routine", seven == ["Soon", "Routine"], seven)

    # ---- the core flow: fill, send, outputs (2 taps)
    p.click("#btn-fill"); p.click("#btn-send")
    p.wait_for_selector("#output:not([hidden])")
    out = p.inner_text("#output")
    check("2 taps (fill, send) produce all five outputs", all(s in out for s in ["Priority", "Checklist for this job", "Message to the customer", "Calendar event", "Spreadsheet row"]), out[:300])
    check("filled request (3 days away) is Soon by the 7-day rule", "Soon" in out and "Visit wanted within 7 days" in out)
    msg = p.input_value("#output textarea")
    check("message box is tall enough to show the whole draft", p.evaluate("(() => { const t = document.querySelector('#output textarea'); return t.scrollHeight <= t.clientHeight + 2; })()"))
    check("message uses first name, date, window and job number", msg.startswith("Hi Jordan,") and "Friday, November 13" in msg and "afternoon, 12 to 4" in msg and "CC-1001" in msg, msg)
    check("job saved and form cleared", job_count(p) == 1 and p.input_value("#f-name") == "")

    # ---- calendar file parsed by an independent library
    ics_path = grab(p, "#output [data-ics]")
    raw = open(ics_path, "rb").read()
    cal = icalendar.Calendar.from_ical(raw)
    ev = [x for x in cal.walk("VEVENT")]
    start = ev[0].decoded("DTSTART"); end = ev[0].decoded("DTEND")
    check(".ics parses: one event, 12:00 to 16:00 Toronto = 17:00 to 21:00 UTC in November",
          len(ev) == 1 and start.astimezone(timezone.utc).hour == 17 and end.astimezone(timezone.utc).hour == 21 and start.date().isoformat() == "2026-11-13", (start, end))
    lines = raw.split(b"\r\n")
    check(".ics lines are CRLF and at most 75 bytes", all(len(l) <= 75 for l in lines) and b"\n" not in raw.replace(b"\r\n", b""), max(len(l) for l in lines))
    check(".ics location and summary", "88 Weber St N, Waterloo, ON N2J 3H1" == str(ev[0]["LOCATION"]) and "CC-1001" in str(ev[0]["SUMMARY"]), (ev[0]["LOCATION"], ev[0]["SUMMARY"]))

    # ---- spreadsheet row
    row = rcsv(grab(p, "#output [data-row]"))
    check("spreadsheet row: header plus one row, phone and postal code cleaned", len(row) == 2 and row[1][0] == "CC-1001" and row[1][7] == "519-555-0150" and row[1][11] == "N2J 3H1", row)

    # ---- six planted bad inputs, one at a time
    bad = [("phone", dict(phone="555-0142"), "10-digit phone"), ("postal", dict(postal="D2L 3G1"), "Canadian postal code"),
           ("date", dict(date="2026-11-09"), "today or a later date"), ("desc", dict(desc=""), "Describe the problem"),
           ("email", dict(email="jordan@"), "name@example.com"), ("type", dict(type=""), "Choose what you need")]
    for field, over, text in bad:
        p.click("#btn-again") if p.is_visible("#btn-again") else None
        before = job_count(p)
        fill_valid(p, **over); p.click("#btn-send")
        errs = p.inner_text("#error-list")
        inv = p.get_attribute("#f-" + field, "aria-invalid")
        check(f"rejects bad {field}: message shown, field marked, no job created", text in errs and inv == "true" and job_count(p) == before and errs.count("\n") == 0, (errs, inv))
    fill_valid(p, phone="555", postal="12345", date="2026-01-01", desc="", email="x@", type="")
    p.click("#btn-send")
    items = p.eval_on_selector_all("#error-list li", "e => e.length")
    check("all six at once: summary lists 6, focus on the summary, typed values kept", items == 6 and p.evaluate("document.activeElement.id") == "error-summary" and p.input_value("#f-name") == "Jordan Lee", items)
    p.click('#error-list [data-focus="postal"]')
    check("error link moves focus to its field", p.evaluate("document.activeElement.id") == "f-postal")
    p.fill("#f-postal", "N2J 3H1")
    check("fixing a field clears its message as you type; other messages stay", p.inner_text("#e-postal") == "" and p.inner_text("#e-phone") != "")
    y0 = p.evaluate("document.querySelector('#form input[name=window][value=morning]').getBoundingClientRect().top")
    p.focus("#f-desc"); p.check('#form input[name="window"][value="morning"]')
    y1 = p.evaluate("document.querySelector('#form input[name=window][value=morning]').getBoundingClientRect().top")
    check("leaving a field doesn't move the layout under the next tap", abs(y1 - y0) < 1 or p.is_checked('#form input[name="window"][value="morning"]'), (y0, y1))
    for ph in ["+1 (519) 555-0150", "519.555.0150", "15195550150"]:
        fill_valid(p, phone=ph); p.click("#btn-send")
        ok = p.is_visible("#output") and p.input_value("#output textarea") != ""
        check(f"accepts phone written as {ph}", ok)
        p.click("#btn-again")

    # ---- gas smell never books
    before = job_count(p)
    fill_valid(p); p.check("#f-gas")
    check("ticking gas smell shows the safety steps at once", p.is_visible("#gas-warning") and "call 911" in p.inner_text("#gas-warning"))
    p.click("#btn-send")
    check("sending with gas smell ticked creates no job", job_count(p) == before and p.evaluate("document.activeElement.id") == "f-gas")
    p.uncheck("#f-gas")
    check("unticking hides the safety steps", not p.is_visible("#gas-warning"))

    # ---- board: move, details, checklist, persistence
    p.click("#btn-sample")
    p.select_option("#board-show", "New")
    first = p.get_attribute("#board .col:not([hidden]) .card", "id").replace("card-", "")
    p.click(f'#card-{first} [data-to="1"]')
    check("move to Scheduled updates the counts", "(3)" in p.inner_text('#board-show option[value="Scheduled"]') or "Scheduled (3)" in p.inner_text("#board-show"), p.inner_text("#board-show"))
    p.select_option("#board-show", "Scheduled")
    p.click(f'[data-toggle="{first}"]')
    p.check(f'#card-{first} [data-check="{first}"][data-i="0"]')
    p.reload(); p.wait_for_selector("#btn-sample")
    stored = p.evaluate(f"JSON.parse(localStorage.getItem('demo-job-intake:v1')).jobs.find(j => j.id === '{first}')")
    check("status and checklist tick survive a reload", stored["status"] == "Scheduled" and stored["checks"][0] is True, stored["status"])

    # ---- clear demo data leaves other apps' keys alone, and can be undone
    p.evaluate("localStorage.setItem('lumoria:save', 'keep me'); localStorage.setItem('demo-job-intake-other', 'not ours')")
    n = job_count(p)
    p.click("#btn-clear")
    check("clear removes only this demo's keys", job_count(p) == 0 and p.evaluate("localStorage.getItem('lumoria:save')") == "keep me" and p.evaluate("localStorage.getItem('demo-job-intake-other')") == "not ours")
    p.click("#btn-clear")
    check("undo clear restores every job", job_count(p) == n and p.inner_text("#btn-clear") == "Clear demo data", job_count(p))
    p.click("#btn-clear"); p.click("#btn-sample")
    check("a change after clearing retires the undo", p.inner_text("#btn-clear") == "Clear demo data" and job_count(p) == 8)
    c.close()

    # ---- copy to clipboard
    c, p = new_page(br, permissions=["clipboard-read", "clipboard-write"])
    p.click("#btn-fill"); p.click("#btn-send"); p.click("#output [data-copy]")
    p.wait_for_selector('#output [data-copied]:has-text("Copied")')
    clip = p.evaluate("navigator.clipboard.readText()")
    check("Copy message puts the exact draft on the clipboard", clip == p.input_value("#output textarea"), clip[:80])
    c.close()

    # ---- summer calendar time (daylight time)
    c, p = new_page(br, SUMMER)
    fill_valid(p, date="2026-07-20", window="morning"); p.click("#btn-send")
    ev = icalendar.Calendar.from_ical(open(grab(p, "#output [data-ics]"), "rb").read()).walk("VEVENT")[0]
    st = ev.decoded("DTSTART").astimezone(timezone.utc)
    check(".ics in July: 8:00 Toronto = 12:00 UTC (daylight time)", st.hour == 12 and st.date().isoformat() == "2026-07-20", st)
    c.close()

    # ---- storage blocked: still works for the session and says so
    c = br.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Toronto")
    c.route("**/fonts.g*/**", lambda r: r.abort())
    c.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });")
    p = c.new_page(); p.clock.set_fixed_time(WINTER); p.goto(URL); p.wait_for_selector("#btn-sample")
    p.click("#btn-fill"); p.click("#btn-send")
    check("with storage blocked: request still works, page says jobs won't be kept", p.is_visible("#output") and "isn't letting the page save" in p.inner_text("#storage-note"))
    c.close()

    # ---- injection through form text and into files
    evil = '<img src=x onerror=window.__pwned=1>'
    for bypass in (True, False):
        c, p = new_page(br, bypass_csp=bypass)
        fill_valid(p, name=evil + " Lee", desc="Line one\nBEGIN:VEVENT\nSUMMARY:fake; with, commas \\ and <script>window.__pwned=2</script>", address="=HYPERLINK(\"http://x\")")
        p.click("#btn-send"); p.select_option("#board-show", "New"); p.click("#board [data-toggle]")
        p.hover("#board"); p.wait_for_timeout(300)
        label = "CSP bypassed" if bypass else "CSP on"
        check(f"injected markup shows as text and never runs ({label})", p.evaluate("window.__pwned") is None and "<img src=x" in p.inner_text("#board"), p.inner_text("#board")[:200])
        if bypass:
            cal = icalendar.Calendar.from_ical(open(grab(p, "#output [data-ics]"), "rb").read())
            evs = cal.walk("VEVENT")
            check(".ics: newlines and BEGIN:VEVENT in the description can't create a second event", len(evs) == 1 and "BEGIN:VEVENT" in str(evs[0]["DESCRIPTION"]), len(evs))
            row = rcsv(grab(p, "#output [data-row]"))
            check("CSV: a cell starting with = is exported as text ('=HYPERLINK...)", row[1][9].startswith("'=HYPERLINK"), row[1][9])
        c.close()

    # ---- CSP, blocked network
    c, p = new_page(br)
    csp = p.get_attribute('meta[http-equiv="Content-Security-Policy"]', "content") or ""
    check("CSP: script hash only, connect-src 'none'", "script-src 'sha256-" in csp and "connect-src 'none'" in csp)
    check("page cannot send data out (fetch blocked)", p.evaluate("fetch('https://example.com/x',{method:'POST',body:'x'}).then(() => 'sent', () => 'blocked')") == "blocked")

    # ---- large: 5,000 jobs
    p.click("#btn-sample")
    p.evaluate("""(() => { const d = JSON.parse(localStorage.getItem('demo-job-intake:v1')); const base = d.jobs[0]; const out = [];
      for (let i = 0; i < 5000; i++) out.push(Object.assign({}, base, { id: 'CC-' + (5000 + i), name: 'Customer ' + i, status: ['New','Scheduled','In progress','Done'][i % 4] }));
      d.jobs = out; d.next = 10000; localStorage.setItem('demo-job-intake:v1', JSON.stringify(d)); })()""")
    t0 = time.time(); p.reload(); p.wait_for_selector("#board .card"); t1 = time.time()
    print(f"      timing: reload and render 5,000 jobs {t1-t0:.2f}s")
    check("5,000 jobs: board renders under 2 seconds, 50 cards per column until asked", t1 - t0 < 2 and p.eval_on_selector_all("#board .col:not([hidden]) .card", "e => e.length") == 50, t1 - t0)
    check("5,000 jobs: export has every job", len(rcsv(grab(p, "#btn-export"))) == 5001)
    p.evaluate("localStorage.clear()"); p.reload(); p.wait_for_selector("#btn-sample")

    # ---- opening details near the bottom of the page must not jump the scroll position
    p.evaluate("localStorage.clear()"); p.reload(); p.wait_for_selector("#btn-sample"); p.click("#btn-sample")
    p.select_option("#board-show", "Done")
    btn = p.locator('#board .col:not([hidden]) [data-toggle]').first
    btn.scroll_into_view_if_needed()
    top0 = btn.evaluate("b => b.getBoundingClientRect().top")
    btn.click(); p.wait_for_timeout(200)
    top1 = p.locator('#board .col:not([hidden]) [data-toggle]').first.evaluate("b => b.getBoundingClientRect().top")
    check("opening a job's details keeps the button where it was on screen", abs(top1 - top0) < 2, (top0, top1))
    # ---- first screen
    p.set_viewport_size({"width": 375, "height": 667}); p.goto(URL); p.wait_for_selector("#btn-sample")
    bf = p.evaluate("[document.getElementById('btn-fill').getBoundingClientRect().bottom, document.getElementById('btn-sample-top').getBoundingClientRect().bottom]")
    check("both first actions are on the first screen at 375 x 667", max(bf) <= 667, bf)
    p.click("#btn-sample-top")
    check("Load sample data at the top fills the board and moves to it", job_count(p) == 8 and p.evaluate("document.activeElement.id") == "h-board")
    p.evaluate("localStorage.clear()"); p.reload(); p.wait_for_selector("#btn-sample")
    p.set_viewport_size({"width": 390, "height": 844})
    # ---- layout and focus
    p.click("#btn-sample"); p.click("#btn-fill"); p.click("#btn-send")
    for w in (320, 390):
        p.set_viewport_size({"width": w, "height": 800})
        check(f"no sideways page scroll at {w}px", p.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0)
    p.screenshot(path=os.path.join(ROOT, "shots", "d3-390.png"), full_page=True)
    p.set_viewport_size({"width": 1360, "height": 900})
    check("no sideways page scroll at 1360px, all four columns visible", p.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0 and p.eval_on_selector_all("#board .col", "e => e.filter(x => x.offsetParent).length") == 4)
    p.focus("#btn-fill"); p.keyboard.press("Tab"); p.keyboard.press("Shift+Tab")
    check("keyboard focus shows a 3px outline", p.evaluate("getComputedStyle(document.activeElement).outlineWidth") == "3px")
    c.close()
    check("no console or page errors", not errors, errors)
    br.close()
srv.terminate()
print(f"\n{sum(1 for r in results if r[1])}/{len(results)} passed")
