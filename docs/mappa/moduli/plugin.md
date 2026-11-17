# Modulo plugin
Dice a Claude Code cosa sono i due plugin (nome, versione, tipi), come si registrano in locale dal marketplace e come si controlla il TypeScript.

File: elenco in `docs/mappa/MAPPA.md`.

Simboli principali: `name` plugins/genius-pub/.claude-plugin/plugin.json:2 (Windows: `genius-pub-windows`, stesso file nella sua cartella), `version` :3, `types` :8 (`./types/index.d.ts`), `license` :9 (MIT, testo in `LICENSE`); `plugins[0]` `.claude-plugin/marketplace.json`:9-11 (macOS), `plugins[1]` :14-16 (Windows); `extends` plugins/genius-pub/tsconfig.json:2 → `.claude-plugin/types/tsconfig.json` del plugin (generato, non in git; `typeRoots` :16-18, `include` :25-29); `.gitignore:3` esclude `diario/`.
Convenzioni:
- il marketplace alla radice ha due plugin; la radice non ha più un manifest;
- la copia Windows è una copia con patch: percorsi `C:\` nella guardia di `docs/mappa/` e nel pannello (`hooks/register.tsx`), UTF-8 e file in sola lettura nei test; il resto è uguale (comandi `/genius-pub-windows:map`, versione 0.4.0);
- il manifest non elenca skill né hook: li trova per convenzione (`hooks/hooks.json`, `skills/`);
- il commit di rilascio si chiama «Genius Pub X.Y.Z»; non ci sono tag;
Dipendenze esterne: nessuna variabile d'ambiente; `claude` e `npx` (per `tsc`).

## Punti di rottura
| Componente | Dipende da | Se cade, cosa vedi | Dove guardare | Come verificarlo |
|---|---|---|---|---|
| Tipi generati | `.claude-plugin/types/` di ogni plugin, ignorata da git | `tsc` fallisce su un clone pulito | plugins/genius-pub/tsconfig.json:2; `.claude-plugin/types/tsconfig.json:16-23` | da `plugins/genius-pub/`: `test -f .claude-plugin/types/tsconfig.json && echo presente \|\| echo MANCANTE` |
| Versione nel manifest | cache di installazione legata alla versione (ipotesi) | modifiche nuove non arrivano dopo l'update | plugins/genius-pub/.claude-plugin/plugin.json:3 | da `plugins/genius-pub/`: `claude plugin validate --strict .` |
| Due copie divergenti | copia Windows fatta a mano | correzione presente in un plugin solo | `plugins/genius-pub/hooks/` e `plugins/genius-pub-windows/hooks/` | `diff -r plugins/genius-pub plugins/genius-pub-windows` |
| Percorso del marketplace | percorso assoluto salvato all'`add`; `source` relativi | cartella spostata: plugin non caricato | .claude-plugin/marketplace.json:11, :16 | `claude plugin marketplace list` |
| Icona assente | `.claude-plugin/icon.png` | avviso `ICON_MISSING`, solo per la directory pubblica | validate | da `plugins/genius-pub/`: `claude plugin validate --strict .` |
