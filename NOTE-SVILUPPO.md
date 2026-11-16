# Note di sviluppo (per il resoconto finale)

> Dal 2026-11-16 sera il plugin si chiama **Genius Pub** (`genius-pub`, v0.2.0); prima era «spiegatore». Dalla v0.3.0 (2026-11-16 notte) l'interfaccia del pannello è in inglese e i comandi sono `/genius-pub:map` (prima `/genius-pub:mappa`), `/explain` (prima `/spiega`) e «bug <symptom>» (prima «guasto <sintomo>»): i nomi vecchi nel testo storico indicano questi. Nel testo storico qui sotto «spiegatore» indica lo stesso plugin. Il nome resta nei file dei prompt (`prompts/spiegatore.md`) e nel tag `<cronologia-spiegatore>`: descrivono il ruolo, non il marchio.

## Fase 0 — risultati (2026-11-15, Claude Code desktop 2.1.325, ponytail 5.3.3)

| Domanda | Risultato | Conseguenza |
|---|---|---|
| Fascia con ponytail | Una riga per plugin: le righe arrivano come `["spiegatore-test", "ponytail"]` e sono visibili entrambe nella tab Code (confermato a vista). `await next(e)` non serve: `AbovePrompt` risponde alla riga del proprio plugin. Terminale: da verificare con la mod vera (il CLI non si autenticava). | Fascia `AbovePrompt`, niente ripiego su `$.ui.status` |
| Cache di `$.model.complete` | Prefisso di circa 34k caratteri marcato `cache: true`: la 1ª chiamata ha `cache_creation_input_tokens` 15.203, la 2ª ha `cache_read_input_tokens` 15.203 | Parti stabili (prompt di sistema, MAPPA, DECISIONI) marcate cache |
| Stima dei token | Circa 34k caratteri sono stati circa 15,2k token, quindi ≈ 2,2 caratteri per token (testo italiano con numeri), non 4 | Il budget usa ≈ 3 caratteri per token e si tara su `usage` |
| `maxTokens` | Con un tetto di 30 sono stati contati 75 e 102 token in uscita (ragionamento interno) | Selettore di file con `effort: "low"` |
| Contesto di Opus con comando `{}` | I messaggi API restano gli stessi, ma ogni `/spiega-test` aggiunge circa 420 caratteri: record del comando (circa 170) più la riga `local-command-caveat` (circa 260) | Le domande passano dall'`Input` del pannello (contesto zero) |
| `{ drop }` su `prompt.submit` | Nessun effetto sul record dei comandi locali (circa 420 caratteri come prima) | Scartato |
| Svuotare il record con `session.append` | Si scende a circa 285 caratteri per comando: la riga caveat resta e il record diventa `(no content)` | Scartato: fragile e lascia righe vuote. `/spiega` resta una scorciatoia da circa 100 token più la domanda |

## Ambiente
- `claude` nel PATH: 2.1.316; il motore della tab Code è 2.1.325. Il validatore 2.1.316 non riconosce `AbovePromptList`. I processi figli (`claude -p`) usano quello nel PATH.
- Il 2026-11-15 `claude -p` non si autenticava (OAuth scaduto, sia 2.1.316 sia 2.1.325). Serve `claude auth login`; per l'hook senza interazione `claude setup-token` + `CLAUDE_CODE_OAUTH_TOKEN`.
- Questa build nativa non registra Glob/Grep: tornano quando Bash è escluso (`--tools Read,Grep,Glob`). Da verificare dopo il login.

## Fonti
- `/map`: https://raw.githubusercontent.com/diegosouzapw/awesome-omni-skill/main/skills/tools/map/SKILL.md (aggregazione con licenza MIT, la skill singola mantiene la licenza d'origine). Verificato il 2026-11-16: la fonte è `https://github.com/dylan/claude` (dal `metadata.json`), senza licenza dichiarata. Quindi niente testo copiato: la skill è scritta da zero.
- `gsd-map-codebase`: la pagina openskillindex restituisce 410; si cerca la fonte originale.
