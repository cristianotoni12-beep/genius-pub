export type Livello = 'base' | 'tecnico'
export type Scheda = 'chiedi' | 'storico'
export type Modo = 'spiega' | 'guasto'
export type Scambio = { domanda: string; risposta: string }
// Archivio nello store: una conversazione va da un «New topic» al successivo.
export type Voce = Scambio & { livello: string; quando: number }
export type Conversazione = { id: string; progetto: string; inizio: number; aggiornata: number; commit?: string; scambi: Voce[] }
export type Uso = { ingresso: number; cacheLetti: number; uscita: number }
export type Risposta = {
  domanda: string
  modo: Modo
  modello: string
  testo: string
  inCorso?: boolean
  nota?: string
  errore?: string
  uso?: Uso
  file?: string[]
  documenti?: string[]
  livello?: string
  // Il modello ha detto che le informazioni ricevute non bastano: il pannello offre «Search the code».
  serveEsplorare?: boolean
  // Riaperta dallo Storico: niente costi da mostrare.
  ripresa?: true
}
export type StatoMappa = { root: string; assente: boolean; cambiati: number }

declare module 'claude-code' {
  interface PluginState {
    'genius-pub': {
      scheda: Shaped<Scheda>
      livello: Shaped<Livello>
      cronologia: Shaped<Scambio[]>
      risposta: Shaped<Risposta | null>
      mappa: Shaped<StatoMappa | null>
      conversazione: string | null
      fonti: boolean
      ridotta: boolean
      occupato: boolean
      // Id di una conversazione, oppure 'decisioni'.
      aperta: string | null
      aperto: boolean
      daEliminare: boolean
      versioneArchivio: number
    }
  }
}
