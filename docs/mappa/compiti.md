# Compiti
Tutti i comandi si lanciano dalla radice del repo, tranne `/reload-plugins` (dentro Claude Code).

## Cambiare il pannello (testi, layout, pulsanti)
| Passo | Dove |
|---|---|
| 1. Pulsanti rapidi: voce in `RAPIDE`; il rendering c'è già | hooks/register.tsx:60-64, :746-748 |
| 2. Testi di fascia, pannello, widget | :127-129, :580, :642-697, :723-737, :813, :820; widget :607-609 |
| 3. Ogni bottone nuovo: `key` unica | :592-827 |
| 4. Stato nuovo: `atom` con `key` e `shape` e blocco in `types/index.d.ts` | :29-45; types/index.d.ts:30-44 |
| 5. Controllare se i test cercano il testo cambiato | tests/genius-pub.test.tsx:242-303 |
**Verifica:** `claude plugin test .`, poi `/reload-plugins` in Claude Code.
**Esempio da imitare:** pulsante «New topic» (register.tsx:794) e test del pannello (tests/genius-pub.test.tsx:242-303).

## Ritoccare i prompt (lingua, livelli, regole)
| Passo | Dove |
|---|---|
| 1. Livelli e lunghezza | prompts/spiegatore.md:12 |
| 2. Regola SERVE e footer «Se si rompe» | spiegatore.md:13, :16; guasto.md:14 |
| 3. Formato del selettore (solo array JSON) | prompts/selettore-file.md:7; contesto.ts:34-56 |
| 4. Ripiego: non scrivere SERVE | prompts/ripiego.md:3 |
**Verifica:** `grep -c SERVE prompts/*.md`; `claude plugin test .` (il test non legge i prompt veri, vedi `docs/mappa/moduli/test.md`).
**Esempio da imitare:** regola SERVE in prompts/spiegatore.md:13.

## Livelli e modelli
| Passo | Dove |
|---|---|
| 1. Tipo `Livello` | types/index.d.ts:1 |
| 2. `MODELLO` e `SFORZO` | hooks/register.tsx:48-49 |
| 3. `LIVELLI` (etichette) | :50-53 |
| 4. `scegliLivello` accetta solo `LIVELLI`; migrazione dei valori vecchi in `VECCHI` e `session.start` | :465-469, :57, :527-531 |
| 5. Descrivere il livello nel prompt | prompts/spiegatore.md:12 |
| 6. Misure dei token: chiamate a `registra` e limite di 30 voci | :320-334, :151 |
**Verifica:** `claude plugin test .` (test «livelli salvati» tests/genius-pub.test.tsx:450); `npx -y -p typescript@5 tsc -p . --noEmit`.
**Esempio da imitare:** la coppia `base`/`tecnico` in register.tsx:48-53.
