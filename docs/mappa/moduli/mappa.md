# Modulo mappa
Genera e aggiorna `docs/mappa/`; il post-commit la tiene aggiornata con Haiku, in background.

File: elenco in `docs/mappa/MAPPA.md`.

Simboli principali: regole 1-11 skills/map/SKILL.md:28-38; dispatch argomenti :40-43; Passo 1 controlli :49-57; Passo 2 esplora e subagenti :59-75; Passo 3 domande :77-82; Passo 4 sintesi e formati :84-137; Passo 5 pulizia :139-142; aggiornamento :146-168; `installa-hook` :172-186; guardie scripts/post-commit.sh:6-14; filtro codice :18; lucchetto :23-25; hash di partenza :30-31; diff e prompt :32-44; processo in background :47-61.
Convenzioni:
- l'aggiornamento è «strutturale» se c'è un file nuovo, sparito o una nuova dipendenza (SKILL.md:153-156): in quel caso Sonnet, altrimenti Edit mirati;
- l'hook ignora i commit di soli `.md` e asset (post-commit.sh:18): scelta voluta;
- `claude -p` dell'hook scrive solo in `docs/mappa/**` (post-commit.sh:57-58);
- l'hook non parte se manca `docs/mappa/MAPPA.md` (:13).
Flusso interno: `docs/mappa/flusso-dei-dati.md` (commit → hook → mappa).
Dipendenze esterne: `GENIUS_PUB_CHILD`, `GENIUS_PUB_RUOLO`, `CLAUDE_CODE_OAUTH_TOKEN`, `HOME`, `PATH`; binari `git`, `uv`, `claude`. Lucchetto `$GITDIR/genius-pub-mappa.lock` (scade dopo 15 minuti, :24); log `$GITDIR/genius-pub-mappa.log`.

## Punti di rottura
| Componente | Dipende da | Se cade, cosa vedi | Dove guardare | Come verificarlo |
|---|---|---|---|---|
| `claude -p` non autenticato | login salvato o `CLAUDE_CODE_OAUTH_TOKEN` | errore nel log, mappa ferma | post-commit.sh:51-59, SKILL.md:186 | `claude auth login`; `tail -n 20 "$(git rev-parse --absolute-git-dir)/genius-pub-mappa.log"` |
| PATH delle app grafiche | commit da app grafica senza `claude`/`uv` nel PATH | hook muto, mappa vecchia; lo script aggiunge `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` | post-commit.sh:7-8, :14 | `command -v claude uv`; `launchctl getenv PATH` |
| Mappa assente | `docs/mappa/MAPPA.md` | niente: l'hook esce in silenzio | post-commit.sh:13 | `test -f docs/mappa/MAPPA.md && echo presente \|\| echo assente` |
| `uv` mancante | PATH | `struttura.md` fermo, `claude` parte lo stesso | post-commit.sh:50 | `command -v uv` |
| Lucchetto orfano | processo morto prima di `rmdir` | commit saltati fino a 15 minuti | post-commit.sh:23-25, :60 | `ls -ld "$(git rev-parse --absolute-git-dir)/genius-pub-mappa.lock"` |
| Doppio aggiornamento | due commit ravvicinati | il secondo è saltato | post-commit.sh:25 | confronta `commit=` con `git rev-parse --short HEAD` |
| Hash riscritto | `commit=` dopo rebase o amend | diff parziale da `HEAD~1`, senza avviso | post-commit.sh:30-31 | `git cat-file -t <hash da commit=>` |
| Primo commit | `diff-tree` senza `--root` | nessun aggiornamento | post-commit.sh:19-20 | `git rev-list --max-parents=0 HEAD` |
| Worktree | `GITDIR` per worktree | lucchetto e note separati | post-commit.sh:12, :23; SKILL.md:62, :174 | `git worktree list` |
| Mappa non versionata | `docs/` non tracciata | `git diff docs/mappa/` vuoto; verifica di SKILL.md:161 inefficace | SKILL.md:151, :161 | `git status --short docs/` |
| Nomi con spazi | `$FILES` senza virgolette | `--solo` e `git diff` ricevono argomenti sbagliati | post-commit.sh:33, :35, :50 | `git ls-files \| grep ' '` |
| Segreti nel diff | diff grezzo nel prompt, `.env` non ignorato | valori segreti verso il modello | post-commit.sh:33, :57-58; SKILL.md:36 | `git ls-files \| grep -E '(^\|/)\.env'` (solo nomi) |
| Percorso del plugin | hook con percorso assoluto | hook muto se il plugin si sposta | SKILL.md:181; post-commit.sh:10 | `test -f "<percorso nel blocco dell'hook>"` |
| Cancellazione note | `rm -rf` di `genius-pub-note` | cancella anche le note di lavoro a fine skill | SKILL.md:140 | `ls -la "$(git rev-parse --absolute-git-dir)/genius-pub-note"` |
| Log non visibile | hook senza output | errori solo nel log | post-commit.sh:47-59 | `tail -n 40 "$(git rev-parse --absolute-git-dir)/genius-pub-mappa.log"` |
