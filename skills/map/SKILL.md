---
name: map
description: Genera o aggiorna docs/mappa/, la mappa del progetto che Genius Pub usa per rispondere: un indice essenziale (MAPPA.md, moduli e loro file) e documenti per modulo e per tema (punti di rottura, comandi, flussi). Usala per «/map», «/mappa», «mappa del progetto», «aggiorna la mappa», e con «installa-hook» per l'hook git post-commit che la tiene aggiornata.
argument-hint: "[aggiorna [file…] | installa-hook]"
---
<!--
Fonti. Struttura (passi, regole, catalogo delle sezioni) ispirata a `/map` di dylan
(https://github.com/dylan/claude, indicizzata in diegosouzapw/awesome-omni-skill: skills/tools/map/SKILL.md),
riscritta da zero perché quella skill non dichiara una licenza.
Mapper che scrivono su file e restituiscono solo una conferma, e voci dei punti di rottura,
da Get Shit Done (https://github.com/gsd-build/get-shit-done, agents/gsd-codebase-mapper.md e
templates/codebase/CONCERNS.md, licenza MIT).
-->

# /genius-pub:map: la mappa del progetto per Genius Pub

`PLUGIN` è la cartella del plugin: due livelli sopra la «Base directory» di questa skill (`<base>/../..`). Lo script strutturale si lancia così: `uv run --script PLUGIN/scripts/struttura.py`. Tutti i comandi partono dalla radice del repository (`git rev-parse --show-toplevel`).

## Come è fatta la mappa
La mappa è la cartella `docs/mappa/`. Genius Pub legge sempre l'indice `MAPPA.md` e, per ogni domanda, solo i documenti e i file che l'indice gli indica. Quindi:
- **l'indice** dice solo dove stanno le cose: i moduli, i loro file con il ruolo in poche parole, l'elenco dei documenti;
- **i documenti** contengono il resto: un documento per modulo (`moduli/<modulo>.md`, con i suoi punti di rottura) e un documento per tema (comandi, flusso dei dati…);
- un documento che l'indice non elenca, per Genius Pub non esiste.

Non c'è un tetto di lunghezza: la mappa cresce con il progetto. Conta la densità (regole 10-11).

## Regole dei documenti
1. Riferimenti `file:riga`, mai codice copiato (al massimo una riga, quando non ha ancora un file).
2. Tabelle invece di prosa.
3. Il vocabolario del progetto: i nomi che usa il codice, non sinonimi.
4. Diagrammi solo in ASCII.
5. Solo i documenti pertinenti, tranne quelli obbligatori.
6. Una convenzione sta nel documento del modulo che riguarda.
7. Ogni comando dice da quale cartella si lancia.
8. Lingua: quella in cui scrive l'utente quando lancia la skill. Nell'aggiornamento (anche dall'hook post-commit) si tiene la lingua della mappa esistente. Identificatori, comandi e nomi di file restano come sono.
9. Mai aprire `.env` o `.env.*` (di `.env.example` si leggono solo i nomi delle variabili), chiavi, certificati. Mai scrivere un valore segreto nella mappa.
10. Niente doppioni: ogni informazione sta in un solo documento, gli altri rimandano. L'elenco dei file sta solo nell'indice.
11. Righe brevi: l'indice entra in ogni domanda, i documenti scelti anche.

## Che cosa fare in base all'argomento
- nessun argomento → **Generazione completa**
- `aggiorna [file…]` → **Aggiornamento**
- `installa-hook` → **Hook post-commit**

---

## Generazione completa

### Passo 1: controlla
- Se non è un repository git, fermati e dillo.
- Se `docs/mappa/MAPPA.md` esiste già, proponi `/genius-pub:map aggiorna` e fermati, a meno che l'utente chieda esplicitamente di rigenerare.
- Se esiste la vecchia mappa in un file solo, `docs/MAPPA.md`, proponi di **dividerla** invece di rigenerarla: costa molto meno perché non si rilegge il codice. Con il sì dell'utente, salta i passi 2 e 3. Lancia `uv run --script PLUGIN/scripts/struttura.py --root .`, poi un subagente `model: sonnet` che legge `docs/MAPPA.md` e scrive la cartella nel formato del passo 4, spostando ogni sezione nel documento giusto senza inventare nulla. Cancella `docs/MAPPA.md` solo dopo un secondo sì dell'utente, quando ha visto la cartella.
- Se `docs/DECISIONI.md` manca, crealo con queste due righe:
  ```
  # Decisioni
  <!-- Una riga per decisione. Ordine cronologico. Mai cancellare: si supera con una nuova riga. -->
  ```

### Passo 2: esplora (tu non leggi il codice)
1. `uv run --script PLUGIN/scripts/struttura.py --root .` scrive `docs/mappa/struttura.md` (0 token; crea la cartella se manca). Poi `uv run --script PLUGIN/scripts/struttura.py --root . --json` per avere i file con ruolo, simboli e centralità (la cartella `docs/mappa/` è già esclusa).
2. Dal JSON scegli **al massimo 6 aree principali**: cartelle o gruppi di file che fanno una cosa sola, ordinati per centralità. Ogni file di codice deve finire in un'area. Ogni area diventerà un modulo con il suo documento.
3. `NOTE=$(git rev-parse --absolute-git-dir)/genius-pub-note` (in un worktree `.git` è un file: serve la vera cartella git), `mkdir -p "$NOTE"`, poi lancia **in parallelo** un subagente per area (strumento Agent, `model: haiku`). A ciascuno passa: il nome dell'area, l'elenco dei suoi file, le regole dei documenti qui sopra e il compito sotto. Passagli il percorso assoluto `$NOTE/<area>.md`: ogni subagente scrive lì la sua nota e **risponde soltanto** con:
   ```
   ## Mappatura completata
   **Area:** <area>
   **Nota:** $NOTE/<area>.md (<N> righe)
   ```
   Il compito del subagente, da scrivere nella nota:
   - il ruolo dell'area, in una frase;
   - una tabella `file · ruolo · simboli principali (file:riga)`;
   - il flusso dei dati: da dove entra, che passaggi fa, dove esce (`file:riga`);
   - le dipendenze esterne: chiamate HTTP/fetch, database, file system, variabili d'ambiente (solo i nomi), servizi;
   - i **candidati punti di rottura**: chiamate esterne, variabili d'ambiente, timeout e tentativi ripetuti, `try/catch` che nascondono l'errore, presupposti impliciti (rete presente, file esistente, ordine delle chiamate). Per ciascuno: componente, da cosa dipende, cosa si vede se cade, dove guardare (`file:riga`), un comando di sola lettura per verificarlo;
   - i compiti ricorrenti nell'area: come la si estende, in passi con `file:riga`.
4. Aspetta tutte le conferme. **Non leggere le note**: le legge la sintesi.

### Passo 3: domande
Leggi `docs/DECISIONI.md`. Chiedi all'utente **solo** quello che non è già lì e non si ricava dalla struttura:
- che cosa fa il progetto, in una frase;
- i 3-5 compiti che fa più spesso;
- gli imprevisti noti (cose che si rompono, trappole).
Non chiedere decisioni già annotate.

### Passo 4: sintesi (subagente `model: sonnet`)
Lancia un subagente con `model: sonnet`. Passagli: i percorsi delle note, le risposte dell'utente, le regole dei documenti, «Come è fatta la mappa» e il formato qui sotto. Legge le note, `docs/mappa/struttura.md` e `docs/DECISIONI.md` e scrive i documenti in `docs/mappa/`. Il testo tra `<!-- STRUTTURA:AUTO-START -->` e `<!-- STRUTTURA:AUTO-END -->` in `struttura.md` non va toccato. Risponde solo con i documenti scritti e le righe di ciascuno.

Documenti (quelli con * sono obbligatori):
```
docs/mappa/
  MAPPA.md               * l'indice
  moduli/<modulo>.md     * uno per modulo, con i suoi punti di rottura
  comandi.md             * | Comando | Cosa fa | Da dove |
  flusso-dei-dati.md       se ci sono livelli: richieste, eventi, pipeline (diagramma ASCII con file:riga)
  stato.md                 se lo stato non è banale: | Cosa | Dove | Nota |
  superficie.md            rotte, API, eventi, comandi CLI, con la protezione di ciascuno
  relazioni.md             chi dipende da chi, accoppiamenti non ovvi con il perché
  compiti.md               ricette: passi con file:riga, **Verifica:** comando, esempio da imitare
  struttura.md             automatico (struttura.py): solo il titolo sopra i marcatori
```
Altri documenti, anche in sottocartelle, vanno bene se servono a rispondere, purché l'indice li elenchi.

Formato di `MAPPA.md`:
```
<!-- mappa: commit=<git rev-parse --short HEAD> · generata=<data e ora ISO> · aggiornata=<data e ora ISO> -->
# Mappa di <progetto>
<una frase: cosa fa, tecnologie chiave, dove vivono i dati>

## Moduli
Ogni modulo ha il suo documento con funzioni principali, convenzioni e punti di rottura.

### <modulo> · `docs/mappa/moduli/<modulo>.md`
<ruolo in una frase>
| File | Ruolo |              ← TUTTI i file del modulo, ruolo in poche parole: Genius Pub li usa per scegliere cosa leggere

## Documenti
| Documento | Cosa contiene |  ← ogni documento della cartella tranne l'indice, con una frase che dice a quali domande risponde

Le decisioni tecniche e il loro perché stanno in `docs/DECISIONI.md`.
```
Ogni modulo ha un titolo `### <modulo> · …` stabile: l'aggiornamento trova i file e il documento di un modulo da quel titolo.

Formato di `moduli/<modulo>.md`:
```
# Modulo <modulo>
<ruolo in una frase>

File: elenco in `docs/mappa/MAPPA.md`.

Simboli principali: `nome` file:riga, …
Convenzioni: …
Flusso interno: …                  (se non è ovvio)
Dipendenze esterne: …              (servizi, database, variabili d'ambiente: solo i nomi)

## Punti di rottura
| Componente | Dipende da | Se cade, cosa vedi | Dove guardare | Come verificarlo |
(se non ce ne sono, una riga che lo dice; quando un limite deriva da una decisione, cita la riga di DECISIONI.md con data e area)
```

### Passo 5: mostra e lascia il commit all'utente
- `rm -rf "$NOTE"`.
- Mostra: i documenti scritti, quanti moduli e quanti punti di rottura, `git status --short docs/` e i token consumati, se li conosci.
- **Non fare commit.** Ricorda all'utente che lo fa lui, e che `/genius-pub:map installa-hook` tiene aggiornata la mappa dopo ogni commit.

---

## Aggiornamento: `aggiorna [file…]`

Se il prompt dice che sei nel **processo dell'hook post-commit**: niente domande all'utente, niente commit, e nessun subagente tranne quello Sonnet del punto 6. Lì non hai Bash: lo script dell'hook ha già fatto i passi con git e ti dà nel prompt i file completi (passo 2), il diff (passo 5), il commit e la data (passo 7); il passo 3 l'ha già lanciato lui.

1. Leggi l'intestazione di `docs/mappa/MAPPA.md` e prendi `commit=<hash>`. Se l'indice non esiste: con la vecchia `docs/MAPPA.md` proponi la divisione (Generazione completa, passo 1), altrimenti proponi `/genius-pub:map`; poi fermati. Nel processo dell'hook fermati e basta.
2. File da considerare: gli argomenti **più** `git diff --name-only <hash>..HEAD` (così si recupera anche quello che un aggiornamento precedente ha saltato). Togli tutto ciò che sta in `docs/mappa/` e `docs/DECISIONI.md`. Se non resta nulla, aggiorna solo `aggiornata=` e fermati.
3. `uv run --script PLUGIN/scripts/struttura.py --root . --solo <file…>`: aggiorna le righe di `struttura.md`.
4. Per ogni file trova, nelle tabelle di `## Moduli` dell'indice, il modulo che lo elenca e quindi il suo documento. Il cambiamento è **strutturale** se:
   - un file non è elencato in nessun modulo (file nuovo);
   - un file elencato non esiste più (spostato o eliminato);
   - c'è una nuova dipendenza esterna: nuove voci in `package.json`, `requirements*.txt`, `pyproject.toml`, oppure nuove chiamate HTTP/database/variabili d'ambiente nei file cambiati.
5. **Non strutturale**: leggi solo i file cambiati e il loro `git diff <hash> -- <file>`. Con modifiche Edit mirate correggi **solo**:
   - `moduli/<modulo>.md` dei moduli coinvolti: simboli, convenzioni, punti di rottura;
   - la riga del file nell'indice, se il suo ruolo è cambiato;
   - un documento tematico, se il cambiamento lo riguarda direttamente (un nuovo script in `package.json` → `comandi.md`).
   Tutto il resto non si tocca: `git diff docs/mappa/` deve mostrarlo. In una sessione interattiva fallo fare a un subagente `model: haiku`; nel processo dell'hook, che è già Haiku, fallo tu.
6. **Strutturale**: un subagente `model: sonnet`, con le stesse regole e gli stessi formati, legge i file dei moduli coinvolti e aggiorna:
   - le tabelle di `## Moduli` nell'indice (file nuovi, spostati, eliminati; un modulo nuovo ha il suo titolo e il suo `moduli/<modulo>.md`);
   - i `moduli/<modulo>.md` coinvolti;
   - `relazioni.md`, se esiste;
   - la tabella `## Documenti`, se aggiunge o toglie un documento.
7. Nell'intestazione dell'indice aggiorna `commit=` (`git rev-parse --short HEAD`) e `aggiornata=`, l'ora attuale in ISO: `date +%Y-%m-%dT%H:%M:%S%z`; nel processo dell'hook, commit e data che trovi nel prompt. `generata=` non cambia.
8. Non fare commit. Riporta in una riga i documenti toccati e se il cambiamento era strutturale.

---

## Hook post-commit: `installa-hook`

1. Destinazione: `git rev-parse --git-path hooks/post-commit`, che rispetta `core.hooksPath`.
2. Il blocco da installare. Chiama lo script del plugin invece di copiarlo, così gli aggiornamenti del plugin valgono subito:
   ```
   # >>> genius-pub >>>
   [ -f 'PLUGIN/scripts/post-commit.sh' ] && sh 'PLUGIN/scripts/post-commit.sh'
   # <<< genius-pub <<<
   ```
   (`PLUGIN` va sostituito con il percorso assoluto reale, `cd PLUGIN && pwd -P`, non con un link simbolico che può sparire. Gli hook valgono per tutti i worktree del repository: dove manca `docs/mappa/MAPPA.md` non fanno nulla.)
3. Se l'hook esiste e contiene già `# >>> genius-pub >>>`, dì che è installato e fermati.
4. Se l'hook esiste con altro contenuto, mostralo e **chiedi conferma**, poi aggiungi il blocco **in fondo**. Mai sovrascrivere.
5. Se non esiste, crealo con `#!/bin/sh` seguito dal blocco.
6. `chmod +x` sull'hook.
7. Ricorda all'utente che servono `uv` e un `claude` autenticato anche senza terminale. Basta il login salvato di `claude`, che vale anche nei processi senza terminale; in alternativa un token di lunga durata con `claude setup-token`, messo in `CLAUDE_CODE_OAUTH_TOKEN` dall'utente nell'ambiente da cui si fanno i commit. Il log dell'ultima esecuzione è `$(git rev-parse --absolute-git-dir)/genius-pub-mappa.log`.
