# /// script
# requires-python = ">=3.12,<3.15"
# dependencies = []
# ///
"""Test di scripts/struttura.py su tre repo git fixture (Next.js JS, TypeScript, Python).

    uv run --script tests/test_struttura.py
"""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "struttura.py"
SENTINELLA = "SENTINELLA_SEGRETA_123"
START, END = "<!-- STRUTTURA:AUTO-START -->", "<!-- STRUTTURA:AUTO-END -->"
GIT = ["git", "-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false",
       "-c", "core.hooksPath=/dev/null", "-c", "init.defaultBranch=main"]
SEGRETO = f"API_KEY={SENTINELLA}\n"

FIXTURE = {
    "next_js": {
        "package.json": json.dumps({"name": "negozio", "scripts": {"dev": "next dev", "build": "next build"},
                                    "dependencies": {"next": "14", "react": "18"},
                                    "devDependencies": {"eslint": "8"}}, indent=2),
        "next.config.js": ("const withPWA = require('next-pwa')\n"
                           "const nextConfig = { reactStrictMode: true, images: { domains: ['x.it'] },\n"
                           f"  plugins: [{{ name: 'p', key: '{SENTINELLA}' }}] }}\n"
                           "module.exports = withPWA(nextConfig)\n"),
        "pages/index.jsx": ("import Header from '../components/Header'\n"
                            "import { getArticoli } from '../lib/api'\n\n"
                            "export default function Home() {\n  return <main><Header /></main>\n}\n\n"
                            "export async function getStaticProps() {\n"
                            "  return { props: { articoli: await getArticoli() } }\n}\n"),
        "pages/_app.js": ("import '../styles/globals.css'\n"
                          "export default function App({ Component, pageProps }) {\n"
                          "  return <Component {...pageProps} />\n}\n"),
        "pages/api/articoli.js": ("const { getArticoli } = require('../../lib/api')\n"
                                  "module.exports = async function handler(req, res) { res.json(await getArticoli()) }\n"),
        "components/Header.jsx": ("import { formatta } from '../lib/api'\n"
                                  "export default function Header() {\n  return <header>{formatta('x')}</header>\n}\n"),
        "components/Widget.vue": ("<template><div /></template>\n<script setup lang=\"ts\">\n"
                                  "import { formatta } from '../lib/api'\nconst conta = (n: number) => n + 1\n</script>\n"),
        "lib/api.js": "export async function getArticoli() {\n  return []\n}\n\nexport const formatta = (s) => s.trim()\n",
        "legacy/modulo.php": "<?php\nrequire_once __DIR__ . '/aiuto.php';\nfunction invia() {}\nclass Modulo {}\n",
        "legacy/aiuto.php": "<?php\nfunction aiuta() {}\n",
        "styles/globals.css": ("@import './tema.css';\n:root { --colore-primario: #c00; }\n"
                               ".btn-primario { color: red }\n.btn-secondario {}\n.card__titolo {}\n"),
        "styles/tema.css": ".tema {}\n",
        "static/demo.html": ('<html><head><link rel="stylesheet" href="../styles/tema.css">'
                             f'<script src="https://cdn.example.com/x.js?key={SENTINELLA}"></script></head>'
                             '<body><main id="contenuto"><form action="/api/articoli"></form></main></body></html>\n'),
        "README.md": "# Negozio\n\n## Avvio\n\n```bash\n# non è un titolo\n```\n\n### Dettaglio\n",
        "public/logo.png": b"\x89PNG\r\n\x1a\n" + bytes(2000),
        # segreti e file da non aprire mai
        ".env": SEGRETO,
        ".env.local": SEGRETO,
        ".env.production": SEGRETO,
        "config/.env": SEGRETO,
        ".env.example": f"API_KEY={SENTINELLA}\nexport DATABASE_URL=\n",
        "certs/server.pem": SEGRETO,
        "certs/server.key": SEGRETO,
        "package-lock.json": json.dumps({"segreto": SENTINELLA}),
        "lib/enorme.js": f"export function {SENTINELLA}() {{}}\n" + "// x\n" * 300_000,
    },
    "typescript": {
        "package.json": json.dumps({"name": "ts", "dependencies": {"next": "14"}}),
        "tsconfig.json": ('{\n  // commento JSONC\n  "compilerOptions": {\n    "baseUrl": ".",\n'
                          '    "paths": { "@/*": ["./src/*"] },\n  },\n  "include": ["src"],\n}\n'),
        "src/app/page.tsx": ("import Card from '@/components/Card'\nimport type { Articolo } from '@/types'\n\n"
                             "export default function Page() {\n  return <Card />\n}\n"),
        "src/app/layout.tsx": "export default function RootLayout({ children }: { children: any }) {\n  return <html>{children}</html>\n}\n",
        "src/components/Card.tsx": "import { openDb } from '../lib/db'\n\nexport default function Card() {\n  return <div />\n}\n",
        "src/lib/db.ts": ("export function openDb() {\n  return 1\n}\n\nexport interface Riga { id: number }\n\n"
                          "export const upsertArticoli = async () => {}\n"),
        "src/types.ts": "export type Articolo = { codice: string }\n",
        ".env": SEGRETO,
    },
    "python": {
        "pyproject.toml": ('[project]\nname = "mypkg"\ndependencies = ["requests>=2", "rich"]\n\n'
                           '[project.scripts]\nmypkg = "mypkg.cli:main"\n\n[tool.ruff]\nline-length = 100\n'),
        "requirements.txt": "requests==2.31\n# commento\nrich\n",
        "mypkg/__init__.py": "from .core import run\n",
        "mypkg/core.py": ("import os\nfrom .utils import helper\n\n\nclass Motore:\n    def avvia(self):\n"
                          "        pass\n\n\ndef run():\n    return helper()\n"),
        "mypkg/utils.py": "def helper():\n    return 1\n",
        "mypkg/cli.py": ("import requests\nimport mypkg.utils\nfrom mypkg.core import run\n\n\ndef main():\n"
                         "    run()\n\n\nif __name__ == '__main__':\n    main()\n"),
        "tests/test_core.py": "from mypkg.core import run\n\n\ndef test_run():\n    assert run() == 1\n",
        ".env": SEGRETO,
    },
}


def git(d, *args):
    return subprocess.run(GIT + ["-C", str(d), *args], check=True, capture_output=True, text=True).stdout


def crea_repo(base, nome, files):
    d = Path(base) / nome
    for rel, contenuto in files.items():
        p = d / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(contenuto if isinstance(contenuto, bytes) else contenuto.encode())
    git(base, "init", "-q", nome)
    git(d, "add", "-A", "-f", ".")  # -f: anche se un gitignore globale esclude .env
    git(d, "commit", "-qm", "fixture")
    return d


def lancia(root, *args, check=True):
    r = subprocess.run(["uv", "run", "--quiet", "--script", str(SCRIPT), "--root", str(root), *args],
                       capture_output=True, text=True)
    if check and r.returncode:
        raise AssertionError(f"struttura.py {args} → {r.returncode}\n{r.stderr}")
    return r


def voci(repo):
    return {e["file"]: e for e in json.loads(lancia(repo, "--json").stdout)["file"]}


class TestStruttura(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="struttura-test-")
        cls.repos = {n: crea_repo(cls.tmp, n, f) for n, f in FIXTURE.items()}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def copia(self, nome):
        dest = Path(tempfile.mkdtemp(dir=self.tmp)) / nome
        shutil.copytree(self.repos[nome], dest)
        return dest

    def test_1_deterministico(self):
        for nome, repo in self.repos.items():
            with self.subTest(nome):
                stampa = lancia(repo, "--stampa").stdout
                self.assertIn(START, stampa)
                self.assertEqual(stampa, lancia(repo, "--stampa").stdout)
                self.assertEqual(lancia(repo, "--json").stdout, lancia(repo, "--json").stdout)
                # un clone altrove (altri mtime, altro percorso) dà lo stesso blocco
                clone = Path(self.tmp) / f"clone-{nome}"
                subprocess.run(GIT + ["clone", "-q", str(repo), str(clone)], check=True)
                self.assertEqual(lancia(clone, "--stampa").stdout, stampa)
                lancia(clone)
                scritto = (clone / "docs" / "mappa" / "struttura.md").read_bytes()
                self.assertEqual(scritto.decode(), stampa)  # file nuovo = solo il blocco
                lancia(clone)
                self.assertEqual((clone / "docs" / "mappa" / "struttura.md").read_bytes(), scritto)

    def test_2_segreti_mai_in_uscita(self):
        for nome, repo in self.repos.items():
            with self.subTest(nome):
                self.assertIn(".env", git(repo, "ls-files").split("\n"))  # il test ha senso solo se .env è tracciato
                copia = self.copia(nome)
                rs = [lancia(repo, "--stampa"), lancia(repo, "--json"), lancia(repo, "--json", "--solo", ".env"),
                      lancia(copia), lancia(copia, "--solo", ".env", ".env.local", "lib/enorme.js")]
                uscite = [x for r in rs for x in (r.stdout, r.stderr)]
                uscite.append((copia / "docs" / "mappa" / "struttura.md").read_text(encoding="utf-8"))
                for u in uscite:
                    self.assertNotIn(SENTINELLA, u)
                self.assertNotIn("`.env`", uscite[0])
        esempio = voci(self.repos["next_js"])[".env.example"]
        self.assertEqual(esempio["dettagli"], {"variabili": ["API_KEY", "DATABASE_URL"]})

    def test_3_testo_fuori_dai_marcatori_intatto(self):
        repo = self.copia("next_js")
        mappa = repo / "docs" / "mappa" / "struttura.md"
        mappa.parent.mkdir(parents=True)
        prima = "# Mappa\n\nTesto scritto a mano, con `codice` e accenti: perché è così.\n\n".encode()
        dopo = "\n\n## Note\nAltro testo umano\r\ncon CRLF e niente a capo finale".encode()
        mappa.write_bytes(prima + f"{START}\nvecchio contenuto\n{END}".encode() + dopo)
        lancia(repo)
        nuovo = mappa.read_bytes()
        self.assertTrue(nuovo.startswith(prima))
        self.assertTrue(nuovo.endswith(dopo))
        self.assertNotIn(b"vecchio contenuto", nuovo)
        self.assertIn(b"- `lib/api.js`", nuovo)
        lancia(repo)
        self.assertEqual(mappa.read_bytes(), nuovo)

        # marcatori assenti: blocco aggiunto in fondo, testo esistente invariato
        mappa.write_bytes("Solo testo umano, senza a capo".encode())
        lancia(repo)
        nuovo = mappa.read_bytes()
        self.assertTrue(nuovo.startswith("Solo testo umano, senza a capo\n".encode()))
        self.assertEqual(nuovo.count(START.encode()), 1)

        # marcatori incompleti: errore, file non toccato
        rotto = f"testo\n{START}\nmezzo blocco\n".encode()
        mappa.write_bytes(rotto)
        r = lancia(repo, check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(mappa.read_bytes(), rotto)

    def test_4_solo_aggiorna_solo_quel_file(self):
        repo = self.copia("next_js")
        lancia(repo)
        mappa = repo / "docs" / "mappa" / "struttura.md"
        prima = mappa.read_text(encoding="utf-8").split("\n")
        api, header = repo / "lib" / "api.js", repo / "components" / "Header.jsx"
        api.write_text(api.read_text() + "\nexport function nuovaFunzione() {}\n")
        header.write_text(header.read_text() + "\nexport function Extra() {}\n")
        lancia(repo, "--solo", "lib/api.js")
        dopo = mappa.read_text(encoding="utf-8").split("\n")
        self.assertEqual(len(prima), len(dopo))
        diverse = [(a, b) for a, b in zip(prima, dopo) if a != b]
        self.assertEqual(len(diverse), 1)
        self.assertTrue(diverse[0][1].startswith("- `lib/api.js`"))
        self.assertIn("nuovaFunzione():7", diverse[0][1])
        self.assertNotIn("Extra()", "\n".join(dopo))  # Header è cambiato ma non era in --solo

        # file nuovo: compare solo la sua riga, nella sua area
        (repo / "lib" / "nuovo.js").write_text("export function fresco() {}\n")
        git(repo, "add", "lib/nuovo.js")
        lancia(repo, "--solo", str(repo / "lib" / "nuovo.js"))  # anche con percorso assoluto
        con_nuovo = mappa.read_text(encoding="utf-8").split("\n")
        self.assertIn("- `lib/nuovo.js` (utilità) → fresco():1", con_nuovo)
        self.assertEqual([r for r in con_nuovo if "lib/nuovo.js" not in r], dopo)

        # file tolto da git: sparisce solo la sua riga
        git(repo, "rm", "-q", "--cached", "lib/nuovo.js")
        lancia(repo, "--solo", "lib/nuovo.js")
        self.assertEqual(mappa.read_text(encoding="utf-8").split("\n"), dopo)

    def test_5_budget_rispettato(self):
        for nome, repo in self.repos.items():
            for budget in (2500, 120):
                with self.subTest(nome, budget=budget):
                    blocco = lancia(repo, "--stampa", "--budget", str(budget)).stdout.rstrip("\n")
                    self.assertLessEqual(len(blocco), budget * 4)
                    self.assertTrue(blocco.startswith(START) and blocco.endswith(END))
                    self.assertEqual("file non mostrati" in blocco, budget == 120)
        piccolo = lancia(self.repos["next_js"], "--stampa", "--budget", "120").stdout
        self.assertIn("- `lib/api.js`", piccolo)  # il più centrale resta
        self.assertNotIn("README.md", piccolo)

    def test_grafo_e_estrazione(self):
        js = voci(self.repos["next_js"])
        self.assertEqual(next(iter(js)), "lib/api.js")
        self.assertEqual(js["lib/api.js"]["usato_da"],
                         ["components/Header.jsx", "components/Widget.vue", "pages/api/articoli.js", "pages/index.jsx"])
        self.assertEqual([(s["nome"], s["tipo"], s["riga"]) for s in js["pages/index.jsx"]["simboli"]],
                         [("Home", "componente", 4), ("getStaticProps", "funzione", 8)])
        self.assertEqual(js["pages/index.jsx"]["ruolo"], "pagina")
        self.assertEqual(js["pages/api/articoli.js"]["ruolo"], "API")
        self.assertEqual(js["pages/api/articoli.js"]["simboli"][0]["nome"], "handler")
        self.assertEqual(js["next.config.js"]["dettagli"],
                         {"chiavi": ["reactStrictMode", "images", "plugins"], "plugin": ["withPWA"]})
        self.assertEqual(js["static/demo.html"]["dettagli"]["script"], ["https://cdn.example.com/x.js"])
        self.assertEqual(js["next.config.js"]["esterni"], ["next-pwa"])
        self.assertEqual(js["package.json"]["dettagli"],
                         {"script": ["dev", "build"], "dip": ["next", "react"], "dev": ["eslint"]})
        self.assertEqual(js["styles/globals.css"]["import"], ["styles/tema.css"])
        self.assertEqual(js["styles/globals.css"]["dettagli"]["var"], ["--colore-primario"])
        self.assertEqual(js["styles/globals.css"]["dettagli"]["prefissi"][0], ".btn (2)")
        self.assertEqual(js["static/demo.html"]["import"], ["styles/tema.css"])
        self.assertEqual(js["static/demo.html"]["dettagli"]["id"], ["contenuto"])
        self.assertEqual(js["legacy/modulo.php"]["import"], ["legacy/aiuto.php"])
        self.assertEqual(js["README.md"]["dettagli"]["titoli"], ["Negozio", "Avvio"])
        self.assertEqual(js["components/Widget.vue"]["simboli"][0]["riga"], 4)
        self.assertNotIn("lib/enorme.js", js)

        t = voci(self.repos["typescript"])
        self.assertEqual(t["src/components/Card.tsx"]["usato_da"], ["src/app/page.tsx"])  # alias @/
        self.assertEqual(t["src/types.ts"]["usato_da"], ["src/app/page.tsx"])
        self.assertEqual(t["src/lib/db.ts"]["usato_da"], ["src/components/Card.tsx"])
        self.assertEqual([(s["nome"], s["riga"]) for s in t["src/lib/db.ts"]["simboli"]],
                         [("openDb", 1), ("Riga", 5), ("upsertArticoli", 7)])
        self.assertEqual(t["tsconfig.json"]["dettagli"]["alias"], ["@/* → ./src/*"])
        self.assertEqual(t["src/app/layout.tsx"]["ruolo"], "layout")

        p = voci(self.repos["python"])
        self.assertEqual(p["mypkg/utils.py"]["usato_da"], ["mypkg/cli.py", "mypkg/core.py"])
        self.assertEqual(p["mypkg/core.py"]["usato_da"], ["mypkg/__init__.py", "mypkg/cli.py", "tests/test_core.py"])
        self.assertEqual(p["mypkg/cli.py"]["esterni"], ["requests"])
        self.assertEqual(p["mypkg/cli.py"]["ruolo"], "entrypoint")
        self.assertEqual([s["nome"] for s in p["mypkg/core.py"]["simboli"]], ["Motore", "run"])
        self.assertEqual(p["pyproject.toml"]["dettagli"],
                         {"chiavi": ["project", "tool.ruff"], "dip": ["requests", "rich"], "script": ["mypkg"]})

    def test_fuori_da_git(self):
        r = lancia(tempfile.mkdtemp(dir=self.tmp), "--stampa", check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("non è dentro un repository git", r.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
