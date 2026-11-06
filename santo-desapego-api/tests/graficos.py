"""
Gera os gráficos dos testes unitários a partir do relatório do Jest/Vitest.

Uso na API (dentro de santo-desapego-api):
    npm run test:relatorio   # roda os testes e grava o relatório
    npm run graficos         # gera os PNGs em tests/relatorio/graficos

Uso no front (dentro de santo-desapego):
    npm run test:relatorio
    npm run graficos         # usa este mesmo script com --relatorio e --sistema

Para guardar uma cópia no histórico (não é apagada nas próximas execuções):
    python tests/graficos.py --historico 2026-11-06_antes-da-correcao

Cada teste fica dentro de um describe('RNxx - Nome da regra'),
describe('RFxx - Nome do requisito') ou describe('RNFxx - Nome'), e é por
esse prefixo que os resultados são agrupados.
"""
import argparse
import csv
import json
import re
import shutil
from collections import OrderedDict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

# Pasta do relatório (trocada por --relatorio no front)
PASTA = Path(__file__).parent / "relatorio"
SISTEMA = "Back-end / API"
# Prefixo da pasta e de cada arquivo, para nunca confundir front e back
PREFIXO = "back-end-api"
SAIDA = PASTA / f"graficos-{PREFIXO}"


def arquivo_saida(nome):
    """'2_resumo.png' -> 'back-end-api_2_resumo.png' (ou 'front-end_...')."""
    return f"{PREFIXO}_{nome}"
META_COBERTURA = 70  # meta do TCC: "Cobertura de testes ≥ 70%"

VERDE = "#2E7D5B"
VERMELHO = "#C0392B"
CINZA = "#9AA5A0"
TEXTO = "#1A1A1A"

# Tipo de agrupamento: (prefixo, título do gráfico, arquivo, título no resumo, rótulo "ok")
TIPOS = [
    ("RN", "Casos de teste por regra de negócio", "1_testes_por_regra.png", "Regras de negócio", "Atendidas"),
    ("RF", "Casos de teste por requisito funcional", "1b_testes_por_requisito.png", "Requisitos funcionais", "Atendidos"),
    ("RNF", "Casos de teste por requisito não funcional", "1c_testes_por_requisito_nao_funcional.png",
     "Requisitos não funcionais", "Atendidos"),
]

plt.rcParams.update({
    "font.size": 10,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.titleweight": "bold",
    "axes.titlesize": 12,
    "figure.dpi": 150,
})


def carregar_resultados():
    """Devolve ({'RN': {...}, 'RF': {...}, 'RNF': {...}}, dados_do_relatorio)."""
    dados = json.loads((PASTA / "resultado.json").read_text(encoding="utf-8"))
    grupos = {tipo: {} for tipo, *_ in TIPOS}
    for arquivo in dados["testResults"]:
        for t in arquivo["assertionResults"]:
            # RNF antes de RN, senão "RNF12" seria lido como "RN" + "F12"
            m = re.match(r"((RNF|RN|RF)\d+)\s*-\s*(.+)", t["ancestorTitles"][0] if t["ancestorTitles"] else "")
            if not m:
                continue
            codigo, tipo, nome = m.groups()
            r = grupos[tipo].setdefault(codigo, {"nome": nome, "aprovados": 0, "reprovados": 0, "falhas": []})
            if t["status"] == "passed":
                r["aprovados"] += 1
            else:
                r["reprovados"] += 1
                r["falhas"].append(t["title"])
    numero = lambda codigo: int(re.sub(r"\D", "", codigo))  # noqa: E731
    ordenar = lambda g: OrderedDict(sorted(g.items(), key=lambda kv: numero(kv[0])))  # noqa: E731
    return {tipo: ordenar(g) for tipo, g in grupos.items()}, dados


def grafico_por_item(itens, titulo, arquivo):
    if not itens:
        return
    codigos = list(itens)[::-1]  # o primeiro código fica no topo
    aprov = [itens[c]["aprovados"] for c in codigos]
    reprov = [itens[c]["reprovados"] for c in codigos]
    rotulos = [f"{c} – {itens[c]['nome']}" for c in codigos]

    altura = max(0.42 * len(codigos) + 1.6, 3.2)  # gráfico com poucas barras não fica espremido
    fig, ax = plt.subplots(figsize=(10, altura))
    ax.barh(rotulos, aprov, color=VERDE, label="Aprovados")
    ax.barh(rotulos, reprov, left=aprov, color=VERMELHO, label="Reprovados")
    for i, (a, r) in enumerate(zip(aprov, reprov)):
        ax.text(a + r + 0.15, i, f"{a}/{a + r}", va="center", fontsize=9, color=TEXTO)
    ax.set_xlabel("Quantidade de casos de teste")
    ax.set_title(f"{titulo} ({SISTEMA})")
    ax.set_xlim(0, max(a + r for a, r in zip(aprov, reprov)) + 1.5)
    # Legenda abaixo do eixo, para nunca cobrir as barras
    # (0,75 polegada abaixo do eixo, convertido para a fração da altura do eixo)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.75 / (altura - 1.2)), ncol=2, frameon=False)
    fig.tight_layout()
    fig.savefig(SAIDA / arquivo_saida(arquivo), bbox_inches="tight")
    plt.close(fig)


def grafico_resumo(grupos, dados):
    total_ok = dados["numPassedTests"]
    total_falha = dados["numFailedTests"]
    paineis = [([total_ok, total_falha], ["Aprovados", "Reprovados"],
                "Casos de teste", f"{total_ok}/{total_ok + total_falha}")]
    for tipo, _, _, titulo, ok_rotulo in TIPOS:
        itens = grupos[tipo]
        if not itens:
            continue
        ok = sum(1 for r in itens.values() if r["reprovados"] == 0)
        paineis.append(([ok, len(itens) - ok], [ok_rotulo, "Com falha"], titulo, f"{ok}/{len(itens)}"))

    fig, eixos = plt.subplots(1, len(paineis), figsize=(5 * len(paineis), 4.6))
    for ax, (valores, rotulos, titulo, centro) in zip(eixos, paineis):
        fatias = [(v, r, c) for v, r, c in zip(valores, rotulos, [VERDE, VERMELHO]) if v > 0]
        ax.pie([f[0] for f in fatias], labels=[f"{f[1]}\n({f[0]})" for f in fatias],
               colors=[f[2] for f in fatias], startangle=90, counterclock=False,
               wedgeprops={"width": 0.38, "edgecolor": "white"})
        ax.text(0, 0, centro, ha="center", va="center", fontsize=16, fontweight="bold", color=TEXTO)
        ax.set_title(titulo)
    fig.suptitle(f"Resumo dos testes ({SISTEMA})", fontweight="bold")
    fig.tight_layout()
    fig.savefig(SAIDA / arquivo_saida("2_resumo_aprovacao.png"))
    plt.close(fig)


def caminho_curto(caminho):
    """'C:\\...\\santo-desapego-api\\routes\\x.js' -> 'routes/x.js' (vale para API e front)."""
    return re.split(r"[\\/]santo-desapego(?:-api)?[\\/]", caminho)[-1].replace("\\", "/")


def grafico_cobertura():
    resumo = json.loads((PASTA / "cobertura" / "coverage-summary.json").read_text(encoding="utf-8"))
    total = resumo.pop("total")
    arquivos = sorted(((caminho_curto(k), v["lines"]["pct"]) for k, v in resumo.items()), key=lambda kv: kv[1])

    # Cobertura por arquivo
    fig, ax = plt.subplots(figsize=(10, 0.42 * len(arquivos) + 1.6))
    nomes = [a for a, _ in arquivos]
    pcts = [p for _, p in arquivos]
    cores = [VERDE if p >= META_COBERTURA else CINZA for p in pcts]
    ax.barh(nomes, pcts, color=cores)
    ax.axvline(META_COBERTURA, color=VERMELHO, linestyle="--", linewidth=1.4)
    ax.text(META_COBERTURA + 1, len(nomes) - 0.4, f"Meta {META_COBERTURA}%", color=VERMELHO, fontsize=9)
    for i, p in enumerate(pcts):
        ax.text(p + 1, i, f"{p:.1f}%", va="center", fontsize=9, color=TEXTO)
    ax.set_xlim(0, 110)
    ax.set_xlabel("Linhas cobertas pelos testes (%)")
    ax.set_title(f"Cobertura de código por arquivo ({SISTEMA})")
    fig.tight_layout()
    fig.savefig(SAIDA / arquivo_saida("3_cobertura_por_arquivo.png"))
    plt.close(fig)

    # Cobertura geral por métrica
    metricas = [("Linhas", "lines"), ("Instruções", "statements"), ("Funções", "functions"), ("Desvios (if/else)", "branches")]
    fig, ax = plt.subplots(figsize=(8, 4.2))
    valores = [total[k]["pct"] for _, k in metricas]
    ax.bar([n for n, _ in metricas], valores,
           color=[VERDE if v >= META_COBERTURA else CINZA for v in valores], width=0.55)
    ax.axhline(META_COBERTURA, color=VERMELHO, linestyle="--", linewidth=1.4)
    # Rótulo da meta à esquerda, fora das barras
    ax.set_xlim(-0.9, len(metricas) - 0.5)
    ax.text(-0.85, META_COBERTURA + 1.5, f"Meta {META_COBERTURA}%", color=VERMELHO, fontsize=9, ha="left")
    for i, v in enumerate(valores):
        ax.text(i, v + 1.5, f"{v:.1f}%", ha="center", fontsize=10, fontweight="bold", color=TEXTO)
    ax.set_ylim(0, 105)
    ax.set_ylabel("Cobertura (%)")
    ax.set_title(f"Cobertura geral ({SISTEMA})")
    fig.tight_layout()
    fig.savefig(SAIDA / arquivo_saida("4_cobertura_geral.png"))
    plt.close(fig)
    return total


def grafico_axe():
    """Ponta a ponta: violações de acessibilidade do axe por página (pasta <relatorio>/axe)."""
    arquivos = sorted((PASTA / "axe").glob("*.json")) if (PASTA / "axe").exists() else []
    if not arquivos:
        return None
    paginas = [json.loads(a.read_text(encoding="utf-8")) for a in arquivos]
    impactos = [("critical", "Crítico", VERMELHO), ("serious", "Grave", "#E07B39"),
                ("moderate", "Moderado", "#E4B83C"), ("minor", "Leve", CINZA)]
    nomes = [p["pagina"] for p in paginas][::-1]
    fig, ax = plt.subplots(figsize=(10, max(0.42 * len(nomes) + 1.6, 3.2)))
    esquerda = [0] * len(nomes)
    for chave, rotulo, cor in impactos:
        valores = [p["por_impacto"][chave] for p in paginas][::-1]
        ax.barh(nomes, valores, left=esquerda, color=cor, label=rotulo)
        esquerda = [e + v for e, v in zip(esquerda, valores)]
    for i, total in enumerate(esquerda):
        ax.text(total + 0.1, i, "nenhuma" if total == 0 else str(total), va="center", fontsize=9, color=TEXTO)
    ax.set_xlim(0, max(max(esquerda) + 1.5, 3))
    ax.set_xlabel("Tipos de violação da WCAG 2.1 A/AA encontrados pelo axe")
    ax.set_title(f"Acessibilidade por página – axe ({SISTEMA})")
    ax.legend(loc="lower right", frameon=False, fontsize=9)
    fig.tight_layout()
    fig.savefig(SAIDA / arquivo_saida("5_acessibilidade_axe.png"))
    plt.close(fig)
    criticos = sum(p["por_impacto"]["critical"] for p in paginas)
    return len(paginas), criticos


def tabela_rastreabilidade(grupos):
    with open(SAIDA / arquivo_saida("rastreabilidade.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Código", "Nome", "Casos de teste", "Aprovados", "Reprovados", "Situação", "Testes que falharam"])
        for itens in grupos.values():
            for c, r in itens.items():
                total = r["aprovados"] + r["reprovados"]
                w.writerow([c, r["nome"], total, r["aprovados"], r["reprovados"],
                            "Atendido" if r["reprovados"] == 0 else "Não atendido", " | ".join(r["falhas"])])


def salvar_historico(nome):
    """Copia os gráficos e a tabela atuais para <relatorio>/historico/<nome>."""
    destino = PASTA / "historico" / nome
    destino.mkdir(parents=True, exist_ok=True)
    for arquivo in list(SAIDA.glob("*.png")) + list(SAIDA.glob("*.csv")):
        shutil.copy2(arquivo, destino / arquivo.name)
    return destino


def main():
    global PASTA, SAIDA, SISTEMA, PREFIXO
    parser = argparse.ArgumentParser(description="Gera os gráficos dos testes unitários.")
    parser.add_argument("--historico", metavar="NOME", help="também salva uma cópia em <relatorio>/historico/NOME")
    parser.add_argument("--relatorio", metavar="PASTA", help="pasta do relatório (padrão: a da API)")
    parser.add_argument("--sistema", default=SISTEMA, help='nome mostrado nos títulos (ex.: "Front-end")')
    parser.add_argument("--prefixo", default=PREFIXO, help='prefixo da pasta e dos arquivos (ex.: "front-end")')
    parser.add_argument("--sem-cobertura", action="store_true", help="ponta a ponta: não há cobertura de código")
    args = parser.parse_args()

    if args.relatorio:
        PASTA = Path(args.relatorio).resolve()
    SISTEMA = args.sistema
    PREFIXO = args.prefixo
    SAIDA = PASTA / f"graficos-{PREFIXO}"

    SAIDA.mkdir(parents=True, exist_ok=True)
    for antigo in list(SAIDA.glob("*.png")) + list(SAIDA.glob("*.csv")):
        antigo.unlink()
    grupos, dados = carregar_resultados()
    for tipo, titulo, arquivo, *_ in TIPOS:
        grafico_por_item(grupos[tipo], titulo, arquivo)
    grafico_resumo(grupos, dados)
    total = None if args.sem_cobertura else grafico_cobertura()
    axe = grafico_axe()
    tabela_rastreabilidade(grupos)

    print(f"Casos de teste: {dados['numPassedTests']} aprovados, {dados['numFailedTests']} reprovados")
    for tipo, itens in grupos.items():
        if not itens:
            continue
        print(f"{tipo} testados: {len(itens)}")
        for c, r in itens.items():
            if r["reprovados"]:
                print(f"  {c} com falha: {', '.join(r['falhas'])}")
    if total:
        print(f"Cobertura de linhas: {total['lines']['pct']:.1f}% (meta {META_COBERTURA}%)")
    if axe:
        print(f"Acessibilidade (axe): {axe[0]} páginas analisadas, {axe[1]} tipos de erro crítico")
    print(f"Gráficos em: {SAIDA}")
    if args.historico:
        print(f"Cópia no histórico: {salvar_historico(args.historico)}")


if __name__ == "__main__":
    main()
