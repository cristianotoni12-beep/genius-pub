<!-- mappa: commit=bdb7da2 · generata=2026-11-16T22:47:18+0100 · aggiornata=2026-11-16T22:47:18+0100 -->
# Mappa di Genius Pub
Plugin per Claude Code (TypeScript/TSX, `claude plugin`, tree-sitter via uv) che tiene una mappa del progetto e un registro delle decisioni e le spiega da un pannello in sola lettura; i dati stanno in `docs/mappa/`, `docs/DECISIONI.md` e nello `$.store` del plugin.

## Moduli
Ogni modulo ha il suo documento con funzioni principali, convenzioni e punti di rottura.

### mod · `docs/mappa/moduli/mod.md`
Pannello, fascia, widget e hook: riceve le domande, chiama il modello in due passi, mostra e archivia la risposta, applica la sola lettura ai figli.
| File | Ruolo |
|---|---|
| `hooks/hooks.json` | carica `./register.tsx` |
| `hooks/register.tsx` | hook, atom, UI, flusso della risposta, ripiego, guardia `tool.call` |
| `hooks/contesto.ts` | funzioni pure: budget, scelta sicura dei file, assemblaggio, archivio |
| `types/index.d.ts` | tipi di `Risposta`, `Conversazione`, stato del plugin |
| `prompts/spiegatore.md` | system prompt della risposta |
| `prompts/guasto.md` | system prompt del modo «bug» |
| `prompts/ripiego.md` | aggiunta al prompt in «Search the code» |
| `prompts/selettore-file.md` | prompt del selettore di file (Haiku) |

### mappa · `docs/mappa/moduli/mappa.md`
Genera e aggiorna `docs/mappa/`; l'hook post-commit la tiene aggiornata in background.
| File | Ruolo |
|---|---|
| `skills/map/SKILL.md` | skill `/genius-pub:map`: generazione, aggiornamento, `installa-hook` |
| `scripts/post-commit.sh` | hook git: filtra i file, prende il diff, lancia `claude -p` in background |

### struttura · `docs/mappa/moduli/struttura.md`
Produce in modo deterministico (0 token) il blocco automatico di `docs/mappa/struttura.md`.
| File | Ruolo |
|---|---|
| `scripts/struttura.py` | file tracciati, simboli, import, PageRank, ruolo, entro un budget |

### test · `docs/mappa/moduli/test.md`
Verifiche senza token del plugin, di `contesto.ts`, di `struttura.py` e dell'hook.
| File | Ruolo |
|---|---|
| `tests/genius-pub.test.tsx` | mod con motore finto: pannello, archivio, ripiego, fascia, guardia |
| `tests/test_struttura.py` | `struttura.py` su tre repo fixture |
| `tests/post-commit.test.sh` | hook con `claude` e `uv` finti |

### plugin · `docs/mappa/moduli/plugin.md`
Manifest, marketplace locale, config TypeScript e note di sviluppo.
| File | Ruolo |
|---|---|
| `.claude-plugin/plugin.json` | manifest (nome, versione, tipi) |
| `.claude-plugin/marketplace.json` | catalogo locale con un solo plugin |
| `tsconfig.json` | estende `.claude-plugin/types/tsconfig.json` (non in git) |
| `.gitignore` | esclusioni del repo |
| `NOTE-SVILUPPO.md` | risultati della Fase 0 e note di ambiente |

## Documenti
| Documento | Cosa contiene |
|---|---|
| `docs/mappa/comandi.md` | Quale comando lancio per testare, validare, installare, ricaricare, rigenerare la mappa e da dove. |
| `docs/mappa/flusso-dei-dati.md` | Come passa una domanda (selettore, risposta, archivio) e come un commit aggiorna la mappa. |
| `docs/mappa/stato.md` | Quali atom di `$.state` e chiavi di `$.store` esistono, dove vivono e cosa significano. |
| `docs/mappa/superficie.md` | Cosa il plugin espone (`/explain`, `/genius-pub:map`, fascia, pannello, widget, hook `tool.call`) e come ciascuno è protetto. |
| `docs/mappa/compiti.md` | Ricette per i compiti frequenti: pannello, prompt, livelli e modelli, con passi, verifica ed esempio. |
| `docs/mappa/struttura.md` | Elenco automatico dei file con simboli e import (generato da `scripts/struttura.py`). |

Le decisioni tecniche e il loro perché stanno in `docs/DECISIONI.md`.
