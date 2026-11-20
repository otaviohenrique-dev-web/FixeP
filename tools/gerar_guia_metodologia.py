# -*- coding: utf-8 -*-
"""Gera docs/GUIA_METODOLOGIA_FRIXEP.pdf (metodologia de implementação: trilha Cru e trilha Polimento).
Uso: python tools/gerar_guia_metodologia.py   (reaproveita estilos de tools/gerar_relatorio.py; precisa de reportlab)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerar_relatorio import *  # noqa: F401,F403  (estilos, fontes, tbl, callout, Doc, Numbered...)
import gerar_relatorio as B

OUT = os.path.join(B.ROOT, "docs", "GUIA_METODOLOGIA_FRIXEP.pdf")
TITLE = "Guia de Metodologia de Implementação"
SZ = {"P": 1, "M": 3, "G": 6}  # dias de trabalho focado (estimativa nossa)


# ------------------------------------------------------------------ conteúdo (dados)
CRU = [
    ("C0", "Fundação: estabilidade e visibilidade", "Antes de construir em cima, garantir que nada se perde e que dá para enxergar o que acontece.",
     "v0.1 Estável", "Servidor 7 dias sem cair; backup restaurado uma vez; CI verde.", [
        ("C0.1", "Corrigir testes antigos (HP de lobo/espectro, baú da cidade) e rodar typecheck + suítes no GitHub Actions a cada PR.", "PR com checks verdes; main nunca fica vermelha.", "M"),
        ("C0.2", "Backup diário do banco, espelho do repositório e segredos no gerenciador de senhas (nunca no Git).", "Restauração testada uma vez, com o passo a passo salvo em docs/.", "P"),
        ("C0.3", "Servidor em VPS no Brasil com reinício automático e monitor de saúde (substitui o PC pessoal).", "api.frixep.com responde com o PC desligado.", "M"),
        ("C0.4", "Segurança: rotacionar a chave exposta do Supabase, configurar DATABASE_CA, apagar contas convidado de teste.", "Chave antiga revogada; conexão ao banco validada.", "P"),
        ("C0.5", "Telemetria mínima: tabela de eventos (login, criação, passo do tutorial, 1º abate, nível 5, saída).", "Uma consulta SQL mostra o funil dos últimos 7 dias.", "M"),
        ("C0.6", "Moderação mínima: silenciar e banir por comando de conta admin; botão Denunciar que grava uma linha.", "Admin silencia e bane; denúncia aparece na tabela.", "M"),
    ]),
    ("C1", "A primeira hora: quests e tutorial", "É a maior alavanca de retenção e o menor esforço. O motor de quests também serve às etapas seguintes.",
     "v0.2 Primeira hora", "Jogador novo chega ao nível 5 sem ajuda externa.", [
        ("C1.1", "Motor de quests orientado a dados: um JSON por quest; tipos abater, coletar, falar, chegar; estado por personagem no banco.", "Quest de teste concluída e persistida após reconectar.", "G"),
        ("C1.2", "NPC com diálogo cru: caixa de texto com botões Aceitar e Entregar, reaproveitando o painel de NPC existente.", "Aceitar e entregar a quest funciona no celular e no PC.", "M"),
        ("C1.3", "Diário (lista em texto) e rastreador de uma linha na HUD.", "Progresso atualiza em tempo real.", "M"),
        ("C1.4", "Tutorial como as 5 primeiras quests (mover, atacar, habilidade, loot, equipar), com faixa de texto.", "Teste com uma pessoa nova, sem explicação sua.", "M"),
        ("C1.5", "15 a 20 quests dos níveis 1 a 10, só texto simples em JSON.", "Cadeia contínua de Brasalume até o nível 10.", "M"),
        ("C1.6", "Dicas de uma vez só (cura, esquiva, mapa-mundo) com marca salva por personagem.", "A dica não reaparece depois de lida.", "P"),
    ]),
    ("C2", "Identidade de build: habilidades e talentos", "Mantém o kit da classe e soma escolhas. A primeira tarefa é refatoração pura, sem mudar o jogo.",
     "v0.3 Builds", "Cada classe com 2 builds jogáveis e salvas.", [
        ("C2.1", "Habilidades como dados: CLASS_DEFS vira lista de efeitos + modificadores, sem mudar nenhum comportamento.", "Todas as suítes existentes continuam verdes (PR isolado).", "G"),
        ("C2.2", "3 variações por habilidade, liberadas nos níveis 10, 20, 30 e 40; escolha em lista, troca livre na cidade.", "Variação escolhida muda o efeito e persiste.", "G"),
        ("C2.3", "Talentos: 1 ponto por nível a partir do 6; 3 ramos como listas; só passivas numéricas; reset em Tostões.", "Gastar, resetar e reconectar mantém o estado.", "G"),
        ("C2.4", "Loadouts: 3 slots que guardam variações e talentos.", "Trocar de slot aplica o build inteiro.", "M"),
        ("C2.5", "Teste de balanceamento por variação e talento (simulação no servidor).", "Nenhuma combinação foge da faixa de dano esperada.", "M"),
    ]),
    ("C3", "Itens com profundidade", "Dá o motivo de caçar o mesmo item muitas vezes. Todo ralo de moeda nasce junto da função.",
     "v0.4 Itens", "Um item com afixos, refino e engaste equipado e salvo.", [
        ("C3.1", "Afixos: de 1 a 5 atributos sorteados no drop, por raridade; guardados no item e somados aos stats.", "Dois itens iguais saem diferentes; tooltip lista os afixos.", "G"),
        ("C3.2", "Refino +1 a +N com Tostões e material, sem risco de perder o item.", "Refinar altera o stat e gasta a moeda.", "M"),
        ("C3.3", "Engaste: espaços e gemas pagas em Óbolos de Sangue.", "Gema somada ao stat; remover devolve o espaço.", "M"),
        ("C3.4", "Conjuntos (sets) de 2 e 4 peças, em dados, com bônus.", "Bônus liga e desliga ao trocar a peça.", "M"),
        ("C3.5", "Forja da ferreira: criar, melhorar e desmontar em materiais.", "Ciclo completo: dropar, desmontar, forjar.", "M"),
        ("C3.6", "Loadout de equipamento (reaproveita C2.4).", "Um clique troca o conjunto inteiro.", "P"),
    ]),
    ("C4", "Mundo: molde de zona, zonas novas e dungeon", "Primeiro o molde, depois as zonas viram preenchimento de dados. Arte provisória gerada por código.",
     "v0.5 Mundo", "Conteúdo contínuo de 1 a 35 e uma dungeon concluída por um grupo.", [
        ("C4.1", "Molde de zona: arquivo de dados (spawns, pontos de caça, chefe, drops, portões) validado em CI.", "Uma zona de teste sobe só com dados.", "M"),
        ("C4.2", "Pântano das Sombras (22 a 28) usando o molde.", "Jogável do portão ao chefe.", "G"),
        ("C4.3", "Cidadela Partida (29 a 35) usando o molde.", "Jogável do portão ao chefe.", "G"),
        ("C4.4", "Dungeon instanciada crua: sala temporária por grupo, 1 chefe, baú e trava semanal.", "Dois grupos simultâneos sem se ver.", "G"),
        ("C4.5", "Chefe de mundo agendado com aviso global em texto.", "Aparece no horário e dropa uma vez por jogador.", "M"),
    ]),
    ("C5", "Social: comunicação, guilda e retenção", "Reaproveita o motor de quests (diárias) e o chat existente.",
     "v0.6 Social", "Dois jogadores se acham, conversam, trocam correio e entram na mesma guilda.", [
        ("C5.1", "Chat com abas: Zona, Global, Grupo, Privado; silenciar jogador.", "Mensagem chega só ao canal certo.", "M"),
        ("C5.2", "Lista de amigos com status online e convite para grupo.", "Amigo online aparece em 1 s.", "M"),
        ("C5.3", "Correio com anexo de itens e moedas (movimentação atômica).", "Anexo nunca duplica nos testes de economia.", "M"),
        ("C5.4", "Guilda crua: criar, convidar, 3 cargos, lista de membros, chat e mensagem do dia.", "Guilda sobrevive a reconexão e reinício do servidor.", "G"),
        ("C5.5", "Buscador de grupo: lista de anúncios com papel (tanque, cura, dano).", "Entrar no anúncio forma o grupo.", "M"),
        ("C5.6", "Quests diárias e semanais (reset por horário) sobre o motor da C1.", "Reseta uma vez por dia, sem acúmulo.", "M"),
        ("C5.7", "Conquistas cruas: lista de metas com contador e título.", "Uma meta concede o título ao concluir.", "M"),
    ]),
    ("C6", "Endgame: raid, arena e temporada", "Tudo reaproveita peças já prontas: dungeon vira raid; fila vira arena.",
     "v0.7 Endgame", "Uma raid concluída e um ranking de arena preenchido.", [
        ("C6.1", "Zonas 36 a 50 e Trono da Geada Negra, repetindo o molde da C4.1.", "Do nível 36 ao 50 sem lacuna de conteúdo.", "G"),
        ("C6.2", "Raid de 8 a 10 jogadores (dungeon com mais vagas e chefe com fases).", "Grupo de teste conclui e recebe o drop.", "M"),
        ("C6.3", "Arena 3 contra 3: fila, partida e ranking em tabela.", "Duas equipes jogam e o ranking atualiza.", "G"),
        ("C6.4", "Temporada: período, ranking que reinicia e recompensa por faixa.", "Virada de temporada entrega os prêmios.", "M"),
    ]),
    ("C7", "Pré-lançamento", "Itens obrigatórios para abrir ao público, em versão simples.",
     "v0.9 Cru completo", "Tudo jogável de ponta a ponta; portão de polimento liberado.", [
        ("C7.1", "Termos de uso, política de privacidade (LGPD) e aviso de idade.", "Aceite registrado no primeiro login.", "P"),
        ("C7.2", "Tela de opções: áudio, teclas, gráficos, idioma.", "Escolhas persistem entre sessões.", "M"),
        ("C7.3", "Loja cosmética crua: lista e compra com moeda premium; nunca vende poder.", "Cosmético comprado aparece no personagem.", "G"),
        ("C7.4", "Beta fechado: convites, formulário de feedback e painel das métricas.", "10 testadores jogam uma semana inteira.", "M"),
    ]),
]

POL = [
    ("P1", "Primeira impressão", "Depois da C7. Torna a primeira hora acolhedora e clara.", [
        ("P1.1", "Criação de personagem: prévia animada da classe, descrição, validação visual do nome.", "C1", "M"),
        ("P1.2", "Guia do tutorial: seta e brilho no alvo, marcadores ! e ? nos NPCs, faixa animada do passo.", "C1.4", "M"),
        ("P1.3", "Diálogo de NPC: retrato, texto digitado, botões estilizados, som de abertura.", "C1.2", "M"),
        ("P1.4", "Diário e rastreador: ícones, barra de progresso, aviso de missão concluída com som e brilho.", "C1.3", "M"),
        ("P1.5", "Dicas contextuais com ícone da tecla ou do toque.", "C1.6", "P"),
    ]),
    ("P2", "Sensação de combate", "O polimento de maior retorno: é o que o jogador faz o tempo todo.",  [
        ("P2.1", "Números de dano e cura flutuantes (cor por tipo, crítico maior).", "C2", "M"),
        ("P2.2", "Efeitos de impacto: partículas, tremor leve e pausa curta no golpe.", "C2", "M"),
        ("P2.3", "Efeito próprio por habilidade e por variação (cor e forma).", "C2.2", "G"),
        ("P2.4", "Sons de combate: golpes, habilidades, passos, subir de nível.", "C2", "M"),
        ("P2.5", "Telégrafos de área legíveis e barra de chefe com fases.", "C2.5", "M"),
    ]),
    ("P3", "Interfaces de build e itens", "Transforma as listas cruas em telas bonitas e rápidas de usar.", [
        ("P3.1", "Árvore de talentos visual: nós, linhas, animação ao gastar ponto, dica ao tocar.", "C2.3", "G"),
        ("P3.2", "Seletor de variações com ícones e pré-visualização; loadouts com ícones.", "C2.2, C2.4", "M"),
        ("P3.3", "Afixos coloridos por faixa, comparação com o item equipado, tooltip final.", "C3.1", "M"),
        ("P3.4", "Feixe de luz e som no drop por raridade; animação de pegar o item.", "C3.1", "M"),
        ("P3.5", "Animação de refino e engaste (sucesso e falha); telas de sets e forja.", "C3.2 a C3.5", "M"),
        ("P3.6", "Transições de painéis e navegação por abas no celular.", "C1 a C3", "M"),
    ]),
    ("P4", "Mundo e arte final", "Feito por lote de zona: uma zona completa por vez, da mais jogada para a menos.", [
        ("P4.1", "Arte final de tiles e props, por zona (um lote por vez).", "C4", "G"),
        ("P4.2", "Clima e iluminação: neve, névoa, dia e noite por zona.", "C4", "M"),
        ("P4.3", "Mapa-mundo ilustrado, minimapa estilizado e transição de zona com nome.", "C4", "M"),
        ("P4.4", "Dungeon: entrada, fechadura, sala do chefe com fases e baú animado.", "C4.4", "M"),
        ("P4.5", "Chefe de mundo: anúncio, aura, barra e drop especial.", "C4.5", "M"),
        ("P4.6", "Ícones definitivos de itens novos, gemas e materiais.", "C3", "G"),
    ]),
    ("P5", "Áudio", "O jogo muda de patamar com som. Pode andar em paralelo à arte.", [
        ("P5.1", "Trilha por zona e cidade, com mistura suave entre elas.", "C4", "M"),
        ("P5.2", "Ambientes (vento, fogo, água) e equilíbrio de volumes.", "C7.2", "M"),
        ("P5.3", "Sons de interface: clique, abrir, erro, moeda.", "C7.2", "P"),
    ]),
    ("P6", "Social, endgame e loja", "O que dá orgulho e vontade de mostrar.", [
        ("P6.1", "Chat colorido por canal, abas estilizadas e notificação.", "C5.1", "M"),
        ("P6.2", "Amigos e correio: ícones, indicador de novo e aviso na tela.", "C5.2, C5.3", "M"),
        ("P6.3", "Guilda: emblema personalizável, tela própria e nome acima do personagem.", "C5.4", "G"),
        ("P6.4", "Emotes, títulos e bordas de retrato.", "C5.7", "M"),
        ("P6.5", "Arena: fila, contagem, placar e ranking estilizados.", "C6.3", "M"),
        ("P6.6", "Raid e temporada: arte, sons, tela de recompensas e subida de faixa.", "C6.2, C6.4", "G"),
        ("P6.7", "Loja: vitrine, prévia do cosmético no personagem e confirmação de compra.", "C7.3", "G"),
    ]),
    ("P7", "Acabamento global e lançamento", "A última camada: tudo que garante a entrega em perfeito funcionamento.", [
        ("P7.1", "Desempenho no celular: atlas, memória, FPS e orçamento por zona.", "P4", "M"),
        ("P7.2", "Acessibilidade: contraste, tamanho de texto, daltonismo, controles configuráveis.", "C7.2", "M"),
        ("P7.3", "Revisão dos textos em PT-BR e de telas vazias e de erro.", "P1 a P6", "M"),
        ("P7.4", "QA visual em 3 tamanhos de tela e correção de cortes.", "P1 a P6", "M"),
        ("P7.5", "Material de lançamento: capturas, vídeo e página do site.", "P7.4", "M"),
    ]),
]


def days(cards, idx=3): return sum(SZ[c[idx]] for c in cards)


# ------------------------------------------------------------------ gráficos
def chart_cycle():
    steps = [("1  Escolher", "um card do guia"), ("2  Fazer cru", "só o essencial"), ("3  Provar", "teste + typecheck"),
             ("4  PR pequeno", "descreve como testar"), ("5  Mesclar", "no mesmo dia"), ("6  Registrar", "marcar o card")]
    n = len(steps); gap = 10; bw = (CW - gap * (n - 1)) / n; h = 62
    d = Drawing(CW, h)
    for i, (a, b) in enumerate(steps):
        x = i * (bw + gap)
        col = EMBER if i in (1, 4) else NIGHT2
        d.add(Rect(x, 8, bw, 44, fillColor=col, strokeColor=None, rx=5, ry=5))
        d.add(String(x + bw / 2, 34, a, fontName="Seg-B", fontSize=8.6, fillColor=colors.white, textAnchor="middle"))
        d.add(String(x + bw / 2, 20, b, fontName="Seg", fontSize=7.2, fillColor=colors.HexColor("#c9d3e3"), textAnchor="middle"))
        if i < n - 1:
            d.add(Polygon([x + bw + 2, 26, x + bw + 2, 36, x + bw + gap - 2, 31], fillColor=GOLD, strokeColor=None))
    return d


def chart_timeline():
    rows = [(c[0] + "  " + c[1].split(":")[0], days(c[5]), EMBER) for c in CRU] + [(p[0] + "  " + p[1], days(p[3]), ICE) for p in POL]
    total = sum(r[1] for r in rows)
    left, bh, gap = 190, 9, 4
    h = len(rows) * (bh + gap) + 30
    d = Drawing(CW, h)
    cw = CW - left - 8
    months = int(total / 20) + 1
    for m in range(0, months + 1, 2):
        x = left + m * 20 * cw / total
        if x <= left + cw + 1:
            d.add(Line(x, 16, x, h - 2, strokeColor=LINE, strokeWidth=0.4))
            d.add(String(x, 4, f"M{m}", fontName="Seg", fontSize=7.2, fillColor=MUTE, textAnchor="middle"))
    y = h - 18; acc = 0
    for name, dd, col in rows:
        d.add(String(0, y + 2.5, name, fontName="Seg", fontSize=7.9, fillColor=INK))
        d.add(Rect(left + acc * cw / total, y, max(dd * cw / total, 2), bh, fillColor=col, strokeColor=None, rx=2, ry=2))
        acc += dd; y -= bh + gap
    return d, total


def tag(txt, color):
    return Paragraph(f'<font color="{color.hexval().replace("0x", "#")}"><b>{txt}</b></font>', S["cell"])


# ------------------------------------------------------------------ página
class Doc2(B.Doc):
    def __init__(self, fn, **kw):
        super().__init__(fn, **kw)
        self.title = "FrixeP - " + TITLE
        self.subject = "Metodologia de implementação: trilha Cru e trilha Polimento"

    def cover(self, c, d):
        c.saveState()
        c.setFillColor(NIGHT); c.rect(0, 0, W, H, stroke=0, fill=1)
        for i, a in enumerate([.10, .07, .05]):
            c.setFillColor(colors.Color(.83, .33, .11, alpha=a)); c.circle(W * .72, H * .30, 190 - i * 55, stroke=0, fill=1)
        c.setStrokeColor(GOLD); c.setLineWidth(1.2); c.line(LM, H - 38 * mm, W - RM, H - 38 * mm)
        c.setFillColor(GOLDL); c.setFont("Seg-B", 9); c.drawString(LM, H - 32 * mm, "GUIA DE EXECUÇÃO  ·  DESENVOLVIMENTO SOLO")
        c.setFillColor(colors.HexColor("#8fa3c4")); c.setFont("Seg", 9); c.drawRightString(W - RM, H - 32 * mm, "Versão 1.0  ·  20 de novembro de 2026")
        if os.path.exists(B.EMB): c.drawImage(B.EMB, W / 2 - 40 * mm, H - 128 * mm, 80 * mm, 80 * mm, mask="auto")
        c.setFillColor(colors.white); c.setFont("Geo-B", 38); c.drawCentredString(W / 2, H * .45, "FrixeP")
        c.setFillColor(GOLDL); c.setFont("Geo-I", 14); c.drawCentredString(W / 2, H * .45 - 22, "Primeiro funcionando, depois bonito")
        c.setStrokeColor(GOLD); c.line(W / 2 - 40 * mm, H * .45 - 38, W / 2 + 40 * mm, H * .45 - 38)
        c.setFillColor(colors.white); c.setFont("Seg-B", 16)
        c.drawCentredString(W / 2, H * .45 - 66, "Metodologia de implementação")
        c.drawCentredString(W / 2, H * .45 - 86, "Trilha Cru  ·  Trilha Polimento")
        c.setFillColor(colors.HexColor("#8fa3c4")); c.setFont("Seg", 9.5)
        c.drawCentredString(W / 2, H * .45 - 118, "Ordem de entrega, rotina de mesclagem e economia de esforço")
        c.setFont("Seg", 8.5)
        c.drawString(LM, 20 * mm, "Complemento do Relatório de Produto e Roadmap · FrixeP")
        c.drawRightString(W - RM, 20 * mm, "Documento de planejamento interno")
        c.restoreState()

    def chrome(self, c, d):
        c.saveState()
        c.setFillColor(NIGHT); c.rect(0, H - 17 * mm, W, 17 * mm, stroke=0, fill=1)
        c.setFillColor(GOLD); c.rect(0, H - 17.8 * mm, W, 0.8 * mm, stroke=0, fill=1)
        if os.path.exists(B.EMB): c.drawImage(B.EMB, LM, H - 15.2 * mm, 12 * mm, 12 * mm, mask="auto")
        c.setFillColor(colors.white); c.setFont("Geo-B", 12); c.drawString(LM + 15 * mm, H - 9.4 * mm, "FrixeP")
        c.setFillColor(colors.HexColor("#8fa3c4")); c.setFont("Seg", 8.2); c.drawString(LM + 15 * mm, H - 13.6 * mm, TITLE)
        c.setFillColor(GOLDL); c.setFont("Seg-B", 8); c.drawRightString(W - RM, H - 9.4 * mm, "USO INTERNO")
        c.setFillColor(colors.HexColor("#8fa3c4")); c.setFont("Seg", 8); c.drawRightString(W - RM, H - 13.6 * mm, "20/11/2026 · v1.0")
        c.setStrokeColor(LINE); c.setLineWidth(0.6); c.line(LM, 14 * mm, W - RM, 14 * mm)
        c.restoreState()


class Numbered2(B.Numbered):
    def save(self):
        n = len(self._saved)
        for st in self._saved:
            self.__dict__.update(st)
            if self._pageNumber > 1:
                self.setFont("Seg", 8); self.setFillColor(MUTE)
                self.drawString(LM, 9.5 * mm, "FrixeP · " + TITLE)
                self.drawRightString(W - RM, 9.5 * mm, f"Página {self._pageNumber} de {n}")
            rl_canvas.Canvas.showPage(self)
        rl_canvas.Canvas.save(self)


# ------------------------------------------------------------------ conteúdo
def stage_cru(c):
    code, name, goal, tagv, gate, cards = c
    out = [H2(f"{code} · {name}"), P(goal)]
    rows = [["ID", "Entrega em versão crua", "Pronto quando", "Tam."]]
    for cid, ent, pr, tm in cards:
        rows.append([f"<b>{cid}</b>", ent, pr, tm])
    out.append(tbl(rows, [CW * .08, CW * .52, CW * .32, CW * .08]))
    out.append(P(f"<b>Marco {tagv}</b> · {gate} · ≈ {days(cards)} dias úteis. Ao chegar aqui: mesclar, criar a tag e fazer o backup do banco.", "small"))
    return [KeepTogether(out[:2] + [out[2]]), out[3]]


def stage_pol(p):
    code, name, goal, cards = p
    out = [H2(f"{code} · {name}"), P(goal)]
    rows = [["ID", "O toque final", "Depende de", "Tam."]]
    for cid, ent, dep, tm in cards:
        rows.append([f"<b>{cid}</b>", ent, dep, tm])
    out.append(tbl(rows, [CW * .08, CW * .62, CW * .22, CW * .08]))
    out.append(P(f"≈ {days(cards)} dias úteis. Um PR por tela ou efeito; mesclar ao concluir cada um.", "small"))
    return [KeepTogether(out[:2] + [out[2]]), out[3]]


def build():
    st = []
    st += [Paragraph("Sumário", ParagraphStyle("h1x", parent=S["h1"])), SP(4)]
    toc = TableOfContents(); toc.levelStyles = [S["toc1"]]; toc.dotsMinLevel = 0
    st += [toc, PageBreak()]

    cru_days = sum(days(c[5]) for c in CRU); pol_days = sum(days(p[3]) for p in POL)
    tl, total = chart_timeline()

    # 1 -------------------------------------------------------------
    st += [H1("1. Como usar este guia")]
    st += [P("Este guia transforma o Relatório de Produto e Roadmap em um <b>plano de execução para um desenvolvedor solo</b>. Ele responde a três perguntas: "
             "<i>o que faço primeiro</i>, <i>até onde vou em cada tarefa</i> e <i>quando guardo o trabalho no repositório</i>.")]
    st += [P("Todo o conteúdo faltante foi separado em duas trilhas, executadas em sequência:")]
    st += [tbl([
        ["", "Trilha 1 · MUITO IMPORTANTES (Cru)", "Trilha 2 · POLIMENTO"],
        ["Objetivo", "Entregar a função completa e jogável, mesmo feia.", "Dar o toque final de designer sobre o que já funciona."],
        ["Quando", "Primeiro, do início até o marco v0.9.", "Só depois do marco v0.9 (portão de polimento)."],
        ["Como", "Interface em texto e listas, painéis já existentes, dados em JSON, arte provisória, sem animação.", "Estilo, efeitos, animações, sons, arte final, ajuste fino em celular."],
        ["Regra de ouro", "Se o jogador consegue usar e o servidor valida, está pronto.", "Nunca muda regra de jogo nem o servidor; só aparência e sensação."],
        [f"Tamanho", f"{sum(len(c[5]) for c in CRU)} cards · ≈ {cru_days} dias úteis", f"{sum(len(p[3]) for p in POL)} cards · ≈ {pol_days} dias úteis"],
    ], [CW * .16, CW * .42, CW * .42])]
    st += [SP(6), callout("Ideia central",
                          "Refinar cedo custa caro: o que é embelezado hoje pode ser refeito amanhã quando a regra mudar. "
                          "Por isso <b>nada é embelezado até que tudo funcione</b>. Cada card cru é pequeno, testado e mesclado no mesmo dia, "
                          "e o repositório nunca fica atrás do seu trabalho.")]
    st += [H2("Como ler os cards")]
    st += [tbl([
        ["Campo", "Significado"],
        ["ID", "Código do card (C = cru, P = polimento). Use o ID no nome da branch, no commit e no PR."],
        ["Entrega / toque final", "O que fazer e, implicitamente, o que <b>não</b> fazer. No cru, nada além do descrito."],
        ["Pronto quando", "Critério objetivo de saída. Passou nele, mescla e segue; não adicione “só mais uma coisa”."],
        ["Tam.", "P ≈ 1 dia · M ≈ 3 dias · G ≈ 6 dias de trabalho focado, com apoio de IA. São estimativas nossas; recalibre depois das primeiras entregas."],
    ], [CW * .22, CW * .78])]
    st += [PageBreak()]

    # 2 -------------------------------------------------------------
    st += [H1("2. O método em uma página")]
    st += [P("O trabalho é feito em <b>fatias verticais</b>: cada card atravessa servidor, banco e cliente, mas só até o ponto em que funciona. "
             "O ciclo é sempre o mesmo, do menor card ao maior:")]
    st += [chart_cycle(), P("Figura 1. Ciclo de entrega. Os passos 2 e 5 são os que mais protegem o projeto: fazer pouco e mesclar cedo.", "cap"), SP(4)]
    st += [H2("2.1 Cru versus Polimento")]
    st += [tbl([
        ["Aspecto", "Cru (trilha 1)", "Polimento (trilha 2)"],
        ["Interface", "Listas, botões e texto; reutiliza painéis e classes CSS existentes.", "Estilo na paleta noite, brasa e ouro; ícones, molduras, estados de hover e vazio."],
        ["Movimento", "Nenhum. Estado muda de imediato.", "Transições, partículas, brilhos, feedback ao toque."],
        ["Som", "Nenhum, ou o que já existe.", "Efeitos, ambientes e trilha."],
        ["Arte", "Placeholders e ícones atuais; arte gerada por código.", "Arte final por zona, ícones definitivos."],
        ["Dados", "JSON simples, valores razoáveis.", "Balanceamento fino com dados reais do beta."],
        ["Desempenho", "Só o necessário para não travar.", "Atlas, memória, FPS no celular modesto."],
        ["Testes", "1 teste de aceitação por card, no servidor.", "Conferência visual em 3 tamanhos de tela."],
    ], [CW * .16, CW * .42, CW * .42])]
    st += [H2("2.2 O que fica de fora do cru (e vai para o polimento)")]
    st += BL([
        "Qualquer CSS novo além do mínimo para a tela caber no celular.",
        "Animações, partículas, brilhos, sons e música.",
        "Arte nova. Se faltar ícone, use o do item parecido ou um quadrado com a sigla.",
        "Otimização antecipada: só se a tela travar de verdade.",
        "Texto final: use frases curtas e honestas; a revisão literária é o card P7.3.",
    ])
    st += [H2("2.3 O que nunca fica de fora (nem no cru)")]
    st += BL([
        "<b>Servidor decide tudo:</b> o cliente só envia intenção. Sem isso a economia se quebra e retrabalho fica caro.",
        "<b>Persistência:</b> o que o jogador ganhou sobrevive a reconectar e a reiniciar o servidor.",
        "<b>Celular:</b> toda tela nova abre e funciona por toque, mesmo sem estilo.",
        "<b>Um teste automatizado</b> que prova o critério “pronto quando”.",
    ])
    st += [PageBreak()]

    # 3 -------------------------------------------------------------
    st += [H1("3. Rotina de segurança do repositório")]
    st += [P("O objetivo é que uma queda de energia, um disco danificado ou um erro de comando <b>nunca custe mais que algumas horas</b>. "
             "Para isso o guia recomenda <b>mesclar cada entrega concluída</b>, mesmo que pequena, e manter tudo o que ainda está em andamento enviado ao GitHub.")]
    st += [H2("3.1 Quando mesclar")]
    st += [tbl([
        ["Situação", "Ação"],
        ["Card cru concluído e “pronto quando” atendido", "Abrir PR e <b>mesclar no mesmo dia</b>. Um PR por card; PR pequeno revisa e volta rápido."],
        ["Card grande (G) que levará vários dias", "Quebrar em partes que se sustentam sozinhas (dados, servidor, cliente) e mesclar cada parte."],
        ["Recurso pela metade, mas sem risco para o jogo atual", "Mesclar <b>atrás de uma chave de recurso</b> desligada (flag em packages/shared). O código fica seguro no main e invisível ao jogador."],
        ["Refatoração (por exemplo C2.1)", "PR isolado, sem mudança de comportamento, mesclado sozinho antes de qualquer recurso novo."],
        ["Fim do dia com trabalho incompleto", "Fazer <i>commit</i> e <i>push</i> da branch (PR em rascunho). Não mescla, mas está salvo no GitHub."],
        ["Card de polimento concluído", "Um PR por tela ou efeito; mesclar ao concluir. Polimento nunca acumula em branch longa."],
        ["Marco concluído (v0.1, v0.2...)", "Mesclar tudo, criar a <b>tag</b> da versão, anotar o que mudou, fazer backup do banco e atualizar o servidor."],
    ], [CW * .38, CW * .62])]
    st += [H2("3.2 Regras de ouro")]
    st += BL([
        "<b>Nunca passe um dia sem enviar:</b> se há trabalho local que o GitHub não tem, é um risco. Rode <font name='Seg-B'>git status</font> ao encerrar.",
        "<b>Nunca deixe uma branch viver mais de 3 dias.</b> Branch longa gera conflito e medo de mesclar.",
        "<b>Nomes:</b> <font name='Seg-B'>feat/cru-c1-quests</font>, <font name='Seg-B'>feat/polish-p2-combate</font>, <font name='Seg-B'>docs/...</font>. Commits começam com “cru:” ou “polish:”.",
        "<b>Main protegida:</b> tudo por PR. Se algo der errado, desfaça com um PR de reversão (<font name='Seg-B'>git revert</font>), nunca com <font name='Seg-B'>reset --hard</font> ou <font name='Seg-B'>push --force</font>.",
        "<b>Antes de mesclar migração de banco:</b> faça backup do banco. Migrações só avançam; reverter é criar outra migração.",
        "<b>Depois de mesclar:</b> o cliente publica sozinho no Render; se houve mudança no servidor, rode o script de atualização do servidor.",
        "<b>Arte pesada</b> segue no Git LFS; segredos e <font name='Seg-B'>.env</font> nunca entram no Git.",
    ])
    st += [H2("3.3 Cópias de segurança (três camadas)")]
    st += [tbl([
        ["Camada", "O que protege", "Frequência"],
        ["GitHub (branch + PR + main)", "Todo o código e a arte versionada", "A cada fim de sessão (push) e a cada card (merge)"],
        ["Espelho do repositório (<font name='Seg-B'>git clone --mirror</font> em outro disco ou nuvem)", "Perda ou bloqueio da conta do GitHub", "Semanal, no marco"],
        ["Backup do banco (Supabase) com restauração testada", "Personagens, itens e economia", "Diário automático + antes de migrações"],
        ["Gerenciador de senhas / cofre", "Chaves, tokens e conteúdo do .env", "Atualizar quando rotacionar um segredo"],
    ], [CW * .40, CW * .34, CW * .26])]
    st += [PageBreak()]

    # 4 -------------------------------------------------------------
    st += [H1("4. Economia de esforço e de tokens")]
    st += [P("Trabalhar com IA custa contexto. Cada pedido grande repete o que já foi dito. As práticas abaixo reduzem o consumo e aumentam o acerto na primeira tentativa.")]
    st += [tbl([
        ["Prática", "Como aplicar"],
        ["Uma conversa por card", "Ao terminar um card, encerre e abra outra conversa para o próximo. Contexto limpo gasta menos e erra menos."],
        ["Pedido enxuto e completo", "Informe só: ID do card, arquivos-alvo, “pronto quando” e as restrições do cru. Nada de contar a história do projeto de novo."],
        ["Indique caminhos, não cole arquivos", "“packages/server/src/rooms/ZoneRoom.ts, função travel()” vale mais e custa menos que colar o arquivo."],
        ["Dados antes de código", "Quests, zonas, itens e talentos em JSON. Adicionar conteúdo vira editar dados, não pedir lógica nova."],
        ["Teste como especificação", "Peça primeiro o teste de aceitação curto; depois a implementação que o faz passar."],
        ["Sem capturas de tela no cru", "Use texto, logs e testes. Capturas ficam para o polimento, onde o visual é o objetivo."],
        ["Lote por tela no polimento", "Um pedido de estilo atende vários cards de uma mesma tela (ex.: todo o painel de talentos)."],
        ["Reutilize o padrão", "Depois do primeiro JSON de quest, diga “siga o padrão de quests/...”; o assistente copia o formato."],
        ["Registre o progresso", "Marque o card concluído no PR e em um arquivo de progresso; a próxima conversa lê uma linha, não relê tudo."],
    ], [CW * .30, CW * .70])]
    st += [SP(6), H2("Modelo de pedido (copie e preencha)")]
    st += [callout("Card CX.Y · nome",
                   "<b>Versão crua.</b> Arquivos: &lt;caminhos&gt;. <b>Pronto quando:</b> &lt;critério do guia&gt;. "
                   "<b>Restrições:</b> reutilizar painéis e classes existentes, sem CSS novo além do mínimo, sem animação nem arte nova, servidor valida e persiste, "
                   "um teste em packages/server/test/. <b>Ao final:</b> typecheck e testes verdes, branch feat/cru-cX-..., PR com “como testar”.", GOLD)]
    st += [PageBreak()]

    # 5 -------------------------------------------------------------
    st += [H1("5. Visão geral: a linha do tempo")]
    st += [P(f"A figura mostra as duas trilhas em sequência. Em vermelho, o cru (≈ {cru_days} dias úteis); em azul, o polimento (≈ {pol_days} dias úteis). "
             f"Somando tudo dá cerca de <b>{total} dias úteis, aproximadamente {total / 20:.0f} meses</b> a 20 dias úteis por mês. "
             "É uma estimativa de planejamento, sem folga para imprevistos: some 20 a 30% de reserva.")]
    st += [tl, P("Figura 2. Etapas em ordem de execução. O marco v0.9 separa o “funciona” do “fica bonito”.", "cap"), SP(4)]
    st += [H2("5.1 Marcos e versões")]
    rows = [["Marco (tag)", "Etapa", "Critério de aceite"]]
    for c in CRU:
        rows.append([f"<b>{c[3]}</b>", f"{c[0]} · {c[1].split(':')[0]}", c[4]])
    rows.append(["<b>v0.95 Polido</b>", "P1 a P6", "Todas as telas com estilo e som; sem regressão de regras."])
    rows.append(["<b>v1.0 Lançamento</b>", "P7", "Desempenho, acessibilidade, textos e QA aprovados no beta aberto."])
    st += [tbl(rows, [CW * .20, CW * .30, CW * .50])]
    st += [SP(6), callout("Portão de polimento",
                          "A trilha 2 só começa quando o marco <b>v0.9</b> estiver mesclado e marcado, e uma semana de teste com jogadores reais estiver sem erro grave. "
                          "Exceção permitida: uma <i>janela de respiro</i> de até 2 dias após cada marco, para um item de polimento à sua escolha. Serve para manter a motivação sem atrasar o cru.", EMBER)]
    st += [PageBreak()]

    # 6 -------------------------------------------------------------
    st += [H1("6. Trilha 1 · MUITO IMPORTANTES (Cru)")]
    st += [P("Execute as etapas na ordem. Dentro de cada etapa, siga também a ordem das linhas: as dependências já estão consideradas. "
             "O foco é <b>entregar a função</b>: se a tela está feia, está certo.")]
    st += [P("Por que esta ordem? <b>C0</b> protege o que existe. <b>C1</b> cria o motor de quests que <b>C5</b> reutiliza. <b>C2</b> refatora as habilidades antes de qualquer "
             "variação. <b>C3</b> depende das variações para os loadouts. <b>C4</b> cria o molde que <b>C6</b> repete. <b>C7</b> fecha o que é obrigatório para abrir ao público.", "small")]
    for c in CRU: st += stage_cru(c)
    st += [PageBreak()]

    # 7 -------------------------------------------------------------
    st += [H1("7. Trilha 2 · POLIMENTO")]
    st += [P("Aqui entra o designer. Cada card de polimento está ligado a um card cru que já funciona, então <b>nenhuma regra muda</b>: só aparência, movimento e som. "
             "A ordem prioriza o que o jogador vê com mais frequência: primeira hora, combate, depois interfaces, mundo, som e social.")]
    st += [callout("Padrão de qualidade do polimento",
                   "Paleta noite, brasa e ouro; estados de passar o mouse, desabilitado, vazio e erro; resposta visual e sonora a cada ação; 60 FPS no computador e estável no celular; "
                   "nada cortado em 3 tamanhos de tela; zero mudança nas regras do servidor.", ICE)]
    st += [SP(4)]
    for p in POL: st += stage_pol(p)
    st += [PageBreak()]

    # 8 -------------------------------------------------------------
    st += [H1("8. Rotina de trabalho e checklists")]
    st += [H2("8.1 Semana-tipo")]
    st += [tbl([
        ["Dia", "Foco", "Saída"],
        ["Segunda", "Escolher 2 ou 3 cards e abrir as branches.", "Lista da semana escrita."],
        ["Terça a quinta", "Executar um card por vez no ciclo da Figura 1.", "Um PR mesclado por card."],
        ["Sexta", "Teste de jogo de 20 minutos, correção de bugs, backup, atualizar o servidor.", "Main verde e servidor na mesma versão do GitHub."],
        ["Fim de marco", "Tag, notas da versão, espelho do repositório, backup do banco.", "Versão marcada e recuperável."],
    ], [CW * .18, CW * .54, CW * .28])]
    st += [H2("8.2 Checklist: card cru pronto")]
    st += BL([
        "Funciona no computador e no celular (toque).",
        "O servidor valida; nada de confiar no cliente.",
        "Persiste: reconectar e reiniciar o servidor mantém o estado.",
        "Há pelo menos 1 teste de aceitação; typecheck e suítes estão verdes.",
        "Texto em PT-BR, mesmo que simples; sem segredos no código.",
        "PR descreve “como testar” e usa o ID do card. Se incompleto, está atrás de uma chave de recurso.",
    ])
    st += [H2("8.3 Checklist: card de polimento pronto")]
    st += BL([
        "Segue a paleta e o estilo do jogo; ícones e molduras consistentes.",
        "Há resposta visual e sonora às ações principais.",
        "Estados de vazio, erro e desabilitado foram tratados.",
        "Conferido em celular, tablet e computador; sem texto cortado.",
        "FPS estável; nenhuma regra de servidor foi alterada.",
    ])
    st += [H2("8.4 Checklist: fechamento de marco")]
    st += BL([
        "Todos os PRs da etapa mesclados; branches antigas removidas.",
        "Tag criada e notas da versão escritas.",
        "Backup do banco feito e espelho do repositório atualizado.",
        "Servidor atualizado para a versão da tag; saúde local e pública respondendo.",
        "Teste de aceitação do marco jogado do início ao fim.",
    ])
    st += [PageBreak()]

    # 9 -------------------------------------------------------------
    st += [H1("9. Riscos do método e como evitá-los")]
    st += [tbl([
        ["Risco", "Sinal de alerta", "Como evitar"],
        ["Polir cedo demais", "Você está ajustando brilho de algo que ainda muda de regra.", "Respeitar o portão v0.9; usar a janela de respiro de 2 dias."],
        ["Card que cresce", "O “pronto quando” vira uma lista de 8 itens.", "Quebrar em dois cards; o que sobrar vira novo card, não parte do atual."],
        ["Branch longa", "Mais de 3 dias sem mesclar.", "Fatiar, usar chave de recurso e mesclar a parte segura."],
        ["Cru com dívida", "Código copiado, sem teste, “depois eu arrumo”.", "O teste de aceitação é obrigatório; refatorações têm PR próprio."],
        ["Perda de dados do jogador", "Migração sem backup.", "Backup obrigatório antes de migrar; restauração testada na C0.2."],
        ["Esgotamento", "Semanas sem entregar algo visível.", "Marcos curtos, janela de respiro e jogar o próprio jogo toda sexta."],
        ["Estimativa otimista", "Os cards M levam 5 dias.", "Recalibrar P, M e G após a C1 e atualizar a linha do tempo."],
    ], [CW * .22, CW * .36, CW * .42])]
    st += [SP(8), H2("Os 10 primeiros passos")]
    st += [tbl([
        ["Ordem", "Card", "Por que agora"],
        ["1", "C0.1 · testes e CI", "Base verde antes de qualquer coisa nova."],
        ["2", "C0.2 · backup e espelho", "Garante que nada se perde daqui para frente."],
        ["3", "C0.4 · segurança", "A chave exposta é o risco mais barato de resolver."],
        ["4", "C0.3 · servidor em VPS", "Estabilidade antes de convidar alguém para jogar."],
        ["5", "C0.5 · telemetria", "Você passa a medir desde o primeiro dia."],
        ["6", "C0.6 · moderação mínima", "Pré-requisito para qualquer teste aberto."],
        ["7", "C1.1 · motor de quests", "Destrava tutorial, campanha, diárias e conquistas."],
        ["8", "C1.2 e C1.3 · NPC e diário", "Primeira interação visível do motor."],
        ["9", "C1.4 · tutorial", "Primeira hora guiada, o maior ganho de retenção."],
        ["10", "C1.5 e C1.6 · quests 1 a 10 e dicas", "Marco v0.2 e primeiro teste com pessoas novas."],
    ], [CW * .10, CW * .42, CW * .48])]
    st += [SP(8), callout("Resumo",
                          "Faça pouco, faça funcionar, prove com um teste, mescle no mesmo dia. Só quando tudo estiver de pé, vista o jogo. "
                          "Assim o repositório está sempre à frente do seu cansaço e o produto funciona antes de ficar bonito.", GOLD)]
    st += [PageBreak()]

    # Apêndice -------------------------------------------------------
    st += [H1("Apêndice. Glossário")]
    st += [tbl([
        ["Termo", "Significado"],
        ["Cru", "Versão funcional mínima: sem estilo, animação, som ou arte nova."],
        ["Polimento", "Camada final de estilo, efeitos, sons, animações e ajuste fino."],
        ["Fatia vertical", "Entrega que atravessa servidor, banco e cliente, mas só até funcionar."],
        ["Chave de recurso (feature flag)", "Interruptor que mantém um recurso incompleto desligado no código mesclado."],
        ["PR (Pull Request)", "Pedido de mesclagem de uma branch no main, com descrição e testes."],
        ["Tag", "Marca permanente de uma versão do repositório (ex.: v0.2)."],
        ["Espelho do repositório", "Cópia completa (todas as branches e tags) guardada fora do GitHub."],
        ["Marco", "Conjunto de cards que forma uma versão jogável e testável."],
        ["Portão de polimento", "Condição para liberar a trilha 2: marco v0.9 e uma semana de teste sem erro grave."],
        ["Data-driven", "Conteúdo descrito em arquivos de dados, em vez de embutido no código."],
    ], [CW * .30, CW * .70])]
    return st


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc = Doc2(OUT)
    story = [NextPageTemplate("body"), PageBreak()] + build()
    doc.multiBuild(story, canvasmaker=Numbered2)
    print("ok ->", OUT)


if __name__ == "__main__":
    main()
