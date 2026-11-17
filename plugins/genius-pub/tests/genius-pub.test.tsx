import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import {
  archivia,
  assembla,
  eSegreto,
  fileToccati,
  MAX_CONVERSAZIONI,
  percorsiSicuri,
  sceltaSicura,
  SERVE_ESPLORARE,
  stimaToken,
} from '../hooks/contesto'

const ROOT = '/repo'
// L'indice: lo legge sempre il selettore. I documenti si scelgono come i file.
const MAPPA = [
  '<!-- mappa: commit=abc1234 · generata=2026-11-15 · aggiornata=2026-11-15 -->',
  '# Mappa',
  '## Moduli',
  '### sync · `docs/mappa/moduli/sync.md`',
  '| File | Ruolo |',
  '| src/db/listino.ts | listino in IndexedDB |',
  '| src/sync/queue.ts | coda di sincronizzazione |',
  '## Documenti',
  '| `docs/mappa/comandi.md` | comandi |',
].join('\n')
const DOC_SYNC = '# Modulo sync\nDOC_SYNC: la coda riprova ogni 30 s.'
const DOC_COMANDI = '# Comandi\nDOC_COMANDI'
const DECISIONI = '# Decisioni\n- 2026-11-15 · sync · IndexedDB invece di localStorage · limite 5 MB · src/db/listino.ts'
const TRACCIATI = [
  'src/db/listino.ts',
  'src/sync/queue.ts',
  '.env',
  '.env.example',
  'certs/server.pem',
  'docs/DECISIONI.md',
  'docs/mappa/MAPPA.md',
  'docs/mappa/moduli/sync.md',
  'docs/mappa/comandi.md',
]

const PANE = {
  plugin: 'genius-pub',
  component: 'Pane',
  requestId: 'genius-pub',
  props: {
    title: 'Genius Pub',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const uso = (input: number, letti = 0) => ({
  input_tokens: input,
  output_tokens: 50,
  cache_read_input_tokens: letti,
  cache_creation_input_tokens: 0,
})

// Le hook del test stanno sotto il plugin e fanno da motore: git, file system, modelli.
function motore(
  on: On,
  opzioni: {
    mappa?: string
    env?: Record<string, string>
    chiamate?: unknown[]
    guasto?: boolean
    serve?: boolean
    spawn?: unknown[]
    store?: Record<string, unknown>
    // La risposta del modello aspetta questa promessa: serve a simulare una domanda in corso.
    attesa?: Promise<unknown>
  } = {},
) {
  const file: Record<string, string> = {
    [`${ROOT}/docs/DECISIONI.md`]: DECISIONI,
    [`${ROOT}/src/db/listino.ts`]: 'export function openDb() {}\n',
    [`${ROOT}/src/sync/queue.ts`]: 'export const coda = []\n',
    [`${ROOT}/.env`]: 'SEGRETO=SENTINELLA_SEGRETA_123',
  }
  if (opzioni.mappa !== undefined) {
    file[`${ROOT}/docs/mappa/MAPPA.md`] = opzioni.mappa
    file[`${ROOT}/docs/mappa/moduli/sync.md`] = DOC_SYNC
    file[`${ROOT}/docs/mappa/comandi.md`] = DOC_COMANDI
  }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', (_, e) => ({ value: opzioni.env?.[e.name] }))
  on('session.cwd', () => ({ value: ROOT }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'Aggiungi la cache del listino', toolUses: [] },
      {
        role: 'assistant',
        text: 'Fatto.',
        toolUses: [{ tool_use_id: 't1', tool: 'Edit', input: { file_path: `${ROOT}/src/sync/queue.ts` } }],
      },
    ],
  }))
  const store: Record<string, unknown> = opzioni.store ?? {}
  opzioni.store = store
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('clock.now', () => ({ value: 1_000 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'explain' } }))
  on('process.run', (_, e) => {
    const args = e.argv.slice(1).join(' ')
    const stdout = args.startsWith('rev-parse')
      ? `${ROOT}\n`
      : args.startsWith('ls-files')
        ? TRACCIATI.join('\n')
        : args.startsWith('diff --name-only')
          ? 'src/db/listino.ts\n'
          : args.startsWith('diff')
            ? '+ riga nuova'
            : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.read', (_, e) => {
    // I prompt del plugin: quello del selettore riconoscibile, gli altri generici.
    if (e.path.endsWith('/prompts/selettore-file.md')) return { value: 'Rispondi SOLO con un array JSON' }
    if (e.path.includes('/prompts/')) return { value: 'Prompt di sistema di Genius Pub' }
    const testo = file[e.path]
    if (testo === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: testo }
  })
  on('fs.stat', (_, e) => {
    if (e.path.includes('/nuovo')) throw new Error(`ENOENT ${e.path}`) // cartella che non esiste ancora
    const realPath = e.path.replace(`${ROOT}/docs/mappa/fuori`, '/altrove') // link simbolico che esce dal repo
    return { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false, realPath } }
  })
  on('model.complete', async (_, e) => {
    opzioni.chiamate?.push(e)
    await opzioni.attesa
    if (opzioni.guasto) {
      return { value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: uso(0) } }
    }
    const selettore = String(e.system ?? '').includes('array JSON')
    return {
      value: selettore
        ? { isAnswered: true, text: '["src/db/listino.ts", ".env", "../fuori.ts", "moduli/sync.md"]', usage: uso(4000) }
        : opzioni.serve
          ? { isAnswered: true, text: `${SERVE_ESPLORARE}\nMi mancano i file del plugin.`, usage: uso(9000, 8000) }
          : { isAnswered: true, text: 'Il listino usa IndexedDB (src/db/listino.ts:1).\n**Se si rompe:** …', usage: uso(9000, 8000) },
    }
  })
  // Il ripiego: un claude -p finto che legge un file e risponde.
  on('process.spawn', async function* (_, e) {
    opzioni.spawn?.push(e)
    const riga = (v: unknown) => ({ stream: 'stdout' as const, text: `${JSON.stringify(v)}\n` })
    yield riga({ type: 'assistant', message: { content: [{ type: 'tool_use' }] } })
    yield riga({ type: 'result', result: `${SERVE_ESPLORARE} Salva nello store del plugin.`, usage: uso(11000) })
    return { value: { code: 0, signal: null } }
  })
  on('tool.call', () => ({ result: 'eseguito' }))
}

test('i percorsi scelti dal modello restano nel repo e senza segreti', () => {
  const tracciati = new Set(TRACCIATI)
  expect(percorsiSicuri('["src/db/listino.ts", ".env", "/etc/passwd", "../x", "certs/server.pem", ".env.example"]', tracciati)).toEqual([
    'src/db/listino.ts',
    '.env.example',
  ])
  expect(percorsiSicuri('non è json', tracciati)).toEqual([])
  expect(percorsiSicuri('Ecco: ["src/sync/queue.ts"] fine', tracciati)).toEqual(['src/sync/queue.ts'])
  // Percorsi Next.js con le parentesi quadre, anche dentro un blocco di codice.
  const next = new Set(['src/app/[lang]/iscrizione/page.tsx', 'src/app/[lang]/annunci/[id]/page.tsx'])
  expect(percorsiSicuri('```json\n["src/app/[lang]/iscrizione/page.tsx", "src/app/[lang]/annunci/[id]/page.tsx"]\n```', next)).toEqual([
    'src/app/[lang]/iscrizione/page.tsx',
    'src/app/[lang]/annunci/[id]/page.tsx',
  ])
  const molti = new Set(Array.from({ length: 10 }, (_, i) => `f${i}.ts`))
  expect(percorsiSicuri(JSON.stringify([...molti]), molti)).toHaveLength(6)
  expect(eSegreto('app/.env.local')).toBe(true)
  expect(eSegreto('.env.example')).toBe(false)

  // File e documenti della mappa separati, ciascuno col suo tetto; indice e DECISIONI già nel contesto.
  const documenti = ['a', 'b', 'c', 'd'].map(n => `docs/mappa/moduli/${n}.md`)
  const ammessi = new Set([...TRACCIATI, ...documenti])
  expect(
    sceltaSicura('["moduli/a.md", "src/db/listino.ts", "docs/mappa/MAPPA.md", "docs/DECISIONI.md", "docs/mappa/moduli/b.md", "moduli/c.md", "moduli/d.md"]', ammessi),
  ).toEqual({ file: ['src/db/listino.ts'], documenti: documenti.slice(0, 3) })
})

test('file toccati di recente: relativi al repo, dal più recente, senza segreti né file esterni', () => {
  const uso = (file_path: string) => ({ input: { file_path } })
  const messaggi = [
    { toolUses: [uso('/repo/src/a.ts'), uso('/repo/src/b.ts')] },
    { toolUses: [uso('/etc/hosts'), uso('/repo/.env'), uso('/repo/src/a.ts'), { input: { command: 'ls' } }] },
  ]
  expect(fileToccati(messaggi, '/repo')).toEqual(['src/a.ts', 'src/b.ts'])
  expect(fileToccati(messaggi, '/repo', 1)).toEqual(['src/a.ts'])
})

test('il contesto segue l’ordine stabile e taglia prima i file, poi i turni', () => {
  const base = {
    sistema: 'S',
    mappa: 'M',
    decisioni: 'D',
    documenti: [{ file: 'docs/mappa/moduli/x.md', testo: 'DOC' }],
    turni: ['T1', 'T2'],
    diff: 'DIFF',
    file: [{ file: 'a.ts', testo: 'A' }],
    cronologia: [{ domanda: 'q', risposta: 'r' }],
    domanda: 'Q',
  }
  const tutto = assembla(base, 100000)
  expect(tutto.prompt.map(b => b.text.split('\n')[0])).toEqual([
    '<mappa>',
    '<decisioni>',
    '<documenti-mappa>',
    '<turni-sessione>',
    '<diff-dopo-la-mappa>',
    '<file>',
    '<cronologia-spiegatore>',
    '<domanda>',
  ])
  expect(tutto.system[0]?.cache).toBe(true)
  expect(tutto.prompt[1]?.cache).toBe(true)

  const grande = 'x'.repeat(3000)
  const budget = Math.floor(stimaToken(grande) / 2)
  const stretto = assembla({ ...base, file: [{ file: 'a.ts', testo: grande }], turni: [grande, 'T2'] }, budget)
  expect(stretto.tagliati).toEqual({ file: 1, turni: 1, documenti: 0 })
  expect(stretto.stimati).toBeLessThanOrEqual(budget)

  // I documenti della mappa si tolgono per ultimi.
  const docGrande = [{ file: 'docs/mappa/moduli/x.md', testo: grande }]
  const soloDoc = assembla({ ...base, documenti: docGrande, file: [{ file: 'a.ts', testo: grande }], turni: [grande] }, budget)
  expect(soloDoc.tagliati).toEqual({ file: 1, turni: 1, documenti: 1 })
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`pannello su ${surface}: domanda, livello, schede`, async ($, on) => {
    const chiamate: unknown[] = []
    const opzioni: Parameters<typeof motore>[1] = { mappa: MAPPA, chiamate }
    motore(on, opzioni)
    await $.session.start({ cwd: ROOT, surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })

    await ui.select({ key: 'livello', value: 'base' })
    expect(await ui.find({ type: 'Button', key: 'ultimo' })).toBeDefined()
    await ui.input({ key: 'domanda', text: 'Perché IndexedDB?' })
    expect((await ui.find({ type: 'Markdown' }))?.text).toContain('IndexedDB')
    // Dopo la risposta: la domanda fa da titolo, una riga corta, i pulsanti rapidi via, le fonti a richiesta.
    expect(await ui.find({ type: 'Text', text: 'Perché IndexedDB?' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /token/ }))?.text).toBe('Basic · 21.1k tokens · 1 file, 1 doc')
    expect(await ui.find({ type: 'Button', key: 'ultimo' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Map:/ })).toBeUndefined()
    await ui.press({ key: 'fonti' })
    expect((await ui.find({ type: 'Text', text: /^Map:/ }))?.text).toContain('moduli/sync.md')
    expect((await ui.find({ type: 'Text', text: /cached/ }))?.text).toContain('haiku')

    // Il selettore legge l'indice e sa quali file l'agente ha toccato di recente.
    const sel = (chiamate[0] as { prompt: string }).prompt
    expect(sel).toContain('### sync')
    expect(sel).toContain("File toccati di recente dall'agente: src/sync/queue.ts")
    expect(sel).not.toContain('DOC_SYNC')

    // Passaggio 2: indice, solo il documento scelto e solo i file sicuri, domanda in fondo.
    const risposta = chiamate[1] as { prompt: string; promptBlocks: { text: string }[] }
    expect(risposta.prompt).toContain('### sync')
    expect(risposta.prompt).toContain('DOC_SYNC')
    expect(risposta.prompt).not.toContain('DOC_COMANDI')
    expect(risposta.prompt).toContain('export function openDb')
    expect(risposta.prompt).not.toContain('SENTINELLA_SEGRETA_123')
    expect(risposta.promptBlocks.at(-1)?.text).toContain('Livello: Basic')
    expect(risposta).toMatchObject({ model: 'haiku', effort: 'medium', maxTokens: 16000 })
    expect(opzioni.store?.['livello-2']).toBe('base')

    // Una misura per domanda nello store, con i token di entrambe le chiamate.
    const misure = opzioni.store?.misure as { quando: number; documenti: string[]; risposta: { input_tokens: number } }[]
    expect(misure).toHaveLength(1)
    expect(misure[0]?.documenti).toEqual(['docs/mappa/moduli/sync.md'])
    expect(misure[0]?.quando).toBe(1_000)
    expect(misure[0]?.risposta.input_tokens).toBe(9000)
    expect(misure[0]).toMatchObject({ sforzo: 'medium', caratteriRisposta: expect.any(Number) })
    expect(opzioni.store?.['errore-misure']).toBeUndefined()

    // Riduci: resta un'anteprima di una riga; la risposta dopo si apre per intero.
    await ui.press({ key: 'riduci' })
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^Il listino usa IndexedDB/ }))?.text).not.toContain('Se si rompe')
    await ui.input({ key: 'domanda', text: 'E la cache?' })
    expect(await ui.find({ type: 'Markdown' })).toBeDefined()

    await ui.press({ key: 'scheda-storico' })
    await ui.press({ key: 'leggi-decisioni' })
    expect((await ui.find({ type: 'Markdown' }))?.text).toContain('IndexedDB invece di localStorage')
    await ui.press({ key: 'indietro' })
    expect(await ui.find({ type: 'Button', key: 'leggi-decisioni' })).toBeDefined()
    await ui.unmount()
  })
}

test('archivio: ogni risposta si salva, si rilegge, si riprende e si elimina', async ($, on) => {
  const chiamate: unknown[] = []
  const opzioni: Parameters<typeof motore>[1] = { mappa: MAPPA, chiamate }
  motore(on, opzioni)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  type Archivio = { id: string; progetto: string; scambi: { domanda: string; livello: string }[] }[]
  const archivio = () => (opzioni.store?.archivio ?? []) as Archivio

  await ui.input({ key: 'domanda', text: 'Perché IndexedDB?' })
  await ui.input({ key: 'domanda', text: 'E se si riempie?' })
  expect(archivio()).toHaveLength(1)
  expect(archivio()[0]?.progetto).toBe(ROOT)
  expect(archivio()[0]?.scambi.map(v => v.domanda)).toEqual(['Perché IndexedDB?', 'E se si riempie?'])

  // New topic: la domanda dopo apre un'altra conversazione.
  await ui.press({ key: 'nuovo' })
  await ui.input({ key: 'domanda', text: 'Come si lancia la build?' })
  const [recente, vecchia] = archivio()
  expect(archivio()).toHaveLength(2)

  await ui.press({ key: 'scheda-storico' })
  expect((await ui.find({ type: 'Text', text: /2 questions · Basic/ }))?.text).toBeDefined()
  await ui.press({ key: `apri-${vecchia?.id}` })
  expect(await ui.find({ type: 'Text', text: 'E se si riempie?' })).toBeDefined()
  await ui.press({ key: 'indietro' })

  // Dalla scheda Chiedi vuota: le conversazioni recenti si riprendono senza passare dallo Storico.
  await ui.press({ key: 'scheda-chiedi' })
  await ui.press({ key: 'nuovo' })
  expect(await ui.find({ type: 'Button', key: `riprendi-${recente?.id}` })).toBeDefined()
  // Riprendi: le domande di prima tornano nel contesto e la prossima continua la stessa conversazione.
  await ui.press({ key: `riprendi-${vecchia?.id}` })
  expect((await ui.find({ type: 'Text', text: /resumed$/ }))?.text).toBe('Basic · resumed')
  await ui.input({ key: 'domanda', text: 'E con due schede aperte?' })
  const ultima = chiamate[chiamate.length - 1] as { prompt: string }
  expect(ultima.prompt).toContain('<cronologia-spiegatore>')
  expect(ultima.prompt).toContain('E se si riempie?')
  expect(ultima.prompt).not.toContain('Come si lancia la build?')
  expect(archivio().find(c => c.id === vecchia?.id)?.scambi).toHaveLength(3)

  // Elimina chiede conferma.
  await ui.press({ key: 'scheda-storico' })
  await ui.press({ key: `apri-${recente?.id}` })
  await ui.press({ key: 'elimina' })
  expect(archivio()).toHaveLength(2)
  await ui.press({ key: 'conferma-elimina' })
  expect(archivio().map(c => c.id)).toEqual([vecchia?.id])
  await ui.unmount()
})

test('archivio: al più 50 conversazioni per progetto, le altre restano', () => {
  const voce = (quando: number) => ({ domanda: 'q', risposta: 'r', livello: 'Base', quando })
  let a = archivia([], 'altro', '/altro', voce(0))
  for (let i = 0; i < MAX_CONVERSAZIONI + 5; i++) a = archivia(a, `c${i}`, ROOT, voce(i))
  expect(a.filter(c => c.progetto === ROOT)).toHaveLength(MAX_CONVERSAZIONI)
  expect(a[0]?.id).toBe(`c${MAX_CONVERSAZIONI + 4}`)
  expect(a.some(c => c.id === 'altro')).toBe(true)
  expect(archivia(a, 'c54', ROOT, voce(99))[0]?.scambi).toHaveLength(2)
})

test('ripiego: solo su richiesta, leggero e senza sessione salvata', async ($, on) => {
  const spawn: { argv: string[]; env?: Record<string, string> }[] = []
  const opzioni: Parameters<typeof motore>[1] = { mappa: MAPPA, serve: true, spawn }
  motore(on, opzioni)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.input({ key: 'domanda', text: 'Dove salva le risposte il plugin?' })
  expect(spawn).toHaveLength(0)
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('Mi mancano i file del plugin.')
  expect(await ui.find({ type: 'Button', key: 'cerca' })).toBeDefined()
  expect(opzioni.store?.archivio).toBeUndefined()

  await ui.press({ key: 'cerca' })
  expect(spawn).toHaveLength(1)
  const argv = spawn[0]?.argv ?? []
  for (const f of ['--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']) expect(argv).toContain(f)
  expect(argv[argv.indexOf('--settings') + 1]).toBe('{"enabledPlugins":{"ponytail@ponytail":false}}')
  expect(argv[argv.indexOf('--model') + 1]).toBe('haiku')
  expect(argv[argv.indexOf('--tools') + 1]).toBe('Read,Grep,Glob')
  expect(spawn[0]?.env).toMatchObject({ GENIUS_PUB_CHILD: '1', GENIUS_PUB_RUOLO: 'spiega' })
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('Salva nello store del plugin.')
  expect((await ui.find({ type: 'Text', text: /token/ }))?.text).toContain('code search')
  expect(opzioni.store?.archivio as unknown[]).toHaveLength(1)
  await ui.unmount()
})

test('fascia: un solo pulsante, lo stato della mappa solo se va sistemata', async ($, on) => {
  motore(on, { mappa: MAPPA })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const fascia = { plugin: 'genius-pub', component: 'AbovePrompt', surface: 'desktop', props: { ...PANE.props, hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 3 } } as const
  const ui = await $.ui.mount(fascia)
  await ui.redraw() // lo stato della mappa si calcola dopo session.start
  // La mappa del test è indietro di un file (diff --name-only finto).
  expect(await ui.find({ type: 'Text', text: 'map: 1 file changed' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Basic|Technical/ })).toBeUndefined()
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(1)
  // Open apre il pannello e diventa Close; Close lo chiude e torna Open.
  expect((await ui.find({ type: 'Button', key: 'apri' }))?.text).toBe('Open')
  await ui.press({ key: 'apri' })
  expect((await ui.find({ type: 'Button', key: 'apri' }))?.text).toBe('Close')
  await ui.press({ key: 'apri' })
  expect((await ui.find({ type: 'Button', key: 'apri' }))?.text).toBe('Open')
  await ui.unmount()
})

test('widget: solo lo stato, senza pulsanti', async ($, on) => {
  motore(on, { mappa: MAPPA })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, placement: 'widget' } })
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: 'map: 1 file changed' })).toBeDefined()
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  await ui.unmount()
})

test('domanda già in corso: avviso sotto l’Input finché la risposta non arriva', async ($, on) => {
  let sblocca = () => {}
  const opzioni: Parameters<typeof motore>[1] = { mappa: MAPPA, attesa: new Promise<void>(ok => (sblocca = ok)) }
  motore(on, opzioni)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'domanda', text: 'Prima domanda' })
  expect(await ui.find({ type: 'Text', text: /^Preparing the answer/ })).toBeDefined()
  await ui.input({ key: 'domanda', text: 'Seconda domanda' })
  expect(await ui.find({ type: 'Text', text: /^Wait for the current answer/ })).toBeDefined()
  sblocca()
  await ui.redraw()
  expect(await ui.find({ type: 'Markdown' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Wait for the current answer/ })).toBeUndefined()
  await ui.unmount()
})

test('errore del modello: motivo e Riprova', async ($, on) => {
  motore(on, { mappa: MAPPA, guasto: true })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'domanda', text: 'Come funziona la sync?' })
  expect((await ui.find({ type: 'Text', text: /No answer/ }))?.text).toContain('529')
  expect(await ui.find({ type: 'Button', key: 'riprova' })).toBeDefined()
  await ui.unmount()
})

const SALVATI = [
  { store: { livello: 'profondo' }, model: 'sonnet', effort: undefined, etichetta: 'Technical' },
  { store: { livello: 'tecnico' }, model: 'haiku', effort: 'medium', etichetta: 'Basic' },
  { store: { livello: 'profondo', 'livello-2': 'medio' }, model: 'haiku', effort: 'medium', etichetta: 'Basic' },
  { store: { livello: 'profondo', 'livello-2': 'tecnico' }, model: 'sonnet', effort: undefined, etichetta: 'Technical' },
]
for (const caso of SALVATI) {
  test(`livello salvato con i nomi di prima ${JSON.stringify(caso.store)} → ${caso.etichetta}`, async ($, on) => {
    const chiamate: unknown[] = []
    motore(on, { mappa: MAPPA, chiamate, store: { ...caso.store } })
    await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.input({ key: 'domanda', text: 'Perché IndexedDB?' })
    const risposta = chiamate[1] as { model: string; effort?: string; promptBlocks: { text: string }[] }
    expect(risposta.model).toBe(caso.model)
    expect(risposta.effort).toBe(caso.effort)
    expect(risposta.promptBlocks.at(-1)?.text).toContain(`Livello: ${caso.etichetta}`)
    await ui.unmount()
  })
}

test('figlio con ruolo spiega: solo strumenti di lettura', async ($, on) => {
  motore(on, { env: { GENIUS_PUB_CHILD: '1', GENIUS_PUB_RUOLO: 'spiega' } })
  expect((await $.tool.call({ tool: 'Read', file_path: `${ROOT}/src/db/listino.ts` })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/docs/mappa/MAPPA.md`, old_string: 'a', new_string: 'b' })).deny).toContain('sola lettura')
  expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).deny).toContain('sola lettura')
})

test('figlio con ruolo mappa: scrive solo dentro docs/mappa/', async ($, on) => {
  motore(on, { env: { GENIUS_PUB_CHILD: '1', GENIUS_PUB_RUOLO: 'mappa' } })
  const edit = (file_path: string) => $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' })
  expect((await edit('docs/mappa/MAPPA.md')).deny).toBeUndefined()
  expect((await edit(`${ROOT}/docs/mappa/moduli/sync.md`)).deny).toBeUndefined()
  const nuovo = await $.tool.call({ tool: 'Write', file_path: `${ROOT}/docs/mappa/nuovo/x.md`, content: 'x' })
  expect(nuovo.deny).toBeUndefined()
  for (const fuori of [
    'docs/../src/db/listino.ts',
    'docs/mappa/../../src/db/listino.ts',
    `${ROOT}/src/db/listino.ts`,
    `${ROOT}/docs/DECISIONI.md`,
    `${ROOT}/docs/mappa-falsa/x.md`,
    `${ROOT}/docs/mappa/fuori/x.md`,
  ]) {
    expect((await edit(fuori)).deny).toContain('docs/mappa/')
  }
  // Niente Bash, neppure i comandi git ammessi prima: li lancia post-commit.sh.
  for (const command of ['git diff abc1234 -- src/db/listino.ts', 'git diff; rm -rf /', 'uv run --script /p/scripts/struttura.py --solo src/a.ts']) {
    expect((await $.tool.call({ tool: 'Bash', command })).deny).toContain('Bash')
  }
})

test('sessione principale: la guardia non blocca nulla', async ($, on) => {
  motore(on)
  expect((await $.tool.call({ tool: 'Bash', command: 'npm test' })).deny).toBeUndefined()
})
