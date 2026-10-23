// Hagenda — haalt gekoppelde agenda's (dienstplanner.be, Google Agenda, …) op
// en zet ze in de database. Wordt aangeroepen:
//   • elke 15 minuten door de planner (cron.sql) met header x-cron-secret
//   • vanuit de app via de knop "Nu bijwerken" (met de login van de gebruiker)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { parseIcs } from "./parse.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const cronSecret = Deno.env.get("CRON_SECRET");

  // Welke agenda's mogen we bijwerken?
  let q = admin.from("calendars").select("id, owner_id, household_id, calendar_secrets(ics_url)").eq("kind", "ics");
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) {
    if (body.calendar_id) q = q.eq("id", body.calendar_id);
  } else {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Niet ingelogd" }, 401);
    q = q.eq("owner_id", u.user.id);              // enkel je eigen gekoppelde agenda's
    if (body.calendar_id) q = q.eq("id", body.calendar_id);
  }
  const { data: cals, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const from = new Date(Date.now() - 180 * 864e5), to = new Date(Date.now() + 400 * 864e5);
  const results: unknown[] = [], errors: string[] = [];

  for (const c of cals ?? []) {
    const sec = Array.isArray(c.calendar_secrets) ? c.calendar_secrets[0] : c.calendar_secrets;
    const url = (sec?.ics_url || "").replace(/^webcal:\/\//i, "https://");
    if (!url) continue;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Hagenda/1.0 (+calendar sync)", Accept: "text/calendar, */*" }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`De link gaf foutcode ${res.status}. Controleer of de link nog klopt.`);
      const text = await res.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Dit is geen agenda-link (.ics). Kopieer de iCal-link opnieuw.");
      const occ = parseIcs(text, from, to);
      const run = crypto.randomUUID();
      const rows = occ.map((o) => ({ ...o, calendar_id: c.id, sync_run: run, rrule: null, created_by: c.owner_id }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: e } = await admin.from("events").upsert(rows.slice(i, i + 500), { onConflict: "calendar_id,external_uid" });
        if (e) throw e;
      }
      // alles wat niet meer in de bron staat, verwijderen
      await admin.from("events").delete().eq("calendar_id", c.id).not("external_uid", "is", null).neq("sync_run", run);
      await admin.from("calendars").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", c.id);
      results.push({ id: c.id, events: rows.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      await admin.from("calendars").update({ last_error: msg.slice(0, 300) }).eq("id", c.id);
    }
  }
  return json({ ok: errors.length === 0, results, errors });
});
