# Lisio

Lis un livre PDF pendant que son livre audio le raconte : chaque mot s'allume au moment où il est prononcé.
Lisio est gratuit, open source, et **tourne sur ton propre PC**. Tes comptes, tes livres et tes notes restent chez toi.

- Bibliothèque personnelle : chaque compte a ses livres, retrouvés sur tous ses appareils (PC, téléphone, tablette).
- Ajout d'un livre depuis le site, sur ordinateur comme sur téléphone : dépose le PDF et les fichiers audio **MP3**, Lisio les synchronise mot à mot avec **Whisper** (installé automatiquement, il tourne sur ton PC, sans clé d'API ni abonnement).
- Lecture : surlignage mot à mot, vitesse, notes et surlignages, reprise là où tu t'étais arrêté, mode hors ligne (PWA), 6 langues d'interface.

## Installer

Il faut **Node.js 20+** ([nodejs.org](https://nodejs.org)) et **Python 3.10+** ([python.org](https://www.python.org), coche « Add to PATH » sous Windows).

1. Télécharge le projet (bouton **Code → Download ZIP**, ou `git clone https://github.com/GOLGOT55/Lisio`).
2. Lance **`start.bat`** (Windows) ou **`./start.sh`** (macOS / Linux).

Le premier lancement installe le serveur et Whisper (quelques minutes, puis le modèle de Whisper se télécharge au premier livre). Ensuite, l'adresse de Lisio s'affiche : ouvre `http://localhost:8787`, crée ton compte, ajoute un livre.

Laisse la fenêtre ouverte : Lisio fonctionne tant qu'elle l'est.

### Whisper et la carte graphique

- Avec une carte **NVIDIA**, Whisper utilise le modèle `large-v3-turbo` sur la carte graphique : environ 1 h à 2 h pour un livre de 15 h selon la carte.
- Sans carte NVIDIA, il tourne sur le processeur avec le modèle `small` : beaucoup plus lent (compte plusieurs heures pour un long livre).
- Réglages possibles (variables d'environnement avant de lancer `start`) : `LISIO_MODEL` (ex. `medium`), `LISIO_DEVICE` (`cpu` ou `cuda`), `LISIO_LANG` (ex. `fr` pour forcer la langue).

## Lire sur ton téléphone

Ton PC est le serveur : il doit être allumé avec Lisio lancé. Ton téléphone se connecte à ton compte et retrouve tous tes livres.

**À la maison (même Wi-Fi)** : ouvre sur le téléphone l'adresse « Lisio sur le Wi-Fi » affichée au lancement (ex. `http://192.168.1.20:8787`). Si elle ne s'ouvre pas, autorise Node.js dans le pare-feu de Windows (réseaux privés).

**Partout (4G, ailleurs)** : deux options **gratuites** :

- **Tunnel Cloudflare** (sans compte) : installe `cloudflared` (`winget install --id Cloudflare.cloudflared` sous Windows), puis lance **`start-tunnel.bat`** (ou `./start-tunnel.sh`) pendant que Lisio tourne. Une adresse `https://xxxx.trycloudflare.com` s'affiche : ouvre-la sur ton téléphone. Elle change à chaque lancement. Pour une adresse fixe, crée un tunnel nommé avec un compte Cloudflare gratuit ([guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)).
- **Tailscale** (compte gratuit) : installe Tailscale sur le PC et le téléphone, puis ouvre `http://<nom-du-pc>:8787` depuis le téléphone. Rien n'est exposé sur Internet.

En https (tunnel), tu peux aussi « Ajouter à l'écran d'accueil » pour l'utiliser comme une app.

### Fermer les inscriptions

Avec un tunnel, n'importe qui ayant l'adresse peut créer un compte. Une fois vos comptes créés, ferme les inscriptions : crée un fichier `.dev.vars` à côté de `start.bat` contenant

```
SIGNUP=off
```

puis relance Lisio.

## Partager un livre

- **Sur le même Lisio** : menu « … » d'un livre → Partager. Donne le code ; l'autre compte l'entre dans « Ajouter un livre ».
- **Vers le Lisio d'un autre PC** : ouvre Lisio par ton adresse Wi-Fi ou ton tunnel (pas `localhost`), puis Partager : un lien `https://…/partage/ABCD-EFGH-JKLM` s'affiche. L'autre personne le colle dans « Ajouter un livre » sur son Lisio : le livre entier (PDF, audio, synchronisation) est copié chez elle, sans refaire la transcription. Ton PC doit rester allumé avec Lisio lancé pendant la copie.

## Tes données

Tout est dans le dossier **`data/`** du projet : comptes (mots de passe hachés), livres ajoutés (PDF, audio), progression, notes. Pour sauvegarder Lisio, copie ce dossier. Pour repartir de zéro, supprime-le.

Mot de passe oublié : `node scripts/reset-password.mjs ton@email.fr nouveauMotDePasse` (dans le dossier du projet).

## Livres et droits d'auteur

Lisio ne fournit aucun livre. Utilise des fichiers que tu as le droit d'utiliser : œuvres du domaine public (ex. [Gallica](https://gallica.bnf.fr), [Wikisource](https://fr.wikisource.org), [Litteratureaudio.com](https://www.litteratureaudio.com), [LibriVox](https://librivox.org)) ou fichiers que tu possèdes, pour ton usage personnel.

## Comment ça marche

- Le serveur est un Worker Cloudflare exécuté **en local** par `wrangler dev` : base SQLite (D1) et fichiers (R2) simulés dans `data/`. Aucun compte Cloudflare n'est nécessaire.
- Le navigateur lit le texte du PDF (pdf.js) et découpe l'audio en morceaux ; le serveur les passe à Whisper (`whisper/server.py`, faster-whisper, uniquement accessible depuis le PC) ; le navigateur aligne ensuite le texte du PDF sur les mots entendus.

## Licences

Lisio est sous licence MIT. Il utilise [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0), [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (MIT), les modèles [Whisper](https://github.com/openai/whisper) d'OpenAI (MIT) et [wrangler](https://github.com/cloudflare/workers-sdk) (MIT / Apache-2.0).

---

## English

Lisio syncs a PDF book with its audiobook word by word. It is free, open source and **self-hosted on your PC**: install Node.js 20+ and Python 3.10+, then run `start.bat` (Windows) or `./start.sh` (macOS/Linux). It installs the server and Whisper (faster-whisper, GPU if you have an NVIDIA card), then serves Lisio at `http://localhost:8787`. Accounts and books are stored in `data/`. Use it from your phone on the same Wi-Fi, or from anywhere with a free Cloudflare quick tunnel (`start-tunnel`) or Tailscale. Set `SIGNUP=off` in `.dev.vars` to close sign-ups. MIT licence.
