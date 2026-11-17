// Funzioni pure di Genius Pub: nessun `$`, quindi testabili da sole.
import type { ModelTextBlock } from 'claude-code'

import type { Conversazione, Scambio, Voce } from '../types'

// Budget di ingresso della risposta (token stimati) e tetti per parte. Sotto i 25k reali anche con la stima corta.
export const BUDGET = 22000
export const MAX_TURNI = 6000
export const MAX_FILE_CHAR = 24000
export const MAX_DIFF_CHAR = 12000
export const MAX_FILE_SCELTI = 6
export const MAX_DOC_SCELTI = 3
export const MAX_TOCCATI = 15
// La mappa è una cartella: l'indice lo legge sempre il selettore, gli altri documenti si scelgono come i file.
export const CARTELLA = 'docs/mappa'
export const INDICE = `${CARTELLA}/MAPPA.md`
export const DECISIONI = 'docs/DECISIONI.md'
// Il modello scrive questa riga quando i file non bastano: il motore passa al ripiego.
export const SERVE_ESPLORARE = '[[SERVE-ESPLORAZIONE]]'

// Misurati su Chef-moi: 2,07-2,2 caratteri per token (mappa italiana piena di percorsi). Con /3 la stima era bassa del 42%.
export const stimaToken = (s: string) => Math.ceil(s.length / 2)

// Percorsi su Windows: `C:\…` o `C:/…`. Lì `\` separa le cartelle e le maiuscole non contano.
// Su macOS e Linux `\` è un carattere del nome: si lascia com'è, o la guardia di docs/mappa/ avrebbe un varco.
export const eWindows = (p: string) => /^[A-Za-z]:[\\/]/.test(p)

// Su Windows: barre in avanti e unità maiuscola (`c:\a\b` → `C:/a/b`). Altrove il percorso resta uguale.
export function barre(p: string, windows = eWindows(p)) {
  if (!windows) return p
  const q = p.replace(/\\/g, '/')
  return /^[a-z]:/.test(q) ? q.charAt(0).toUpperCase() + q.slice(1) : q
}

// `p` relativo a `base` se ci sta dentro, altrimenti undefined. Su Windows senza badare a barre e maiuscole.
export function relativoA(p: string, base: string): string | undefined {
  const w = eWindows(base) || eWindows(p)
  const a = barre(p, w)
  const prefisso = `${barre(base, w).replace(/\/$/, '')}/`
  const dentro = w ? a.toLowerCase().startsWith(prefisso.toLowerCase()) : a.startsWith(prefisso)
  return dentro && a.length > prefisso.length ? a.slice(prefisso.length) : undefined
}

// Percorso assoluto e senza `.` né `..`, risolto da `cwd` se relativo. Non segue i link simbolici.
export function percorsoDentro(cwd: string, fp: string) {
  const w = eWindows(cwd) || eWindows(fp)
  const f = barre(fp, w)
  const pieno = f.startsWith('/') || eWindows(f) ? f : `${barre(cwd, w)}/${f}`
  const unita = eWindows(pieno) ? pieno.slice(0, 2) : ''
  const parti: string[] = []
  for (const p of pieno.slice(unita.length).split('/')) {
    if (p === '..') parti.pop()
    else if (p !== '' && p !== '.') parti.push(p)
  }
  return `${unita}/${parti.join('/')}`
}

// Mai aprire segreti: .env e varianti (non .env.example), chiavi e certificati.
// Il nome si prende dopo l'ultima `/` o `\`: su Windows `C:\repo\.env` resta un segreto.
export function eSegreto(percorso: string): boolean {
  const nome = percorso.split(/[\\/]/).pop() ?? ''
  if (nome === '.env.example') return false
  return nome === '.env' || nome.startsWith('.env.') || /\.(pem|key)$/.test(nome)
}

// Risposta del selettore → al massimo `max` percorsi tracciati da git, senza segreti.
// La lista ammessa è `git ls-files`, quindi niente percorsi assoluti né `..`.
// Si leggono le stringhe tra virgolette, non l'array: i percorsi Next.js (`src/app/[lang]/…`) rompono la ricerca di `[…]`.
export function percorsiSicuri(testo: string, tracciati: ReadonlySet<string>, max = MAX_FILE_SCELTI): string[] {
  const scelti = new Set<string>()
  for (const [, voce = ''] of testo.matchAll(/"([^"\n]+)"/g)) {
    if (scelti.size === max) break
    const v = voce.trim().replace(/^\.\//, '')
    // `moduli/rotte.md` al posto di `docs/mappa/moduli/rotte.md`: si accetta anche così.
    const p = tracciati.has(v) ? v : `${CARTELLA}/${v}`
    if (tracciati.has(p) && !eSegreto(p)) scelti.add(p)
  }
  return [...scelti]
}

const eDocumento = (p: string) => p.startsWith(`${CARTELLA}/`) && p.endsWith('.md') && p !== INDICE

// Scelta del selettore → file di codice e documenti della mappa, ciascuno col suo tetto.
// L'indice e DECISIONI.md sono già nel contesto: non si scelgono.
export function sceltaSicura(testo: string, ammessi: ReadonlySet<string>) {
  const tutti = percorsiSicuri(testo, ammessi, Infinity).filter(p => p !== INDICE && p !== DECISIONI)
  return {
    file: tutti.filter(p => !p.startsWith(`${CARTELLA}/`)).slice(0, MAX_FILE_SCELTI),
    documenti: tutti.filter(eDocumento).slice(0, MAX_DOC_SCELTI),
  }
}

// File letti o scritti dall'agente di recente, relativi al repo, dal più recente: guidano il selettore
// per «Spiega ultimo turno» e «Cosa è cambiato».
export function fileToccati(
  messaggi: readonly { toolUses?: readonly { input: Record<string, unknown> }[] }[],
  root: string,
  max = MAX_TOCCATI,
): string[] {
  const visti = new Set<string>()
  const w = eWindows(root)
  for (let i = messaggi.length - 1; i >= 0 && visti.size < max; i--) {
    const usi = messaggi[i]?.toolUses ?? []
    for (let j = usi.length - 1; j >= 0 && visti.size < max; j--) {
      const input = usi[j]?.input ?? {}
      const fp = input.file_path ?? input.notebook_path
      if (typeof fp !== 'string') continue
      const f = barre(fp, w)
      const rel = relativoA(f, root) ?? (f.startsWith('/') || eWindows(f) ? '' : f)
      if (rel && !rel.split('/').includes('..') && !eSegreto(rel)) visti.add(rel)
    }
  }
  return [...visti]
}

// Hash del commit su cui è stata generata la mappa, dall'intestazione.
export const hashMappa = (mappa: string) =>
  mappa.match(/<!--\s*mappa:\s*commit=([0-9a-f]{7,40})/)?.[1]

// Ultimi turni della sessione principale, solo testo, dal più vecchio al più recente.
export function righeTurni(
  messaggi: readonly { role: string; text?: string }[],
  maxToken = MAX_TURNI,
): string[] {
  const righe: string[] = []
  let totale = 0
  for (let i = messaggi.length - 1; i >= 0; i--) {
    const m = messaggi[i]
    const testo = (m?.text ?? '').trim()
    if (!m || !testo) continue
    const chi = m.role === 'user' ? 'utente' : 'agente'
    const riga = `[turno ${i + 1} · ${chi}] ${testo}`
    totale += stimaToken(riga)
    if (totale > maxToken) break
    righe.unshift(riga)
  }
  return righe
}

export type Parti = {
  sistema: string
  mappa: string
  decisioni: string
  documenti: readonly { file: string; testo: string }[]
  turni: readonly string[]
  diff: string
  file: readonly { file: string; testo: string }[]
  cronologia: readonly Scambio[]
  domanda: string
}

export type Assemblato = {
  system: ModelTextBlock[]
  prompt: ModelTextBlock[]
  stimati: number
  tagliati: { file: number; turni: number; documenti: number }
}

const blocco = (tag: string, testo: string) => `<${tag}>\n${testo}\n</${tag}>`

const testoDi = (tag: string, voci: readonly { file: string; testo: string }[]) =>
  voci.map(f => `<${tag} path="${f.file}">\n${f.testo}\n</${tag}>`).join('\n')

// Ordine §9.3: parti stabili prima (sistema, indice, decisioni: marcate per la cache), domanda in fondo.
// Oltre il budget si tolgono prima i file (gli ultimi scelti), poi i turni più vecchi, per ultimi i documenti.
export function assembla(p: Parti, budget = BUDGET): Assemblato {
  const file = [...p.file]
  const turni = [...p.turni]
  const documenti = [...p.documenti]
  const testoFile = () => testoDi('file', file)
  const testoDocumenti = () => testoDi('documento', documenti)
  const cronologia = p.cronologia
    .slice(-3)
    .map(s => `Domanda: ${s.domanda}\nRisposta: ${s.risposta}`)
    .join('\n\n')
  const stima = () =>
    stimaToken(
      p.sistema + p.mappa + p.decisioni + testoDocumenti() + turni.join('\n\n') + p.diff + testoFile() + cronologia + p.domanda,
    )
  while (stima() > budget && file.length > 0) file.pop()
  while (stima() > budget && turni.length > 0) turni.shift()
  while (stima() > budget && documenti.length > 0) documenti.pop()

  const parti: [string, string, boolean?][] = [
    ['mappa', p.mappa || '(mappa assente)'],
    ['decisioni', p.decisioni || '(nessuna decisione annotata)', true],
    ['documenti-mappa', testoDocumenti()],
    ['turni-sessione', turni.join('\n\n')],
    ['diff-dopo-la-mappa', p.diff],
    ['file', testoFile()],
    ['cronologia-spiegatore', cronologia],
    ['domanda', p.domanda],
  ]
  return {
    system: [{ text: p.sistema, cache: true }],
    prompt: parti
      .filter(([, testo]) => testo.trim() !== '')
      .map(([tag, testo, cache]) => (cache ? { text: blocco(tag, testo), cache: true } : { text: blocco(tag, testo) })),
    stimati: stima(),
    tagliati: {
      file: p.file.length - file.length,
      turni: p.turni.length - turni.length,
      documenti: p.documenti.length - documenti.length,
    },
  }
}

// Archivio delle conversazioni nello store del plugin (4 MiB in tutto, livello e misure compresi):
// le ultime 50 per progetto e al più 3 milioni di caratteri, si tolgono le più vecchie.
export const MAX_CONVERSAZIONI = 50
export const MAX_ARCHIVIO_CHAR = 3_000_000

// Aggiunge uno scambio alla conversazione `id`, o la crea; l'archivio resta ordinato dalla più recente.
export function archivia(
  archivio: readonly Conversazione[],
  id: string,
  progetto: string,
  voce: Voce,
  commit?: string,
): Conversazione[] {
  const prima = archivio.find(c => c.id === id)
  const conv: Conversazione = {
    id,
    progetto,
    inizio: prima?.inizio ?? voce.quando,
    aggiornata: voce.quando,
    scambi: [...(prima?.scambi ?? []), voce],
    ...((commit ?? prima?.commit) && { commit: commit ?? prima?.commit }),
  }
  let delProgetto = 0
  const tutte = [conv, ...archivio.filter(c => c.id !== id)].filter(
    c => c.progetto !== progetto || ++delProgetto <= MAX_CONVERSAZIONI,
  )
  while (tutte.length > 1 && JSON.stringify(tutte).length > MAX_ARCHIVIO_CHAR) tutte.pop()
  return tutte
}

// Una lista dallo store, scartando quello che non ha la forma di una conversazione.
export const comeArchivio = (v: unknown): Conversazione[] =>
  Array.isArray(v) ? v.filter(c => c && typeof c.id === 'string' && Array.isArray(c.scambi)) : []

const MESI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const due = (n: number) => String(n).padStart(2, '0')
export function dataBreve(ms: number) {
  const d = new Date(ms)
  return `${MESI[d.getMonth()]} ${d.getDate()}, ${due(d.getHours())}:${due(d.getMinutes())}`
}

// 16743 → «16.7k»
export const migliaia = (n: number) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`)

export const taglia = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
