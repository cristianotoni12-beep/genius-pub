# Modulo plugin
Dice a Claude Code cos'è il plugin (nome, versione, tipi), come si registra in locale e come si controlla il TypeScript.

File: elenco in `docs/mappa/MAPPA.md`.

Simboli principali: `name` .claude-plugin/plugin.json:2, `version` :3, `types` :6 (`./types/index.d.ts`); `plugins[0].name` .claude-plugin/marketplace.json:9, `source` :10; `extends` tsconfig.json:2 → `.claude-plugin/types/tsconfig.json` (generato, non in git; `typeRoots` :16-18, `include` :25-29); `.gitignore:3` esclude `diario/`.
Convenzioni:
- il manifest non elenca skill né hook: li trova per convenzione (`hooks/hooks.json`, `skills/`);
- il commit di rilascio si chiama «Genius Pub X.Y.Z»; non ci sono tag;
Dipendenze esterne: nessuna variabile d'ambiente; `claude` e `npx` (per `tsc`).

## Punti di rottura
| Componente | Dipende da | Se cade, cosa vedi | Dove guardare | Come verificarlo |
|---|---|---|---|---|
| Tipi generati | `.claude-plugin/types/` ignorata da git | `tsc` fallisce su un clone pulito | tsconfig.json:2; `.claude-plugin/types/tsconfig.json:16-23` | `test -f .claude-plugin/types/tsconfig.json && echo presente \|\| echo MANCANTE` |
| Versione nel manifest | cache di installazione legata alla versione (ipotesi) | modifiche nuove non arrivano dopo l'update | .claude-plugin/plugin.json:3 | `claude plugin validate --strict .` |
| Percorso del marketplace | percorso assoluto salvato all'`add` | cartella spostata: plugin non caricato | .claude-plugin/marketplace.json:2, :9, :10 | `claude plugin marketplace list` |
| Icona assente | `.claude-plugin/icon.png` | avviso `ICON_MISSING`, solo per la directory pubblica | validate | `claude plugin validate --strict .` |
