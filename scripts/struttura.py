#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12,<3.15"
# dependencies = ["tree-sitter-language-pack==0.13.0"]
# [tool.uv]
# exclude-newer = "2026-11-15T00:00:00Z"
# ///
"""struttura.py: mappa strutturale deterministica (0 token) di un repo git.

Scrive SOLO tra i marcatori STRUTTURA:AUTO di docs/mappa/struttura.md (o --output).

    uv run --script scripts/struttura.py [--root R] [--output F] [--budget N]
                                         [--solo FILE ...] [--json | --stampa]

- Elenco file da `git ls-files`; segreti, lockfile, file oltre 1 MB e la mappa
  stessa sono esclusi prima di aprire qualsiasi file.
- tree-sitter-language-pack 0.13.0 è fissato perché include le grammatiche
  nella wheel: niente download al primo avvio, stesso albero a ogni esecuzione.
- Query e visita dell'albero sono minime e scritte qui (nessun tags.scm esterno).
- Grafo degli import risolti + PageRank a iterazioni fisse; a parità di
  punteggio decide il tipo di file e poi il percorso.
"""

import argparse
import bisect
import json
import os
import posixpath
import re
import stat
import subprocess
import sys
import tempfile
import tomllib
from html.parser import HTMLParser

import tree_sitter as ts
import tree_sitter_language_pack as tslp

START = "<!-- STRUTTURA:AUTO-START -->"
END = "<!-- STRUTTURA:AUTO-END -->"
NOTA = "<!-- generato da scripts/struttura.py: non modificare a mano tra i marcatori -->"
RADICE, ASSET = "(radice)", "(asset e binari)"
MAX_BYTE = 1024 * 1024
MAX_SIMBOLI, MAX_USATO, MAX_LISTA, MAX_ASSET, MAX_VOCE = 6, 3, 20, 8, 60

LOCKFILE = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "npm-shrinkwrap.json",
            "bun.lock", "bun.lockb", "uv.lock", "composer.lock", "Cargo.lock", "Gemfile.lock"}
ASSET_EXT = set(
    ".png .jpg .jpeg .gif .webp .avif .svg .ico .icns .bmp .tif .tiff .heic .psd .ai .sketch .fig "
    ".woff .woff2 .ttf .otf .eot .mp3 .mp4 .m4a .wav .ogg .flac .webm .mov .avi .mkv "
    ".pdf .zip .gz .tgz .tar .7z .rar .wasm .exe .dll .so .dylib .bin .db .sqlite .sqlite3 "
    ".pkl .pt .pth .onnx .npy .npz .h5 .parquet .jar .class .pyc .glb .gltf .blend".split())
CODICE = {".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
          ".ts": "typescript", ".mts": "typescript", ".cts": "typescript", ".tsx": "tsx",
          ".py": "python", ".php": "php", ".svelte": "sfc", ".vue": "sfc", ".astro": "sfc"}
EST_JS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".astro")
RE_CONFIG_JS = re.compile(r"\.config\.[cm]?[jt]s$")
# a parità di PageRank: prima i manifest del progetto, poi il codice, per ultimi i file opachi
PRIORITA = {"package": 0, "tsconfig": 0, "toml": 0, "requirements": 0, "codice": 1, "yaml": 2,
            "html": 2, "css": 3, "env": 3, "markdown": 4, "altro": 5}


# ---------------------------------------------------------------- elenco file

def elenca(root):
    out = subprocess.run(["git", "-C", root, "ls-files", "-z"], capture_output=True, check=True).stdout
    return sorted({p for p in out.decode("utf-8", "replace").split("\0") if p})


def escluso(p, out_rel):
    nome = posixpath.basename(p)
    return (nome == ".env" or (nome.startswith(".env.") and nome != ".env.example")
            or nome.endswith((".pem", ".key")) or nome in LOCKFILE
            or p.startswith("docs/mappa/") or p in ("docs/MAPPA.md", out_rel))


def tipo_file(p):
    nome = posixpath.basename(p)
    low = nome.lower()
    ext = posixpath.splitext(low)[1]
    if nome == ".env.example":
        return "env"
    if nome == "package.json":
        return "package"
    if re.fullmatch(r"[tj]sconfig(\..+)?\.json", low):
        return "tsconfig"
    if ext in CODICE:
        return "codice"
    if ext in (".html", ".htm"):
        return "html"
    if ext in (".css", ".scss", ".sass", ".less"):
        return "css"
    if ext in (".yaml", ".yml"):
        return "yaml"
    if ext == ".toml":
        return "toml"
    if ext in (".md", ".mdx"):
        return "markdown"
    if re.fullmatch(r"requirements.*\.txt", low):
        return "requirements"
    return "asset" if ext in ASSET_EXT else "altro"


def area(p):
    d = posixpath.dirname(p)
    return "/".join(d.split("/")[:2]) if d else RADICE


def norm(p):
    r = posixpath.normpath(p) if p else ""
    return "" if r == "." else r


# ---------------------------------------------------------------- tree-sitter

_parser, _query = {}, {}


def albero(lingua, src):
    if lingua not in _parser:
        _parser[lingua] = tslp.get_parser(lingua)
    return _parser[lingua].parse(src).root_node


def trova_tutti(lingua, q, nodo):
    if (lingua, q) not in _query:
        _query[lingua, q] = ts.Query(tslp.get_language(lingua), q)
    return ts.QueryCursor(_query[lingua, q]).matches(nodo)


def testo(n):
    return n.text.decode("utf-8", "replace")


def stringa(n):
    t = testo(n)
    if len(t) >= 2 and t[0] == t[-1] and t[0] in "'\"`" and "${" not in t:
        return t[1:-1]
    return None


def primo(n, tipo):
    pila = [n]
    while pila:
        x = pila.pop()
        if x.type == tipo:
            return x
        pila.extend(reversed(x.children))
    return None


def simbolo(nome_nodo, tipo, riga0=0, esportato=True, nome=None):
    return {"nome": nome or testo(nome_nodo), "tipo": tipo, "riga": nome_nodo.start_point.row + 1 + riga0,
            "esportato": esportato}


# ---------------------------------------------------------------- JS / TS

Q_JS_CHIAMATE = """
(call_expression function: (identifier) @f arguments: (arguments . (string) @s))
(call_expression function: (import) arguments: (arguments . (string) @s))
"""
Q_JSX = "[(jsx_element) (jsx_self_closing_element)] @j"
FUNZIONI = {"arrow_function", "function_expression", "function", "generator_function"}
DICHIARAZIONI = {"function_declaration": "funzione", "generator_function_declaration": "funzione",
                 "class_declaration": "classe", "abstract_class_declaration": "classe",
                 "interface_declaration": "tipo", "type_alias_declaration": "tipo", "enum_declaration": "tipo"}


def estrai_js(src, lingua, riga0=0):
    root = albero(lingua, src)
    jsx = [] if lingua == "typescript" else sorted(
        n.start_byte for _, m in trova_tutti(lingua, Q_JSX, root) for n in m["j"])
    simboli, spec, esportati = [], [], set()

    def ha_jsx(n):
        i = bisect.bisect_left(jsx, n.start_byte)
        return i < len(jsx) and jsx[i] < n.end_byte

    def aggiungi(nome, tipo, corpo, esportato):
        if tipo == "funzione" and testo(nome)[:1].isupper() and ha_jsx(corpo):
            tipo = "componente"
        simboli.append(simbolo(nome, tipo, riga0, esportato))

    def dichiarazione(d, esportato):
        if d.type in DICHIARAZIONI:
            nome = d.child_by_field_name("name")
            if nome is not None and (esportato or DICHIARAZIONI[d.type] != "tipo"):
                aggiungi(nome, DICHIARAZIONI[d.type], d, esportato)
            return nome is not None
        if d.type not in ("lexical_declaration", "variable_declaration"):
            return False
        for v in d.named_children:
            nome, val = v.child_by_field_name("name"), v.child_by_field_name("value")
            if v.type != "variable_declarator" or nome is None or nome.type != "identifier":
                continue
            if val is not None and val.type in FUNZIONI:
                aggiungi(nome, "funzione", val, esportato)
            elif val is not None and val.type == "call_expression" and testo(nome)[:1].isupper() and ha_jsx(val):
                aggiungi(nome, "componente", val, esportato)
            elif esportato:
                aggiungi(nome, "costante", v, esportato)
        return True

    for n in root.named_children:
        if n.type == "import_statement":
            s = n.child_by_field_name("source") or primo(n, "string")  # anche `import x = require('y')`
            if s is not None and stringa(s):
                spec.append(stringa(s))
        elif n.type == "export_statement":
            s = n.child_by_field_name("source")
            if s is not None and stringa(s):
                spec.append(stringa(s))
            d = n.child_by_field_name("declaration")
            if (d is None or not dichiarazione(d, True)) and any(c.type == "default" for c in n.children):
                v = n.child_by_field_name("value") or d
                if v is not None and v.type == "identifier":
                    esportati.add(testo(v))
                elif v is not None:
                    tipo = "componente" if ha_jsx(v) else "funzione" if v.type in FUNZIONI else "costante"
                    simboli.append(simbolo(n, tipo, riga0, True, "default"))
            for c in n.named_children:
                if c.type == "export_clause":
                    esportati.update(testo(x.child_by_field_name("name")) for x in c.named_children
                                     if x.type == "export_specifier")
        elif (n.type == "expression_statement" and n.named_children
              and n.named_children[0].type == "assignment_expression"):  # CommonJS
            a = n.named_children[0]
            sx, dx = a.child_by_field_name("left"), a.child_by_field_name("right")
            if testo(sx) == "module.exports" and dx is not None:
                if dx.type == "identifier":
                    esportati.add(testo(dx))
                elif dx.type in FUNZIONI:
                    nome = dx.child_by_field_name("name")
                    if nome is not None:
                        aggiungi(nome, "funzione", dx, True)
                    else:
                        simboli.append(simbolo(n, "funzione", riga0, True, "default"))
                for p in dx.named_children if dx.type == "object" else []:
                    if p.type == "shorthand_property_identifier":
                        esportati.add(testo(p))
                    elif p.type == "pair":
                        val = p.child_by_field_name("value")
                        aggiungi(p.child_by_field_name("key"), "funzione" if val.type in FUNZIONI else "costante",
                                 val, True)
            elif sx.type == "member_expression" and testo(sx).startswith(("exports.", "module.exports.")):
                aggiungi(sx.child_by_field_name("property"),
                         "funzione" if dx is not None and dx.type in FUNZIONI else "costante", dx or a, True)
        else:
            dichiarazione(n, False)

    for s in simboli:
        s["esportato"] = s["esportato"] or s["nome"] in esportati
    for i, m in trova_tutti(lingua, Q_JS_CHIAMATE, root):
        if (i == 1 or testo(m["f"][0]) == "require") and stringa(m["s"][0]):
            spec.append(stringa(m["s"][0]))
    return simboli, spec, root


def coppie_obj(obj):
    out = []
    for p in obj.named_children:
        if p.type == "pair":
            k = p.child_by_field_name("key")
            out.append((stringa(k) if k.type == "string" else testo(k), p.child_by_field_name("value")))
        elif p.type == "shorthand_property_identifier":
            out.append((testo(p), None))
        elif p.type == "method_definition":
            out.append((testo(p.child_by_field_name("name")), None))
    return out


def nome_plugin(el):
    if el.type == "call_expression":
        f = el.child_by_field_name("function")
        if testo(f) == "require":
            s = primo(el.child_by_field_name("arguments"), "string")
            return stringa(s) if s is not None else None
        return testo(f) + "()"
    if el.type == "string":
        return stringa(el)
    if el.type == "array" and el.named_children:
        return nome_plugin(el.named_children[0])
    return testo(el) if el.type in ("identifier", "member_expression") else None  # mai oggetti letterali: valori


def trova_alias(obj, prof=3):
    for k, v in coppie_obj(obj):
        if v is not None and v.type == "object":
            if k == "alias":
                return [a for a, _ in coppie_obj(v)]
            if prof and (r := trova_alias(v, prof - 1)):
                return r
    return []


def config_js(root):
    """Chiavi, alias e plugin dell'oggetto esportato da next/vite/*.config.*."""
    variabili, bersaglio, plugin = {}, None, []
    for n in root.named_children:
        d = n.child_by_field_name("declaration") if n.type == "export_statement" else n
        if d is not None and d.type in ("lexical_declaration", "variable_declaration"):
            for v in d.named_children:
                if v.child_by_field_name("name") is not None and v.child_by_field_name("value") is not None:
                    variabili[testo(v.child_by_field_name("name"))] = v.child_by_field_name("value")
        if n.type == "export_statement" and any(c.type == "default" for c in n.children):
            bersaglio = n.child_by_field_name("value") or n.child_by_field_name("declaration")
        elif (n.type == "expression_statement" and n.named_children
              and n.named_children[0].type == "assignment_expression"
              and testo(n.named_children[0].child_by_field_name("left")) == "module.exports"):
            bersaglio = n.named_children[0].child_by_field_name("right")
    for _ in range(8):  # segue variabili, wrapper withX(...)/defineConfig(...) e arrow function
        if bersaglio is None or bersaglio.type == "object":
            break
        t = bersaglio.type
        if t == "identifier":
            bersaglio = variabili.get(testo(bersaglio))
        elif t in ("parenthesized_expression", "satisfies_expression", "as_expression", "return_statement"):
            bersaglio = bersaglio.named_children[0] if bersaglio.named_children else None
        elif t in FUNZIONI:
            corpo = bersaglio.child_by_field_name("body")
            bersaglio = primo(corpo, "return_statement") if corpo is not None and corpo.type == "statement_block" else corpo
        elif t == "call_expression":
            f = bersaglio.child_by_field_name("function")
            nome = testo(f.child_by_field_name("function") if f.type == "call_expression" else f)
            if nome.startswith("with"):
                plugin.append(nome)
            args = bersaglio.child_by_field_name("arguments").named_children
            bersaglio = next((x for x in args if x.type == "object"), args[0] if args else None)
        else:
            break
    dettagli = {}
    if bersaglio is not None and bersaglio.type == "object":
        coppie = coppie_obj(bersaglio)
        dettagli["chiavi"] = [k for k, _ in coppie]
        if alias := trova_alias(bersaglio):
            dettagli["alias"] = alias
        for k, v in coppie:
            if k == "plugins" and v is not None and v.type == "array":
                plugin += [nome_plugin(x) for x in v.named_children]
    if plugin := [p for p in plugin if p]:
        dettagli["plugin"] = plugin
    return dettagli


RE_SCRIPT = re.compile(rb"<script\b([^>]*)>(.*?)</script\s*>", re.S | re.I)


def blocchi_sfc(src, ext):
    """(lingua, sorgente, righe prima) per frontmatter Astro e blocchi <script> di Svelte/Vue/Astro."""
    out = []
    if ext == ".astro" and (m := re.match(rb"\s*---\r?\n(.*?)^---", src, re.S | re.M)):
        out.append(("typescript", m.group(1), src[:m.start(1)].count(b"\n")))
    for m in RE_SCRIPT.finditer(src):
        lang = re.search(rb"""lang\s*=\s*["']?(tsx|ts)""", m.group(1))
        lingua = ({b"tsx": "tsx", b"ts": "typescript"}[lang.group(1)] if lang
                  else "typescript" if ext == ".astro" else "javascript")
        out.append((lingua, m.group(2), src[:m.start(2)].count(b"\n")))
    return out


# ---------------------------------------------------------------- Python / PHP

Q_PY = "[(import_statement) (import_from_statement)] @i"


def estrai_py(src):
    root = albero("python", src)
    simboli, spec, main = [], [], False
    for n in root.named_children:
        d = n.child_by_field_name("definition") if n.type == "decorated_definition" else n
        if d is not None and d.type in ("function_definition", "class_definition"):
            nome = d.child_by_field_name("name")
            simboli.append(simbolo(nome, "funzione" if d.type == "function_definition" else "classe",
                                   esportato=not testo(nome).startswith("_")))
        elif n.type == "if_statement" and "__main__" in testo(n.child_by_field_name("condition")):
            main = True
    for _, m in trova_tutti("python", Q_PY, root):
        n = m["i"][0]
        nomi = [testo(c.child_by_field_name("name") if c.type == "aliased_import" else c)
                for c in n.children_by_field_name("name")]
        if n.type == "import_statement":
            spec += [("import", x, []) for x in nomi]
        else:
            spec.append(("from", testo(n.child_by_field_name("module_name")), nomi))
    return simboli, spec, main


Q_PHP = "[(include_expression) (include_once_expression) (require_expression) (require_once_expression)] @i"
DICH_PHP = {"function_definition": "funzione", "class_declaration": "classe", "interface_declaration": "tipo",
            "trait_declaration": "classe", "enum_declaration": "tipo"}


def estrai_php(src):
    root = albero("php", src)
    simboli, spec = [], []

    def scorri(nodi):
        for n in nodi:
            if n.type == "namespace_definition" and n.child_by_field_name("body") is not None:
                scorri(n.child_by_field_name("body").named_children)
            elif n.type in DICH_PHP and n.child_by_field_name("name") is not None:
                simboli.append(simbolo(n.child_by_field_name("name"), DICH_PHP[n.type]))
            elif n.type == "namespace_use_declaration":
                spec += [("use", testo(c.named_children[0])) for c in n.named_children
                         if c.type == "namespace_use_clause" and c.named_children]

    scorri(root.named_children)
    for _, m in trova_tutti("php", Q_PHP, root):
        s = primo(m["i"][0], "string") or primo(m["i"][0], "encapsed_string")
        if s is not None and stringa(s):
            spec.append(("inc", stringa(s)))
    return simboli, spec


# ---------------------------------------------------------------- altri tipi

class _Html(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.d = {"script": [], "link": [], "form": [], "id": []}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script" and a.get("src"):
            self.d["script"].append(a["src"])
        elif tag == "link" and a.get("href"):
            self.d["link"].append(a["href"])
        elif tag == "form" and a.get("action"):
            self.d["form"].append(a["action"])
        if a.get("id"):
            self.d["id"].append(a["id"])


RE_JSONC = re.compile(r'("(?:\\.|[^"\\])*")|//[^\n]*|/\*.*?\*/|,(?=\s*[}\]])', re.S)


def jsonc(t):
    return json.loads(RE_JSONC.sub(lambda m: m.group(1) or "", t))


def unici(xs):
    return list(dict.fromkeys(x for x in xs if x))


def nome_pacchetto(req):
    m = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", req)
    return m.group(1) if m else None


def estrai_css(t, e):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    t = re.sub(r"(?<![:\w])//[^\n]*", "", t)  # commenti SCSS, non gli URL
    imp = re.findall(r"@(?:import|use|forward)\s+(?:url\()?\s*['\"]([^'\"]+)['\"]", t)
    conteggio = {}
    for prelude in re.findall(r"([^{};]+)\{", t):
        for sel in prelude.split(","):
            if m := re.match(r"\s*([.#][A-Za-z_][\w-]*)", sel):
                pref = re.split(r"(?<=.)(?:--|__|-|_)", m.group(1))[0]
                conteggio[pref] = conteggio.get(pref, 0) + 1
    e["_spec"] = imp
    e["dettagli"].update({
        "import": unici(re.split(r"[?#]", x)[0] for x in imp),
        "var": unici(re.findall(r"(?<![\w-])(--[\w-]+)\s*:", t)),
        "prefissi": [f"{k} ({n})" for k, n in sorted(conteggio.items(), key=lambda kv: (-kv[1], kv[0]))[:5]],
    })


def estrai(e, src):
    p, tipo = e["file"], e["tipo"]
    ext = posixpath.splitext(p.lower())[1]
    if tipo == "codice":
        lingua = CODICE[ext]
        if lingua == "python":
            e["simboli"], e["_spec"], e["_main"] = estrai_py(src)
        elif lingua == "php":
            e["simboli"], e["_spec"] = estrai_php(src)
        elif lingua == "sfc":
            for lang, blocco, riga0 in blocchi_sfc(src, ext):
                s, sp, _ = estrai_js(blocco, lang, riga0)
                e["simboli"] += s
                e["_spec"] += sp
        else:
            e["simboli"], e["_spec"], root = estrai_js(src, lingua)
            if RE_CONFIG_JS.search(p.lower()):
                e["dettagli"] = config_js(root)
        return
    t = src.decode("utf-8", "replace")
    d = e["dettagli"]
    if tipo == "package":
        j = json.loads(t)
        for chiave, etichetta in (("scripts", "script"), ("dependencies", "dip"), ("devDependencies", "dev")):
            if isinstance(j.get(chiave), dict) and j[chiave]:
                d[etichetta] = list(j[chiave])
    elif tipo == "tsconfig":
        j = jsonc(t)
        co = j.get("compilerOptions") if isinstance(j.get("compilerOptions"), dict) else {}
        paths = co.get("paths") if isinstance(co.get("paths"), dict) else {}
        d["chiavi"] = list(j)
        if isinstance(j.get("extends"), str):
            d["estende"] = [j["extends"]]
        if paths:
            d["alias"] = [f"{k} → {v[0]}" for k, v in paths.items() if isinstance(v, list) and v]
        e["_ts"] = (co.get("baseUrl") if isinstance(co.get("baseUrl"), str) else None, paths)
    elif tipo == "yaml":
        d["chiavi"] = unici(k.strip("'\"") for k in re.findall(r"(?m)^([A-Za-z0-9_\"'][^:#\n]*?)\s*:(?:\s|$)", t))
    elif tipo == "toml":
        j = tomllib.loads(t)
        d["chiavi"] = [x for k, v in j.items() for x in ([f"tool.{s}" for s in v] if k == "tool" and isinstance(v, dict) else [k])]
        prj = j.get("project") if isinstance(j.get("project"), dict) else {}
        poetry = j.get("tool", {}).get("poetry", {}).get("dependencies", {}) if isinstance(j.get("tool"), dict) else {}
        dip = [nome_pacchetto(x) for x in prj.get("dependencies", []) if isinstance(x, str)]
        dip += [k for k in poetry if k != "python"] if isinstance(poetry, dict) else []
        if dip := unici(dip):
            d["dip"] = dip
        if isinstance(prj.get("scripts"), dict) and prj["scripts"]:
            d["script"] = list(prj["scripts"])
    elif tipo == "requirements":
        d["dip"] = unici(nome_pacchetto(r) for r in t.splitlines() if not r.lstrip().startswith(("#", "-")))
    elif tipo == "env":  # solo i nomi: i valori non vengono mai conservati
        d["variabili"] = unici(re.findall(r"(?m)^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=", t))
    elif tipo == "markdown":
        titoli, recinto = [], False
        for riga_ in t.splitlines():
            if riga_.lstrip().startswith(("```", "~~~")):
                recinto = not recinto
            elif not recinto and (m := re.match(r"#{1,2}\s+(.+?)\s*#*\s*$", riga_)):
                titoli.append(m.group(1))
        d["titoli"] = titoli
    elif tipo == "html":
        h = _Html()
        h.feed(t)
        e["_spec"] = h.d["script"] + h.d["link"]
        # senza query string: negli URL ci finiscono chiavi API (es. ?key=...)
        d.update({k: unici(re.split(r"[?#]", x)[0] for x in v) for k, v in h.d.items() if v})
    elif tipo == "css":
        estrai_css(t, e)
    e["dettagli"] = {k: v for k, v in d.items() if v}


# ---------------------------------------------------------------- risoluzione import

def trova(base, nodi):
    if base.startswith(".."):
        return None
    pre = base + "/" if base else ""
    for c in [base] + [base + x for x in EST_JS] + [pre + "index" + x for x in EST_JS]:
        if c in nodi:
            return c
    stem, ext = posixpath.splitext(base)
    if ext in (".js", ".jsx", ".mjs", ".cjs"):  # import './x.js' che punta a x.ts (ESM in TypeScript)
        return next((stem + x for x in (".ts", ".tsx", ".mts", ".cts") if stem + x in nodi), None)
    return None


def risolvi_js(spec, da, nodi, tscfg):
    """(file risolto o None, interno?). Interno = relativo o alias: non è un pacchetto esterno."""
    spec = re.split(r"[?#]", spec)[0]
    if spec.startswith("."):
        return trova(norm(posixpath.join(posixpath.dirname(da), spec)), nodi), True
    if spec.startswith("/"):
        return trova(norm(spec.lstrip("/")), nodi), True
    d = posixpath.dirname(da)
    while True:  # tsconfig/jsconfig più vicino; shortcut: `extends` non seguito, basta se i paths sono nel file vicino
        if d in tscfg:
            base, schemi = tscfg[d]
            for pre, suf, stella_, mete in schemi:
                if (spec.startswith(pre) and spec.endswith(suf) and len(spec) >= len(pre) + len(suf)
                        if stella_ else spec == pre):
                    stella = spec[len(pre):len(spec) - len(suf)]
                    for m in mete:
                        if r := trova(norm(posixpath.join(base, m.replace("*", stella, 1))), nodi):
                            return r, True
                    return None, True
            if r := trova(norm(posixpath.join(base, spec)), nodi):
                return r, True
            break
        if not d:
            break
        d = posixpath.dirname(d)
    return None, False


def modulo_py(mod, radici, nodi):
    rel = mod.replace(".", "/")
    for r in radici:
        b = posixpath.join(r, rel) if r else rel
        for c in (b + ".py", b + "/__init__.py"):
            if c in nodi:
                return c
    return None


def risolvi_py(spec, da, nodi, radici):
    tipo, mod, nomi = spec
    if mod.startswith("."):
        base = posixpath.dirname(da)
        for _ in range(len(mod) - len(mod.lstrip(".")) - 1):
            base = posixpath.dirname(base)
        resto, radici = mod.lstrip("."), [base]
        if not resto:
            trovati = [modulo_py(n, radici, nodi) for n in nomi]
            return [t or modulo_py("__init__", radici, nodi) for t in trovati], []
        mod = resto
    else:
        radici = radici + [posixpath.dirname(da)]  # chi lancia uno script ha la sua cartella in sys.path
    if tipo == "import":
        r = modulo_py(mod, radici, nodi)
        return [r], ([] if r or mod.split(".")[0] in sys.stdlib_module_names else [mod.split(".")[0]])
    trovati = [modulo_py(f"{mod}.{n}", radici, nodi) or modulo_py(mod, radici, nodi) for n in nomi or [""]]
    if not any(trovati) and mod.split(".")[0] not in sys.stdlib_module_names | {"__future__"}:
        return [], [mod.split(".")[0]]
    return trovati, []


def risolvi_css(spec, da, nodi):
    if re.match(r"([a-z]+:|//|~)", spec, re.I):
        return None
    base = norm(posixpath.join(posixpath.dirname(da), spec))
    d, n = posixpath.split(base)
    pre = d + "/" if d else ""
    for c in (base, base + ".scss", base + ".css", f"{pre}_{n}.scss", f"{pre}_{n}", base + "/_index.scss",
              base + "/index.scss"):
        if c in nodi:
            return c
    return None


def risolvi_html(spec, da, nodi):
    if re.match(r"([a-z]+:|//|#)", spec, re.I):
        return None
    spec = re.split(r"[?#]", spec)[0]
    if spec.startswith("/"):
        cand = [spec.lstrip("/"), "public/" + spec.lstrip("/")]
    else:
        cand = [norm(posixpath.join(posixpath.dirname(da), spec))]
    return next((c for c in cand if c in nodi), None)


def risolvi_php(spec, da, nodi, php):
    tipo, nome = spec
    if tipo == "inc":
        cand = [norm(posixpath.join(posixpath.dirname(da), nome.lstrip("/"))), norm(nome.lstrip("/"))]
        return next((c for c in cand if c in nodi), None)
    suff = "/".join(nome.strip("\\").split("\\")[-2:]) + ".php"  # shortcut: niente PSR-4 da composer.json
    return next((q for q in php if q == suff or q.endswith("/" + suff)), None)


def collega(voci):
    nodi = set(voci)
    tscfg = {}
    for p in sorted(voci):
        if "_ts" in voci[p] and posixpath.basename(p) in ("jsconfig.json", "tsconfig.json"):
            d = posixpath.dirname(p)
            base_url, paths = voci[p]["_ts"]
            base = norm(posixpath.join(d, base_url)) if base_url else d
            schemi = [(*k.partition("*")[::2], "*" in k, [m for m in v if isinstance(m, str)])
                      for k, v in paths.items() if isinstance(v, list)]
            tscfg[d] = (base, sorted(schemi, key=lambda s: (-len(s[0]), s[0])))
    pkg = {posixpath.dirname(p) for p in nodi if posixpath.basename(p) == "__init__.py"}
    radici = sorted({""} | {posixpath.dirname(d) for d in pkg if posixpath.dirname(d) not in pkg}
                    | ({"src"} if any(p.startswith("src/") for p in nodi) else set()), key=lambda r: (r != "", r))
    php = sorted(p for p in nodi if p.endswith(".php"))
    for p in sorted(voci):
        e = voci[p]
        ext = posixpath.splitext(p.lower())[1]
        risolti, esterni = set(), set()
        for spec in e["_spec"]:
            if e["tipo"] == "css":
                risolti.add(risolvi_css(spec, p, nodi))
            elif e["tipo"] == "html":
                risolti.add(risolvi_html(spec, p, nodi))
            elif ext == ".py":
                r, x = risolvi_py(spec, p, nodi, radici)
                risolti.update(r)
                esterni.update(x)
            elif ext == ".php":
                risolti.add(risolvi_php(spec, p, nodi, php))
            else:
                r, interno = risolvi_js(spec, p, nodi, tscfg)
                risolti.add(r)
                if not interno:
                    esterni.add("/".join(spec.split("/")[:2 if spec.startswith("@") else 1]))
        e["import"] = sorted(risolti - {None, p})
        e["esterni"] = sorted(esterni)
    for p in sorted(voci):
        for q in voci[p]["import"]:
            voci[q]["usato_da"].append(p)


def pagerank(voci, d=0.85, giri=60):
    nodi = sorted(voci)
    n = len(nodi)
    if not n:
        return
    idx = {p: i for i, p in enumerate(nodi)}
    uscite = [[idx[q] for q in voci[p]["import"]] for p in nodi]
    r = [1.0 / n] * n
    for _ in range(giri):
        pendenti = sum(r[i] for i in range(n) if not uscite[i])
        nuovo = [(1 - d) / n + d * pendenti / n] * n
        for i, us in enumerate(uscite):
            for j in us:
                nuovo[j] += d * r[i] / len(us)
        r = nuovo
    for p, v in zip(nodi, r):
        voci[p]["punteggio"] = round(v, 6)


# ---------------------------------------------------------------- ruolo

def ruolo(e):
    parti = e["file"].split("/")
    nome, low = parti[-1], parti[-1].lower()
    cartelle, base, t = {x.lower() for x in parti[:-1]}, parti[-1].lower().split(".")[0], e["tipo"]
    if t == "markdown":
        return "documentazione"
    if t == "env":
        return "variabili d'ambiente"
    if t in ("package", "tsconfig", "yaml", "toml", "requirements") or RE_CONFIG_JS.search(low) or "config" in cartelle:
        return "config"
    if re.search(r"(^|[._-])(test|spec)s?([._-]|$)", low) or cartelle & {"test", "tests", "__tests__", "spec", "e2e"}:
        return "test"
    if (base == "route" and "app" in cartelle) or ("api" in cartelle and "pages" in cartelle):
        return "API"
    if base == "_app":
        return "shell app"
    if base == "_document":
        return "documento HTML"
    if "pages" in cartelle or "routes" in cartelle or ("app" in cartelle and base == "page"):
        return "pagina"
    if "app" in cartelle and base in ("layout", "template"):
        return "layout"
    if base == "actions" and "app" in cartelle:
        return "azioni server"
    if base == "middleware":
        return "middleware"
    if cartelle & {"types", "typings"} or re.search(r"(^|[-_])types?$", base) or low.endswith(".d.ts"):
        return "tipi"
    if re.match(r"use[A-Z]", nome) or cartelle & {"hooks", "composables"}:
        return "hook"
    if cartelle & {"components", "component", "ui", "widgets"}:
        return "componente"
    if cartelle & {"store", "stores", "context", "contexts", "state"}:
        return "stato"
    if cartelle & {"db", "database", "models", "model", "schema", "schemas", "prisma", "migrations", "entities"}:
        return "dati"
    if cartelle & {"api", "services", "service", "server", "backend"}:
        return "servizio"
    if cartelle & {"lib", "libs", "utils", "util", "helpers", "common", "shared"}:
        return "utilità"
    if cartelle & {"scripts", "bin", "tools", "cli"}:
        return "script"
    if t == "css":
        return "stile"
    if t == "html":
        return "pagina HTML"
    if nome == "__init__.py":
        return "pacchetto"
    if e["_main"] or base in ("main", "cli", "__main__", "app", "server", "index"):
        return "entrypoint"
    if any(s["tipo"] == "componente" for s in e["simboli"]):
        return "componente"
    return ""


# ---------------------------------------------------------------- analisi

def analizza(root, out_rel):
    voci, asset = {}, {}
    for p in elenca(root):
        if escluso(p, out_rel):
            continue
        percorso = os.path.join(root, p)
        try:
            st = os.lstat(percorso)
        except OSError:
            continue
        if not stat.S_ISREG(st.st_mode):  # symlink, submodule: mai seguiti
            continue
        tipo = tipo_file(p)
        if tipo == "asset":  # mai aperti: solo conteggio e peso
            n, b = asset.get(area(p), (0, 0))
            asset[area(p)] = (n + 1, b + st.st_size)
            continue
        if st.st_size > MAX_BYTE:
            continue
        e = {"file": p, "area": area(p), "ruolo": "", "tipo": tipo, "punteggio": 0.0, "simboli": [], "import": [],
             "esterni": [], "usato_da": [], "dettagli": {}, "_spec": [], "_main": False}
        if tipo != "altro":
            try:
                with open(percorso, "rb") as f:
                    estrai(e, f.read())
            except Exception as exc:  # un file strano non deve fermare la mappa (né l'hook post-commit)
                print(f"struttura.py: {p}: {type(exc).__name__}, file letto senza dettagli", file=sys.stderr)
                e.update(simboli=[], dettagli={}, _spec=[])
        voci[p] = e
    collega(voci)
    pagerank(voci)
    for e in voci.values():
        e["ruolo"] = ruolo(e)
    return voci, asset


def ordine(voci):
    return sorted(voci.values(), key=lambda e: (-e["punteggio"], PRIORITA[e["tipo"]], e["file"]))


def manifesto(e):
    """package.json, tsconfig, pyproject… nella radice: nessuno li importa ma dicono molto del progetto."""
    return e["area"] == RADICE and (PRIORITA[e["tipo"]] == 0 or RE_CONFIG_JS.search(e["file"].lower()))


# ---------------------------------------------------------------- resa markdown

def lista(xs, n):
    xs = [x if len(x) <= MAX_VOCE else x[:MAX_VOCE - 1] + "…" for x in xs]
    return ", ".join(xs[:n]) + (f" +{len(xs) - n}" if len(xs) > n else "")


def fmt_simbolo(s):
    return {"funzione": f"{s['nome']}()", "componente": f"<{s['nome']}>"}.get(s["tipo"], s["nome"]) + f":{s['riga']}"


def riga(e):
    # prima l'API pubblica (funzioni, componenti, classi), poi tipi e costanti, per ultimi gli interni
    simboli = sorted(e["simboli"], key=lambda s: (not s["esportato"], s["tipo"] in ("tipo", "costante"), s["riga"]))
    parti = [lista([fmt_simbolo(s) for s in simboli], MAX_SIMBOLI)] if simboli else []
    parti += [f"{k}: {lista(v, MAX_LISTA)}" for k, v in e["dettagli"].items()]
    u = e["usato_da"]  # oltre MAX_USATO basta il conteggio: l'elenco completo è in --json
    if u:
        parti.append(f"usato da: {', '.join(u)}" if len(u) <= MAX_USATO else f"usato da {len(u)} file")
    testa = f"- `{e['file']}`" + (f" ({e['ruolo']})" if e["ruolo"] else "")
    return testa + (" → " + " · ".join(parti) if parti else "")


def peso(b):
    return f"{b / 1048576:.1f} MB" if b >= 1048576 else f"{b / 1024:.0f} KB"


def chiave_area(a):
    return (a != RADICE, a)


def componi(scelte, omessi, asset, budget):
    corpo, per_area = [NOTA], {}
    for e in scelte:
        per_area.setdefault(e["area"], []).append(e)
    for a in sorted(per_area, key=chiave_area):
        corpo += ["", "### " + a] + [riga(e) for e in sorted(per_area[a], key=lambda e: e["file"])]
    if omessi:
        corpo += ["", f"_+{omessi} file non mostrati (budget {budget} token)._"]
    if asset:
        top = sorted(asset.items(), key=lambda kv: (-kv[1][1], kv[0]))[:MAX_ASSET]
        corpo += ["", "### " + ASSET] + [f"- `{a}` → {n} file, {peso(b)}" for a, (n, b) in sorted(top)]
        if len(asset) > len(top):
            corpo.append(f"- … altre {len(asset) - len(top)} cartelle")
    return corpo


def blocco(corpo):
    return "\n".join([START, *corpo, END])


def genera(voci, asset, budget):
    """I file più centrali finché il blocco sta nel budget (1 token ≈ 4 caratteri); resa per area e percorso."""
    tutti, scelte = ordine(voci), []

    def sta(e, limite):
        return len(blocco(componi(scelte + [e], len(tutti) - len(scelte) - 1, asset, budget))) <= limite

    for e in tutti:  # prima i manifest della radice, ma al massimo in un quarto del budget
        if manifesto(e) and sta(e, budget):
            scelte.append(e)
    for e in tutti:
        if e in scelte:
            continue
        if not sta(e, budget * 4):
            break
        scelte.append(e)
    return componi(scelte, len(tutti) - len(scelte), asset, budget)


# ---------------------------------------------------------------- --solo

def percorso_riga(r):
    return r[3:r.index("`", 3)] if r.startswith("- `") and "`" in r[3:] else None


def indice_riga(corpo, p):
    return next((i for i, r in enumerate(corpo) if percorso_riga(r) == p), None)


def rimuovi(corpo, i):
    del corpo[i]
    h = i - 1
    if corpo[h].startswith("### ") and (h + 1 >= len(corpo) or not corpo[h + 1].startswith("- `")):
        del corpo[h]
        if h < len(corpo) and corpo[h] == "":
            del corpo[h]
        elif corpo[h - 1] == "":
            del corpo[h - 1]


def inserisci(corpo, e):
    testa = "### " + e["area"]
    if testa in corpo:
        j = corpo.index(testa) + 1
        while j < len(corpo) and (q := percorso_riga(corpo[j])) is not None and q < e["file"]:
            j += 1
        corpo.insert(j, riga(e))
        return
    for k, r in enumerate(corpo):
        if r.startswith("_+") or r == "### " + ASSET or (
                r.startswith("### ") and chiave_area(r[4:]) > chiave_area(e["area"])):
            corpo[k:k] = [testa, riga(e), ""]
            return
    corpo += ["", testa, riga(e)]


def applica_solo(corpo, voci, solo, budget):
    """Aggiorna, toglie o aggiunge solo le righe dei file indicati; tutto il resto resta com'è."""
    for p in solo:
        e, i = voci.get(p), indice_riga(corpo, p)
        if e is None:
            if i is not None:
                rimuovi(corpo, i)
        elif i is not None:
            corpo[i] = riga(e)
        else:
            prova = list(corpo)
            inserisci(prova, e)
            if len(blocco(prova)) <= budget * 4:
                corpo[:] = prova
            else:
                print(f"struttura.py: {p} non aggiunto, il blocco supererebbe il budget", file=sys.stderr)
    return corpo


# ---------------------------------------------------------------- main

def marcatori(t, out):
    if t is None or (START not in t and END not in t):
        return None
    s, f = t.find(START), t.find(END)
    if s == -1 or f == -1 or f < s or t.count(START) > 1 or t.count(END) > 1:
        sys.exit(f"struttura.py: marcatori STRUTTURA in {out} incompleti o duplicati: correggili a mano, il file non è stato toccato.")
    return s, f


def scrivi(path, t):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    modo = stat.S_IMODE(os.stat(path).st_mode) if os.path.exists(path) else 0o644
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".struttura-")
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
        f.write(t)
    os.chmod(tmp, modo)
    os.replace(tmp, path)


def pubblica(e):
    return {k: v for k, v in e.items() if not k.startswith("_")}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Mappa strutturale deterministica per docs/mappa/struttura.md (0 token).")
    ap.add_argument("--root", default=".", help="cartella del repo git (default: .)")
    ap.add_argument("--output", default="docs/mappa/struttura.md", help="file da aggiornare, relativo alla radice del repo")
    ap.add_argument("--budget", type=int, default=2500, help="token massimi del blocco (1 token ≈ 4 caratteri)")
    ap.add_argument("--solo", nargs="+", metavar="FILE", help="aggiorna solo le righe di questi file")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--json", action="store_true", help="stampa i dati completi in JSON, senza scrivere")
    g.add_argument("--stampa", action="store_true", help="stampa il blocco, senza scrivere")
    a = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")

    git = subprocess.run(["git", "-C", a.root, "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    if git.returncode != 0:
        sys.exit(f"struttura.py: {a.root} non è dentro un repository git (l'elenco dei file viene da `git ls-files`).")
    root = git.stdout.strip()
    out = a.output if os.path.isabs(a.output) else os.path.join(root, a.output)
    out_rel = os.path.relpath(out, root).replace(os.sep, "/")
    solo = sorted({norm((os.path.relpath(os.path.realpath(f), root) if os.path.isabs(f) else f).replace(os.sep, "/"))
                   for f in a.solo}) if a.solo else None

    voci, asset = analizza(root, out_rel)

    if a.json:
        print(json.dumps({"versione": 1,
                          "file": [pubblica(e) for e in ordine(voci) if not solo or e["file"] in solo],
                          "asset": [{"cartella": k, "file": n, "byte": b} for k, (n, b) in sorted(asset.items())]},
                         ensure_ascii=False, indent=1))
        return

    t = None
    if os.path.exists(out):
        with open(out, encoding="utf-8", newline="") as f:
            t = f.read()
    pos = marcatori(t, out)
    corpo = t[pos[0] + len(START):pos[1]].strip("\n").split("\n") if pos else []
    if solo and any(r.startswith("### ") for r in corpo):
        corpo = applica_solo(corpo, voci, solo, a.budget)
    else:  # niente blocco da ritoccare: si genera tutto
        corpo = genera(voci, asset, a.budget)
    nuovo_blocco = blocco(corpo)
    if a.stampa:
        print(nuovo_blocco)
        return
    if t is None:
        nuovo = nuovo_blocco + "\n"
    elif pos is None:
        nuovo = t + ("\n" if t and not t.endswith("\n") else "") + ("\n" if t else "") + nuovo_blocco + "\n"
    else:
        nuovo = t[:pos[0]] + nuovo_blocco + t[pos[1] + len(END):]
    if nuovo != t:
        scrivi(out, nuovo)
    print(f"struttura.py: {out_rel} {'aggiornato' if nuovo != t else 'invariato'} "
          f"({len(nuovo_blocco) // 4}/{a.budget} token)", file=sys.stderr)


if __name__ == "__main__":
    main()
