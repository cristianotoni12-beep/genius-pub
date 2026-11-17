# Struttura di Genius Pub

<!-- STRUTTURA:AUTO-START -->
<!-- generato da scripts/struttura.py: non modificare a mano tra i marcatori -->

### (radice)
- `.gitignore`
- `LICENSE`
- `NOTE-SVILUPPO.md` (documentazione) → titoli: Note di sviluppo (per il resoconto finale), Fase 0 — risultati (2026-11-15, Claude Code desktop 2.1.325…, Ambiente, Fonti
- `README.md` (documentazione) → titoli: Genius Pub, Requirements, Install, Develop, License

### .claude-plugin
- `.claude-plugin/marketplace.json`

### docs
- `docs/DECISIONI.md` (documentazione) → titoli: Decisioni

### plugins/genius-pub
- `plugins/genius-pub/.claude-plugin/plugin.json`
- `plugins/genius-pub/hooks/contesto.ts` (hook) → stimaToken():22, eSegreto():25, percorsiSicuri():34, sceltaSicura():50, fileToccati():60, hashMappa():80 +26 · usato da: plugins/genius-pub/hooks/register.tsx, plugins/genius-pub/tests/genius-pub.test.tsx
- `plugins/genius-pub/hooks/hooks.json` (hook)
- `plugins/genius-pub/hooks/register.tsx` (hook) → register():518, etichettaDi():54, plurale():55, leggiRuolo():77, git():85, leggi():94 +29
- `plugins/genius-pub/prompts/guasto.md` (documentazione)
- `plugins/genius-pub/prompts/ripiego.md` (documentazione)
- `plugins/genius-pub/prompts/selettore-file.md` (documentazione)
- `plugins/genius-pub/prompts/spiegatore.md` (documentazione)
- `plugins/genius-pub/scripts/post-commit.sh` (script)
- `plugins/genius-pub/scripts/struttura.py` (script) → elenca():66, escluso():71, tipo_file():78, area():105, norm():110, albero():120 +49
- `plugins/genius-pub/skills/map/SKILL.md` (documentazione) → titoli: /genius-pub:map: la mappa del progetto per Genius Pub, Come è fatta la mappa, Regole dei documenti, Che cosa fare in base all'argomento, Generazione completa, Aggiornamento: `aggiorna [file…]`, Hook post-commit: `installa-hook`
- `plugins/genius-pub/tests/genius-pub.test.tsx` (test) → uso():58, motore():66
- `plugins/genius-pub/tests/post-commit.test.sh` (test)
- `plugins/genius-pub/tests/test_struttura.py` (test) → git():98, crea_repo():102, lancia():114, voci():122, TestStruttura:126
- `plugins/genius-pub/tsconfig.json` (config) → chiavi: extends · estende: ./.claude-plugin/types/tsconfig.json
- `plugins/genius-pub/types/index.d.ts` (tipi) → Livello:1, Scheda:2, Modo:3, Scambio:4, Voce:6, Conversazione:7 +3

### plugins/genius-pub-windows
- `plugins/genius-pub-windows/.claude-plugin/plugin.json`
- `plugins/genius-pub-windows/hooks/contesto.ts` (hook) → stimaToken():22, eWindows():26, barre():29, relativoA():36, percorsoDentro():45, eSegreto():60 +30 · usato da: plugins/genius-pub-windows/hooks/register.tsx, plugins/genius-pub-windows/tests/genius-pub.test.tsx
- `plugins/genius-pub-windows/hooks/hooks.json` (hook)
- `plugins/genius-pub-windows/hooks/register.tsx` (hook) → register():514, etichettaDi():57, plurale():58, leggiRuolo():80, git():88, leggi():97 +28
- `plugins/genius-pub-windows/prompts/guasto.md` (documentazione)
- `plugins/genius-pub-windows/prompts/ripiego.md` (documentazione)
- `plugins/genius-pub-windows/prompts/selettore-file.md` (documentazione)
- `plugins/genius-pub-windows/prompts/spiegatore.md` (documentazione)
- `plugins/genius-pub-windows/scripts/post-commit.sh` (script)
- `plugins/genius-pub-windows/scripts/struttura.py` (script) → elenca():66, escluso():71, tipo_file():78, area():105, norm():110, albero():120 +49
- `plugins/genius-pub-windows/skills/map/SKILL.md` (documentazione) → titoli: /genius-pub-windows:map: la mappa del progetto per Genius P…, Come è fatta la mappa, Regole dei documenti, Che cosa fare in base all'argomento, Generazione completa, Aggiornamento: `aggiorna [file…]`, Hook post-commit: `installa-hook`
- `plugins/genius-pub-windows/tests/genius-pub.test.tsx` (test) → comeNelTest():49, uso():65, motore():73
- `plugins/genius-pub-windows/tests/post-commit.test.sh` (test)
- `plugins/genius-pub-windows/tests/test_struttura.py` (test) → git():100, crea_repo():105, lancia():117, voci():126, TestStruttura:130
- `plugins/genius-pub-windows/tsconfig.json` (config) → chiavi: extends · estende: ./.claude-plugin/types/tsconfig.json
- `plugins/genius-pub-windows/types/index.d.ts` (tipi) → Livello:1, Scheda:2, Modo:3, Scambio:4, Voce:6, Conversazione:7 +3
<!-- STRUTTURA:AUTO-END -->
