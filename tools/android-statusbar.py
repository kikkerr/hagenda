"""Hagenda: kleur van de strook achter statusbalk en navigatiebalk instellen.

Wordt door GitHub Actions uitgevoerd na `npx cap add android`.
Licht thema: witte balk met donkere icoontjes. Donker thema: donkere balk met lichte icoontjes.
"""
import pathlib, re

res = pathlib.Path("android/app/src/main/res")

def write_colors(folder, color):
    d = res / folder
    d.mkdir(parents=True, exist_ok=True)
    (d / "hagenda_colors.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="hagenda_bars">{color}</color>\n</resources>\n', encoding="utf-8")

def write_bools(folder, light_icons):
    d = res / folder
    d.mkdir(parents=True, exist_ok=True)
    v = "true" if light_icons else "false"
    (d / "hagenda_bools.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <bool name="hagenda_dark_icons">{v}</bool>\n</resources>\n', encoding="utf-8")

write_colors("values", "#FFFFFF")
write_colors("values-night", "#171B27")
write_bools("values", True)          # licht thema -> donkere icoontjes
write_bools("values-night", False)   # donker thema -> lichte icoontjes

styles = res / "values" / "styles.xml"
xml = styles.read_text(encoding="utf-8")
extra = """
        <item name="android:windowBackground">@color/hagenda_bars</item>
        <item name="android:statusBarColor">@color/hagenda_bars</item>
        <item name="android:navigationBarColor">@color/hagenda_bars</item>
        <item name="android:windowLightStatusBar">@bool/hagenda_dark_icons</item>
        <item name="android:windowLightNavigationBar">@bool/hagenda_dark_icons</item>
    """
m = re.search(r'(<style name="AppTheme\.NoActionBar"[^>]*>)(.*?)(</style>)', xml, re.S)
if not m:
    raise SystemExit("AppTheme.NoActionBar niet gevonden in styles.xml")
if "hagenda_bars" not in m.group(2):
    xml = xml[:m.end(2)] + extra + xml[m.end(2):]
    styles.write_text(xml, encoding="utf-8")
print("Statusbalk-kleuren ingesteld")
