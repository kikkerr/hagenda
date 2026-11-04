#!/usr/bin/env bash
# Hagenda — website klaarmaken (gebruikt door Cloudflare Pages).
# Vult de Supabase-gegevens in vanuit de omgevingsvariabelen
# SUPABASE_URL en SUPABASE_ANON_KEY, zodat ze niet in de code hoeven te staan.
set -euo pipefail

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "FOUT: stel SUPABASE_URL en SUPABASE_ANON_KEY in bij de omgevingsvariabelen." >&2
  exit 1
fi

sed -i "s|supabaseUrl: \"\"|supabaseUrl: \"${SUPABASE_URL}\"|" app/index.html
sed -i "s|supabaseAnonKey: \"\"|supabaseAnonKey: \"${SUPABASE_ANON_KEY}\"|" app/index.html

if grep -q 'supabaseUrl: ""' app/index.html; then
  echo "FOUT: de Supabase-gegevens konden niet ingevuld worden in app/index.html." >&2
  exit 1
fi
echo "Website klaar in de map app/"
