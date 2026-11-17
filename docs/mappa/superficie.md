# Superficie
| Cosa | Dove | Protezione |
|---|---|---|
| `/explain [bug] <domanda>` | hooks/register.tsx:521, :538-542 | registrato solo se non è un figlio (`leggiRuolo`, :519); la riga entra in trascrizione (~100 token), la risposta no |
| `/genius-pub:map [aggiorna \| installa-hook]` (Windows: `/genius-pub-windows:map`) | skills/map/SKILL.md | `installa-hook` chiede conferma se l'hook esiste (:182-184); non fa commit |
| Fascia `AbovePrompt` | :570-590 | parla solo quando c'è da fare; un solo pulsante Open/Close; stato in atom `aperto` |
| Pannello `Pane` | :592-827 | sola lettura; ogni bottone ha `key` unica; guardia «occupato» contro domande in parallelo (:344) |
| Widget (versione ridotta) | :601-616 | solo presentazione |
| Hook `tool.call` | :561-567 | nei figli (`GENIUS_PUB_CHILD`): solo `LETTURA`; con ruolo `mappa` anche `ORGANIZZAZIONE` e Edit/Write dentro `docs/mappa/` (`vietato` :508-516); se la guardia fallisce, nega |
| Selettore di file | hooks/contesto.ts:34-56 | `percorsiSicuri` e `sceltaSicura` scartano segreti e percorsi fuori dal repo; `eSegreto` :25 |
| Ripiego «Search the code» | :176-194 | `claude -p --tools Read,Grep,Glob`, sola lettura |
| Hook git post-commit | scripts/post-commit.sh | esce se `GENIUS_PUB_CHILD`, se manca la mappa o `claude`; lucchetto anti-doppioni |
