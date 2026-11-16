# Struttura di Genius Pub

<!-- STRUTTURA:AUTO-START -->
<!-- generato da scripts/struttura.py: non modificare a mano tra i marcatori -->

### (radice)
- `.gitignore`
- `NOTE-SVILUPPO.md` (documentazione) → titoli: Note di sviluppo (per il resoconto finale), Fase 0 — risultati (2026-11-15, Claude Code desktop 2.1.325…, Ambiente, Fonti
- `tsconfig.json` (config) → chiavi: extends · estende: ./.claude-plugin/types/tsconfig.json

### .claude-plugin
- `.claude-plugin/marketplace.json`
- `.claude-plugin/plugin.json`

### hooks
- `hooks/contesto.ts` (hook) → stimaToken():22, eSegreto():25, percorsiSicuri():34, sceltaSicura():50, fileToccati():60, hashMappa():80 +26 · usato da: hooks/register.tsx, tests/genius-pub.test.tsx
- `hooks/hooks.json` (hook)
- `hooks/register.tsx` (hook) → register():518, etichettaDi():54, plurale():55, leggiRuolo():77, git():85, leggi():94 +29

### prompts
- `prompts/guasto.md` (documentazione)
- `prompts/ripiego.md` (documentazione)
- `prompts/selettore-file.md` (documentazione)
- `prompts/spiegatore.md` (documentazione)

### scripts
- `scripts/post-commit.sh` (script)
- `scripts/struttura.py` (script) → elenca():66, escluso():71, tipo_file():78, area():105, norm():110, albero():120 +49

### skills/map
- `skills/map/SKILL.md` (documentazione) → titoli: /genius-pub:map: la mappa del progetto per Genius Pub, Come è fatta la mappa, Regole dei documenti, Che cosa fare in base all'argomento, Generazione completa, Aggiornamento: `aggiorna [file…]`, Hook post-commit: `installa-hook`

### tests
- `tests/genius-pub.test.tsx` (test) → uso():58, motore():66
- `tests/post-commit.test.sh` (test)
- `tests/test_struttura.py` (test) → git():98, crea_repo():102, lancia():114, voci():122, TestStruttura:126

### types
- `types/index.d.ts` (tipi) → Livello:1, Scheda:2, Modo:3, Scambio:4, Voce:6, Conversazione:7 +3
<!-- STRUTTURA:AUTO-END -->
