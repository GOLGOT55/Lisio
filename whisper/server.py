"""Whisper pour Lisio : transcrit les morceaux d'audio envoyés par le serveur Lisio, avec l'heure de chaque mot.

POST /transcribe  (corps = octets audio, en-tête x-mime)  →  {"words": [[mot, début, fin], ...], "language": "fr", "duration": s}
GET  /health  →  {"ok": true, "model": ..., "device": ...}

N'écoute que 127.0.0.1:8765 : seul le serveur Lisio (même PC) l'appelle.
Réglages (variables d'environnement) : LISIO_MODEL (défaut large-v3-turbo sur carte graphique, small sur processeur),
LISIO_DEVICE (auto / cuda / cpu), LISIO_LANG (ex. fr ; vide = détection automatique).
"""
import json, os, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Windows : DLL CUDA fournies par les paquets pip nvidia-cublas-cu12 / nvidia-cudnn-cu12 (installés si une carte NVIDIA est détectée)
try:
    import nvidia.cublas, nvidia.cudnn
    for m in (nvidia.cublas, nvidia.cudnn):
        d = os.path.join(list(m.__path__)[0], "bin")
        if os.path.isdir(d):
            os.add_dll_directory(d)
            os.environ["PATH"] = d + os.pathsep + os.environ["PATH"]
except ImportError:
    pass
import av
from faster_whisper import WhisperModel

# shortcut: PyAV 19 a retiré l'option metadata_errors que faster-whisper 1.2.1 passe encore ; à retirer quand faster-whisper sera corrigé
_av_open = av.open
av.open = lambda *a, metadata_errors=None, **k: _av_open(*a, **k)

PORT = 8765
LANG = os.environ.get("LISIO_LANG") or None
EXT = {"audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/aac": ".aac", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/flac": ".flac", "audio/webm": ".webm"}


def load():
    want = os.environ.get("LISIO_DEVICE", "auto")
    if want in ("auto", "cuda"):
        try:
            name = os.environ.get("LISIO_MODEL", "large-v3-turbo")
            m = WhisperModel(name, device="cuda", compute_type="float16")
            list(m.transcribe(__import__("numpy").zeros(16000, "float32"))[0])  # vérifie que CUDA marche vraiment
            return m, name, "cuda"
        except Exception as e:
            if want == "cuda":
                raise
            print(f"Carte graphique indisponible ({str(e)[:120]}) : Whisper tourne sur le processeur (plus lent).", flush=True)
    name = os.environ.get("LISIO_MODEL", "small")
    return WhisperModel(name, device="cpu", compute_type="int8"), name, "cpu"


print("Chargement de Whisper (le premier lancement télécharge le modèle)…", flush=True)
MODEL, NAME, DEVICE = load()
LOCK = threading.Lock()
print(f"Whisper prêt : modèle {NAME} sur {DEVICE}, http://127.0.0.1:{PORT}", flush=True)


class H(BaseHTTPRequestHandler):
    def reply(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"ok": True, "model": NAME, "device": DEVICE})
        self.reply(404, {"error": "introuvable"})

    def do_POST(self):
        if self.path != "/transcribe":
            return self.reply(404, {"error": "introuvable"})
        n = int(self.headers.get("content-length", 0))
        if not 0 < n <= 60_000_000:
            return self.reply(413, {"error": "Morceau audio trop gros."})
        data = self.rfile.read(n)
        f = tempfile.NamedTemporaryFile(suffix=EXT.get(self.headers.get("x-mime", ""), ".mp3"), delete=False)
        try:
            f.write(data); f.close()
            t = time.time()
            with LOCK:  # un morceau à la fois : la carte graphique est déjà pleine
                segs, info = MODEL.transcribe(f.name, language=LANG, word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
                words = [[w.word.strip(), round(w.start, 2), round(w.end, 2)] for s in segs for w in (s.words or [])]
            print(f"{info.duration / 60:.1f} min transcrites en {time.time() - t:.0f} s ({len(words)} mots)", flush=True)
            self.reply(200, {"words": words, "language": info.language, "duration": round(info.duration, 2)})
        except Exception as e:
            print("Erreur :", e, flush=True)
            self.reply(500, {"error": f"Whisper : {str(e)[:200]}"})
        finally:
            try: os.unlink(f.name)
            except OSError: pass

    def log_message(self, *a):
        pass


ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
