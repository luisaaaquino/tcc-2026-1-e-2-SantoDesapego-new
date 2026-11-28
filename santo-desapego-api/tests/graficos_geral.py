"""Gráficos gerais: junta os testes da API, do front e ponta a ponta.

Antes, gere os gráficos de cada camada (npm run test:relatorio + npm run graficos
na API e no front; npx playwright test + npm run graficos no e2e). Depois, na
raiz do repositório:
    python santo-desapego-api/tests/graficos_geral.py

Lê as planilhas de rastreabilidade e a cobertura que o graficos.py de cada
camada já gerou e salva em docs/graficos-testes-geral (ou na pasta passada
como segundo argumento).
"""
import csv
import json
import re
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402

RAIZ = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2]
SAIDA = Path(sys.argv[2]) if len(sys.argv) > 2 else RAIZ / "docs" / "graficos-testes-geral"
SAIDA.mkdir(parents=True, exist_ok=True)

VERDE = "#2E7D5B"
VERMELHO = "#C0392B"
CINZA = "#9AA5A0"
TEXTO = "#1A1A1A"
CORES_CAMADA = ["#2E7D5B", "#C8743A", "#3A6EA5"]
META = 70

plt.rcParams.update({
    "font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
    "axes.titleweight": "bold", "axes.titlesize": 12, "figure.dpi": 150,
})

CAMADAS = [
    ("Back-end / API", RAIZ / "santo-desapego-api/tests/relatorio", "back-end-api", "Unitário (Jest)"),
    ("Front-end", RAIZ / "santo-desapego/tests/relatorio", "front-end", "Unitário (Vitest)"),
    ("Ponta a ponta", RAIZ / "e2e/relatorio", "ponta-a-ponta", "E2E (Playwright)"),
]


def contar(pasta):
    d = json.loads((pasta / "resultado.json").read_text(encoding="utf-8"))
    return d["numPassedTests"], d["numFailedTests"]


def rastreio(pasta, prefixo):
    arq = pasta / f"graficos-{prefixo}" / f"{prefixo}_rastreabilidade.csv"
    with open(arq, encoding="utf-8-sig") as f:
        return {l["Código"]: l for l in csv.DictReader(f, delimiter=";")}


def cobertura(pasta):
    arq = pasta / "cobertura" / "coverage-summary.json"
    if not arq.exists():
        return None
    return json.loads(arq.read_text(encoding="utf-8"))["total"]


nomes = [c[0] for c in CAMADAS]
contagens = [contar(p) for _, p, _, _ in CAMADAS]
rastros = [rastreio(p, pre) for _, p, pre, _ in CAMADAS]
coberturas = [cobertura(p) for _, p, _, _ in CAMADAS]
aprov_total = sum(a for a, _ in contagens)
reprov_total = sum(r for _, r in contagens)
total = aprov_total + reprov_total


# 1. Resumo de todos os testes
fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 4.6), gridspec_kw={"width_ratios": [1, 1.5]})
a1.pie([aprov_total, reprov_total] if reprov_total else [aprov_total],
       colors=[VERDE, VERMELHO] if reprov_total else [VERDE], startangle=90, counterclock=False,
       wedgeprops={"width": 0.32})
a1.text(0, 0.08, f"{aprov_total}/{total}", ha="center", va="center", fontsize=20, fontweight="bold", color=TEXTO)
a1.text(0, -0.2, "aprovados", ha="center", va="center", fontsize=10, color=TEXTO)
a1.set_title("Todos os casos de teste")
rot = [f"{n}\n{t}" for (n, _, _, t) in CAMADAS]
ap = [a for a, _ in contagens]
rp = [r for _, r in contagens]
a2.bar(rot, ap, color=CORES_CAMADA)
a2.bar(rot, rp, bottom=ap, color=VERMELHO)
for i, (a, r) in enumerate(zip(ap, rp)):
    a2.text(i, a + r + max(ap) * 0.015, f"{a}/{a + r} ({(a + r) / total:.0%} do total)",
            ha="center", fontsize=10, fontweight="bold", color=TEXTO)
a2.set_ylabel("Casos de teste")
a2.set_ylim(0, max(ap) * 1.12)
a2.set_title("Casos de teste por tipo de teste")
fig.suptitle("Resumo geral dos testes do Santo Desapego", fontweight="bold", fontsize=13)
fig.tight_layout()
fig.savefig(SAIDA / "geral_1_resumo_todos_os_testes.png", bbox_inches="tight")
plt.close(fig)


# 2. Requisitos e regras verificados (por tipo e por camada)
codigos = sorted(set().union(*[r.keys() for r in rastros]),
                 key=lambda c: ({"RN": 0, "RF": 1, "RNF": 2}[re.match(r"[A-Z]+", c).group()], int(re.sub(r"\D", "", c))))
nome_de = {}
for r in rastros:
    for c, l in r.items():
        nome_de.setdefault(c, l["Nome"])
tipo_de = lambda c: re.match(r"[A-Z]+", c).group()  # noqa: E731
TIPOS = [("RN", "Regras de negócio"), ("RF", "Requisitos funcionais"), ("RNF", "Requisitos não funcionais")]

fig, ax = plt.subplots(figsize=(10, 4.2))
largura = 0.2
x = range(len(TIPOS))
for j, (nome, *_) in enumerate(CAMADAS):
    vals = [sum(1 for c in rastros[j] if tipo_de(c) == t) for t, _ in TIPOS]
    pos = [i + (j - 1.5) * largura for i in x]
    b = ax.bar(pos, vals, largura, color=CORES_CAMADA[j], label=nome)
    ax.bar_label(b, fontsize=8)
uniao = [sum(1 for c in codigos if tipo_de(c) == t) for t, _ in TIPOS]
b = ax.bar([i + 1.5 * largura for i in x], uniao, largura, color=TEXTO, label="Total (sem repetir)")
ax.bar_label(b, fontsize=8, fontweight="bold")
ax.set_xticks(list(x), [n for _, n in TIPOS])
ax.set_ylabel("Quantidade verificada")
ax.set_title("Regras e requisitos verificados por tipo de teste")
ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=4, frameon=False)
fig.tight_layout()
fig.savefig(SAIDA / "geral_2_requisitos_por_tipo_de_teste.png", bbox_inches="tight")
plt.close(fig)


# 3. Matriz de rastreabilidade: cada regra/requisito x tipo de teste
matriz = [[int(rastros[j][c]["Casos de teste"]) if c in rastros[j] else 0 for j in range(len(CAMADAS))] for c in codigos]
fig, ax = plt.subplots(figsize=(10, 0.3 * len(codigos) + 1.8))
mapa = LinearSegmentedColormap.from_list("v", ["#FFFFFF", "#CFE6DA", VERDE])
lim = sorted(v for l in matriz for v in l)[int(len(codigos) * 3 * 0.9)] or 1
ax.imshow([[min(v, lim) for v in l] for l in matriz], aspect="auto", cmap=mapa, vmin=0, vmax=lim)
for i, l in enumerate(matriz):
    for j, v in enumerate(l):
        ax.text(j, i, str(v) if v else "–", ha="center", va="center", fontsize=8,
                color="white" if v >= lim * 0.7 else (TEXTO if v else CINZA))
ax.set_xticks(range(len(CAMADAS)), [f"{n}\n({sum(1 for c in r)} itens)" for (n, *_), r in zip(CAMADAS, rastros)])
ax.xaxis.tick_top()
ax.set_yticks(range(len(codigos)), [f"{c} – {nome_de[c]}" for c in codigos], fontsize=8)
for s in ax.spines.values():
    s.set_visible(False)
ax.set_xticks([i + 0.5 for i in range(len(CAMADAS) - 1)], minor=True)
ax.set_yticks([i + 0.5 for i in range(len(codigos) - 1)], minor=True)
ax.grid(which="minor", color="#E5E5E5", linewidth=0.6)
ax.tick_params(which="minor", length=0)
ax.set_title("Matriz de rastreabilidade: casos de teste por regra/requisito e tipo de teste", pad=12)
fig.tight_layout()
fig.savefig(SAIDA / "geral_3_matriz_rastreabilidade.png", bbox_inches="tight")
plt.close(fig)


# 4. Cobertura de código (só os testes unitários medem)
com_cob = [(n, c) for (n, *_), c in zip(CAMADAS, coberturas) if c]
metricas = [("Linhas", "lines"), ("Instruções", "statements"), ("Funções", "functions"), ("Desvios", "branches")]
fig, ax = plt.subplots(figsize=(9, 4))
largura = 0.36
for j, (n, c) in enumerate(com_cob):
    vals = [c[k]["pct"] for _, k in metricas]
    b = ax.bar([i + (j - 0.5) * largura for i in range(len(metricas))], vals, largura, color=CORES_CAMADA[j], label=n)
    ax.bar_label(b, labels=[f"{v:.1f}%".replace(".", ",") for v in vals], fontsize=8)
ax.axhline(META, color=VERMELHO, linestyle="--", linewidth=1)
ax.set_xlim(-0.9, len(metricas) - 0.5)
ax.text(-0.88, META + 1.5, f"Meta {META}%", color=VERMELHO, ha="left", fontsize=9, fontweight="bold")
ax.set_xticks(range(len(metricas)), [m for m, _ in metricas])
ax.set_ylim(0, 105)
ax.set_ylabel("Cobertura (%)")
ax.set_title("Cobertura de código dos testes unitários")
ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.1), ncol=2, frameon=False)
fig.tight_layout()
fig.savefig(SAIDA / "geral_4_cobertura_de_codigo.png", bbox_inches="tight")
plt.close(fig)


# Planilha consolidada
with open(SAIDA / "geral_rastreabilidade.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["Código", "Nome", *[f"Casos - {n}" for n in nomes], "Total de casos", "Aprovados", "Situação"])
    for c, l in zip(codigos, matriz):
        aprov = sum(int(rastros[j][c]["Aprovados"]) for j in range(len(CAMADAS)) if c in rastros[j])
        w.writerow([c, nome_de[c], *l, sum(l), aprov, "Atendido" if aprov == sum(l) else "Com falha"])

print(f"Total: {aprov_total}/{total} aprovados")
for n, (a, r) in zip(nomes, contagens):
    print(f"  {n}: {a}/{a + r}")
for (t, nt), u in zip(TIPOS, uniao):
    print(f"  {nt} verificados (sem repetir): {u}")
print("Gráficos em:", SAIDA)
