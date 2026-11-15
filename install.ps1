# Installe (ou met à jour) Lisio sur Windows. Dans PowerShell :
#   irm https://raw.githubusercontent.com/GOLGOT55/Lisio/main/install.ps1 | iex
# Crée le dossier « Lisio » dans Téléchargements avec tout dedans (programme, Whisper, données dans Lisio\data),
# installe Node.js et Python s'ils manquent, fait démarrer Lisio avec Windows, puis le lance.
$ErrorActionPreference = "Stop"
$repo = "GOLGOT55/Lisio"
$downloads = (New-Object -ComObject Shell.Application).NameSpace("shell:Downloads").Self.Path
$dir = Join-Path $downloads "Lisio"

function Need($cmd, $id, $name) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { return }
  Write-Host "Installation de $name..."
  winget install -e --id $id --silent --accept-package-agreements --accept-source-agreements
  # recharge le PATH pour trouver le programme qu'on vient d'installer
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$name n'a pas pu être installé. Installe-le à la main puis relance cette commande." }
}
Need "node" "OpenJS.NodeJS.LTS" "Node.js"
Need "py" "Python.Python.3.12" "Python 3"  # « py » : le raccourci « python » du Microsoft Store n'est pas un vrai Python

Write-Host "Téléchargement de Lisio..."
$tmp = Join-Path $env:TEMP ("lisio-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
Invoke-WebRequest "https://github.com/$repo/archive/refs/heads/main.zip" -OutFile "$tmp\lisio.zip" -UseBasicParsing
Expand-Archive "$tmp\lisio.zip" $tmp
New-Item -ItemType Directory -Force $dir | Out-Null
# copie par-dessus : data\ (comptes, livres), .venv et .dev.vars d'une installation précédente sont gardés
Copy-Item "$tmp\Lisio-main\*" $dir -Recurse -Force
Remove-Item $tmp -Recurse -Force

# démarrage avec Windows (fenêtre réduite) : les livres en attente sont transcrits dès que le PC s'allume
$startup = [Environment]::GetFolderPath("Startup")
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup "Lisio.lnk"))
$lnk.TargetPath = Join-Path $dir "start.bat"; $lnk.WorkingDirectory = $dir; $lnk.WindowStyle = 7
$lnk.Save()

Write-Host ""
Write-Host "Lisio est installé dans : $dir"
Write-Host "Tout est dans ce dossier : le programme, Whisper, et tes données (comptes, livres) dans Lisio\data."
Write-Host "Lisio démarrera tout seul avec Windows. Pour l'enlever du démarrage : supprime « Lisio » dans $startup"
Write-Host ""
Start-Process (Join-Path $dir "start.bat") -WorkingDirectory $dir
