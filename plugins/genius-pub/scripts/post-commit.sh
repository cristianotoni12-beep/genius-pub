#!/bin/sh
# Genius Pub: dopo un commit di codice aggiorna la mappa (docs/mappa/) in background con Haiku.
# Non fa commit e non usa --amend: la mappa resta modificata e va nel commit successivo.
# Installato da /genius-pub:map installa-hook come chiamata a questo file.
# Con GENIUS_PUB_MANUALE=1 lo lancia il pulsante «Update map» del pannello: lavora in primo piano, non serve un commit
# nuovo e l'ultima riga stampata dice com'è andata.

[ "$GENIUS_PUB_CHILD" = 1 ] && exit 0                 # niente cicli dai processi di Genius Pub
fine() { [ "$GENIUS_PUB_MANUALE" = 1 ] && echo "$1"; exit 0; }
# I commit dalle app grafiche non leggono ~/.zshrc: claude sta in ~/.local/bin, uv in /opt/homebrew/bin.
PATH="$PATH:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin"

PLUGIN=$(cd "$(dirname "$0")/.." && pwd) || exit 0
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
GITDIR=$(git rev-parse --absolute-git-dir) || exit 0
[ -f "$ROOT/docs/mappa/MAPPA.md" ] || fine "No map yet: create it with /genius-pub:map."
command -v claude >/dev/null 2>&1 || fine "claude CLI not found."

# Solo codice e configurazione: fuori docs/, Markdown e asset (quindi mai la mappa né DECISIONI.md).
# --diff-merges=first-parent: senza, un commit di merge non elenca nessun file.
codice() { grep -vE '^docs/|\.(md|mdx|txt|png|jpe?g|gif|svg|webp|avif|ico|pdf|mp3|mp4|mov|webm|woff2?|ttf|otf|eot|zip)$'; }
# Dal pulsante contano solo i file cambiati dall'ultima mappa (più sotto), non quelli dell'ultimo commit.
FILES=
if [ "$GENIUS_PUB_MANUALE" != 1 ]; then
  FILES=$(git diff-tree --no-commit-id --name-only -r --diff-merges=first-parent HEAD | codice)
  [ -n "$FILES" ] || exit 0
fi

# Un aggiornamento alla volta; quello saltato lo recupera il prossimo dal diff della mappa.
LOCK="$GITDIR/genius-pub-mappa.lock"
find "$LOCK" -maxdepth 0 -mmin +15 -exec rmdir {} \; 2>/dev/null   # lucchetto rimasto da un processo morto
mkdir "$LOCK" 2>/dev/null || fine "A map update is already running."

cd "$ROOT" || exit 0
# La parte con git la fa lo script (0 token): Haiku compone comandi Bash con && e ; che la guardia rifiuta.
# File: anche quelli cambiati dall'ultima mappa (commit=<hash>), così si recupera un aggiornamento saltato.
PRIMA=$(sed -n 's/.*commit=\([0-9a-f]\{4,40\}\).*/\1/p' "$ROOT/docs/mappa/MAPPA.md" | head -1)
git rev-parse -q --verify "${PRIMA:-x}^{commit}" >/dev/null 2>&1 || PRIMA=HEAD~1
FILES=$( { echo "$FILES"; git diff --name-only "$PRIMA" HEAD 2>/dev/null | codice; } | sort -u)
[ -n "$FILES" ] || { rmdir "$LOCK"; fine "Nothing to update: commit your changes first."; }
DIFF=$(git diff "$PRIMA" HEAD -- $FILES 2>/dev/null | head -c 30000)

PROMPT="/genius-pub:map aggiorna $(printf '%s ' $FILES)

Sei nel processo dell'hook post-commit: niente domande all'utente, nessun commit, niente Bash.
Lo script dell'hook ha già fatto la parte con git: struttura.md è aggiornato; i file del comando sono tutti quelli cambiati da $PRIMA.
Commit attuale: $(git rev-parse --short HEAD). Data per aggiornata=: $(git log -1 --date=iso-strict --format=%cd HEAD)
Messaggio del commit (il perché delle modifiche):
$(git log -1 --format=%B HEAD)

Diff da $PRIMA a HEAD (al più 30000 caratteri):
$DIFF"

# Niente server MCP (non servono e pesano molto sul contesto), niente ponytail e nessuna sessione salvata su disco.
LOG="$GITDIR/genius-pub-mappa.log"
aggiorna() {
  : >"$LOG"
  command -v uv >/dev/null 2>&1 && uv run --script "$PLUGIN/scripts/struttura.py" --root . --solo $FILES >>"$LOG" 2>&1
  GENIUS_PUB_CHILD=1 GENIUS_PUB_RUOLO=mappa nohup claude -p "$PROMPT" \
    --model haiku \
    --output-format json \
    --permission-mode dontAsk \
    --strict-mcp-config --no-session-persistence \
    --settings '{"enabledPlugins":{"ponytail@ponytail":false}}' \
    --tools "Read,Grep,Glob,Edit,Write,Agent,Skill" \
    --allowedTools "Read" "Grep" "Glob" "Skill" "Agent" "Edit(./docs/mappa/**)" "Write(./docs/mappa/**)" \
    >>"$LOG" 2>&1 </dev/null
  ESITO=$?
  rmdir "$LOCK"
  return $ESITO
}
if [ "$GENIUS_PUB_MANUALE" = 1 ]; then
  aggiorna || fine "Map update failed: see $LOG"
  fine "Map updated."
fi
aggiorna >/dev/null 2>&1 &
exit 0
