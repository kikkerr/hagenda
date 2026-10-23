// Zet een .ics-agenda om naar losse afspraken (herhalingen uitgerekend).
import ICAL from "npm:ical.js@2.1.0";

export type Occ = { external_uid: string; title: string; starts_at: string; ends_at: string; all_day: boolean; location: string; notes: string };

// Vangnet: sommige feeds verwijzen naar "Europe/Brussels" zonder de tijdzone mee te sturen.
const BXL = `BEGIN:VTIMEZONE
TZID:Europe/Brussels
BEGIN:STANDARD
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
END:VTIMEZONE`;
function ensureBrussels() {
  for (const name of ["Europe/Brussels", "Europe/Amsterdam", "Europe/Paris", "Romance Standard Time", "W. Europe Standard Time"]) {
    if (!ICAL.TimezoneService.has(name)) {
      const tz = new ICAL.Timezone({ component: new ICAL.Component(ICAL.parse(BXL)), tzid: name });
      ICAL.TimezoneService.register(tz, name);
    }
  }
}

const dateOnly = (t: any) => `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}T00:00:00Z`;

export function parseIcs(text: string, from: Date, to: Date): Occ[] {
  const comp = new ICAL.Component(ICAL.parse(text));
  // tijdzones uit het bestand zelf registreren (Outlook/dienstplanner sturen die mee)
  for (const tz of comp.getAllSubcomponents("vtimezone")) {
    try { ICAL.TimezoneService.register(tz); } catch (_) { /* dubbel geregistreerd */ }
  }
  ensureBrussels();
  const masters = new Map<string, any>();
  const exceptions: any[] = [];
  for (const v of comp.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(v);
    if (!ev.uid || !ev.startDate) continue;
    if ((v.getFirstPropertyValue("status") || "").toString().toUpperCase() === "CANCELLED" && !ev.isRecurrenceException()) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev); else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const m = masters.get(ex.uid);
    if (m) m.relateException(ex); else masters.set(ex.uid + "#" + ex.recurrenceId.toString(), ex);
  }

  const out: Occ[] = [];
  const push = (uid: string, item: any, s: any, e: any) => {
    const allDay = !!s.isDate;
    const end = e || s;
    const sd = allDay ? dateOnly(s) : s.toJSDate().toISOString();
    let ed = allDay ? dateOnly(end) : end.toJSDate().toISOString();
    if (ed <= sd) ed = allDay ? new Date(Date.parse(sd) + 864e5).toISOString() : new Date(Date.parse(sd) + 36e5).toISOString();
    if (new Date(ed) < from || new Date(sd) > to) return;
    out.push({
      external_uid: uid, title: (item.summary || "(geen titel)").toString().slice(0, 500),
      starts_at: sd, ends_at: ed, all_day: allDay,
      location: (item.location || "").toString().slice(0, 500), notes: (item.description || "").toString().slice(0, 4000),
    });
  };

  for (const [key, ev] of masters) {
    if (ev.isRecurring()) {
      const it = ev.iterator();
      let next, guard = 0;
      while ((next = it.next()) && guard++ < 5000) {
        if (next.toJSDate() > to) break;
        const d = ev.getOccurrenceDetails(next);
        const status = (d.item.component.getFirstPropertyValue("status") || "").toString().toUpperCase();
        if (status === "CANCELLED") continue;
        push(`${key}__${next.toString()}`, d.item, d.startDate, d.endDate);
      }
    } else {
      push(key, ev, ev.startDate, ev.endDate);
    }
  }
  return out;
}
