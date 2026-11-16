# Flusso dei dati

## Domanda → selettore → risposta → archivio
Entrate:
| Da dove | Passo | Dove |
|---|---|---|
| campo Input | `onSubmit` → `dalCampo` | hooks/register.tsx:736, :457 |
| `/explain` | `command.run` → `apri` → `dalCampo` | :538-542 |
| prefisso «bug » | modo guasto | :460 |
| pulsanti rapidi | `RAPIDE` → `rispondi` | :60-64, :746-748 |
| Resume, Retry, Search the code | `apriConversazione`, `rispondi`, `cercaNelCodice` | :444, :821, :815 |

```
Input / /explain / rapido
   |
 dalCampo :457 --"bug "--> modo guasto :460
   |
 rispondi :343   guardia occupato :344
   |
 calcolaRisposta :250
   |-- niente mappa --> serveEsplorare :257
   |-- passo 1: selettore ($.model, 'haiku') :271 --> sceltaSicura :283
   |-- leggi file e documenti :285-288, diff :289-293
   |-- passo 2: assembla (contesto.ts:129) --> $.model.complete :311
   |-- registra misure :320
   |-- [[SERVE-ESPLORAZIONE]] :337 --> serveEsplorare
   v
 concludi :380 --> atom risposta :381, cronologia (max 3) :385
   |-- archiviaScambio :393 --> store «archivio» :402
   v
 Pane :592 (testo :824)

 «Search the code» :815 --> cercaNelCodice :361
   --> esplora :176 (claude -p figlio, sola lettura) --> concludi :375
```

## Commit → hook → mappa
```
git commit
  |
 .git/hooks/post-commit (blocco di SKILL.md:176-180)
  |
 scripts/post-commit.sh
  |  guardie :6, :13, :14 · filtro :18-20 · lucchetto :23-25
  |  hash da commit= :30-31 · FILES e DIFF (max 30000 car.) :32-33
  v
 background :47-61
  |-- uv run struttura.py --solo FILES :50 --> docs/mappa/struttura.md
  |-- claude -p --model haiku :51-59 (GENIUS_PUB_RUOLO=mappa)
        --> prompt /genius-pub:map aggiorna (SKILL.md:146-168)
        --> Edit/Write solo in docs/mappa/** (guardia: register.tsx:508)
  v
 rmdir lucchetto :60 · log genius-pub-mappa.log
```

## Uscite della mod
| Uscita | Dove |
|---|---|
| testo nel pannello | hooks/register.tsx:592, :824 |
| versione ridotta nel widget | :601-616 |
| riga di stato sopra l'Input | :570-590 |
| archivio, misure, cronologia, stato mappa | `docs/mappa/stato.md` |
