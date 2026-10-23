/**
 * Hagenda — iCal-link maken van een gedeelde Google-agenda (bv. dienstplanner.be)
 *
 * Google geeft geen geheime iCal-link voor agenda's die iemand anders met je deelt.
 * Dit script leest die agenda met jouw rechten en geeft ze terug als .ics.
 *
 * 1. Vul hieronder AGENDA_ID en TOKEN in.
 * 2. Implementeren > Nieuwe implementatie > Web-app
 *    Uitvoeren als: Ik  —  Wie heeft toegang: Iedereen
 * 3. De link voor de app is:  <web-app-URL>?token=<TOKEN>
 */

// Agenda-ID: Google Agenda > instellingen van de dienstplanner-agenda > "Agenda integreren" > Agenda-ID
const AGENDA_ID = 'PLAK_HIER_HET_AGENDA_ID';

// Zelfgekozen geheime code (lang en willekeurig, bv. 30 letters en cijfers). Zonder deze code geen toegang.
const TOKEN = 'KIES_HIER_EEN_LANGE_GEHEIME_CODE';

const DAGEN_TERUG = 60;
const DAGEN_VOORUIT = 400;

function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== TOKEN || TOKEN.indexOf('KIES_HIER') === 0) {
    return ContentService.createTextOutput('Geen toegang').setMimeType(ContentService.MimeType.TEXT);
  }
  const cal = CalendarApp.getCalendarById(AGENDA_ID);
  if (!cal) {
    return ContentService.createTextOutput('Agenda niet gevonden: controleer AGENDA_ID').setMimeType(ContentService.MimeType.TEXT);
  }

  const nu = new Date();
  const van = new Date(nu.getTime() - DAGEN_TERUG * 864e5);
  const tot = new Date(nu.getTime() + DAGEN_VOORUIT * 864e5);
  const tz = Session.getScriptTimeZone();

  const utc = d => Utilities.formatDate(d, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const dag = d => Utilities.formatDate(d, tz, 'yyyyMMdd');
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);

  const r = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hagenda//Gedeelde agenda via Google//NL',
    'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + esc(cal.getName())
  ];

  cal.getEvents(van, tot).forEach(ev => {
    // herhalende afspraken delen één ID; begintijd erbij maakt elke afspraak uniek
    r.push('BEGIN:VEVENT', 'UID:' + ev.getId() + '-' + ev.getStartTime().getTime(), 'DTSTAMP:' + utc(nu));
    if (ev.isAllDayEvent()) {
      r.push('DTSTART;VALUE=DATE:' + dag(ev.getAllDayStartDate()), 'DTEND;VALUE=DATE:' + dag(ev.getAllDayEndDate()));
    } else {
      r.push('DTSTART:' + utc(ev.getStartTime()), 'DTEND:' + utc(ev.getEndTime()));
    }
    r.push('SUMMARY:' + esc(ev.getTitle()));
    if (ev.getLocation()) r.push('LOCATION:' + esc(ev.getLocation()));
    if (ev.getDescription()) r.push('DESCRIPTION:' + esc(ev.getDescription()));
    r.push('END:VEVENT');
  });
  r.push('END:VCALENDAR');

  return ContentService.createTextOutput(r.join('\r\n')).setMimeType(ContentService.MimeType.ICAL);
}

/** Klik op "Uitvoeren" met deze functie om te testen: het logboek toont het aantal afspraken. */
function test() {
  const cal = CalendarApp.getCalendarById(AGENDA_ID);
  if (!cal) { Logger.log('Agenda niet gevonden: controleer AGENDA_ID'); return; }
  const n = cal.getEvents(new Date(), new Date(Date.now() + 30 * 864e5)).length;
  Logger.log('OK: "' + cal.getName() + '" heeft ' + n + ' afspraken in de komende 30 dagen.');
}
