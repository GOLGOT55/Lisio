@echo off
chcp 65001 >nul
title Lisio - accès hors de chez toi
where cloudflared >nul 2>&1 || (
  echo cloudflared est introuvable. Installe-le ^(gratuit^) avec :
  echo     winget install --id Cloudflare.cloudflared
  echo puis relance start-tunnel.bat.
  pause & exit /b 1
)
echo Lisio doit déjà tourner ^(start.bat^). L'adresse https://....trycloudflare.com qui s'affiche ci-dessous
echo s'ouvre sur ton téléphone, même en 4G. Elle change à chaque lancement.
cloudflared tunnel --url http://localhost:8787
pause
