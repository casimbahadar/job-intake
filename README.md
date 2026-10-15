# Job request intake and tracker (demo)

A service request form and job board for Cedar & Copper Plumbing, a fictional plumbing company in Kitchener-Waterloo. One request produces a priority, a job checklist, a customer message, a calendar event and a spreadsheet row. It is a demo with made-up data.

Live: https://casimbahadar.github.io/demo-job-intake/

## What it does

- A customer form with checks on every field: a 10-digit phone number, a Canadian postal code, a visit date from today up to 6 months out, a request type, a time of day and a short description. Errors appear when you tap Send and clear as you fix each field.
- Priority set by rules shown on the page, where the first rule that fits decides:
  1. Urgent if water is leaking right now.
  2. Urgent if sewage is backing up.
  3. Urgent if there's no heat and the request comes in between October and April.
  4. Soon if the preferred visit is within 7 days.
  5. Routine for everything else.
- Ticking "I smell gas" shows safety steps straight away and never creates a booking.
- For each request: a checklist for the request type, a message draft to copy, a calendar file (.ics, America/Toronto time) and a spreadsheet row (.csv).
- A status board with New, Scheduled, In progress and Done. Jobs move with buttons, and the whole board exports as one CSV.

## Privacy and storage

Nothing is sent anywhere. The page's Content-Security-Policy blocks outgoing connections, and it doesn't connect to any calendar, email or text service. Jobs are saved in this browser's localStorage under keys that start with `demo-job-intake:`, and "Clear demo data" removes only those keys. Every project page on casimbahadar.github.io shares one browser origin, so please use made-up details.

Spreadsheet cells that start with =, +, - or @ are exported with a leading apostrophe, so a spreadsheet shows them as text instead of running them as formulas.

## Sample data

8 made-up requests, dated relative to today so they never go stale. Phone numbers are in the 555-01xx range, which is reserved for fiction. In November the sample gives 3 Urgent, 3 Soon and 2 Routine. In May to September the no-heat request drops from Urgent to Soon, as the rules say.

## Files

- `index.html` is the whole tool. The CSS and JavaScript are inline and there is no build step.
- `.nojekyll` tells GitHub Pages to serve the files as they are.

Built by Casim Bahadar, Kitchener-Waterloo, Ontario. https://casimbahadar.github.io/
