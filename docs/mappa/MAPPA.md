<!-- mappa: commit=0348b00 · generata=2026-11-16T22:47:18+0100 · aggiornata=2026-11-17T17:30:53+01:00 -->
# Mappa di Genius Pub
Ora ci sono due plugin per Claude Code (TypeScript/TSX, `claude plugin`, tree-sitter via uv): `plugins/genius-pub/` per macOS e `plugins/genius-pub-windows/` per Windows, stesso layout; tengono una mappa del progetto e un registro delle decisioni e le spiegano da un pannello in sola lettura; i dati stanno in `docs/mappa/`, `docs/DECISIONI.md` e nello `$.store` del plugin.

Nei documenti della mappa, i percorsi senza prefisso `plugins/` (es. `hooks/register.tsx`) sono relativi a `plugins/genius-pub/`; la copia Windows ha gli stessi file con le stesse righe, salvo le patch elencate in `docs/mappa/moduli/plugin.md`.

## Moduli
Ogni modulo ha il suo documento con funzioni principali, convenzioni e punti di rottura. Ogni file esiste in due copie: `<P>` = `plugins/genius-pub` (macOS) e `plugins/genius-pub-windows` (Windows).

### mod · `docs/mappa/moduli/mod.md`
Pannello, fascia, widget e hook: riceve le domande, chiama il modello in due passi, mostra e archivia la risposta, applica la sola lettura ai figli.
| File | Ruolo |
|---|---|
| `<P>/hooks/hooks.json` | carica `./register.tsx` |
| `<P>/hooks/register.tsx` | hook, atom, UI, flusso della risposta, ripiego, guardia `tool.call` (Windows: percorsi `C:\` nella guardia di `docs/mappa/` e nel pannello) |
| `<P>/hooks/contesto.ts` | funzioni pure: budget, scelta sicura dei file, assemblaggio, archivio |
| `<P>/types/index.d.ts` | tipi di `Risposta`, `Conversazione`, stato del plugin |
| `<P>/prompts/spiegatore.md` | system prompt della risposta |
| `<P>/prompts/guasto.md` | system prompt del modo «bug» |
| `<P>/prompts/ripiego.md` | aggiunta al prompt in «Search the code» |
| `<P>/prompts/selettore-file.md` | prompt del selettore di file (Haiku) |

### mappa · `docs/mappa/moduli/mappa.md`
Genera e aggiorna `docs/mappa/`; l'hook post-commit la tiene aggiornata in background.
| File | Ruolo |
|---|---|
| `<P>/skills/map/SKILL.md` | skill `/genius-pub:map` (Windows: `/genius-pub-windows:map`): generazione, aggiornamento, `installa-hook` |
| `<P>/scripts/post-commit.sh` | hook git: filtra i file, prende il diff, lancia `claude -p` in background |

### struttura · `docs/mappa/moduli/struttura.md`
Produce in modo deterministico (0 token) il blocco automatico di `docs/mappa/struttura.md`.
| File | Ruolo |
|---|---|
| `<P>/scripts/struttura.py` | file tracciati, simboli, import, PageRank, ruolo, entro un budget |

### test · `docs/mappa/moduli/test.md`
Verifiche senza token del plugin, di `contesto.ts`, di `struttura.py` e dell'hook.
| File | Ruolo |
|---|---|
| `<P>/tests/genius-pub.test.tsx` | mod con motore finto: pannello, archivio, ripiego, fascia, guardia |
| `<P>/tests/test_struttura.py` | `struttura.py` su tre repo fixture (Windows: UTF-8, file in sola lettura) |
| `<P>/tests/post-commit.test.sh` | hook con `claude` e `uv` finti |

### plugin · `docs/mappa/moduli/plugin.md`
Manifest dei due plugin, marketplace locale con due voci, config TypeScript e note di sviluppo.
| File | Ruolo |
|---|---|
| `plugins/genius-pub/.claude-plugin/plugin.json` | manifest macOS (nome `genius-pub`, versione, tipi, licenza) |
| `plugins/genius-pub-windows/.claude-plugin/plugin.json` | manifest Windows (nome `genius-pub-windows`, versione 0.4.0) |
| `.claude-plugin/marketplace.json` | catalogo locale con due plugin: `./plugins/genius-pub` e `./plugins/genius-pub-windows` |
| `plugins/genius-pub/tsconfig.json` · `plugins/genius-pub-windows/tsconfig.json` | estendono `.claude-plugin/types/tsconfig.json` del plugin (non in git) |
| `LICENSE` | licenza MIT del repo |
| `README.md` | presentazione, requisiti, installazione, verifiche |
| `.gitignore` | esclusioni del repo |
| `NOTE-SVILUPPO.md` | risultati della Fase 0 e note di ambiente |

## Documenti
| Documento | Cosa contiene |
|---|---|
| `docs/mappa/comandi.md` | Quale comando lancio per testare, validare, installare, ricaricare, rigenerare la mappa e da dove. |
| `docs/mappa/flusso-dei-dati.md` | Come passa una domanda (selettore, risposta, archivio) e come un commit aggiorna la mappa. |
| `docs/mappa/stato.md` | Quali atom di `$.state` e chiavi di `$.store` esistono, dove vivono e cosa significano. |
| `docs/mappa/superficie.md` | Cosa il plugin espone (`/explain`, `/genius-pub:map` e `/genius-pub-windows:map`, fascia, pannello, widget, hook `tool.call`) e come ciascuno è protetto. |
| `docs/mappa/compiti.md` | Ricette per i compiti frequenti: pannello, prompt, livelli e modelli, con passi, verifica ed esempio. |
| `docs/mappa/struttura.md` | Elenco automatico dei file con simboli e import (generato da `plugins/genius-pub/scripts/struttura.py`). |

Le decisioni tecniche e il loro perché stanno in `docs/DECISIONI.md`.
