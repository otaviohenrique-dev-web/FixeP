# -*- coding: utf-8 -*-
"""Gera docs/RELATORIO_PRODUTO_FRIXEP.pdf (relatório de estado e roadmap do jogo).
Uso: python tools/gerar_relatorio.py   (precisa de reportlab; usa as fontes Georgia e Segoe UI do Windows)."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle,
                                KeepTogether, Image, NextPageTemplate, Flowable)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "RELATORIO_PRODUTO_FRIXEP.pdf")
EMB = os.path.join(ROOT, "packages", "client", "public", "icon-512.png")
FD = r"C:\Windows\Fonts"
for name, f in [("Geo", "georgia.ttf"), ("Geo-B", "georgiab.ttf"), ("Geo-I", "georgiai.ttf"), ("Geo-BI", "georgiaz.ttf"),
                ("Seg", "segoeui.ttf"), ("Seg-B", "segoeuib.ttf"), ("Seg-I", "segoeuii.ttf"), ("Seg-BI", "segoeuiz.ttf")]:
    pdfmetrics.registerFont(TTFont(name, os.path.join(FD, f)))
pdfmetrics.registerFontFamily("Geo", normal="Geo", bold="Geo-B", italic="Geo-I", boldItalic="Geo-BI")
pdfmetrics.registerFontFamily("Seg", normal="Seg", bold="Seg-B", italic="Seg-I", boldItalic="Seg-BI")

# paleta (a mesma do jogo: noite azulada, brasa e ouro)
NIGHT = colors.HexColor("#0d1420")
NIGHT2 = colors.HexColor("#16233a")
GOLD = colors.HexColor("#b98a3e")
GOLDL = colors.HexColor("#e6be78")
EMBER = colors.HexColor("#d4551c")
ICE = colors.HexColor("#4a6f9c")
INK = colors.HexColor("#1d2430")
MUTE = colors.HexColor("#5b6678")
LINE = colors.HexColor("#d9dee7")
ZEBRA = colors.HexColor("#f4f6fa")
OK = colors.HexColor("#2f8f5b")
WARN = colors.HexColor("#c98a12")
BAD = colors.HexColor("#c0392b")

W, H = A4
LM = RM = 20 * mm
TM = 26 * mm
BM = 20 * mm
CW = W - LM - RM

S = {}
S["body"] = ParagraphStyle("body", fontName="Seg", fontSize=9.6, leading=14.2, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=5)
S["small"] = ParagraphStyle("small", parent=S["body"], fontSize=8.3, leading=11.5, textColor=MUTE, alignment=TA_LEFT, spaceAfter=3)
S["cell"] = ParagraphStyle("cell", parent=S["body"], fontSize=8.4, leading=11.2, alignment=TA_LEFT, spaceAfter=0)
S["cellb"] = ParagraphStyle("cellb", parent=S["cell"], fontName="Seg-B")
S["cellh"] = ParagraphStyle("cellh", parent=S["cell"], fontName="Seg-B", textColor=colors.white)
S["h1"] = ParagraphStyle("h1", fontName="Geo-B", fontSize=19, leading=23, textColor=NIGHT, spaceBefore=4, spaceAfter=8)
S["h2"] = ParagraphStyle("h2", fontName="Geo-B", fontSize=12.6, leading=16, textColor=NIGHT2, spaceBefore=10, spaceAfter=4)
S["h3"] = ParagraphStyle("h3", fontName="Seg-B", fontSize=10, leading=13, textColor=EMBER, spaceBefore=6, spaceAfter=2)
S["bul"] = ParagraphStyle("bul", parent=S["body"], leftIndent=13, bulletIndent=2, spaceAfter=2.5, alignment=TA_LEFT)
S["cap"] = ParagraphStyle("cap", parent=S["small"], fontName="Seg-I", alignment=TA_CENTER, spaceBefore=2)
S["call"] = ParagraphStyle("call", parent=S["body"], fontSize=9.6, leading=14, alignment=TA_LEFT, spaceAfter=0)
S["toc1"] = ParagraphStyle("toc1", fontName="Seg-B", fontSize=10.5, leading=19, textColor=NIGHT, leftIndent=0)


def P(t, st="body"): return Paragraph(t, S[st])
def H1(t): return Paragraph(t, S["h1"])
def H2(t): return Paragraph(t, S["h2"])
def H3(t): return Paragraph(t, S["h3"])
def BL(items): return [Paragraph(i, S["bul"], bulletText="•") for i in items]
def SP(n=6): return Spacer(1, n)


def chip(txt):
    c = {"Existe": OK, "Parcial": WARN, "Falta": BAD}.get(txt, MUTE)
    return Paragraph(f'<font color="{c.hexval().replace("0x", "#")}"><b>{txt}</b></font>', S["cell"])


def tbl(data, widths, head=True, zebra=True, extra=None):
    rows = []
    for ri, r in enumerate(data):
        row = []
        for c in r:
            if isinstance(c, str):
                row.append(Paragraph(c, S["cellh"] if (head and ri == 0) else S["cell"]))
            else:
                row.append(c)
        rows.append(row)
    t = Table(rows, colWidths=widths, repeatRows=1 if head else 0)
    st = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
          ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
          ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE)]
    if head:
        st += [("BACKGROUND", (0, 0), (-1, 0), NIGHT2), ("LINEBELOW", (0, 0), (-1, 0), 1.2, GOLD)]
    if zebra:
        for i in range(1 if head else 0, len(rows)):
            if i % 2 == 0: st.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    if extra: st += extra
    t.setStyle(TableStyle(st))
    return t


def callout(title, text, color=EMBER):
    inner = [Paragraph(f'<font color="{color.hexval().replace("0x", "#")}"><b>{title}</b></font>', S["call"]), Spacer(1, 2), Paragraph(text, S["call"])]
    t = Table([[inner]], colWidths=[CW])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fbf6ee")), ("LINEBEFORE", (0, 0), (0, -1), 3, color),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


# ------------------------------------------------------------------ gráficos
def chart_maturity():
    rows = [("Combate e classes", 3.5), ("Itens e equipamento", 3.0), ("Economia e comércio", 3.0), ("Social (grupo, chat, troca)", 2.5),
            ("Progressão de personagem", 2.0), ("Mundo e zonas", 2.0), ("Operação e infraestrutura", 2.0), ("Arte e áudio finais", 1.5),
            ("Onboarding (primeira hora)", 1.0), ("Endgame (chefes, PvP, temporadas)", 1.0), ("Quests e narrativa", 0.0)]
    bh, gap, left = 15, 7, 170
    h = len(rows) * (bh + gap) + 30
    d = Drawing(CW, h)
    for i in range(6):
        x = left + i * (CW - left - 30) / 5
        d.add(Line(x, 14, x, h - 4, strokeColor=LINE, strokeWidth=0.5))
        d.add(String(x, 2, str(i), fontName="Seg", fontSize=7.5, fillColor=MUTE, textAnchor="middle"))
    y = h - 22
    for name, v in rows:
        d.add(String(0, y + 4, name, fontName="Seg", fontSize=8.6, fillColor=INK))
        wmax = (CW - left - 30)
        col = BAD if v < 1.5 else (WARN if v < 2.5 else (ICE if v < 3.5 else OK))
        d.add(Rect(left, y, wmax * v / 5, bh, fillColor=col, strokeColor=None))
        d.add(Rect(left, y, wmax, bh, fillColor=None, strokeColor=LINE, strokeWidth=0.5))
        d.add(String(left + wmax * v / 5 + 5, y + 4, f"{v:.1f}", fontName="Seg-B", fontSize=8.4, fillColor=INK))
        y -= bh + gap
    return d


def chart_priority():
    w, h = CW, 270
    d = Drawing(w, h)
    px, py, pw, ph = 40, 28, w - 56, h - 50
    d.add(Rect(px, py, pw / 2, ph / 2, fillColor=colors.HexColor("#f6f7fa"), strokeColor=None))
    d.add(Rect(px + pw / 2, py, pw / 2, ph / 2, fillColor=colors.HexColor("#eef2f9"), strokeColor=None))
    d.add(Rect(px, py + ph / 2, pw / 2, ph / 2, fillColor=colors.HexColor("#fbf1e4"), strokeColor=None))
    d.add(Rect(px + pw / 2, py + ph / 2, pw / 2, ph / 2, fillColor=colors.HexColor("#f4e7d6"), strokeColor=None))
    d.add(Rect(px, py, pw, ph, fillColor=None, strokeColor=MUTE, strokeWidth=0.8))
    d.add(Line(px + pw / 2, py, px + pw / 2, py + ph, strokeColor=LINE, strokeWidth=0.8))
    d.add(Line(px, py + ph / 2, px + pw, py + ph / 2, strokeColor=LINE, strokeWidth=0.8))
    for txt, x, y in [("FAZER JÁ", px + 6, py + ph - 12), ("PLANEJAR COM CUIDADO", px + pw / 2 + 6, py + ph - 12),
                      ("ENCAIXAR NO MEIO", px + 6, py + 6), ("DEIXAR PARA DEPOIS", px + pw / 2 + 6, py + 6)]:
        d.add(String(x, y, txt, fontName="Seg-B", fontSize=7.4, fillColor=MUTE))
    d.add(String(px + pw / 2, 8, "ESFORÇO  →", fontName="Seg-B", fontSize=7.8, fillColor=INK, textAnchor="middle"))
    d.add(String(10, py + ph / 2, "IMPACTO", fontName="Seg-B", fontSize=7.8, fillColor=INK, textAnchor="middle"))
    # (rótulo, esforço 0-1, impacto 0-1, cor)
    pts = [("Tutorial + 1ª hora", .18, .93, EMBER), ("Motor de quests", .42, .86, EMBER), ("Telemetria e moderação", .16, .70, EMBER),
           ("Hospedagem no Brasil", .26, .78, EMBER), ("Variações de skill", .46, .66, ICE), ("Árvore de talentos", .62, .74, ICE),
           ("Afixos e refino", .56, .58, ICE), ("Guildas e amigos", .58, .48, ICE), ("Novas zonas 22-50", .90, .90, GOLD),
           ("Dungeons / raid", .84, .62, GOLD), ("Arena e temporadas", .80, .40, GOLD), ("Cosméticos (loja)", .50, .30, MUTE),
           ("Montarias", .72, .16, MUTE), ("Profissões", .64, .22, MUTE)]
    for lab, e, i, c in pts:
        x, y = px + e * pw, py + i * ph
        d.add(Circle(x, y, 4.2, fillColor=c, strokeColor=colors.white, strokeWidth=1))
        anchor = "end" if e > 0.78 else "start"
        d.add(String(x + (-7 if anchor == "end" else 7), y - 2.5, lab, fontName="Seg", fontSize=7.6, fillColor=INK, textAnchor=anchor))
    return d


def chart_gantt():
    phases = [("F0  Fundação e operação", 0, 2, MUTE), ("F1  A primeira hora", 1, 3.5, EMBER), ("F2  Identidade de build", 3.5, 6, ICE),
              ("F3  Profundidade de itens", 5.5, 7.5, ICE), ("F4  Mundo 1-50 (parte 1)", 6.5, 10.5, GOLD),
              ("F5  Social e retenção", 8, 10.5, ICE), ("F6  Endgame e temporadas", 10.5, 13.5, GOLD), ("F7  Beta e lançamento", 11, 14, EMBER)]
    total = 14
    left, bh, gap = 150, 14, 8
    h = len(phases) * (bh + gap) + 28
    d = Drawing(CW, h)
    cw = CW - left - 8
    for m in range(total + 1):
        x = left + m * cw / total
        d.add(Line(x, 16, x, h - 2, strokeColor=LINE, strokeWidth=0.4))
        if m % 2 == 0: d.add(String(x, 4, f"M{m}", fontName="Seg", fontSize=7.4, fillColor=MUTE, textAnchor="middle"))
    y = h - 22
    for name, a, b, c in phases:
        d.add(String(0, y + 3.5, name, fontName="Seg", fontSize=8.4, fillColor=INK))
        d.add(Rect(left + a * cw / total, y, (b - a) * cw / total, bh, fillColor=c, strokeColor=None, rx=3, ry=3))
        y -= bh + gap
    return d


# ------------------------------------------------------------------ página
class Doc(BaseDocTemplate):
    def __init__(self, fn, **kw):
        super().__init__(fn, pagesize=A4, leftMargin=LM, rightMargin=RM, topMargin=TM, bottomMargin=BM,
                         title="FrixeP - Relatório de Produto e Roadmap", author="Equipe FrixeP", subject="Estado atual e plano para um MMORPG web de sucesso", **kw)
        fr = Frame(LM, BM, CW, H - TM - BM, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id="cover", frames=[Frame(0, 0, W, H, id="c", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=self.cover),
                               PageTemplate(id="body", frames=[fr], onPage=self.chrome)])

    def afterFlowable(self, f):
        if isinstance(f, Paragraph) and f.style.name == "h1":
            self.notify("TOCEntry", (0, f.getPlainText(), self.page))

    def cover(self, c, d):
        c.saveState()
        c.setFillColor(NIGHT); c.rect(0, 0, W, H, stroke=0, fill=1)
        # faixa de brasa e "geada" decorativa
        for i, a in enumerate([.10, .07, .05]):
            c.setFillColor(colors.Color(.83, .33, .11, alpha=a)); c.circle(W * .72, H * .30, 190 - i * 55, stroke=0, fill=1)
        c.setStrokeColor(GOLD); c.setLineWidth(1.2); c.line(LM, H - 38 * mm, W - RM, H - 38 * mm)
        c.setFillColor(GOLDL); c.setFont("Seg-B", 9); c.drawString(LM, H - 32 * mm, "RELATÓRIO DE PRODUTO  ·  CONFIDENCIAL")
        c.setFillColor(colors.HexColor("#8fa3c4")); c.setFont("Seg", 9); c.drawRightString(W - RM, H - 32 * mm, "Versão 1.1  ·  21 de novembro de 2026")
        if os.path.exists(EMB): c.drawImage(EMB, W / 2 - 48 * mm, H - 140 * mm, 96 * mm, 96 * mm, mask="auto")
        c.setFillColor(colors.white); c.setFont("Geo-B", 44); c.drawCentredString(W / 2, H * .43, "FrixeP")
        c.setFillColor(GOLDL); c.setFont("Geo-I", 15); c.drawCentredString(W / 2, H * .43 - 24, "Acenda a Brasa  ·  Desperte o Mundo")
        c.setStrokeColor(GOLD); c.line(W / 2 - 40 * mm, H * .43 - 40, W / 2 + 40 * mm, H * .43 - 40)
        c.setFillColor(colors.white); c.setFont("Seg-B", 16); c.drawCentredString(W / 2, H * .43 - 70, "Estado atual do jogo e plano")
        c.drawCentredString(W / 2, H * .43 - 90, "para um MMORPG web de sucesso")
        c.setFillColor(colors.HexColor("#8fa3c4")); c.setFont("Seg", 9.5)
        c.drawCentredString(W / 2, H * .43 - 124, "Análise de lacunas, refatorações, roadmap, métricas e riscos")
        c.setFillColor(colors.HexColor("#8fa3c4")); c.setFont("Seg", 8.5)
        c.drawString(LM, 20 * mm, "FrixeP · MMO RPG 2D isométrico de fantasia sombria · Navegador e celular")
        c.drawRightString(W - RM, 20 * mm, "Documento de planejamento interno")
        c.restoreState()

    def chrome(self, c, d):
        c.saveState()
        c.setFillColor(NIGHT); c.rect(0, H - 17 * mm, W, 17 * mm, stroke=0, fill=1)
        c.setFillColor(GOLD); c.rect(0, H - 17.8 * mm, W, 0.8 * mm, stroke=0, fill=1)
        if os.path.exists(EMB): c.drawImage(EMB, LM, H - 15.2 * mm, 12 * mm, 12 * mm, mask="auto")
        c.setFillColor(colors.white); c.setFont("Geo-B", 12); c.drawString(LM + 15 * mm, H - 9.4 * mm, "FrixeP")
        c.setFillColor(colors.HexColor("#8fa3c4")); c.setFont("Seg", 8.2); c.drawString(LM + 15 * mm, H - 13.6 * mm, "Relatório de Produto e Roadmap")
        c.setFillColor(GOLDL); c.setFont("Seg-B", 8); c.drawRightString(W - RM, H - 9.4 * mm, "CONFIDENCIAL · USO INTERNO")
        c.setFillColor(colors.HexColor("#8fa3c4")); c.setFont("Seg", 8); c.drawRightString(W - RM, H - 13.6 * mm, "20/11/2026 · v1.0")
        c.setStrokeColor(LINE); c.setLineWidth(0.6); c.line(LM, 14 * mm, W - RM, 14 * mm)
        c.restoreState()


class Numbered(rl_canvas.Canvas):
    def __init__(self, *a, **k):
        super().__init__(*a, **k); self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__)); self._startPage()

    def save(self):
        n = len(self._saved)
        for st in self._saved:
            self.__dict__.update(st)
            if self._pageNumber > 1:
                self.setFont("Seg", 8); self.setFillColor(MUTE)
                self.drawString(LM, 9.5 * mm, "FrixeP · Relatório de Produto e Roadmap")
                self.drawRightString(W - RM, 9.5 * mm, f"Página {self._pageNumber} de {n}")
            super().showPage()
        super().save()


# ------------------------------------------------------------------ conteúdo
def build():
    st = []
    st += [Paragraph("Sumário", ParagraphStyle("h1x", parent=S["h1"])), SP(4)]
    toc = TableOfContents(); toc.levelStyles = [S["toc1"]]
    toc.dotsMinLevel = 0
    st += [toc, PageBreak()]

    # ---------------------------------------------------------------- 1
    st += [H1("1. Sumário executivo")]
    st += [P("O FrixeP já é, tecnicamente, um MMORPG funcional: servidor autoritativo em tempo real, quatro classes com combate de ação, "
             "itens com oito níveis de raridade (seis já com equipamento), economia com duas moedas, mercado entre jogadores, troca segura, grupos, chefes que exigem cooperação, "
             "PvP opcional e um mundo de quatro zonas, tudo jogável no navegador e no celular. A base técnica é sólida e coerente "
             "(client Phaser, servidor Colyseus, banco PostgreSQL, testes automatizados de anti-trapaça e economia).")]
    st += [P("O que o jogo ainda <b>não</b> tem é o que transforma um sistema divertido em um produto que prende: um motivo para voltar amanhã. "
             "Hoje o jogador entra, cria o personagem e é largado em um mapa sem objetivo, sem história e sem caminho de crescimento além de "
             "“subir de nível e pegar itens melhores”. Os elementos que faltam são conhecidos e bem estudados.")]
    st += [callout("Diagnóstico em uma frase",
                   "Temos o motor e o combate; falta o <b>jogo em volta do motor</b>: onboarding, quests e narrativa, progressão com escolhas (builds), "
                   "conteúdo para os níveis 22 a 50, vida social duradoura (guildas) e uma operação confiável fora do computador do desenvolvedor.")]
    st += [SP(6), H2("As cinco decisões que mais pesam no sucesso")]
    st += BL([
        "<b>1. Primeira hora impecável.</b> Tutorial guiado e cadeia inicial de quests (níveis 1 a 10). É a maior alavanca de retenção e o menor esforço do plano.",
        "<b>2. Identidade de build.</b> Manter o kit fixo de cada classe (é a assinatura do jogo), mas somar <i>variações de habilidade</i> e uma <i>árvore de talentos</i>. O Clérigo, com o Q em duas versões, já provou a ideia.",
        "<b>3. Conteúdo para 1–50.</b> Hoje o conteúdo cobre até aproximadamente o nível 21 e o teto é 50. Faltam de cinco a seis zonas, dungeons e um chefe final.",
        "<b>4. Social como retenção.</b> Guildas, lista de amigos, correio e chat global transformam jogadores em comunidade. O jogo já força cooperação nos chefes: falta o lugar onde ela vive.",
        "<b>5. Fundação operacional.</b> Hospedagem estável no Brasil (hoje o servidor roda em uma máquina pessoal), backups, telemetria e moderação antes de qualquer divulgação.",
    ])
    st += [SP(4), P("O roadmap proposto tem oito fases em cerca de catorze meses para a equipe atual (um desenvolvedor principal e um artista), "
                    "com um <b>beta fechado a partir do mês 11</b>. Cada fase termina em algo jogável e mensurável. As estimativas são nossas, de planejamento, e devem ser revistas a cada fase.")]
    st += [PageBreak()]

    # ---------------------------------------------------------------- 2
    st += [H1("2. Visão de produto e público")]
    st += [H2("2.1 Promessa ao jogador")]
    st += [P("“Um MMORPG de fantasia sombria que abre em um clique, no navegador ou no celular, com combate de ação, cooperação de verdade e loot que importa.” "
             "O mundo gira em torno da <b>Geada Negra</b>, que consome o reino de Vael, e da cidade-refúgio de <b>Brasalume</b>, a última brasa acesa. "
             "A frase do jogo, <i>Acenda a Brasa · Desperte o Mundo</i>, deve guiar narrativa, missões e arte.")]
    st += [H2("2.2 Quem queremos atrair")]
    st += [tbl([
        ["Perfil", "O que procura", "O que o FrixeP precisa oferecer"],
        ["Veterano de MMO clássico (Tibia, MU, Ragnarok)", "Grind com sentido, loot raro, comunidade, PvP com risco", "Pontos de caça, itens raros, guildas, economia viva, PvP opcional (já existe parte)"],
        ["Fã de ARPG (Diablo, Path of Exile)", "Builds, afixos, números crescendo, eventos", "Variações de skill, árvore de talentos, itens com afixos, chefes e temporadas"],
        ["Jogador de Albion / sandbox", "Economia dirigida por jogadores, comércio, trocas", "Mercado, troca segura e moedas (já existem); profissões e crafting depois"],
        ["Casual de navegador e celular", "Sessões curtas, zero instalação, progresso visível", "Entrada em 30 s, quests diárias curtas, interface de toque (já existe), PWA"],
    ], [CW * .27, CW * .30, CW * .43])]
    st += [SP(4), P("O público inicial recomendado é o <b>brasileiro</b>: o servidor próximo dá baixa latência (já medimos cerca de 20 ms), o idioma já é PT-BR e a comunidade pode ser construída "
                    "com proximidade. Internacionalização entra depois do lançamento, quando houver algo a escalar.")]
    st += [H2("2.3 Princípios de design")]
    st += BL([
        "<b>Fricção zero:</b> do clique ao primeiro monstro em menos de 60 segundos. Sem download, sem formulário longo.",
        "<b>Loop central gostoso:</b> caçar → pegar loot → melhorar o personagem → enfrentar algo mais difícil, cada passo com resposta visual e sonora imediata.",
        "<b>Cooperação com recompensa:</b> chefes e dungeons pedem grupo; o jogo deve facilitar achar e manter um grupo.",
        "<b>Respeito ao jogador:</b> nada de poder à venda. Monetização somente cosmética (seção 6).",
        "<b>Móvel de primeira classe:</b> todo recurso novo nasce pensado para toque, não adaptado depois.",
        "<b>Servidor manda:</b> o cliente só envia intenções. Isso já é regra e protege a economia contra trapaça.",
    ])
    st += [PageBreak()]

    # ---------------------------------------------------------------- 3
    st += [H1("3. Estado atual do jogo")]
    st += [P("Resumo do que existe hoje, levantado do repositório em 20/11/2026. As notas de maturidade (0 a 5) são uma avaliação nossa: "
             "0 é ausente, 3 é jogável com lacunas e 5 é pronto para lançamento.")]
    st += [chart_maturity(), P("Figura 1. Maturidade por área. Quests e onboarding são os pontos mais baixos; combate e itens, os mais altos.", "cap"), SP(6)]
    st += [H2("3.1 O que já está construído")]
    st += [tbl([
        ["Área", "Situação atual"],
        ["Plataforma", "Navegador (computador e celular), instalável como app (PWA), login com Google, personagem salvo em PostgreSQL. Cliente em Phaser 3 + Vite, servidor Colyseus + Express."],
        ["Classes", "Guerreiro (tanque), Arqueiro (distância), Clérigo (suporte) e Mago (explosivo). Cada uma tem ataque básico, Q/W/E, ultimate (R) e esquiva, com recurso próprio (Fúria, Foco, Mana). O Clérigo escolhe entre duas versões do Q."],
        ["Progressão", "Nível 1 a 50, XP exponencial (20% por nível), placas de nível com moldura que muda a cada 10 níveis."],
        ["Itens", "Oito níveis de raridade (inferior, comum, incomum, raro, épico, lendário, mítico, ancestral; hoje há equipamento de comum a mítico), seis espaços de equipamento, três ou mais tipos de arma por classe, itens no chão com reserva ao dono, tetos de raridade por zona e baús de chefe."],
        ["Economia", "Duas moedas (Tostões de Ferro e Óbolos de Sangue), comerciante (Garrick), ferreira (Brasa), troca segura entre jogadores com chat privado, mercado de jogadores (leiloeiro Ossian) com taxa, baú pessoal."],
        ["Mundo", "Cidade segura de Brasalume (hub, sem combate) e três zonas de combate: Cinzas, Floresta Gélida e Catacumbas. Pontos de caça em grupo, chefes por zona, travessia por portões, mapa-mundo, bolha de proteção na chegada."],
        ["Social", "Grupo (party) com divisão de XP e loot, chat da zona com balão de fala, troca e mercado. Chefes exigem grupo."],
        ["PvP", "Modo opcional, com regras de entrada (parado, sem dano recente) e canal de reentrada."],
        ["Qualidade", "Testes automatizados de anti-trapaça, economia, inventário, chegada, zonas e classes; script que atualiza e reinicia o servidor; aviso de renderização por software."],
        ["Arte e identidade", "Login em dark fantasy, emblema oficial, kits de sprites próprios (classes, lobo, espectro, NPCs), silhueta e painéis de interface. Boa parte da arte de mapa ainda é provisória (desenhada por código)."],
    ], [CW * .16, CW * .84])]
    st += [PageBreak()]

    # ---------------------------------------------------------------- 4
    st += [H1("4. O que um MMORPG precisa ter: lacunas")]
    st += [P("A tabela compara o jogo com os elementos esperados de um MMORPG moderno. <b>Existe</b>: pronto e jogável. <b>Parcial</b>: há base, mas faltam peças. <b>Falta</b>: não existe.")]
    rows = [["Elemento", "Estado", "Observação"]]
    data = [
        ("NÚCLEO DE JOGO", None, None),
        ("Criação de personagem e classes", "Existe", "Quatro classes; falta personalização visual (rosto, cabelo, cor)."),
        ("Combate em tempo real com habilidades", "Existe", "Servidor autoritativo, telégrafos de área, esquiva."),
        ("Nível e XP", "Existe", "Cap 50; falta conteúdo para os níveis altos."),
        ("Árvore de habilidades e talentos", "Falta", "Kits fixos; só o Q do Clérigo tem escolha."),
        ("Atributos e builds", "Parcial", "Bônus vêm só do equipamento; sem pontos a distribuir."),
        ("Tutorial e onboarding", "Falta", "O jogador cai no mapa sem orientação."),
        ("Quests, diário de missões e NPCs com diálogo", "Falta", "Não existe motor de quests."),
        ("Conquistas e títulos", "Falta", "Bom reforço de retenção e orgulho."),
        ("ITENS E ECONOMIA", None, None),
        ("Equipamento com raridade e espaços", "Existe", "Seis espaços; arma e armadura com kits por classe."),
        ("Afixos aleatórios, refino, engaste, conjuntos", "Falta", "Hoje o item é fixo por raridade; pouco “caça ao item perfeito”."),
        ("Conjuntos de equipamento salvos (loadouts)", "Falta", "Trocar de papel (tanque/dano) com um clique."),
        ("Forja e crafting", "Parcial", "A ferreira quebra itens por Tostões; não há criar nem melhorar."),
        ("Comércio: troca, mercado, baú", "Existe", "Completo e seguro; faltam ferramentas de análise de preço."),
        ("Controle de inflação (sinks e faucets)", "Parcial", "Taxa do mercado existe; faltam ralos recorrentes."),
        ("MUNDO", None, None),
        ("Zonas de combate", "Parcial", "Três zonas cobrem cerca dos níveis 1 a 21."),
        ("Dungeons instanciadas e raid", "Falta", "Chefes são de campo; sem conteúdo privado para o grupo."),
        ("Eventos de mundo e chefes de mundo", "Falta", "Fortalece o social e dá picos de atividade."),
        ("Coleta e profissões", "Falta", "Opcional, mas liga economia e exploração."),
        ("Viagem rápida", "Parcial", "Mapa-mundo no portão; sem atalhos nas zonas."),
        ("SOCIAL", None, None),
        ("Grupo (party)", "Existe", "Divisão de XP e loot; falta buscador de grupo."),
        ("Chat", "Parcial", "Chat de zona. Faltam global, grupo, guilda e privado geral."),
        ("Lista de amigos e correio", "Falta", "Essencial para relacionamento fora da sessão."),
        ("Guildas", "Falta", "A maior ferramenta de retenção de MMO."),
        ("PvP", None, None),
        ("PvP opcional", "Existe", "Regras claras de entrada e saída."),
        ("Arenas, ranking e temporadas", "Falta", "Competição estruturada e razão para voltar."),
        ("PLATAFORMA E OPERAÇÃO", None, None),
        ("Web, celular e instalação", "Existe", "Joystick de toque, PWA, HUD compacto."),
        ("Moderação: silenciar, denunciar, banir; painel admin", "Falta", "Obrigatório antes de abrir ao público."),
        ("Telemetria e análise de jogadores", "Falta", "Sem dados não dá para melhorar o funil."),
        ("Configurações (teclas, gráficos, áudio)", "Parcial", "Há som e FPS; falta tela de opções completa."),
        ("Arte e áudio finais", "Parcial", "Arte de personagens avançada; mapas, efeitos e trilha em andamento."),
    ]
    extra = []
    for lab, s, o in data:
        if s is None:
            rows.append([Paragraph(f"<b>{lab}</b>", S["cell"]), "", ""])
            extra += [("NOSPLIT", (0, len(rows) - 1), (-1, len(rows))), ("SPAN", (0, len(rows) - 1), (-1, len(rows) - 1)), ("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), colors.HexColor("#e9edf5"))]
        else:
            rows.append([lab, chip(s), o])
    st += [tbl(rows, [CW * .36, CW * .10, CW * .54], zebra=False, extra=extra)]
    st += [PageBreak()]

    # ---------------------------------------------------------------- 5
    st += [H1("5. Aprofundamento das lacunas críticas")]
    st += [H2("5.1 A primeira hora (onboarding)")]
    st += [P("É onde a maioria dos jogos perde jogadores. Hoje o fluxo é: login, criar personagem, aparecer em Brasalume. Falta guiar. Proposta:")]
    st += BL([
        "<b>Tutorial em 5 passos</b> (mover, atacar, usar habilidade, pegar loot, equipar item), cada um com instrução na tela e recompensa pequena.",
        "<b>Primeira zona controlada:</b> uma área inicial sem chefes, com monstros fracos e um NPC que dá as primeiras quests.",
        "<b>Meta de ritmo:</b> primeiro abate em até 60 s; nível 5 em até 10 minutos; primeiro item equipado em até 5 minutos.",
        "<b>Dicas contextuais</b> que aparecem uma vez (cura, esquiva, mapa-mundo) e a opção de reler em “Ajuda”.",
    ])
    st += [H2("5.2 Quests e narrativa")]
    st += [P("Quests dão direção, ensinam o jogo e entregam recompensas previsíveis. A narrativa do FrixeP já tem seu gancho: a Geada Negra consome Vael e Brasalume é a última brasa. "
             "O motor deve ser <b>orientado a dados</b> (um arquivo por quest), para que arte, texto e balanceamento evoluam sem mexer no código do servidor.")]
    st += [tbl([
        ["Tipo", "Descrição", "Quando"],
        ["Tutorial", "Cadeia curta que ensina controles e sistemas", "Níveis 1 a 5"],
        ["Campanha", "Uma história por zona, com chefe no fim e recompensa única", "Cada zona"],
        ["Caça e coleta", "Abater N inimigos ou juntar itens nos pontos de caça", "Todos os níveis"],
        ["Diárias e semanais", "Tarefas curtas e repetíveis com recompensa em moedas e materiais", "Retenção"],
        ["Grupo", "Missões que pedem cooperação (chefe, dungeon)", "Nível 15+"],
        ["Conquistas", "Metas de longo prazo com título ou cosmético", "Sempre"],
    ], [CW * .17, CW * .58, CW * .25])]
    st += [SP(4)]
    st += BL(["<b>Peças técnicas:</b> NPC com diálogo, diário de missões (painel e marcador no mapa), rastreador na HUD, condições e recompensas validadas no servidor, estado salvo por personagem."])
    st += [H2("5.3 Progressão de personagem: árvore de habilidades e builds")]
    st += [P("Hoje cada classe tem um kit fixo, igual para todos os jogadores da classe. É claro e fácil de aprender, mas todo Guerreiro de nível 50 joga igual a um de nível 10. "
             "Recomendamos <b>preservar o kit como identidade</b> e acrescentar escolhas em três camadas:")]
    st += [tbl([
        ["Camada", "Como funciona", "Exemplo (Guerreiro)"],
        ["1. Kit base", "Golpe, Q, W, E, R e esquiva continuam como assinatura da classe", "Investida, Correntes, Escudo Refletor, Queda do Colosso"],
        ["2. Variações de habilidade", "Cada habilidade ganha 3 variações (modificadores), liberadas em níveis marcos (10, 20, 30, 40). Troca livre na cidade. Generaliza o que o Clérigo já faz no Q.", "Investida: <i>Aríete</i> (mais distância e atordoamento) · <i>Escudeiro</i> (reduz dano recebido por 3 s) · <i>Rompe-Fileiras</i> (atravessa e fere em linha)"],
        ["3. Árvore de talentos", "1 ponto por nível a partir do 6 (cerca de 45 pontos). Três ramos por classe, com passivas e um talento final por ramo. Reset barato em Tostões.", "Ramos: <i>Bastião</i> (tanque) · <i>Carrasco</i> (dano) · <i>Comandante</i> (apoio ao grupo)"],
    ], [CW * .19, CW * .45, CW * .36])]
    st += [SP(4)]
    st += BL([
        "<b>Por que assim:</b> o kit fixo mantém o jogo legível e fácil de balancear; variações e talentos entregam a sensação de “meu personagem”, sem explodir o número de combinações.",
        "<b>Loadouts:</b> salvar até 3 conjuntos (variações + talentos + equipamento) e trocar com um toque. Resolve o “quero ser tanque no chefe e dano na caça”.",
        "<b>Refatoração necessária:</b> hoje as habilidades estão descritas em <font name='Seg-B'>CLASS_DEFS</font> com um <i>kind</i> por habilidade e a lógica vive no servidor. "
        "Passar a descrever cada habilidade como <i>lista de efeitos</i> (dano, área, atordoar, enraizar, curar, deslocar) mais <i>modificadores</i> aplicados pelo servidor. O build do jogador vira dado persistido; o cliente só exibe.",
        "<b>Balanceamento:</b> ampliar os testes unitários de balanceamento já existentes para cobrir cada variação e talento antes de liberar.",
    ])
    st += [H2("5.4 Equipamento e itens")]
    st += [P("O sistema atual (raridade, espaços, kits de arma, tetos por zona) é bom como base, mas o item é “fixo por raridade”: dois cajados raros são iguais. A caça ao item ideal é o motor de longo prazo dos MMOs e ARPGs.")]
    st += BL([
        "<b>Afixos aleatórios:</b> itens com 1 a 5 atributos sorteados (por raridade). Dá motivo para caçar o mesmo tipo de item muitas vezes.",
        "<b>Refino e engaste:</b> melhorar itens com Tostões e materiais; gemas com Óbolos de Sangue. Sempre com ralo de moeda e sem risco de perder o item (evita frustração).",
        "<b>Conjuntos (sets):</b> 2 e 4 peças, com bônus de build. Ligar cada conjunto a uma dungeon ou chefe.",
        "<b>Loadouts de equipamento</b> e <b>aparência (transmog)</b> separando visual de atributos: excelente para cosméticos.",
        "<b>Forja de verdade:</b> a ferreira hoje só quebra itens. Ela deve criar, refinar e converter itens em materiais.",
    ])
    st += [PageBreak()]
    st += [H2("5.5 Mundo, ambientação e conteúdo para 1–50")]
    st += [callout("Lacuna de conteúdo", "O nível máximo é 50, mas os inimigos e chefes atuais cobrem cerca de 1 a 21. Um jogador chega ao nível 21 e não tem mais para onde ir. Sem novas zonas, o jogo acaba cedo.", BAD)]
    st += [SP(5), P("Proposta de escada de zonas (nomes são sugestões de ambientação coerente com a Geada Negra; a ordem e os temas podem mudar):")]
    st += [tbl([
        ["Faixa", "Zona (existente ou sugerida)", "Tema e função"],
        ["Hub", "Brasalume (existe)", "Cidade segura, NPCs, mercado, baú, portão do mundo"],
        ["1 – 8", "Cinzas (existe)", "Ruínas; zona de aprendizado, tutorial e primeiras quests"],
        ["9 – 14", "Floresta Gélida (existe)", "Neve e lobos; primeiro chefe que exige grupo"],
        ["15 – 21", "Catacumbas (existe)", "Espectros; primeiro contato com itens épicos"],
        ["22 – 28", "Pântano das Sombras (nova)", "Água escura, névoa; veneno e emboscadas; profissões de coleta"],
        ["29 – 35", "Cidadela Partida (nova)", "Fortaleza em ruínas; primeira dungeon de grupo com conjunto de itens"],
        ["36 – 42", "Planícies Rubras (nova)", "Campos de batalha antigos; eventos de mundo e chefe de mundo"],
        ["43 – 50", "Abismo Gélido e Trono da Geada Negra (novas)", "Endgame: dungeon final, raid de 8 a 10 jogadores, ranking de temporada"],
    ], [CW * .12, CW * .32, CW * .56])]
    st += [SP(4)]
    st += BL([
        "<b>Dungeons instanciadas</b> (3 a 5 jogadores): mecânicas de chefe, fechadura de grupo, recompensa garantida por conclusão e semanal por dificuldade.",
        "<b>Eventos de mundo:</b> chefe de mundo com horário anunciado e invasões da Geada que juntam várias zonas.",
        "<b>Ambientação:</b> cada zona com trilha, sons ambientes, clima e arte final (hoje os mapas são desenhados por código com cores provisórias); personagens e monstros já têm kits.",
        "<b>Exploração:</b> baús escondidos, atalhos, segredos e lore em pedras e diários. Recompensa curiosidade, não só combate.",
    ])
    st += [H2("5.6 Social: guildas, amigos e comunicação")]
    st += BL([
        "<b>Guildas:</b> criação, cargos, banco da guilda, mensagem do dia, missões de guilda, conquistas. É a ferramenta número um de retenção em MMO.",
        "<b>Amigos e correio:</b> lista com status online, convite rápido para grupo e correio com anexo de itens e moedas (liga com a economia).",
        "<b>Chat completo:</b> abas Zona, Global, Grupo, Guilda e Privado; filtros e silenciar jogador.",
        "<b>Buscador de grupo:</b> o jogo já exige grupo em chefes; precisa facilitar encontrar um (papel: tanque, cura, dano).",
        "<b>Emotes e identidade:</b> emotes, títulos, bordas de retrato; a placa de nível já mostra a estética.",
    ])
    st += [H2("5.7 Endgame e PvP")]
    st += BL([
        "<b>Dungeon final e raid</b> no Trono da Geada Negra, com recompensas de maior raridade e cosméticos exclusivos.",
        "<b>Arena de PvP</b> com fila, equipes de 3 e ranking; separa competição de mundo aberto. Mantém o PvP opcional atual.",
        "<b>Temporadas</b> de 8 a 12 semanas com ranking, passe cosmético gratuito e premiação. É o motor de picos de retorno.",
    ])
    st += [H2("5.8 Economia saudável")]
    st += BL([
        "<b>Ralos (sinks):</b> refino, reparo, taxa do mercado, correio, inscrição de guilda, reset de talentos. Controla a inflação conforme o jogo cresce.",
        "<b>Fontes (faucets):</b> quests, drops, venda ao comerciante. Monitorar a emissão de moeda por hora de jogo.",
        "<b>Segurança:</b> manter as moedas atômicas no servidor (já é assim), registrar auditoria de trocas e mercado, limites diários contra venda de contas e moeda por fora (RMT).",
    ])
    st += [PageBreak()]

    # ---------------------------------------------------------------- 6
    st += [H1("6. Monetização ética e retenção")]
    st += [P("Em um MMORPG de navegador a confiança do jogador é um ativo. Recomendamos um modelo <b>sem poder à venda</b>: ninguém ganha força pagando. O jogo gratuito precisa ser completo.")]
    st += [tbl([
        ["Fonte", "O que vende", "Cuidado"],
        ["Cosméticos", "Aparências (transmog), bordas de retrato, efeitos de habilidade, emotes, montarias", "Nunca alteram atributos; facilmente exibíveis na cidade"],
        ["Passe de temporada", "Trilha gratuita e trilha premium só de cosméticos e conveniência leve", "Recompensas visíveis; nada que quebre o equilíbrio"],
        ["Conveniência", "Espaços extras de baú e personagem, loadouts adicionais", "Limites generosos no jogo gratuito"],
        ["Apoiador", "Título e emblema de fundador no beta", "Edição limitada, honra o público inicial"],
    ], [CW * .20, CW * .46, CW * .34])]
    st += [SP(4), H2("Loop de retenção")]
    st += [P("Os ganchos que fazem voltar, por horizonte de tempo:")]
    st += [tbl([
        ["Horizonte", "Gancho", "Elemento do jogo"],
        ["Mesma sessão", "“Mais uma”", "Pontos de caça, drops com animação, nível subindo, cadeia de quests"],
        ["Dia seguinte", "Diária e recompensa de volta", "Quests diárias, login com bônus, evento do dia"],
        ["Semana", "Dungeon semanal, evento, guilda", "Fechadura semanal, chefe de mundo, missões de guilda"],
        ["Mês", "Temporada, ranking, novo conjunto", "Passe de temporada, arena, conquista longa"],
    ], [CW * .18, CW * .34, CW * .48])]
    st += [PageBreak()]

    # ---------------------------------------------------------------- 7
    st += [H1("7. Arquitetura e refatorações necessárias")]
    st += [P("A base atual é boa e testada. Para crescer com segurança, estes pontos precisam de atenção antes ou junto das fases de conteúdo:")]
    st += [tbl([
        ["Tema", "Situação hoje", "Recomendação", "Prioridade"],
        ["Hospedagem do servidor", "Roda em uma máquina pessoal com túnel Cloudflare; o jogo cai quando o computador desliga ou a internet oscila.", "Mover para VPS no Brasil (ou provedor com região em São Paulo), serviço gerenciado, reinício automático, backup do banco diário e monitor de saúde.", "Alta"],
        ["Escala de salas", "Uma sala por zona, em um processo.", "Medir capacidade por sala; separar processos por zona; fila de entrada; preparar instâncias de dungeon (salas temporárias).", "Média"],
        ["Habilidades data-driven", "Definidas em código (CLASS_DEFS) com lógica por tipo.", "Descrever como efeitos e modificadores em dados; build do jogador persistido; testes por variação.", "Alta"],
        ["Conteúdo data-driven", "Zonas e itens em arquivos TypeScript compartilhados.", "Quests, NPCs, diálogos, drops e eventos em JSON validado; ferramenta simples de checagem em CI.", "Alta"],
        ["Banco de dados", "PostgreSQL (Supabase), migrações numeradas.", "Novas tabelas: quests, talentos, guildas, amigos, correio, conquistas, temporadas. Índices e rotina de backup testada.", "Alta"],
        ["Observabilidade", "Log de arquivo e endpoint de saúde.", "Painel de métricas (jogadores online, latência, erros, economia); alertas; registro de auditoria de moedas.", "Alta"],
        ["Moderação", "Inexistente.", "Silenciar, denunciar, histórico de chat, banimento por conta e painel admin mínimo.", "Alta"],
        ["Testes e CI", "Suítes de servidor (anti-trapaça, economia, zonas...). Algumas falhas antigas conhecidas.", "Rodar tudo em CI a cada PR; corrigir falhas pré-existentes; teste de carga com bots por zona.", "Média"],
        ["Pipeline de arte", "Arte provisória por código mais kits gerados.", "Padronizar atlas, nomes e tamanho; arte final por zona; revisão de memória no celular.", "Média"],
        ["Cliente", "Cena principal grande, HUD em DOM.", "Dividir a cena por responsabilidades (mundo, HUD, entrada) para acelerar novas telas (talentos, guilda, quests).", "Média"],
        ["Segurança", "Servidor autoritativo, limite de mensagens, testes anti-trapaça.", "Revisar chaves já expostas, rotacionar segredos, política de senha/token, proteção de DDoS no domínio.", "Alta"],
    ], [CW * .15, CW * .26, CW * .47, CW * .12])]
    st += [PageBreak()]

    # ---------------------------------------------------------------- 8
    st += [H1("8. Priorização")]
    st += [P("Cada item foi posicionado por <b>impacto na retenção e na percepção de qualidade</b> contra o <b>esforço estimado</b>. As cores indicam a fase em que entram (vermelho: primeiras fases; azul: meio; dourado: conteúdo grande; cinza: depois do lançamento).")]
    st += [chart_priority(), P("Figura 2. Matriz impacto × esforço. O canto superior esquerdo reúne o que dá mais resultado com menos custo.", "cap")]
    st += [SP(4)]
    st += [P("Leitura: <b>tutorial, motor de quests, telemetria, moderação e hospedagem</b> são pré-requisitos baratos e de impacto alto. Zonas novas e raid têm o maior impacto e o maior custo; "
             "por isso são faseadas e entregues a cada ciclo, em vez de um grande lançamento único.")]
    st += [PageBreak()]

    # ---------------------------------------------------------------- 9
    st += [H1("9. Roadmap por fases")]
    st += [P("Estimativa para a equipe atual (desenvolvedor principal, artista e apoio de IA no código), em meses a partir do início (M0). Fases se sobrepõem onde as equipes de código e arte não competem entre si.")]
    st += [chart_gantt(), P("Figura 3. Linha do tempo proposta (14 meses até o lançamento).", "cap"), SP(6)]
    st += [tbl([
        ["Fase", "Entregas principais", "Critério de saída"],
        ["F0 · Fundação e operação (M0–M2)", "Servidor em VPS no Brasil, backup diário, monitor e alerta, CI com todos os testes, telemetria básica de funil, silenciar/denunciar/banir.", "Servidor sem queda por 30 dias; painel mostra online e erros; backup restaurado com sucesso em teste."],
        ["F1 · A primeira hora (M1–M3,5)", "Tutorial de 5 passos, motor de quests orientado a dados, diário e rastreador, NPC com diálogo, 15 a 20 quests dos níveis 1 a 10, ajuda contextual.", "≥ 80% dos novos jogadores concluem o tutorial; primeiro abate em ≤ 60 s."],
        ["F2 · Identidade de build (M3,5–M6)", "Habilidades como dados, 3 variações por habilidade, árvore de talentos (3 ramos por classe), reset, loadouts.", "Cada classe com ≥ 2 builds viáveis nos testes de balanceamento; telemetria de escolhas."],
        ["F3 · Profundidade de itens (M5,5–M7,5)", "Afixos, refino, engaste, conjuntos, forja que cria e melhora, loadouts de equipamento.", "Ralos de moeda ativos; inflação sob controle em simulação."],
        ["F4 · Mundo 1–50, parte 1 (M6,5–M10,5)", "Pântano das Sombras e Cidadela Partida, primeira dungeon de grupo, chefe de mundo, arte final do primeiro lote, trilha e sons.", "Conteúdo contínuo de 1 a 35; dungeon concluída por grupos de teste."],
        ["F5 · Social e retenção (M8–M10,5)", "Guildas, amigos, correio, chat global/grupo/guilda, quests diárias e semanais, conquistas, buscador de grupo.", "Retorno no dia 7 acima da meta; guildas ativas no beta."],
        ["F6 · Endgame e temporadas (M10,5–M13,5)", "Planícies Rubras, Abismo e Trono, raid, arena PvP com ranking, primeira temporada.", "Raid completa por grupo de teste; arena com fila funcionando."],
        ["F7 · Beta e lançamento (M11–M14)", "Beta fechado (M11), aberto (M13), loja de cosméticos e passe, site, Discord, política de privacidade e termos.", "Metas de retenção e estabilidade (seção 10) atingidas no beta aberto."],
    ], [CW * .24, CW * .46, CW * .30])]
    st += [PageBreak()]

    # ---------------------------------------------------------------- 10
    st += [H1("10. Métricas de sucesso")]
    st += [P("As metas abaixo são <b>sugestões de partida</b> para um MMO de navegador em beta; devem ser ajustadas com os primeiros dados reais. O importante é medir desde a Fase 0.")]
    st += [tbl([
        ["Métrica", "O que mede", "Meta inicial sugerida"],
        ["Conclusão do tutorial", "Clareza da primeira hora", "≥ 80%"],
        ["Tempo até o primeiro abate", "Fricção de entrada", "≤ 60 s"],
        ["Retorno no dia 1 / dia 7 / dia 30", "Retenção", "40% / 20% / 10% (referência de mercado a validar)"],
        ["Sessão média", "Engajamento", "≥ 25 min"],
        ["Jogadores em grupo por semana", "Saúde social", "≥ 35% dos ativos"],
        ["Pertencimento a guildas", "Retenção de longo prazo", "≥ 40% dos ativos até o nível 20"],
        ["Latência média", "Qualidade técnica", "≤ 50 ms para jogadores no Brasil"],
        ["Disponibilidade do servidor", "Confiabilidade", "≥ 99,5% ao mês"],
        ["Moeda criada x destruída por dia", "Saúde da economia", "Razão próxima de 1,0 a 1,3"],
        ["Denúncias resolvidas em 24 h", "Moderação", "≥ 90%"],
    ], [CW * .34, CW * .30, CW * .36])]
    st += [PageBreak()]

    # ---------------------------------------------------------------- 11
    st += [H1("11. Riscos e mitigações")]
    st += [tbl([
        ["Risco", "Impacto", "Mitigação"],
        ["Servidor cai (hoje depende de um PC pessoal)", "Alto: jogadores perdem confiança", "F0: VPS no Brasil, reinício automático, monitor, backup; comunicar janelas de manutenção."],
        ["Escopo grande demais para a equipe", "Alto: atrasos e esgotamento", "Faseamento com entregas jogáveis; cortar adiante (montarias, profissões) se necessário."],
        ["Arte e áudio atrasam o conteúdo", "Médio", "Kits de sprites reaproveitáveis; arte final em lotes por zona; pacote de áudio licenciado para começar."],
        ["Desequilíbrio entre classes e builds", "Médio", "Testes unitários de balanceamento por variação; telemetria; ajustes semanais no beta."],
        ["Trapaça e economia quebrada (duplicação, bots)", "Alto", "Servidor autoritativo (já), auditoria de moeda, limites, testes de carga e anti-bot simples."],
        ["Baixa retenção por falta de direção", "Alto", "F1 e F5 priorizadas; dados desde o início; testes com jogadores reais cedo."],
        ["Desempenho em celular e GPU por software", "Médio", "Aviso já existe; orçamento de memória por zona; teste periódico em aparelhos modestos."],
        ["Questões legais (LGPD, termos, idade)", "Médio", "Política de privacidade, termos de uso, coleta mínima de dados, controle de contas de menores."],
        ["Dependência de uma só pessoa", "Alto", "Documentação (este relatório e o README), automação, testes e revisão por PR já adotados."],
    ], [CW * .32, CW * .20, CW * .48])]
    st += [PageBreak()]

    # ---------------------------------------------------------------- 12
    st += [H1("12. Próximos 30 dias")]
    st += [P("Sequência concreta para começar, ordenada por impacto e dependência:")]
    st += [tbl([
        ["Semana", "Ação", "Resultado esperado"],
        ["1", "Definir hospedagem no Brasil; contratar VPS; migrar servidor e banco; configurar backup diário e reinício automático.", "Jogo estável fora do computador pessoal."],
        ["1–2", "Instrumentar telemetria do funil (login, criação, tutorial, primeiro abate, nível 5, retorno).", "Primeiros dados reais de onde o jogador desiste."],
        ["2", "Ferramentas mínimas de moderação (silenciar, denunciar, banir) e registro de chat.", "Pré-requisito para abrir ao público."],
        ["2–4", "Desenhar e implementar o motor de quests (dados, NPC, diário, rastreador) e o tutorial de 5 passos.", "Primeira hora guiada, jogável de ponta a ponta."],
        ["3–4", "Escrever as primeiras 10 quests de Cinzas e a história de abertura de Vael e Brasalume.", "Conteúdo de verdade usando o motor."],
        ["4", "Especificar o sistema de variações de habilidade e talentos (documento de design e modelo de dados).", "Pronto para iniciar a F2."],
        ["Contínuo", "Rodar os testes em CI; corrigir falhas antigas (vida de inimigo e baú) e rotacionar segredos.", "Base verde e segura."],
    ], [CW * .12, CW * .60, CW * .28])]
    st += [SP(8), callout("Mensagem final",
                          "O FrixeP tem o que é difícil de construir: um servidor autoritativo, combate de ação e uma economia segura rodando no navegador. "
                          "O que falta é o que dá alma e hábito: <b>guiar o jogador, dar-lhe escolhas, dar-lhe um mundo para percorrer e outras pessoas para dividir esse mundo</b>. "
                          "Com a ordem certa (fundação, primeira hora, builds, mundo, social, endgame) o jogo cresce sem perder o que já funciona.", GOLD)]
    st += [PageBreak()]

    # ---------------------------------------------------------------- Apêndice
    st += [H1("Apêndice A. Inventário técnico")]
    st += [tbl([
        ["Item", "Detalhe"],
        ["Cliente", "TypeScript, Phaser 3, Vite; HUD, mochila, mercado e telas em DOM; PWA; WebAudio sintetizado na tela de login."],
        ["Servidor", "Node.js, Colyseus 0.16, Express; simulação a 20 Hz; uma sala por zona; servidor autoritativo."],
        ["Compartilhado", "Pacote com regras e tipos usados por cliente e servidor (classes, itens, zonas, economia)."],
        ["Banco", "PostgreSQL (Supabase em produção, PGlite embutido em desenvolvimento); migrações numeradas."],
        ["Hospedagem atual", "Cliente estático no Render (frixep.com); servidor em máquina própria com Cloudflare Tunnel (api.frixep.com); login Google."],
        ["Testes", "Anti-trapaça, persistência, inventário, classes, mana, chat, PvP, zonas, chegada, economia, mercado, balanceamento e chefes."],
        ["Zonas", "Brasalume (hub), Cinzas, Floresta Gélida, Catacumbas."],
        ["Classes", "Guerreiro, Arqueiro, Clérigo, Mago."],
        ["Raridades", "Inferior (cinza), comum (branco), incomum (verde), raro (azul), épico (roxo), lendário (laranja), mítico (vermelho), ancestral (ciano); inferior e ancestral ainda sem itens; nível máximo 50."],
        ["Moedas", "Tostões de Ferro e Óbolos de Sangue."],
    ], [CW * .22, CW * .78])]
    st += [SP(10), H1("Apêndice B. Glossário")]
    st += [tbl([
        ["Termo", "Significado"],
        ["Servidor autoritativo", "O servidor decide todos os resultados; o cliente só envia intenções. Impede trapaça."],
        ["Afixo", "Atributo extra sorteado em um item (por exemplo, +crítico)."],
        ["Sink e faucet", "Ralo e fonte de moeda; equilíbrio entre os dois controla a inflação."],
        ["Loadout", "Conjunto salvo de equipamento, variações e talentos para trocar rápido."],
        ["Dungeon instanciada", "Área privada criada só para um grupo, com chefe e recompensa próprios."],
        ["RMT", "Venda de moeda ou itens por dinheiro real fora do jogo."],
        ["Retenção D1/D7/D30", "Percentual de jogadores que voltam 1, 7 e 30 dias depois do primeiro acesso."],
        ["Data-driven", "Conteúdo descrito em arquivos de dados, em vez de embutido no código."],
    ], [CW * .26, CW * .74])]
    return st


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc = Doc(OUT)
    story = [NextPageTemplate("body"), PageBreak()] + build()  # a capa é desenhada pelo template "cover" (página 1)
    doc.multiBuild(story, canvasmaker=Numbered)
    print("ok ->", OUT)


if __name__ == "__main__":
    main()
