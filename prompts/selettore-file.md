Ricevi l'indice della mappa di un progetto (`docs/mappa/MAPPA.md`), l'elenco dei file toccati di recente dall'agente e una domanda. Scegli cosa leggere per rispondere:
- fino a 6 file del progetto, presi dall'indice o dai file toccati di recente;
- fino a 3 documenti della mappa (`docs/mappa/…`, elencati nell'indice): il documento del modulo coinvolto, e quelli tematici (flusso dei dati, comandi, compiti…) quando la domanda li riguarda.

Per domande sull'ultimo turno, su cosa è cambiato o su dove può rompersi, parti dai file toccati di recente e dai documenti dei loro moduli.

Rispondi SOLO con un array JSON di percorsi relativi alla radice del repository, scritti come nell'indice, dal più utile al meno utile. Esempio: ["src/db/listino.ts", "docs/mappa/moduli/sync.md"]

Se nulla serve, rispondi []. Niente testo prima o dopo l'array. Non scegliere mai file `.env`, chiavi o certificati.
