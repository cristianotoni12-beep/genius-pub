// Genius Pub: pannello e fascia in sola lettura. Non scrive mai file del progetto.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelCompleteResult, ModelEffort, Register } from 'claude-code'

import type { Livello, Modo, Risposta, Scheda, StatoMappa, Uso } from '../types'
import {
  archivia,
  assembla,
  BUDGET,
  CARTELLA,
  comeArchivio,
  dataBreve,
  DECISIONI,
  eSegreto,
  fileToccati,
  hashMappa,
  INDICE,
  MAX_DIFF_CHAR,
  MAX_FILE_CHAR,
  migliaia,
  righeTurni,
  sceltaSicura,
  SERVE_ESPLORARE,
  taglia,
} from './contesto'

const PANE = 'genius-pub'
// shape: le schede di prima («decisioni», «archivio») si leggono come 'chiedi'.
const scheda = atom({ plugin: 'genius-pub', key: 'scheda' } as const, 'chiedi' as Scheda, { shape: 'scheda-2' })
// shape: dopo il cambio dei livelli un valore vecchio («medio», «profondo») si legge come 'base'; session.start rilegge il preferito.
const livello = atom({ plugin: 'genius-pub', key: 'livello' } as const, 'base' as Livello, { shape: 'livello-3' })
const cronologia = atom({ plugin: 'genius-pub', key: 'cronologia' } as const, [], { shape: 'cronologia-1' })
const risposta = atom({ plugin: 'genius-pub', key: 'risposta' } as const, null, { shape: 'risposta-1' })
const statoMappa = atom({ plugin: 'genius-pub', key: 'mappa' } as const, null, { shape: 'mappa-1' })
// Storico: la conversazione in corso, la voce aperta nella scheda (id o 'decisioni'), e una versione che ridisegna la scheda.
const conversazione = atom({ plugin: 'genius-pub', key: 'conversazione' } as const, null)
const aperta = atom({ plugin: 'genius-pub', key: 'aperta' } as const, null)
const daEliminare = atom({ plugin: 'genius-pub', key: 'daEliminare' } as const, false)
const versioneArchivio = atom({ plugin: 'genius-pub', key: 'versioneArchivio' } as const, 0)
const fonti = atom({ plugin: 'genius-pub', key: 'fonti' } as const, false)
// La fascia mostra Open o Close: true dopo $.ui.open, false a ogni chiusura (anche a mano).
const aperto = atom({ plugin: 'genius-pub', key: 'aperto' } as const, false)
const ridotta = atom({ plugin: 'genius-pub', key: 'ridotta' } as const, false)
// Una domanda arrivata mentre un'altra è in corso: avviso sotto l'Input fino alla fine della risposta.
const occupato = atom({ plugin: 'genius-pub', key: 'occupato' } as const, false)
const mappaInCorso = atom({ plugin: 'genius-pub', key: 'mappaInCorso' } as const, false)
const notaMappa = atom({ plugin: 'genius-pub', key: 'notaMappa' } as const, null)

// Il livello sceglie modello e quanto ragiona; la lunghezza la dice il prompt. Un livello in più è una voce in più qui.
const MODELLO: Record<Livello, string> = { base: 'haiku', tecnico: 'sonnet' }
const SFORZO: Record<Livello, ModelEffort | undefined> = { base: 'medium', tecnico: undefined }
const LIVELLI = [
  { value: 'base', label: 'Basic' },
  { value: 'tecnico', label: 'Technical' },
]
const etichettaDi = (liv: Livello) => LIVELLI.find(l => l.value === liv)?.label ?? 'Basic'
const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`
// Tetto di sicurezza contro le risposte fuori controllo, non una lunghezza: un tetto basso tronca la risposta.
const MAX_RISPOSTA = 16000
// Livelli salvati con i nomi di prima. Chiave «livello»: base, tecnico (il medio di allora), profondo. Chiave «livello-2»: anche medio.
const VECCHI: Record<string, Livello> = { base: 'base', tecnico: 'base', profondo: 'tecnico' }
const RAPIDE = [
  { key: 'ultimo', label: 'Explain the last turn', domanda: 'Explain what the agent did in the last turn of the session, and why.' },
  { key: 'cambiato', label: 'What changed', domanda: 'What changed in the code compared to the map, and how does it affect the rest of the project?' },
  { key: 'rompersi', label: 'Where it can break', domanda: 'Where can the recent work break? Start from the breaking points in the map.' },
]

// Strumenti ammessi nei processi figli (GENIUS_PUB_CHILD=1).
const LETTURA = new Set(['Read', 'Grep', 'Glob'])
const ORGANIZZAZIONE = new Set(['Agent', 'Task', 'Skill', 'TodoWrite'])

// Nei processi figli ponytail aggiunge regole e mappa (~3k caratteri) e il suo stile alle risposte. Se non è installato, la chiave si ignora.
const SENZA_PONYTAIL = '{"enabledPlugins":{"ponytail@ponytail":false}}'

// Ruolo del processo, letto una volta: undefined finché non è noto.
let figlio: boolean | undefined
let ruolo: string | undefined

async function leggiRuolo($: EngineInterface) {
  if (figlio === undefined) {
    figlio = (await $.env.get('GENIUS_PUB_CHILD')) === '1'
    ruolo = (await $.env.get('GENIUS_PUB_RUOLO')) ?? 'spiega'
  }
  return figlio
}

async function git($: EngineInterface, args: string[], cwd?: string) {
  try {
    const r = await $.process.run(['git', ...args], { timeoutMs: 15000, ...(cwd ? { cwd } : {}) })
    return r.exitCode === 0 ? r.stdout : undefined
  } catch {
    return undefined
  }
}

async function leggi($: EngineInterface, percorso: string) {
  try {
    return await $.fs.read(percorso)
  } catch {
    return undefined
  }
}

async function promptDi($: EngineInterface, nome: string) {
  return (await leggi($, `${$.plugin.root}/prompts/${nome}.md`)) ?? ''
}

async function radice($: EngineInterface) {
  return (await git($, ['rev-parse', '--show-toplevel']))?.trim() || undefined
}

// Stato della fascia: 0 token, solo git e file system.
async function calcolaStatoMappa($: EngineInterface): Promise<StatoMappa | null> {
  const root = await radice($)
  if (!root) return null
  const mappa = await leggi($, `${root}/${INDICE}`)
  if (mappa === undefined) return { root, assente: true, cambiati: 0 }
  const hash = hashMappa(mappa)
  if (!hash) return { root, assente: false, cambiati: -1 }
  const out = await git($, ['diff', '--name-only', hash, '--'], root)
  const cambiati = (out ?? '')
    .split('\n')
    .filter(f => f !== '' && !f.startsWith(`${CARTELLA}/`) && f !== DECISIONI).length
  return { root, assente: false, cambiati }
}

// Testo per fascia e widget; undefined se la mappa è aggiornata.
function statoDellaMappa(stato: StatoMappa) {
  if (stato.assente) return 'no map · /genius-pub:map'
  if (stato.cambiati < 0) return 'map has no header'
  return stato.cambiati > 0 ? `map: ${plurale(stato.cambiati, 'file', 'files')} changed` : undefined
}

async function aggiornaStatoMappa($: EngineInterface) {
  const stato = await calcolaStatoMappa($)
  await update($, statoMappa, () => stato)
}

// «Update map»: lo stesso lavoro dell'hook post-commit (Haiku, scrive solo in docs/mappa/), ma in primo piano.
// Lo script stampa una riga sola con l'esito; il modello non passa dal contesto della sessione principale.
async function aggiornaMappa($: EngineInterface) {
  const stato = await read($, statoMappa)
  if (!stato || (await read($, mappaInCorso))) return
  await update($, mappaInCorso, () => true)
  await update($, notaMappa, () => null)
  const nota = await $.process
    .run(['sh', `${$.plugin.root}/scripts/post-commit.sh`], {
      cwd: stato.root,
      env: { GENIUS_PUB_MANUALE: '1' },
      timeoutMs: 600_000,
    })
    .then(r => r.stdout.trim().split('\n').pop() || 'Map update finished.')
    .catch((err: unknown) => `Map update failed: ${err instanceof Error ? err.message : String(err)}`)
  await update($, notaMappa, () => nota)
  await update($, mappaInCorso, () => false)
  await aggiornaStatoMappa($)
}

function somma(a: Uso | undefined, r: ModelCompleteResult): Uso {
  const u = r.usage
  return {
    ingresso: (a?.ingresso ?? 0) + u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
    cacheLetti: (a?.cacheLetti ?? 0) + u.cache_read_input_tokens,
    uscita: (a?.uscita ?? 0) + u.output_tokens,
  }
}

// Ultime 30 misure in $.store (file JSON del plugin): si leggono senza passare dal contesto di Opus.
async function registra($: EngineInterface, voce: Record<string, unknown>) {
  try {
    const prima = await $.store.get('misure')
    const misure = Array.isArray(prima) ? prima : []
    await $.store.set('misure', [...misure, { quando: await $.clock.now(), ...voce }].slice(-30))
  } catch (err) {
    await $.store.set('errore-misure', err instanceof Error ? err.message : String(err)).catch(() => undefined)
  }
}

function motivo(r: ModelCompleteResult) {
  if (r.isAnswered) return ''
  return r.reason === 'api-error' ? `API error (${r.status ?? '?'})` : r.reason
}

async function apri($: EngineInterface, chiedi: boolean) {
  if (chiedi) await update($, scheda, () => 'chiedi')
  await $.ui.open({ id: PANE, title: 'Genius Pub', closeOnEscape: true, ...(chiedi ? { focus: true } : {}) })
  await update($, aperto, () => true)
}

// Il ui.close di un plugin lo vedono solo i plugin sopra di lui, non i suoi hook: lo stato si aggiorna qui.
async function chiudi($: EngineInterface) {
  await $.ui.close({ id: PANE })
  await update($, aperto, () => false)
}

// Ripiego, solo quando lo chiedi con «Search the code»: un claude -p con soli strumenti di lettura esplora il repo.
// Senza server MCP, skill né sessione salvata su disco: parte da circa 11k token invece di 200k (misurato su Chef-moi).
async function esplora($: EngineInterface, root: string, base: Risposta, sistema: string, liv: Livello, uso?: Uso): Promise<Risposta> {
  const argv = [
    'claude', '-p',
    '--model', MODELLO[liv],
    '--tools', 'Read,Grep,Glob',
    '--permission-mode', 'plan',
    '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
    '--settings', SENZA_PONYTAIL,
    '--output-format', 'stream-json', '--verbose',
    '--append-system-prompt', sistema,
    `Livello: ${etichettaDi(liv)}\n\n${base.modo === 'guasto' ? 'Sintomo' : 'Domanda'}: ${base.domanda}`,
  ]
  let resto = ''
  let testo = ''
  let letture = 0
  let usoFinale = uso
  let usoRipiego: Record<string, number> = {}
  let errore: string | undefined
  const figlioSpawn = $.process.spawn({ argv, cwd: root, env: { GENIUS_PUB_CHILD: '1', GENIUS_PUB_RUOLO: 'spiega' } })
  for await (const pezzo of figlioSpawn) {
    if (pezzo.stream !== 'stdout') continue
    const righe = (resto + pezzo.text).split('\n')
    resto = righe.pop() ?? ''
    for (const riga of righe) {
      let ev: { type?: string; message?: { content?: { type: string; text?: string }[] }; result?: string; is_error?: boolean; usage?: Record<string, number> }
      try {
        ev = JSON.parse(riga)
      } catch {
        continue
      }
      if (ev.type === 'assistant') {
        for (const b of ev.message?.content ?? []) {
          if (b.type === 'tool_use') letture += 1
          if (b.type === 'text' && b.text) testo = b.text
        }
        const nota = `Searching the code, read-only… ${letture} ${letture === 1 ? 'read' : 'reads'}`
        await update($, risposta, r => (r ? { ...r, nota } : r))
      }
      if (ev.type === 'result') {
        testo = ev.result ?? testo
        if (ev.is_error) errore = testo || 'the code search did not answer'
        const u = (usoRipiego = ev.usage ?? {})
        usoFinale = {
          ingresso: (uso?.ingresso ?? 0) + (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
          cacheLetti: (uso?.cacheLetti ?? 0) + (u.cache_read_input_tokens ?? 0),
          uscita: (uso?.uscita ?? 0) + (u.output_tokens ?? 0),
        }
      }
    }
  }
  if (!testo && !errore) errore = 'the code search ended without an answer (need `claude auth login`?)'
  await registra($, {
    domanda: base.domanda.slice(0, 80),
    modello: `${MODELLO[liv]} (code search)`,
    letture,
    risposta: usoRipiego,
    caratteriRisposta: testo.length,
  })
  const pulito = testo.split(SERVE_ESPLORARE).join('').trim()
  return { ...base, modello: `${MODELLO[liv]} (code search)`, testo: errore ? '' : pulito, errore, uso: usoFinale }
}

// Legge i percorsi scelti solo se restano dentro il repo anche dopo i link simbolici, e mai un segreto.
async function leggiScelti($: EngineInterface, root: string, rootReale: string, percorsi: readonly string[]) {
  const letti: { file: string; testo: string }[] = []
  for (const f of percorsi) {
    const reale = (await $.fs.stat(`${root}/${f}`, { resolve: true }).catch(() => undefined))?.realPath
    if (!reale || !reale.startsWith(`${rootReale}/`) || eSegreto(reale)) continue
    const testo = await leggi($, reale)
    if (testo !== undefined) letti.push({ file: f, testo: testo.slice(0, MAX_FILE_CHAR) })
  }
  return letti
}

async function calcolaRisposta($: EngineInterface, domanda: string, modo: Modo, liv: Livello): Promise<Risposta> {
  const etichetta = etichettaDi(liv)
  const base: Risposta = { domanda, modo, modello: MODELLO[liv], livello: etichetta, testo: '' }
  const root = await radice($)
  if (!root) return { ...base, errore: 'this session is not in a git repository' }
  const sistema = await promptDi($, modo === 'guasto' ? 'guasto' : 'spiegatore')
  const mappa = await leggi($, `${root}/${INDICE}`)
  if (!mappa) return { ...base, serveEsplorare: true }

  // Anche i file non ancora committati (la mappa appena generata, i file nuovi dell'agente), non quelli ignorati.
  const [decisioni, selettore, elenco, messaggiGrezzi] = await Promise.all([
    leggi($, `${root}/${DECISIONI}`),
    promptDi($, 'selettore-file'),
    git($, ['ls-files', '--cached', '--others', '--exclude-standard'], root),
    $.session.messages(),
  ])
  const ammessi = new Set((elenco ?? '').split('\n').filter(Boolean))
  const messaggi = Array.isArray(messaggiGrezzi) ? messaggiGrezzi : []
  const toccati = fileToccati(messaggi, root).filter(f => ammessi.has(f))

  // Passaggio 1: Haiku legge solo l'indice e sceglie file di codice e documenti della mappa.
  const sel = await $.model.complete({
    model: 'haiku',
    system: selettore,
    prompt: [
      { text: mappa, cache: true },
      { text: `File toccati di recente dall'agente: ${toccati.length ? toccati.join(', ') : 'nessuno'}\n\nDomanda: ${domanda}` },
    ],
    maxTokens: 400,
    effort: 'low',
    timeoutMs: 60000,
  })
  let uso = somma(undefined, sel)
  const scelta = sceltaSicura(sel.isAnswered ? sel.text : '', ammessi)
  const rootReale = (await $.fs.stat(root, { resolve: true })).realPath ?? root
  const [file, documenti] = await Promise.all([
    leggiScelti($, root, rootReale, scelta.file),
    leggiScelti($, root, rootReale, scelta.documenti),
  ])
  const hash = hashMappa(mappa)
  const diff =
    hash && file.length > 0
      ? ((await git($, ['diff', hash, '--', ...file.map(f => f.file)], root)) ?? '').slice(0, MAX_DIFF_CHAR)
      : ''
  const turni = righeTurni(messaggi)

  // Passaggio 2: la risposta.
  const contesto = assembla(
    {
      sistema,
      mappa,
      decisioni: decisioni ?? '',
      documenti,
      turni,
      diff,
      file,
      cronologia: await read($, cronologia),
      domanda: `Livello: ${etichetta}\n\n${modo === 'guasto' ? 'Sintomo' : 'Domanda'}: ${domanda}`,
    },
    BUDGET,
  )
  const r = await $.model.complete({
    model: MODELLO[liv],
    system: contesto.system,
    prompt: contesto.prompt,
    maxTokens: MAX_RISPOSTA,
    ...(SFORZO[liv] && { effort: SFORZO[liv] }),
    timeoutMs: 300000,
  })
  uso = somma(uso, r)
  await registra($, {
    domanda: domanda.slice(0, 80),
    modello: MODELLO[liv],
    sforzo: SFORZO[liv] ?? 'default',
    file: file.map(f => f.file),
    documenti: documenti.map(d => d.file),
    toccati,
    sceltaDelSelettore: sel.isAnswered ? sel.text.slice(0, 600) : motivo(sel),
    stimati: contesto.stimati,
    tagliati: contesto.tagliati,
    selettore: sel.usage,
    risposta: r.usage,
    // Caratteri del testo visibile: confrontati con i token in uscita dicono quanto pesa il ragionamento.
    caratteriRisposta: r.isAnswered ? r.text.length : 0,
  })
  const letti = { file: file.map(f => f.file), documenti: documenti.map(d => d.file.slice(CARTELLA.length + 1)) }
  if (!r.isAnswered) return { ...base, errore: motivo(r), uso, ...letti }
  if (r.text.includes(SERVE_ESPLORARE)) {
    return { ...base, testo: r.text.split(SERVE_ESPLORARE).join('').trim(), serveEsplorare: true, uso, ...letti }
  }
  return { ...base, testo: r.text, uso, ...letti }
}

async function rispondi($: EngineInterface, domanda: string, modo: Modo) {
  if ((await read($, risposta))?.inCorso) {
    await update($, occupato, () => true)
    return
  }
  const liv = await read($, livello)
  const base: Risposta = { domanda, modo, modello: MODELLO[liv], livello: etichettaDi(liv), testo: '' }
  await update($, risposta, () => ({ ...base, inCorso: true }))
  let esito: Risposta
  try {
    esito = await calcolaRisposta($, domanda, modo, liv)
  } catch (err) {
    esito = { ...base, errore: err instanceof Error ? err.message : String(err) }
  }
  await concludi($, esito)
}

// «Search the code»: la stessa domanda, con il ripiego che legge i file da sé.
async function cercaNelCodice($: EngineInterface) {
  const r = await read($, risposta)
  const root = await radice($)
  if (!r || r.inCorso || !root) return
  const liv = await read($, livello)
  const sistema = `${await promptDi($, r.modo === 'guasto' ? 'guasto' : 'spiegatore')}\n\n${await promptDi($, 'ripiego')}`
  const base: Risposta = { domanda: r.domanda, modo: r.modo, modello: MODELLO[liv], livello: etichettaDi(liv), testo: '' }
  await update($, risposta, () => ({ ...base, inCorso: true, nota: 'Searching the code, read-only…' }))
  let esito: Risposta
  try {
    esito = await esplora($, root, base, sistema, liv, r.uso)
  } catch (err) {
    esito = { ...base, errore: err instanceof Error ? err.message : String(err) }
  }
  await concludi($, esito)
}

// Una risposta vera entra nella cronologia (contesto delle domande dopo) e nell'archivio.
// Quella che chiede di cercare nel codice non è ancora una risposta.
async function concludi($: EngineInterface, esito: Risposta) {
  await update($, risposta, () => esito)
  await update($, occupato, () => false)
  await update($, ridotta, () => false)
  if (esito.errore !== undefined || esito.serveEsplorare || !esito.testo) return
  await update($, cronologia, l => [...l, { domanda: esito.domanda, risposta: esito.testo }].slice(-3))
  await archiviaScambio($, esito)
}

async function leggiArchivio($: EngineInterface) {
  return comeArchivio(await $.store.get('archivio'))
}

async function archiviaScambio($: EngineInterface, esito: Risposta) {
  try {
    const progetto = (await read($, statoMappa))?.root ?? (await radice($))
    if (!progetto) return
    const quando = await $.clock.now()
    const id = (await read($, conversazione)) ?? `${quando}-${Math.random().toString(36).slice(2, 8)}`
    await update($, conversazione, () => id)
    const commit = (await git($, ['rev-parse', '--short', 'HEAD'], progetto))?.trim() || undefined
    const voce = { domanda: esito.domanda, risposta: esito.testo, livello: esito.livello ?? 'Basic', quando }
    await $.store.set('archivio', archivia(await leggiArchivio($), id, progetto, voce, commit))
    await update($, versioneArchivio, v => (v ?? 0) + 1)
  } catch (err) {
    await $.store.set('errore-archivio', err instanceof Error ? err.message : String(err)).catch(() => undefined)
  }
}

// Riprende una conversazione: le ultime 3 domande tornano nel contesto, la prossima la continua.
async function riprendi($: EngineInterface, id: string) {
  const conv = (await leggiArchivio($)).find(c => c.id === id)
  const ultimo = conv?.scambi[conv.scambi.length - 1]
  if (!conv || !ultimo) return
  const ora = (await git($, ['rev-parse', '--short', 'HEAD'], conv.progetto))?.trim()
  const nota =
    conv.commit && ora && ora !== conv.commit
      ? `Resumed from commit ${conv.commit}: the code is now at ${ora}, new answers read today's files.`
      : undefined
  await update($, conversazione, () => id)
  await update($, cronologia, () => conv.scambi.slice(-3).map(v => ({ domanda: v.domanda, risposta: v.risposta })))
  await update($, risposta, () => ({
    domanda: ultimo.domanda,
    modo: 'spiega' as const,
    modello: '',
    livello: ultimo.livello,
    testo: ultimo.risposta,
    ripresa: true as const,
    ...(nota && { nota }),
  }))
  await update($, fonti, () => false)
  await update($, ridotta, () => false)
  await update($, aperta, () => null)
  await update($, scheda, () => 'chiedi')
}

async function elimina($: EngineInterface, id: string) {
  await $.store.set('archivio', (await leggiArchivio($)).filter(c => c.id !== id))
  if ((await read($, conversazione)) === id) await update($, conversazione, () => null)
  await update($, daEliminare, () => false)
  await update($, aperta, () => null)
  await update($, versioneArchivio, v => (v ?? 0) + 1)
}

async function apriConversazione($: EngineInterface, id: string) {
  await update($, daEliminare, () => false)
  await update($, aperta, () => id)
}

function riepilogo(r: Risposta, u: Uso | undefined) {
  if (!u) return `${r.livello ?? r.modello} · resumed`
  const letti = r.file
    ? `${plurale(r.file.length, 'file', 'files')}, ${plurale(r.documenti?.length ?? 0, 'doc', 'docs')}`
    : 'code search'
  return `${r.livello ?? r.modello} · ${migliaia(u.ingresso + u.uscita)} tokens · ${letti}`
}

async function dalCampo($: EngineInterface, testo: string) {
  const t = testo.trim()
  if (!t) return
  const guasto = t.match(/^bug\s+([\s\S]+)$/i)
  const sintomo = guasto?.[1]
  await rispondi($, sintomo ?? t, sintomo ? 'guasto' : 'spiega')
}

async function scegliLivello($: EngineInterface, valore: string) {
  const liv = (LIVELLI.some(l => l.value === valore) ? valore : 'base') as Livello
  await update($, livello, () => liv)
  await $.store.set('livello-2', liv)
}

async function nuovoArgomento($: EngineInterface) {
  await update($, cronologia, () => [])
  await update($, risposta, () => null)
  await update($, conversazione, () => null)
  await update($, fonti, () => false)
  await update($, ridotta, () => false)
}

function percorsoDentro(cwd: string, fp: string) {
  const parti: string[] = []
  for (const p of (fp.startsWith('/') ? fp : `${cwd}/${fp}`).split('/')) {
    if (p === '..') parti.pop()
    else if (p !== '' && p !== '.') parti.push(p)
  }
  return `/${parti.join('/')}`
}

// Percorso reale anche di un file che non esiste ancora: si risolve l'antenato più vicino che esiste.
async function percorsoReale($: EngineInterface, p: string) {
  const coda: string[] = []
  let base = p
  while (base !== '/') {
    const reale = (await $.fs.stat(base, { resolve: true }).catch(() => undefined))?.realPath
    if (reale) return [reale.replace(/\/$/, ''), ...coda].join('/')
    coda.unshift(base.slice(base.lastIndexOf('/') + 1))
    base = base.slice(0, base.lastIndexOf('/')) || '/'
  }
  return p
}

// Ruolo `mappa` (hook post-commit): oltre alla lettura, scrive solo dentro docs/mappa/. Niente Bash: la parte con git la fa post-commit.sh.
async function eMappa($: EngineInterface, fp: string) {
  const cwd = await $.session.cwd()
  const cartella = await percorsoReale($, `${cwd}/${CARTELLA}`)
  return (await percorsoReale($, percorsoDentro(cwd, fp))).startsWith(`${cartella}/`)
}

async function vietato($: EngineInterface, strumento: string, e: Record<string, unknown>) {
  if (LETTURA.has(strumento)) return undefined
  if (ruolo !== 'mappa') return `${strumento} non è uno strumento di lettura`
  if (ORGANIZZAZIONE.has(strumento)) return undefined
  if (strumento === 'Edit' || strumento === 'Write') {
    return (await eMappa($, String(e.file_path ?? ''))) ? undefined : `si può scrivere solo dentro ${CARTELLA}/`
  }
  return `${strumento} non ammesso`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (!(await leggiRuolo($))) {
      await $.command.register({
        name: 'explain',
        description: 'Ask Genius Pub (read-only panel). "bug <symptom>" for bug mode.',
        argumentHint: '[bug] <question>',
        immediate: true,
      })
      const nuovo = await $.store.get('livello-2')
      const vecchio = await $.store.get('livello')
      const preferito =
        nuovo === 'medio' ? 'base' : LIVELLI.some(l => l.value === nuovo) ? (nuovo as Livello) : VECCHI[String(vecchio)]
      if (preferito) await update($, livello, () => preferito)
      void aggiornaStatoMappa($)
    }
    return next(e)
  })

  // La riga di comando entra comunque nella trascrizione (~100 token): la risposta no.
  on('command.run', { command: 'explain' }, async ($, e) => {
    await apri($, true)
    void dalCampo($, e.args ?? '')
    return {}
  })

  on('turn.complete', async ($, e, next) => {
    if (!(await leggiRuolo($))) void aggiornaStatoMappa($)
    return next(e)
  })

  // Chiusura a mano (crocetta, Esc): la solleva il motore. La nostra $.ui.close non arriva qui, vedi chiudi().
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, aperto, () => false)
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear' || e.source === 'fork') await nuovoArgomento($)
    return next(e)
  })

  // Sola lettura nei processi figli; nella sessione principale non tocca nulla.
  on('tool.call', async ($, e, next) => {
    if (!(await leggiRuolo($))) return next(e)
    const no = await vietato($, String(e.tool), e as unknown as Record<string, unknown>)
    return no ? { deny: `genius-pub (sola lettura): ${no}` } : next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'genius-pub: la guardia ha avuto un errore, strumento negato' },
  )

  // Fascia: parla solo quando c'è qualcosa da fare. Un solo pulsante, Open o Close.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (figlio || e.props.hasSurvey) return next(e)
    const stato = await read($, statoMappa)
    if (!stato) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const mappa = statoDellaMappa(stato)
    const aperta = await read($, aperto)
    return (
      <Box gap={1}>
        <Text>
          ◉ Genius Pub{mappa && ' · '}
          {mappa && <Text color="warning">{mappa}</Text>}
        </Text>
        <Button
          key="apri"
          label={aperta ? 'Close' : 'Open'}
          onPress={() => (aperta ? chiudi($) : apri($, true))}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Markdown, Progress, Select, Text } = $.ui.resolve(e)
    const s = await read($, scheda)
    const stato = await read($, statoMappa)
    await read($, versioneArchivio) // si ridisegna quando l'archivio cambia
    const conversazioni = (await leggiArchivio($)).filter(c => c.progetto === stato?.root)
    const r = await read($, risposta)

    // Widget (pannello ridotto nell'app): solo lo stato, niente pulsanti, perché i clic potrebbero non arrivare.
    if (e.props.placement === 'widget') {
      const mappa = stato && statoDellaMappa(stato)
      const riga = r?.inCorso
        ? (r.nota ?? 'Preparing the answer…')
        : r?.errore !== undefined
          ? `No answer: ${r.errore}`
          : r
            ? 'Answer ready · expand to read'
            : (mappa ?? `Map up to date · ${plurale(conversazioni.length, 'saved chat', 'saved chats')}`)
      return (
        <Box flexDirection="column">
          {r && <Text bold>{taglia(r.domanda, 60)}</Text>}
          {r?.inCorso ? <Progress label={riga} /> : <Text color={!r && mappa ? 'warning' : undefined} dimColor={!!r}>{riga}</Text>}
        </Box>
      )
    }

    const linguetta = (k: Scheda, label: string) => (
      <Button key={`scheda-${k}`} label={label} variant={s === k ? 'primary' : 'secondary'} onPress={() => update($, scheda, () => k)} />
    )
    const testa = (
      <Box gap={1}>
        {linguetta('chiedi', 'Ask')}
        {linguetta('storico', 'History')}
      </Box>
    )
    const titoloConv = (c: (typeof conversazioni)[number]) => taglia(c.scambi[0]?.domanda ?? '', 60)
    const domande = (n: number) => plurale(n, 'question', 'questions')

    if (s === 'storico') {
      const id = await read($, aperta)
      const indietro = <Button key="indietro" label="‹ Back" onPress={() => update($, aperta, () => null)} />

      if (id === 'decisioni') {
        // 0 token: il file letto così com'è, nella sua lingua.
        const testo = stato ? await leggi($, `${stato.root}/${DECISIONI}`) : undefined
        return (
          <Box flexDirection="column" gap={1}>
            {testa}
            <Box gap={1}>
              {indietro}
              <Text bold>Project decisions</Text>
            </Box>
            <Markdown text={testo ?? `No \`${DECISIONI}\` in this project: \`/genius-pub:map\` creates it.`} />
          </Box>
        )
      }

      const conv = conversazioni.find(c => c.id === id)
      if (conv) {
        const conferma = await read($, daEliminare)
        return (
          <Box flexDirection="column" gap={1}>
            {testa}
            {conferma ? (
              <Box gap={1} flexWrap="wrap">
                <Text color="warning">Delete this conversation for good?</Text>
                <Button key="conferma-elimina" label="Yes, delete" onPress={() => void elimina($, conv.id)} />
                <Button key="annulla-elimina" label="No" onPress={() => update($, daEliminare, () => false)} />
              </Box>
            ) : (
              <Box gap={1} flexWrap="wrap">
                {indietro}
                <Button key="riprendi" label="Resume" variant="primary" onPress={() => void riprendi($, conv.id)} />
                <Button key="elimina" label="Delete" onPress={() => update($, daEliminare, () => true)} />
              </Box>
            )}
            <Text dimColor>
              {dataBreve(conv.inizio)} · {domande(conv.scambi.length)}
            </Text>
            {conv.scambi.map((v, i) => (
              <Box key={`scambio-${i}`} flexDirection="column">
                <Text bold>{v.domanda}</Text>
                <Markdown text={v.risposta} />
                <Text dimColor>
                  {v.livello} · {dataBreve(v.quando)}
                </Text>
              </Box>
            ))}
          </Box>
        )
      }

      const haDecisioni = stato ? (await leggi($, `${stato.root}/${DECISIONI}`)) !== undefined : false
      return (
        <Box flexDirection="column" gap={1}>
          {testa}
          {haDecisioni ? (
            <Box gap={1} borderStyle="round" paddingX={1} justifyContent="space-between">
              <Box flexDirection="column">
                <Text bold>Project decisions</Text>
                <Text dimColor>{DECISIONI}</Text>
              </Box>
              <Button key="leggi-decisioni" label="Read" onPress={() => update($, aperta, () => 'decisioni')} />
            </Box>
          ) : (
            <Text dimColor>No {DECISIONI} in this project: /genius-pub:map creates it.</Text>
          )}
          <Text bold>Conversations</Text>
          {conversazioni.length === 0 && <Text dimColor>No saved conversations yet: every answer saves itself.</Text>}
          {conversazioni.map(c => (
            <Box key={`conv-${c.id}`} gap={1} justifyContent="space-between">
              <Box flexDirection="column" flexShrink={1}>
                <Text>{titoloConv(c)}</Text>
                <Text dimColor>
                  {dataBreve(c.aggiornata)} · {domande(c.scambi.length)} · {c.scambi[c.scambi.length - 1]?.livello}
                </Text>
              </Box>
              <Button key={`apri-${c.id}`} label="Open" onPress={() => void apriConversazione($, c.id)} />
            </Box>
          ))}
        </Box>
      )
    }

    const liv = await read($, livello)
    const mostraFonti = await read($, fonti)
    const corta = await read($, ridotta)
    const attesa = await read($, occupato)
    const inCorsoMappa = await read($, mappaInCorso)
    const esitoMappa = await read($, notaMappa)
    const testoMappa = stato && statoDellaMappa(stato)
    const fermo = r !== null && !r.inCorso
    const segnaposto =
      r === null
        ? 'Ask something about this project…'
        : r.ripresa
          ? 'Continue this conversation…'
          : r.modo === 'guasto'
            ? 'Ask more about this bug…'
            : 'Ask a follow-up…'
    return (
      <Box flexDirection="column" gap={1}>
        {testa}
        {stato?.assente && (
          <Text color="warning">No project map: I'll search the files instead, more slowly. Create it with /genius-pub:map.</Text>
        )}
        {stato && !stato.assente && (inCorsoMappa || testoMappa || esitoMappa) && (
          <Box gap={1} flexWrap="wrap">
            {inCorsoMappa && <Progress label="Updating the map with Haiku…" />}
            {!inCorsoMappa && testoMappa && <Text color="warning">{testoMappa}</Text>}
            {!inCorsoMappa && esitoMappa && <Text dimColor>{esitoMappa}</Text>}
            {!inCorsoMappa && testoMappa && <Button key="aggiorna-mappa" label="Update map" onPress={() => void aggiornaMappa($)} />}
          </Box>
        )}
        {/* Il tasto non si può togliere (senza etichetta direbbe «submit»): «↵» è la più corta. */}
        <Input key="domanda" placeholder={segnaposto} submitLabel="↵" autoFocus onSubmit={v => void dalCampo($, v)} />
        {attesa && <Text color="warning">Wait for the current answer: questions go one at a time.</Text>}
        <Box gap={1} flexWrap="wrap">
          <Select key="livello" label="Level" options={LIVELLI} value={liv} onSelect={v => void scegliLivello($, v)} />
          {r === null && <Text dimColor>“bug &lt;symptom&gt;” for a problem</Text>}
        </Box>

        {r === null && (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column" alignItems="flex-start">
              {RAPIDE.map(q => (
                <Button key={q.key} label={q.label} onPress={() => void rispondi($, q.domanda, 'spiega')} />
              ))}
            </Box>
            {conversazioni.length > 0 && <Text bold>Pick up where you left off</Text>}
            {conversazioni.slice(0, 3).map(c => (
              <Box key={`recente-${c.id}`} gap={1} justifyContent="space-between">
                <Box flexDirection="column" flexShrink={1}>
                  <Text>{titoloConv(c)}</Text>
                  <Text dimColor>
                    {dataBreve(c.aggiornata)} · {domande(c.scambi.length)}
                  </Text>
                </Box>
                <Button key={`riprendi-${c.id}`} label="Resume" onPress={() => void riprendi($, c.id)} />
              </Box>
            ))}
            {conversazioni.length > 0 && (
              <Box>
                <Button
                  key="tutto-storico"
                  label="All history"
                  onPress={async () => {
                    await update($, aperta, () => null)
                    await update($, scheda, () => 'storico')
                  }}
                />
              </Box>
            )}
          </Box>
        )}

        {r !== null && (
          <Box flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold>
              {r.modo === 'guasto' && <Text color="warning">bug </Text>}
              {r.domanda}
            </Text>
            {r.inCorso && <Progress label={r.nota ?? 'Preparing the answer…'} />}
            {fermo && corta && r.testo !== '' && <Text dimColor>{taglia(r.testo.split('\n')[0] ?? '', 80)}</Text>}
            {fermo && (r.uso !== undefined || r.ripresa) && <Text dimColor>{riepilogo(r, r.uso)}</Text>}
            {fermo && (
              <Box gap={1} flexWrap="wrap">
                {r.testo !== '' && (
                  <Button key="riduci" label={corta ? 'Show answer' : 'Collapse'} onPress={() => update($, ridotta, v => !v)} />
                )}
                {r.uso !== undefined && (
                  <Button key="fonti" label={mostraFonti ? 'Hide sources' : 'Sources'} onPress={() => update($, fonti, v => !v)} />
                )}
                <Button key="nuovo" label="New topic" onPress={() => void nuovoArgomento($)} />
              </Box>
            )}
            {fermo && mostraFonti && r.uso !== undefined && (
              <Box flexDirection="column">
                <Text dimColor>
                  {r.modello} · in {r.uso.ingresso} ({r.uso.cacheLetti} cached) · out {r.uso.uscita}
                </Text>
                {r.file && r.file.length > 0 && <Text dimColor>Files: {r.file.join(', ')}</Text>}
                {r.documenti && r.documenti.length > 0 && <Text dimColor>Map: {r.documenti.join(', ')}</Text>}
              </Box>
            )}
          </Box>
        )}

        {fermo && r.nota && <Text dimColor>{r.nota}</Text>}
        {fermo && r.serveEsplorare && (
          <Box gap={1} flexWrap="wrap">
            <Text color="warning">
              {r.testo ? "What I have isn't enough for a sure answer." : 'Without a map I can only search the files, more slowly.'}
            </Text>
            <Button key="cerca" label="Search the code" variant="primary" onPress={() => void cercaNelCodice($)} />
          </Box>
        )}
        {r?.errore !== undefined && (
          <Box gap={1} flexWrap="wrap">
            <Text color="error">No answer: {r.errore}</Text>
            <Button key="riprova" label="Retry" onPress={() => void rispondi($, r.domanda, r.modo)} />
          </Box>
        )}
        {r !== null && r.testo !== '' && !(fermo && corta) && <Markdown text={r.testo} />}
      </Box>
    )
  })
}
