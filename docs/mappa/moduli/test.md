# Modulo test
Verifiche senza token e senza toccare il repo reale: la mod, `hooks/contesto.ts`, `scripts/struttura.py` e `scripts/post-commit.sh`.

File: elenco in `docs/mappa/MAPPA.md`.

Simboli principali: `motore` tests/genius-pub.test.tsx:66-165 (mondo finto), `ROOT` :16, `MAPPA` :18-28 (commit `abc1234`), `TRACCIATI` :32-42 (include `.env` e `certs/server.pem`), `PANE` :44-56, `uso` :58; `git` tests/test_struttura.py:98, `crea_repo` :102, `lancia` :114, `TestStruttura` :126.
Convenzioni:
- opzioni di `motore` (tipo :68-78): `mappa`, `env`, `chiamate`, `guasto`, `serve`, `spawn`, `store`, `attesa`;
- ogni bottone di `Pane` ha una `key` unica (register.tsx:592-827): i test premono per `key`;
- test principali: percorsi sicuri :167, file toccati :194, ordine e tagli :204, pannello per superficie :242, archivio :305, ripiego :366, fascia :393, widget :412, errore del modello :440, figlio spiega :471, figlio mappa :478, sessione principale :501; struttura: determinismo :141, segreti :158, `--solo` :203, budget :233; hook (`tests/post-commit.test.sh`): doc-only :33, prompt e flag :46-53, lucchetto :56, merge :70, PATH minimo :78, blocco dell'hook: versione più recente :94, cartella installata sparita :96, cartella di sviluppo :98.
Flusso interno: `motore` risponde con dati fissi a ogni evento (`session.start`, `process.run`, `fs.read`, `model.complete`, `process.spawn`, `tool.call`); `claude` e `uv` dell'hook sono finti.
Dipendenze esterne: `GENIUS_PUB_CHILD`, `GENIUS_PUB_RUOLO` (via `opzioni.env`); runtime `claude-code/testing` (dal Claude Code installato); `uv`, `git`.

## Punti di rottura
| Componente | Dipende da | Se cade, cosa vedi | Dove guardare | Come verificarlo |
|---|---|---|---|---|
| Forma di `model.complete` | risposta finta (tests/genius-pub.test.tsx:141-155) | test verdi ma in uso `motivo()` e `riepilogo()` sbagliati | register.tsx:157-160 | confrontare con `.claude-plugin/types/claude-code/index.d.ts` |
| Prompt del selettore | il fake lo riconosce dalla frase «array JSON» (:130, :147) | cambia il prompt, il test non se ne accorge | prompts/selettore-file.md; register.tsx:271-281 | `grep "array JSON" prompts/*.md` |
| Prompt veri | `fs.read` dà testo generico (:131) | il marcatore `[[SERVE-ESPLORAZIONE]]` non è controllato: «Search the code» può sparire | prompts/spiegatore.md:13, guasto.md:14, ripiego.md:3 | `grep -c SERVE prompts/*.md` |
| `git rev-parse` | stessa risposta (`ROOT`) per due chiamate (:117-118) | commit archiviato `/repo`; «Resumed from commit» mai visibile | register.tsx:107, :400, :414-418 | dare al fake un hash per `--short HEAD` |
| Symlink fuori dal repo | `fs.stat` sempre «file» (:136-139) | guardia testata solo sulle stringhe | register.tsx:239-248; contesto.ts:50 | aggiungere un file con `realPath` fuori da `/repo` |
| Stream del ripiego | righe complete, solo stdout (:157-163) | righe spezzate, `is_error`, «ended without an answer» non coperti | register.tsx:195-226 | fake con riga in due chunk |
| Stato della fascia | `diff --name-only` fisso (:121-122) | «no map» e «map has no header» non testati | register.tsx:111-130 | variare il fake |
| Messaggi della sessione | `toolUses[].input.file_path` (:94-103) | se la forma reale cambia, `fileToccati` tace | contesto.ts:60-77 | confrontare con l'output reale di `$.session.messages` |
| Guardia dei tool | `tool.call` sempre «eseguito» (:164) | il ramo «la guardia ha avuto un errore» non è coperto | register.tsx:561-567 | fake che lancia e asserzione su `deny` |
| Ruolo dei figli | `ruolo` letto una volta a livello di modulo | ruolo vecchio tra test | register.tsx:74-83 | ogni test deve partire da un modulo nuovo |
| Superficie terminal | solo il pannello gira su `terminal` (:242) | fascia e widget sul terminale senza test | register.tsx:570-616 | aggiungere `surface: 'terminal'` |
| Chiamata a `struttura.py` | `uv` finto registra e basta (post-commit.test.sh:17) | argomenti sbagliati passano | post-commit.sh:50 | `uv run --script scripts/struttura.py --root . --stampa` |
| `claude -p` finto | solo alcuni flag controllati con `grep` (:46-53) | `--permission-mode dontAsk` non controllato | post-commit.sh:51-59 | aggiungere `grep` sui flag |
| Attese fisse | `sleep` di 1-2 s (post-commit.test.sh:35-61) | «NON OK» falsi su macchina carica | :41-44, :57-61 | rilanciare tre volte |
| PATH minimo | `git` in `/usr/bin` (:85) | con git solo da Homebrew: «claude non trovato» | post-commit.sh:8, :11-12 | `command -v git` |
| Fixture di struttura | `git add -f` per `.env` (tests/test_struttura.py:109) | `.env` non tracciato: `assertIn` fallisce (:161) | :109, :161 | `git ls-files` nel tmp |
| Tipi per `tsc` | `.claude-plugin/types/` non è in git | `tsc` fallisce su un clone pulito | tsconfig.json:2 | `ls .claude-plugin/types/tsconfig.json` |

Non coperto dai test: modo «bug» (register.tsx:460, :307); pulsanti «cambiato» e «rompersi» (:60-64); `command.run` di `/explain` (:538-542); `turn.complete`, `ui.close`, `classic.SessionStart` (:544-558); mappa assente (:257, :732-734); tetto dell'archivio (contesto.ts:174, :197); `--output`, `--json` e Astro/PHP di `struttura.py` (:350-353, :395-407, :969, :990).
