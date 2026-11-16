# Stato
Atom di `$.state`, tutti con `plugin: 'genius-pub'` (hooks/register.tsx:29-45).
| Cosa | Dove | Nota |
|---|---|---|
| `scheda` | :29 | scheda aperta; `shape` `scheda-2`, i valori vecchi valgono `chiedi` |
| `livello` | :31 | `base` o `tecnico`; `shape` `livello-3`; `session.start` rilegge il preferito |
| `cronologia` | :32 | ultime 3 domande, contesto della risposta (:385) |
| `risposta` | :33 | risposta mostrata nel pannello |
| `mappa` (`statoMappa`) | :34 | stato della fascia; aggiornato da `aggiornaStatoMappa` (:132-135) |
| `conversazione` | :36 | conversazione in corso (scheda History) |
| `aperta` | :37 | voce aperta nella scheda (id o `decisioni`) |
| `daEliminare` | :38 | conferma di eliminazione |
| `versioneArchivio` | :39 | numero che ridisegna la scheda |
| `fonti` | :40 | mostra le fonti |
| `aperto` | :42 | pannello aperto: la fascia mostra Open o Close; aggiornato da `chiudi` (:169) e hook `ui.close` (:550) |
| `ridotta` | :43 | versione ridotta |
| `occupato` | :45 | domanda arrivata durante un'altra: avviso sotto l'Input |

Chiavi di `$.store`:
| Cosa | Dove | Nota |
|---|---|---|
| `archivio` | :390, :402, :437 | conversazioni; tetto di 3 milioni di caratteri (contesto.ts:174, :197); limite 50 chat |
| `misure` | :149-151 | ultime 30 misure (token, `tagliati`) |
| `livello-2` | :468, :527 | livello preferito (chiave attuale) |
| `livello` | :528 | chiave vecchia, letta tramite `VECCHI` (:57) |
| `errore-archivio` | :405 | errore ingoiato dell'archivio |
| `errore-misure` | :153 | errore ingoiato delle misure |
