#!/usr/bin/env bash
# Installe (ou met à jour) Lisio sur macOS / Linux :
#   curl -fsSL https://raw.githubusercontent.com/GOLGOT55/Lisio/main/install.sh | bash
# Crée le dossier « Lisio » dans Téléchargements avec tout dedans (programme, Whisper, données dans Lisio/data), puis le lance.
set -e
REPO="GOLGOT55/Lisio"
DL="$(xdg-user-dir DOWNLOAD 2>/dev/null || echo "$HOME/Downloads")"
DIR="$DL/Lisio"
command -v node >/dev/null || { echo "Installe Node.js 20+ (https://nodejs.org) puis relance cette commande."; exit 1; }
command -v python3 >/dev/null || { echo "Installe Python 3.10+ (https://www.python.org) puis relance cette commande."; exit 1; }

echo "Téléchargement de Lisio..."
TMP="$(mktemp -d)"
curl -fsSL "https://github.com/$REPO/archive/refs/heads/main.tar.gz" | tar -xz -C "$TMP"
mkdir -p "$DIR"
# copie par-dessus : data/ (comptes, livres), .venv et .dev.vars d'une installation précédente sont gardés
cp -R "$TMP/Lisio-main/." "$DIR/"
rm -rf "$TMP"
chmod +x "$DIR"/*.sh

echo
echo "Lisio est installé dans : $DIR"
echo "Tout est dans ce dossier : le programme, Whisper, et tes données (comptes, livres) dans Lisio/data."
echo
cd "$DIR" && exec ./start.sh
