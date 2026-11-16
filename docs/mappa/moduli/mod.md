# Modulo mod
Dentro Claude Code riceve le domande, chiama il modello in due passi, mostra la risposta e la archivia; nei processi figli applica la sola lettura.

File: elenco in `docs/mappa/MAPPA.md`.

Simboli principali: `register` hooks/register.tsx:518, `calcolaRisposta` :250, `rispondi` :343, `cercaNelCodice` :361, `concludi` :380, `esplora` :176, `vietato` :508, `leggiRuolo` :77, `dalCampo` :457, `registra` :147, `BUDGET` hooks/contesto.ts:7, `eSegreto` :25, `percorsiSicuri` :34, `sceltaSicura` :50, `fileToccati` :60, `hashMappa` :80, `assembla` :129, `archivia` :177; tipi `Livello` types/index.d.ts:1, `Risposta` :9, `PluginState` :28.
Convenzioni:
- il livello sceglie modello e sforzo (`MODELLO`, `SFORZO` :48-49); la lunghezza la dice il prompt;
- i prompt in `prompts/` finiscono con la regola SERVE (spiegatore.md:13, guasto.md:14); `ripiego.md:3` vieta di scriverla;
- ogni atom ha una `shape` (register.tsx:29-45): cambiando il significato, cambia la `shape`;
- il modello del selettore, `'haiku'`, è scritto a mano (:273).
Flusso interno: `docs/mappa/flusso-dei-dati.md`.
Dipendenze esterne: `GENIUS_PUB_CHILD`, `GENIUS_PUB_RUOLO`; binari `claude` e `git` nel PATH.

## Punti di rottura
| Componente | Dipende da | Se cade, cosa vedi | Dove guardare | Come verificarlo |
|---|---|---|---|---|
| `claude -p` non autenticato | login o `CLAUDE_CODE_OAUTH_TOKEN` | «No answer: …» o risposta vuota in «Search the code» | register.tsx:177, :226 | `command -v claude`; poi `claude auth login` |
| Ripiego senza timeout | ciclo `for await` sul processo | «Searching the code…» che non finisce | register.tsx:194-225 | `ps aux \| grep "claude -p" \| grep -v grep` |
| Selettore file | `$.model`, timeout 60 s | risposta senza file, nessuna riga «Files:» | register.tsx:271-283 | `grep -c "docs/mappa/" docs/mappa/MAPPA.md` |
| Intestazione della mappa | regex `commit=` | «map has no header» in fascia | contesto.ts:80-81, register.tsx:117, :128 | `head -3 docs/mappa/MAPPA.md` |
| Commit della mappa sparito (rebase, gc) | `git diff <hash>` | conteggio «changed» sbagliato, diff vuoto senza errore | register.tsx:118, :289-293, :88-90 | `git cat-file -t <hash da MAPPA.md>` |
| Chiamate `git` | `git` nel PATH, repo | fascia e stato assenti, nessun messaggio | register.tsx:85-92 | `git rev-parse --show-toplevel` |
| File di prompt | `$.plugin.root/prompts/` | `leggi` torna vuoto: risposta senza regole né footer | register.tsx:94-104 | da radice repo: `wc -c prompts/*.md` |
| Risposta del modello | timeout 300 s, tetto 16000 token (`MAX_RISPOSTA`) | «No answer: API error (…)» | register.tsx:311-318, :157-160 | `grep -n "timeoutMs\|maxTokens" hooks/register.tsx` |
| Stima del budget | 2 caratteri per token | file scartati in silenzio (`tagliati`) | contesto.ts:22, :129-145 | leggere `tagliati` nello store `misure` |
| Archivio e misure | try/catch che ingoia l'errore | conversazione assente da History; chiavi `errore-archivio`, `errore-misure` | register.tsx:393-407, :147-155 | `docs/mappa/stato.md` |
| Archivio senza lock | lettura e riscrittura | una voce può andare persa con due scritture insieme | register.tsx:393-407, :436-442 | presupposto: una sola sessione per progetto |
| Guardia `tool.call` | `leggiRuolo`, catch che nega | figlio con tutti gli strumenti negati | register.tsx:561-567 | `grep -n "tool.call" hooks/register.tsx` |
| Lettura del ruolo | `$.env.get`, cache nel modulo | nessun catch in `session.start`: l'hook fallisce | register.tsx:77-83, :519-520 | `grep -n leggiRuolo hooks/register.tsx` |
| Chiusura del pannello | il plugin non riceve il `ui.close` delle proprie `$.ui.close` | fascia ferma su Close | `chiudi` register.tsx:169; hook `ui.close` :550 | `grep -n "chiudi\|ui.close" hooks/register.tsx` |
| Aggiornamento fascia | `void aggiornaStatoMappa` | fascia ferma su uno stato vecchio | register.tsx:132-135, :532, :545 | `git diff --name-only <hash> --` |
| Id di Ponytail | nome del plugin scritto a mano | il figlio riceve regole Ponytail | register.tsx:71 | `grep -n ponytail hooks/register.tsx` |
| Alias modello | `'haiku'`, `'sonnet'` risolti dall'host | errore di modello a ogni domanda | register.tsx:48, :273 | `grep -n "'haiku'\|'sonnet'" hooks/register.tsx` |
| Tipi di `.claude-plugin/types/` | cartella non in git | `tsc` fallisce | `tsconfig.json:2` | `docs/mappa/moduli/plugin.md` |
