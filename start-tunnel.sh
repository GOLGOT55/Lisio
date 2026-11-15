#!/usr/bin/env bash
# Accès à Lisio hors de chez toi, par un tunnel Cloudflare gratuit (sans compte). Lisio doit déjà tourner (start.sh).
command -v cloudflared >/dev/null || { echo "Installe cloudflared : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"; exit 1; }
cloudflared tunnel --url http://localhost:8787
