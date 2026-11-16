# Modulo struttura
Produce in modo deterministico (0 token) il blocco `STRUTTURA:AUTO` di `docs/mappa/struttura.md`: file tracciati, simboli, import, PageRank e ruolo, entro un budget.

File: elenco in `docs/mappa/MAPPA.md`.

Simboli principali: `elenca` scripts/struttura.py:66, `escluso` :71, `tipo_file` :78, `area` :105, `albero` :120, `estrai_js` :171, `config_js` :298, `estrai_py` :368, `estrai_php` :395, `estrai` :470, `collega` :650, `pagerank` :692, `ruolo` :713, `analizza` :770, `ordine` :806, `genera` :866, `applica_solo` :922, `marcatori` :943, `scrivi` :952, `main` :966.
Convenzioni:
- budget: 1 token = 4 caratteri; i manifest della radice entrano fino a un quarto (:873-875), poi gli altri fino al budget (:876-881);
- `ruolo` (:713): l'ordine delle condizioni conta, vince la prima;
- il testo tra i marcatori `STRUTTURA:AUTO-START` e `STRUTTURA:AUTO-END` non si modifica a mano;
- shortcut dichiarati: `tsconfig extends` non seguito (:565), namespace PHP risolto per suffisso (:646).
Flusso interno: argomenti (`main`) → `elenca` → `analizza` (`escluso`, `tipo_file`, `estrai`) → `collega` → `pagerank` + `ordine` → `ruolo` → `genera` o `applica_solo` → `marcatori` → `scrivi` (file temporaneo, `os.replace`).
Dipendenze esterne: nessuna variabile d'ambiente; `uv`, Python 3.12-3.14, `tree-sitter-language-pack==0.13.0` (:2-6, `exclude-newer` :6), `git`.

## Punti di rottura
| Componente | Dipende da | Se cade, cosa vedi | Dove guardare | Come verificarlo |
|---|---|---|---|---|
| Linguaggi non supportati | `CODICE`: solo js/ts/py/php/sfc | file elencati per nome, senza simboli | scripts/struttura.py:54 | da radice repo: `git ls-files \| grep -E '\.(go\|rs\|java\|rb)$'` |
| Parse o grammatica | `tslp.get_parser`, catch per file | «file letto senza dettagli» su stderr | :795 | da radice repo: `uv run --script scripts/struttura.py --json > /dev/null` |
| File oltre 1 MB | `MAX_BYTE` | file escluso senza avviso | :787 | `git ls-files -z \| xargs -0 du -k \| awk '$1>1024'` |
| Segreti non coperti | `escluso` guarda solo il nome | `id_rsa`, `*.p12`, `credentials.*` restano elencati (non letti) | :73 | `git ls-files \| grep -iE 'secret\|credential\|id_rsa\|\.p12$'` |
| Marcatori mancanti o doppi | `marcatori` | lo script esce con errore, file intatto | :943, :1012 | `grep -c 'STRUTTURA:AUTO' docs/mappa/struttura.md` (atteso 2) |
| API tree-sitter | `QueryCursor` richiede tree-sitter >= 0.25 | `AttributeError` su ogni JS/TS: mappa senza simboli | :129, :174 | `uv export --script scripts/struttura.py --no-hashes \| grep tree-sitter==` |
| Wheel per piattaforma | pin 0.13.0 | `uv` non installa, lo script non parte | :4 | `uv export --script scripts/struttura.py --no-hashes` |
| Indice di pattern | require rilevato con `i == 1` | cambiando `Q_JS_CHIAMATE` i require spariscono | :256 | `grep -n Q_JS_CHIAMATE scripts/struttura.py` |
| `uv` e `git` nel PATH | shebang `env -S` | `python scripts/struttura.py` dà `ModuleNotFoundError` | :1, :37 | `command -v uv git` |
| `--root` fuori dal repo | `rev-parse` | uscita con messaggio, nessuna scrittura | :978 | `git -C <root> rev-parse --show-toplevel` |
| Budget | `genera` si ferma al primo file che non entra | file meno centrali restano fuori | :880 | `--stampa` e conteggio righe |
| `rimuovi` con indice 0 | `corpo[h-1]` | caso improbabile: legge l'ultima riga | :901-903 | da verificare con un test |
