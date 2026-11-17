# Genius Pub

A Claude Code plugin that keeps a map of your project and a log of its technical decisions, and explains the project from a read-only panel without touching the main session's context.

- **`/genius-pub:map`** writes `docs/mappa/`: an index of modules and files, one document per module with its breaking points, plus commands, data flow, state and recipes. `/genius-pub:map installa-hook` adds a git post-commit hook that keeps the map up to date in the background (Haiku).
- **Panel:** the band above the prompt shows `◉ Genius Pub` and an Open/Close button. Ask questions in the panel (or with `/explain`); `bug <symptom>` switches to bug mode. Answers come in the language of the question. Two levels: Basic (Haiku) and Technical (Sonnet).
- **Read-only:** the panel never edits files. Searching the code (`claude -p` with Read, Grep, Glob only) starts only when you press «Search the code».
- **Decisions:** in projects with `docs/DECISIONI.md`, one line per technical choice (see this repository's own file).

This repository maps itself: see [`docs/mappa/MAPPA.md`](docs/mappa/MAPPA.md) and [`docs/DECISIONI.md`](docs/DECISIONI.md). Maps, prompts and notes are in Italian; the interface is in English.

## Requirements
- Claude Code with plugin mods (the band and the panel); tested on 2.1.325.
- `git`. For «Search the code» and the post-commit hook: the `claude` CLI, authenticated. For the map: [`uv`](https://docs.astral.sh/uv/).
- There are two plugins, one per system: `genius-pub` for macOS and `genius-pub-windows` for Windows (it handles `C:\…` paths). On Windows the hook is a `sh` script and needs Git Bash (untested).

## Install
```bash
claude plugin marketplace add cristianotoni12-beep/genius-pub
```
macOS:
```bash
claude plugin install genius-pub@genius-pub --scope user
```
Windows:
```bash
claude plugin install genius-pub-windows@genius-pub --scope user
```
Then, inside a git repository: `/genius-pub:map` (on Windows `/genius-pub-windows:map`), and optionally the same command with `installa-hook`.

The hook runs without a terminal, so `claude` must be logged in (`claude auth login`) or get `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`. It follows plugin updates by itself.

## Develop
The code is in `plugins/genius-pub/` (macOS) and `plugins/genius-pub-windows/` (Windows): a fix that applies to both goes in both. From the repository root, for the marketplace:
```bash
claude plugin validate --strict .
```
Then from each plugin's folder:
```bash
claude plugin validate --strict .
```
```bash
claude plugin test .
```
```bash
sh tests/post-commit.test.sh
```
```bash
uv run --script tests/test_struttura.py
```

## License
MIT, see [`LICENSE`](LICENSE).
