# Comandi
| Comando | Cosa fa | Da dove |
|---|---|---|
| `claude plugin test .` | prova il plugin intero con il motore vero | radice del repo |
| `sh tests/post-commit.test.sh` | prova l'hook con `claude` e `uv` finti (circa 12 s) | radice del repo |
| `uv run --script tests/test_struttura.py` | prova `struttura.py` su repo fixture | radice del repo |
| `claude plugin validate --strict .` | controlla manifest e marketplace (avviso `ICON_MISSING` atteso) | radice del repo |
| `npx -y -p typescript@5 tsc -p . --noEmit` | controllo dei tipi; richiede `.claude-plugin/types/` | radice del repo |
| `uv run --script scripts/struttura.py --root . --stampa` | stampa la struttura senza scrivere | radice del repo |
| `uv run --script scripts/struttura.py --root . --solo <file…>` | aggiorna `docs/mappa/struttura.md` solo per quei file | radice del repo |
| `claude plugin marketplace add <radice del repo>` | registra il marketplace locale (prima volta) | qualsiasi cartella |
| `claude plugin install genius-pub@genius-pub` | installa il plugin | qualsiasi cartella |
| `claude plugin marketplace update genius-pub` poi `claude plugin update genius-pub@genius-pub` | porta una versione nuova, poi riavvio | qualsiasi cartella |
| `/reload-plugins` | ricarica il plugin dopo una modifica | dentro Claude Code |
| `/explain [bug] <domanda>` | apre il pannello e pone la domanda | dentro Claude Code |
| `/genius-pub:map` | genera `docs/mappa/` | dentro Claude Code, radice del progetto |
| `/genius-pub:map aggiorna [file…]` | aggiorna la mappa | dentro Claude Code |
| `/genius-pub:map installa-hook` | installa l'hook git post-commit | dentro Claude Code |
| `claude auth login` | autentica `claude -p` (ripiego e hook); in alternativa `CLAUDE_CODE_OAUTH_TOKEN` | qualsiasi cartella |
| `tail -n 40 "$(git rev-parse --absolute-git-dir)/genius-pub-mappa.log"` | legge il log dell'hook | radice del progetto |
