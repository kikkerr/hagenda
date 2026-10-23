# Hagenda

Gedeelde agenda voor twee (of meer) personen, met:

- **Gedeelde en privé-agenda's** — privé-afspraken ziet enkel de eigenaar (afgedwongen in de database, niet alleen in de app).
- **Dienstplanner.be en Google Agenda gekoppeld** via hun iCal-link, automatisch elke 15 minuten bijgewerkt.
- **Eigen afspraken** toevoegen, bewerken, herhalen (dag/week/maand/jaar).
- **Account met e-mail + wachtwoord.** Alles staat online: app verwijderd of gsm kwijt → opnieuw inloggen en alles is terug.
- Weergaven: dag, 3 dagen, week, maand, planning. Live bijgewerkt op alle toestellen.

Zonder Supabase-gegevens draait de app in **demomodus** (voorbeelddata, enkel in de browser) — handig om de werking te bekijken.

## Mappen

| Map / bestand | Wat |
|---|---|
| `app/index.html` | De volledige app (web + inhoud van de apk) |
| `supabase/schema.sql` | Database + beveiligingsregels |
| `supabase/functions/sync-ics/` | Cloudfunctie die dienstplanner/Google ophaalt |
| `supabase/cron.sql` | Planning: elke 15 min bijwerken |
| `.github/workflows/build-apk.yml` | Bouwt de Android-apk op GitHub |

---

## Installatie (eenmalig, ± 30 minuten)

### 1. Supabase-project aanmaken (gratis)
1. Ga naar <https://supabase.com> → *Start your project* → aanmelden met GitHub.
2. *New project*: naam `hagenda`, kies een sterk databasewachtwoord (bewaar het), regio **West EU (Ireland)** of **Central EU (Frankfurt)**.
3. Wacht tot het project klaar is.

### 2. Database klaarzetten
1. Links: **SQL Editor** → *New query*.
2. Plak de volledige inhoud van `supabase/schema.sql` → **Run**. Je moet "Success" zien.

### 3. Inloggen instellen
1. **Authentication → Sign In / Providers → Email**: laat aan.
2. *Confirm email*: aan laten is veiliger (je krijgt dan een bevestigingsmail bij het aanmaken van een account).
3. Optioneel: **Authentication → Sign In / Providers**: zet *Allow new users to sign up* **uit** nadat jij en je partner een account hebben. Dan kan niemand anders nog een account maken.

### 4. Synchronisatiefunctie installeren
Op je Fedora-pc (terminal):

```bash
# Supabase-commando installeren (eenmalig)
npm install -g supabase        # of: brew install supabase/tap/supabase

cd hagenda
supabase login
supabase link --project-ref <PROJECT-REF>       # staat in de URL van je project: https://<PROJECT-REF>.supabase.co
supabase secrets set CRON_SECRET=<kies-een-lange-geheime-code>   # bv. de uitvoer van: openssl rand -hex 24 (noteer ze)
supabase functions deploy sync-ics --no-verify-jwt
```

Daarna in de **SQL Editor** de inhoud van `supabase/cron.sql` plakken, `<PROJECT-REF>` en `<CRON_SECRET>` invullen (dezelfde geheime code als hierboven) → **Run**.

> Tip: bij *Database → Extensions* moeten `pg_cron` en `pg_net` aan staan (het script zet ze normaal zelf aan).

### 5. App koppelen aan Supabase
**Project Settings → API**: kopieer *Project URL* en de *anon public* sleutel.

- **Website om te testen:** vul ze bovenaan in `app/index.html` in bij `CONFIG`.
- **Apk:** zet ze in GitHub als secrets (stap 7), dan hoeven ze niet in de code.

De anon-sleutel mag in een app staan; de echte beveiliging zijn de regels uit `schema.sql`.

### 6. Eerste keer gebruiken
1. Open de app → **Account maken** → bevestig je e-mail → inloggen.
2. Kies **Nieuw huishouden** en vul je naam in. Je krijgt automatisch de agenda's *Samen* (gedeeld) en *Privé*.
3. Menu ☰ → **Account en instellingen** → kopieer de **uitnodigingscode**.
4. Je partner maakt een account en kiest **Aansluiten** met die code.
5. **Externe agenda koppelen**:
   - *Jij*: koppel dienstplanner.be aan je Google-account (knop op de dienstplanner-website → Google). Haal daarna in Google Agenda het **Geheim adres in iCal-indeling** op van de agenda waarin de diensten staan (zie hieronder) en plak dat in de app.
   - *Je partner* (in haar eigen account): Google Agenda op computer → ⚙ Instellingen → klik haar agenda → **Agenda integreren** → **Geheim adres in iCal-indeling** → kopiëren.
   - Kies per gekoppelde agenda of de ander ze mag zien (*Gedeeld*) of niet (*Privé*).

### 7. Android-apk via GitHub
1. Maak een **private** repo en push deze map.
2. *Settings → Secrets and variables → Actions → New repository secret*:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = anon public sleutel
   - `DEBUG_KEYSTORE_BASE64` = vaste ondertekening, zodat een nieuwe apk de oude gewoon bijwerkt (zonder deze moet je telkens eerst de-installeren):
     ```bash
     keytool -genkeypair -keystore debug.keystore -storepass android -alias androiddebugkey \
       -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Hagenda"
     base64 -w0 debug.keystore      # deze lange tekst is de waarde van het secret
     ```
     Bewaar `debug.keystore` veilig (niet in de repo; `.gitignore` sluit hem al uit).
3. Tabblad **Actions → Android-apk bouwen → Run workflow**. Na ± 5 minuten staat de apk onderaan bij *Artifacts*.
4. Op de gsm: zip openen → apk installeren (toestaan: *Installeren uit onbekende bronnen*).

---

## Goed om te weten
- **Gratis plan Supabase**: een project dat 7 dagen niet gebruikt wordt, wordt gepauzeerd (gegevens blijven bewaard, je zet het met één klik terug aan). Bij dagelijks gebruik gebeurt dit niet.
- **Reservekopie**: *Account en instellingen → Reservekopie downloaden* maakt een .ics-bestand van jullie eigen afspraken, dat je in elke agenda-app kan importeren.
- **Gekoppelde agenda's zijn alleen-lezen** in de app; wijzigen doe je in dienstplanner.be of Google. De app neemt het binnen 15 minuten over (of meteen via de 🔄-knop).
- **Herhalende afspraken**: bewerken of verwijderen geldt voor de hele reeks (één keer overslaan komt in een volgende versie).
- **Offline**: zonder internet toont de app de laatst geladen versie.
