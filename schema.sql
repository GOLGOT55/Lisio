CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  pass TEXT NOT NULL,
  prefs TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL,
  ip TEXT NOT NULL DEFAULT '', seen INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ok',
  ai_limit INTEGER -- actions de transcription par jour : NULL = défaut, -1 = illimité
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  ip TEXT NOT NULL DEFAULT '', ua TEXT NOT NULL DEFAULT '', seen INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'user' -- 'user' (cookie sid) ou 'admin' (cookie aid)
);
CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER NOT NULL,
  book_id TEXT NOT NULL,
  word INTEGER NOT NULL,
  time REAL NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id)
);
-- kind : 'note' (pastille) ou 'hl' (surlignage / citation)
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  book_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  w0 INTEGER NOT NULL,
  w1 INTEGER NOT NULL,
  color TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  pos TEXT NOT NULL DEFAULT '', -- position libre de la pastille {x,y} en fractions de page
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_user_book ON notes (user_id, book_id);
-- réglages personnels d'un livre (NULL = valeur du catalogue) ; hidden = retiré de la bibliothèque
CREATE TABLE IF NOT EXISTS library (
  user_id INTEGER NOT NULL,
  book_id TEXT NOT NULL,
  title TEXT, author TEXT, year TEXT, colors TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0, -- 1 = reçu avec un code de partage
  PRIMARY KEY (user_id, book_id)
);
-- propriétaire d'un livre (absent = livre commun visible par tous) et code de partage
CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL, share TEXT UNIQUE, created INTEGER NOT NULL,
  title TEXT, author TEXT, year TEXT, duration REAL, colors TEXT,
  status TEXT NOT NULL DEFAULT 'ready', -- 'draft' pendant l'envoi, 'queued' en attente de transcription par le PC, 'failed', 'ready'
  r2 INTEGER NOT NULL DEFAULT 0 -- 1 = fichiers dans R2 (ajouté depuis le site)
);

-- livre envoyé au PC : avancement de la transcription (scripts/queue.mjs) ou erreur
CREATE TABLE IF NOT EXISTS jobs (book_id TEXT PRIMARY KEY, progress REAL NOT NULL DEFAULT 0, error TEXT, updated INTEGER NOT NULL);
-- site en ligne relié à un PC (une seule ligne) : clé du PC, compte qui l'a relié, adresse actuelle du tunnel, code d'appairage
CREATE TABLE IF NOT EXISTS pc (id INTEGER PRIMARY KEY CHECK (id = 1), key TEXT, owner INTEGER, url TEXT, updated INTEGER, pair_code TEXT, pair_exp INTEGER, pair_owner INTEGER);
