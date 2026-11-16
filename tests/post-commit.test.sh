#!/bin/sh
# Collaudo di scripts/post-commit.sh con un `claude` finto: nessun token speso.
# Uso: sh tests/post-commit.test.sh
set -eu
PLUGIN=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# claude finto: registra argomenti e variabili, dorme 2 s per simulare il lavoro.
mkdir "$TMP/bin"
cat >"$TMP/bin/claude" <<'EOF'
#!/bin/sh
{ echo "CHIAMATA child=$GENIUS_PUB_CHILD ruolo=$GENIUS_PUB_RUOLO cwd=$(pwd)"; printf '%s\n' "$@"; } >>"$REGISTRO"
sleep 2
EOF
# uv finto: registra la chiamata a struttura.py senza toccare la mappa.
printf '#!/bin/sh\necho "UV $*" >>"$REGISTRO_UV"\n' >"$TMP/bin/uv"
chmod +x "$TMP/bin/claude" "$TMP/bin/uv"
export PATH="$TMP/bin:$PATH" REGISTRO="$TMP/registro.txt" REGISTRO_UV="$TMP/registro-uv.txt"
: >"$REGISTRO" && : >"$REGISTRO_UV"

cd "$TMP" && git init -q repo && cd repo
git config user.email t@t && git config user.name t
mkdir -p docs/mappa src
echo '<!-- mappa: commit=0000000 · generata=x · aggiornata=x -->' >docs/mappa/MAPPA.md
printf '#!/bin/sh\n# >>> genius-pub >>>\n[ -f %s ] && sh %s\n# <<< genius-pub <<<\n' \
  "'$PLUGIN/scripts/post-commit.sh'" "'$PLUGIN/scripts/post-commit.sh'" >.git/hooks/post-commit
chmod +x .git/hooks/post-commit

ok() { echo "ok - $1"; }
ko() { echo "NON OK - $1"; exit 1; }

# 1. Commit di sola documentazione: nessun processo.
git add docs && git commit -qm "solo docs"
sleep 1
[ ! -s "$REGISTRO" ] && [ ! -s "$REGISTRO_UV" ] && ok "commit di sola documentazione: nessun processo" || ko "doc-only ha lanciato claude o uv"

# 2. Commit di codice: il commit non aspetta il processo, che parte con i file giusti.
echo 'export const a = 1' >src/a.ts
git add src
INIZIO=$(date +%s)
git commit -qm "aggiunge a.ts perché serve"
DURATA=$(( $(date +%s) - INIZIO ))
[ "$DURATA" -lt 2 ] && ok "il commit non aspetta il processo (${DURATA}s)" || ko "commit lento: ${DURATA}s"
sleep 1
grep -q '^CHIAMATA child=1 ruolo=mappa' "$REGISTRO" && ok "processo con GENIUS_PUB_CHILD=1 e ruolo mappa" || ko "variabili mancanti"
grep -q '^/genius-pub:map aggiorna src/a.ts' "$REGISTRO" && ok "prompt con i file del commit" || ko "prompt sbagliato"
grep -q 'perché serve' "$REGISTRO" && ok "messaggio del commit nel prompt" || ko "manca il messaggio"
grep -qx 'haiku' "$REGISTRO" && grep -qxF 'Edit(./docs/mappa/**)' "$REGISTRO" && ok "haiku e scrittura limitata a docs/mappa/" || ko "flag sbagliati"
grep -qx -- '--strict-mcp-config' "$REGISTRO" && grep -qx -- '--no-session-persistence' "$REGISTRO" && ok "niente server MCP né sessione salvata" || ko "manca --strict-mcp-config o --no-session-persistence"
grep -qxF '{"enabledPlugins":{"ponytail@ponytail":false}}' "$REGISTRO" && ok "niente ponytail nel processo" || ko "manca --settings senza ponytail"
grep -qx 'Read,Grep,Glob,Edit,Write,Agent,Skill' "$REGISTRO" && ! grep -q '^Bash' "$REGISTRO" && ok "niente Bash nel processo" || ko "Bash ancora tra gli strumenti"
grep -qF '+export const a = 1' "$REGISTRO" && grep -q 'Data per aggiornata=: 20' "$REGISTRO" && ok "diff e data del commit nel prompt" || ko "manca il diff o la data nel prompt"
grep -qF "UV run --script $PLUGIN/scripts/struttura.py --root . --solo src/a.ts" "$REGISTRO_UV" && ok "struttura.md aggiornata dallo script" || ko "struttura.py non lanciato"

# 3. Secondo commit mentre il primo lavora: il lucchetto lo salta.
echo 'export const b = 2' >src/b.ts && git add src && git commit -qm "b"
sleep 1
[ "$(grep -c '^CHIAMATA' "$REGISTRO")" -eq 1 ] && ok "un aggiornamento alla volta" || ko "processi sovrapposti"
sleep 2
[ ! -d .git/genius-pub-mappa.lock ] && ok "lucchetto rilasciato" || ko "lucchetto rimasto"

# 4. Dentro un processo di Genius Pub l'hook non fa nulla (niente cicli).
: >"$REGISTRO"
echo 'export const c = 3' >src/c.ts && git add src && GENIUS_PUB_CHILD=1 git commit -qm "c"
sleep 1
[ ! -s "$REGISTRO" ] && ok "nessun ciclo con GENIUS_PUB_CHILD=1" || ko "ciclo"
[ -z "$(git status --porcelain)" ] && ok "nessuna modifica né commit fatti dall'hook" || ko "working tree sporco"

# 5. Commit di merge: l'hook vede i file portati dal ramo.
git checkout -qb ramo && echo 'export const d = 4' >src/d.ts && git add src && GENIUS_PUB_CHILD=1 git commit -qm "d"
# `git merge` da solo lancia post-merge: post-commit arriva quando un merge si chiude con `git commit`.
git checkout -q - && : >"$REGISTRO" && git merge -q --no-ff --no-commit ramo && git commit -qm "merge ramo"
sleep 1
grep -q '^/genius-pub:map aggiorna src/d.ts' "$REGISTRO" && ok "commit di merge: file del ramo nel prompt" || ko "merge ignorato"
sleep 2

# 6. Commit da un'app grafica (PATH minimo, claude solo in ~/.local/bin) con la mappa ferma al commit di a.ts:
#    si recuperano anche b.ts (saltato dal lucchetto), c.ts e d.ts.
mkdir -p "$TMP/casa/.local/bin" && cp "$TMP/bin/claude" "$TMP/bin/uv" "$TMP/casa/.local/bin/"
GIT=$(command -v git) && : >"$REGISTRO" && : >"$REGISTRO_UV"
A=$(git log --format=%h --grep='aggiunge a.ts' -1)
echo "<!-- mappa: commit=$A · generata=x · aggiornata=x -->" >docs/mappa/MAPPA.md
echo 'export const e = 5' >src/e.ts && git add src
HOME="$TMP/casa" PATH=/usr/bin:/bin "$GIT" commit -qm "e"
sleep 1
grep -q '^CHIAMATA child=1 ruolo=mappa' "$REGISTRO" && ok "claude trovato in ~/.local/bin senza ~/.zshrc" || ko "claude non trovato con il PATH minimo"
grep -q '^/genius-pub:map aggiorna src/b.ts src/c.ts src/d.ts src/e.ts' "$REGISTRO" && grep -qF -- '--solo src/b.ts src/c.ts src/d.ts src/e.ts' "$REGISTRO_UV" && ok "recuperati i file cambiati dall'ultima mappa" || ko "file saltati non recuperati"
sleep 2
echo "tutti i controlli passati"
