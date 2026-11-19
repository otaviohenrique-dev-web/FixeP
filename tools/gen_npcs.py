"""
Gera os kits de sprites dos NPCs de ofício (assets/placeholder/npc_smith|npc_merchant|npc_auctioneer .png + .json), por código,
no formato do Aseprite (quadros 64x64, tags <animacao>_<direcao>, 4 diagonais: desenha SE e NE; o jogo espelha SW e NW).
Obra própria do projeto, no mesmo estilo dos monstros (contorno escuro automático, paleta fria com brasas e velas).

  Brasa    (ferreira)    avental, óculos na testa, martelo, bigorna com barra em brasa, fumaça e fagulhas.
  Garrick  (comerciante) capuz, lanterna que balança, bolsas de moedas, balança sobre um caixote e sacos.
  Ossian   (leiloeiro)   casaca negra, cartola, monóculo, martelo de leilão e púlpito com livro-caixa, sino e vela.

Animações: idle (parado, respiração + efeitos), talk (conversa, quando a janela abre) e uma de ofício:
  work (Brasa martela), count (Garrick conta moedas / pesa), gavel (Ossian bate o martelo).
Arte final em assets/npcs/<nome>.* tem prioridade (o jogo já procura lá).
Uso: python tools/gen_npcs.py        (precisa de Python e Pillow)
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_placeholder_bodies as gp  # noqa: E402

F, FEET, OL = gp.F, gp.FEET, gp.OL
ANIMS = {
    "smith": [("idle", 6, 150), ("talk", 6, 110), ("work", 6, 90)],
    "merchant": [("idle", 6, 150), ("talk", 6, 110), ("count", 6, 110)],
    "auctioneer": [("idle", 6, 150), ("talk", 6, 110), ("gavel", 6, 90)],
}

# ------------------------------------------------------------------ paleta
STEEL = (88, 98, 116, 255); STEEL_D = (50, 56, 70, 255); STEEL_L = (150, 164, 186, 255)
LEATHER = (96, 62, 38, 255); LEATHER_D = (62, 38, 24, 255); LEATHER_L = (132, 90, 56, 255)
SKIN = (214, 164, 122, 255); SKIN_D = (170, 120, 88, 255); SKIN_PALE = (206, 196, 190, 255); SKIN_PALE_D = (150, 140, 142, 255)
GOLD = (236, 186, 82, 255); GOLD_D = (160, 116, 46, 255)
EMBER = (255, 122, 42, 255); EMBER_L = (255, 214, 120, 255)
WOOD = (104, 70, 44, 255); WOOD_D = (66, 42, 28, 255); WOOD_L = (146, 102, 64, 255)
CLOTH = (200, 190, 170, 255); CLOTH_D = (140, 130, 114, 255)


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (255,)


def outline(layer):
    """Contorno escuro de 1 px em volta de tudo que é opaco (só no corpo e nos objetos; efeitos entram depois)."""
    a = layer.split()[3].point(lambda v: 255 if v > 40 else 0)
    ring = ImageChops_subtract(a.filter(ImageFilter.MaxFilter(3)), a)
    solid = Image.new("RGBA", layer.size, OL)
    out = layer.copy()
    out.paste(solid, (0, 0), ring)
    return out


def ImageChops_subtract(a, b):
    from PIL import ImageChops
    return ImageChops.subtract(a, b)


class Canvas:
    def __init__(self):
        self.body = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        self.fx = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        self.b = ImageDraw.Draw(self.body)
        self.f = ImageDraw.Draw(self.fx)

    def finish(self, white=0.0):
        base = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        sh = ImageDraw.Draw(base)
        sh.ellipse([8, FEET - 3, 56, FEET + 5], fill=(0, 0, 0, 95))     # sombra no chão
        base.alpha_composite(outline(self.body))
        base.alpha_composite(self.fx)
        return base


def glow(c, cx, cy, r, color, alpha):
    """Brilho suave (círculos concêntricos translúcidos)."""
    for k in range(4, 0, -1):
        rr = r * k / 4
        c.f.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=color[:3] + (int(alpha * (5 - k) / 6),))


def smoke(c, x0, y0, t, n=3, spread=3, color=(120, 120, 134)):
    """Fumaça subindo em ciclo: cada baforada nasce, sobe, abre e some."""
    for j in range(n):
        p = (t + j / n) % 1.0
        x = x0 + math.sin((p * 2 + j) * 2.4) * spread * p
        y = y0 - p * 17
        r = 1.2 + p * 3.2
        a = int(120 * (1 - p) ** 1.4)
        c.f.ellipse([x - r, y - r, x + r, y + r], fill=color + (a,))


def sparks(c, x0, y0, t, n=5, power=1.0, seed=3):
    rnd = random.Random(seed)
    for j in range(n):
        ang = rnd.uniform(-2.6, -0.5)
        sp = rnd.uniform(6, 13) * power
        p = min(1.0, t * 1.0 + rnd.uniform(0, 0.2))
        x = x0 + math.cos(ang) * sp * p
        y = y0 + math.sin(ang) * sp * p + 9 * p * p
        a = int(255 * (1 - p))
        if a > 20:
            c.f.rectangle([x, y, x + 1, y + 1], fill=EMBER_L[:3] + (a,))


def limb(c, x0, y0, x1, y1, w, col, col_d=None):
    c.b.line([(x0, y0), (x1, y1)], fill=col_d or shade(col, 0.7), width=w + 1)
    c.b.line([(x0, y0), (x1, y1)], fill=col, width=w)


def face_dots(c, hx, hy, back, eye=(20, 14, 20, 255), dx=1):
    if back:
        return
    c.b.rectangle([hx + dx - 2, hy - 1, hx + dx - 1, hy], fill=eye)
    c.b.rectangle([hx + dx + 2, hy - 1, hx + dx + 3, hy], fill=eye)


# ------------------------------------------------------------------ BRASA, a ferreira
def draw_smith(direction, anim, i, n):
    back = direction == "ne"
    t = i / n
    c = Canvas()
    cx = 24
    bob = math.sin(2 * math.pi * t) * 0.8
    arm_ang, mouth, spark_t, white_hot = 0.5, 0, 1.0, 0.5 + 0.3 * math.sin(2 * math.pi * t)
    hammer_hit = False
    if anim == "talk":
        arm_ang = 0.2 - 0.5 * math.sin(math.pi * t)       # ergue o martelo ao falar
        mouth = 1 if i % 2 == 0 else 0
        bob = -abs(math.sin(math.pi * t)) * 1.5
    elif anim == "work":
        arm_ang = (1.5, 1.9, 0.9, 0.1, -0.5, 0.3)[i]     # levanta e desce o martelo
        hammer_hit = i == 3
        spark_t = (1, 1, 1, 0.0, 0.25, 0.5)[i]
        white_hot = 1.0 if i in (3, 4) else white_hot
        bob = (0, -1, -2, 1, 0, 0)[i]
    y = bob
    # pernas e botas
    for s in (-1, 1):
        c.b.rectangle([cx + s * 4 - 2, 43 + y, cx + s * 4 + 2, 51], fill=(58, 46, 44, 255))
        c.b.rectangle([cx + s * 4 - 3, 49, cx + s * 4 + 3, 52], fill=LEATHER_D)
    # tronco: camisa de linho + avental de couro com fuligem
    c.b.polygon([(cx - 9, 29 + y), (cx + 9, 29 + y), (cx + 10, 45 + y), (cx - 10, 45 + y)], fill=CLOTH_D)
    c.b.polygon([(cx - 6, 31 + y), (cx + 6, 31 + y), (cx + 8, 47), (cx - 8, 47)], fill=LEATHER if not back else LEATHER_D)
    c.b.line([(cx - 8, 38 + y), (cx + 8, 38 + y)], fill=LEATHER_D, width=2)                  # cinto
    if not back:
        c.b.rectangle([cx - 2, 39 + y, cx + 1, 43 + y], fill=STEEL_D)                          # alicate no cinto
        for px, py in ((cx - 4, 41), (cx + 3, 44), (cx + 1, 35), (cx - 3, 34)):
            c.b.point((px, py + y), fill=LEATHER_D)                                          # fuligem
        c.b.line([(cx - 5, 31 + y), (cx - 7, 29 + y)], fill=LEATHER_D)                        # alças
        c.b.line([(cx + 5, 31 + y), (cx + 7, 29 + y)], fill=LEATHER_D)
    # braço de trás (esquerdo), parado ao lado do corpo
    limb(c, cx - 9, 31 + y, cx - 11, 41 + y, 4, SKIN, SKIN_D)
    c.b.rectangle([cx - 13, 40 + y, cx - 9, 43 + y], fill=STEEL)                              # braçadeira
    # braço do martelo
    sx, sy = cx + 9, 31 + y
    ex, ey = sx + math.cos(arm_ang) * 11, sy + math.sin(arm_ang) * 11 - 3
    limb(c, sx, sy, ex, ey, 4, SKIN, SKIN_D)
    # martelo: cabo + cabeça
    hx = ex + math.cos(arm_ang - 1.0) * 9
    hy = ey + math.sin(arm_ang - 1.0) * 9
    limb(c, ex, ey, hx, hy, 2, WOOD, WOOD_D)
    c.b.rectangle([hx - 4, hy - 2, hx + 3, hy + 2], fill=STEEL, outline=STEEL_D)
    c.b.line([(hx - 4, hy - 2), (hx + 3, hy - 2)], fill=STEEL_L)
    c.b.rectangle([ex - 2, ey - 2, ex + 2, ey + 2], fill=STEEL)                              # luva/braçadeira
    # cabeça
    hx0, hy0 = cx + (0 if back else 1), 22 + y
    c.b.ellipse([hx0 - 6, hy0 - 6, hx0 + 6, hy0 + 6], fill=SKIN)
    if not back:
        c.b.rectangle([hx0 - 5, hy0 + 2, hx0 + 5, hy0 + 5], fill=SKIN_D)                      # queixo forte
    # cabelo ruivo preso num coque e óculos de solda na testa
    hair = (176, 62, 30, 255)
    c.b.ellipse([hx0 - 7, hy0 - 8, hx0 + 7, hy0 - 1 if not back else hy0 + 5], fill=hair)
    c.b.ellipse([hx0 - 3, hy0 - 12, hx0 + 4, hy0 - 6], fill=shade(hair, 0.85))
    if not back:
        c.b.rectangle([hx0 - 6, hy0 - 4, hx0 + 6, hy0 - 2], fill=LEATHER_D)                  # tira dos óculos
        for gx in (hx0 - 4, hx0 + 2):
            c.b.ellipse([gx, hy0 - 6, gx + 3, hy0 - 3], fill=GOLD_D, outline=GOLD)           # lentes de latão
        face_dots(c, hx0, hy0 + 1, back)
        c.b.line([(hx0 - 2, hy0 + 4), (hx0 + 3, hy0 + 4 + (1 if mouth else 0))], fill=(90, 34, 30, 255))
        if mouth:
            c.b.rectangle([hx0 - 1, hy0 + 4, hx0 + 2, hy0 + 5], fill=(60, 18, 20, 255))
    # bigorna à direita
    c.b.rectangle([45, 44, 57, 52], fill=STEEL_D)
    c.b.rectangle([47, 40, 55, 45], fill=STEEL)
    c.b.polygon([(42, 36), (58, 36), (59, 40), (44, 40)], fill=STEEL_L)
    c.b.polygon([(58, 36), (63, 37), (59, 40)], fill=STEEL)                                   # chifre
    c.b.line([(43, 36), (58, 36)], fill=(214, 226, 240, 255))
    # barra em brasa em cima da bigorna
    hot = (255, int(110 + 100 * white_hot), int(30 + 60 * white_hot), 255)
    c.b.rectangle([46, 33, 56, 35], fill=hot, outline=EMBER)
    # efeitos: brilho da brasa, fumaça e fagulhas
    glow(c, 51, 34, 11, EMBER, 70 + int(60 * white_hot))
    smoke(c, 52, 31, (t + (0.25 if anim != "idle" else 0)) % 1.0)
    sparks(c, 52, 33, spark_t if anim == "work" else (t * 0.9) % 1.0, n=5 if anim == "work" else 2, power=1.4 if hammer_hit else 0.8)
    if hammer_hit:
        glow(c, 52, 33, 9, EMBER_L, 190)
    return c.finish()


# ------------------------------------------------------------------ GARRICK, o comerciante
def draw_merchant(direction, anim, i, n):
    back = direction == "ne"
    t = i / n
    c = Canvas()
    cx = 22
    bob = math.sin(2 * math.pi * t) * 0.7
    swing = math.sin(2 * math.pi * t) * 2.0
    hand_up = 0.0
    mouth = 0
    scale_tilt = math.sin(2 * math.pi * t) * 1.2
    if anim == "talk":
        hand_up = math.sin(math.pi * t) * 5
        mouth = 1 if i % 2 == 0 else 0
        swing *= 1.4
    elif anim == "count":
        scale_tilt = (0, 3, 4, 1, -3, -1)[i] * 0.9
        hand_up = (0, 2, 4, 3, 1, 0)[i]
    y = bob
    ROBE, ROBE_D, ROBE_L = (112, 32, 46, 255), (70, 18, 32, 255), (156, 54, 66, 255)
    # túnica longa com barra dourada
    c.b.polygon([(cx - 8, 27 + y), (cx + 8, 27 + y), (cx + 13, 51), (cx - 13, 51)], fill=ROBE)
    c.b.polygon([(cx + 2, 28 + y), (cx + 8, 27 + y), (cx + 13, 51), (cx + 5, 51)], fill=ROBE_D)
    c.b.line([(cx - 13, 51), (cx + 13, 51)], fill=GOLD, width=2)
    c.b.line([(cx - 11, 47), (cx + 11, 47)], fill=GOLD_D)
    if not back:
        c.b.rectangle([cx - 2, 27 + y, cx + 1, 50], fill=ROBE_L)                              # abertura da frente
        c.b.line([(cx - 8, 36 + y), (cx + 8, 36 + y)], fill=LEATHER_D, width=2)               # cinto
        c.b.rectangle([cx - 1, 35 + y, cx + 1, 38 + y], fill=GOLD)                            # fivela
        # bolsas de moedas penduradas no cinto
        for bx, by in ((cx - 7, 39), (cx + 6, 40)):
            c.b.ellipse([bx - 3, by + y, bx + 3, by + 6 + y], fill=(176, 134, 70, 255), outline=LEATHER_D)
            c.b.rectangle([bx - 1, by - 1 + y, bx + 1, by + 1 + y], fill=GOLD_D)
    # capuz
    hx, hy = cx + (-1 if back else 1), 20 + y
    c.b.polygon([(hx - 9, hy + 8), (hx - 7, hy - 8), (hx, hy - 13), (hx + 7, hy - 8), (hx + 9, hy + 8)], fill=ROBE)
    c.b.polygon([(hx, hy - 13), (hx + 7, hy - 8), (hx + 9, hy + 8), (hx + 2, hy + 8)], fill=ROBE_D)
    if not back:
        c.b.ellipse([hx - 5, hy - 5, hx + 6, hy + 7], fill=(40, 22, 28, 255))               # sombra do capuz
        c.b.ellipse([hx - 4, hy - 3, hx + 5, hy + 7], fill=(206, 168, 138, 255))
        c.b.rectangle([hx - 4, hy + 3, hx + 5, hy + 7], fill=(150, 150, 156, 255))            # barba grisalha
        face_dots(c, hx, hy, back, eye=(26, 20, 16, 255), dx=0)
        c.b.point((hx - 2, hy - 1), fill=GOLD)
        c.b.line([(hx - 2, hy + 3), (hx + 3, hy + 3 + (1 if mouth else 0))], fill=(70, 40, 40, 255))
    else:
        c.b.polygon([(hx - 5, hy - 4), (hx, hy + 6), (hx + 5, hy - 4)], fill=ROBE_D)
    c.b.polygon([(hx - 9, hy + 8), (hx + 9, hy + 8), (hx + 7, hy + 11), (hx - 7, hy + 11)], fill=ROBE_L)  # gola
    # braço da lanterna (cajado com gancho)
    ax, ay = cx + 9, 32 + y - hand_up * 0.4
    sx2, sy2 = cx + 17 + swing * 0.3, 14 + y
    limb(c, ax, ay, ax + 3, ay + 2, 4, ROBE_L, ROBE_D)
    c.b.line([(ax + 3, 52), (sx2 - swing * 0.2, sy2)], fill=WOOD_D, width=2)
    c.b.line([(ax + 3, 52), (sx2 - swing * 0.2, sy2)], fill=WOOD, width=1)
    c.b.line([(sx2 - swing * 0.2, sy2), (sx2 + 3, sy2 + 2)], fill=WOOD)
    lx, ly = sx2 + swing * 0.9, 19 + y
    c.b.line([(sx2 + 3, sy2 + 2), (lx, ly - 1)], fill=STEEL_D)                                 # corrente
    c.b.rectangle([lx - 3, ly, lx + 3, ly + 8], fill=GOLD_D, outline=GOLD)
    c.b.rectangle([lx - 2, ly + 2, lx + 2, ly + 7], fill=(255, 226, 150, 255))                  # vidro iluminado
    c.b.polygon([(lx - 4, ly), (lx + 4, ly), (lx, ly - 3)], fill=GOLD_D)
    flick = 0.7 + 0.3 * math.sin(2 * math.pi * t * 2 + 1)
    c.b.rectangle([lx - 1, ly + 3, lx + 1, ly + 6], fill=(255, int(150 + 60 * flick), 60, 255))
    glow(c, lx, ly + 5, 13, (255, 190, 90), 80 + int(50 * flick))
    # mão livre mexendo nas moedas
    c.b.ellipse([cx - 13, 34 + y - hand_up, cx - 8, 39 + y - hand_up], fill=SKIN_PALE)
    if anim == "count":
        c.f.rectangle([cx - 12, 32 - hand_up, cx - 10, 33 - hand_up], fill=GOLD + ())
    # caixote com balança e sacos à direita
    c.b.rectangle([40, 43, 58, 52], fill=WOOD, outline=WOOD_D)
    c.b.line([(40, 47), (58, 47)], fill=WOOD_D)
    c.b.line([(44, 43), (44, 52)], fill=WOOD_D)
    c.b.line([(54, 43), (54, 52)], fill=WOOD_D)
    c.b.line([(49, 43), (49, 30)], fill=STEEL_D, width=2)                                     # coluna da balança
    c.b.polygon([(46, 52), (52, 52), (49, 48)], fill=STEEL_D)
    bx0, by0 = 49, 30
    ex1, ey1 = bx0 - 8, by0 + scale_tilt
    ex2, ey2 = bx0 + 8, by0 - scale_tilt
    c.b.line([(ex1, ey1), (ex2, ey2)], fill=GOLD, width=2)                                    # travessa
    for px, py in ((ex1, ey1), (ex2, ey2)):
        c.b.line([(px, py), (px - 3, py + 7)], fill=STEEL)
        c.b.line([(px, py), (px + 3, py + 7)], fill=STEEL)
        c.b.arc([px - 5, py + 3, px + 5, py + 11], 0, 180, fill=GOLD)
    c.b.ellipse([ex2 - 2, ey2 + 4, ex2 + 2, ey2 + 7], fill=GOLD)                              # moedas num prato
    c.b.ellipse([ex1 - 3, ey1 + 5, ex1 + 3, ey1 + 8], fill=(150, 150, 160, 255))               # peso no outro
    for sx, sy_ in ((36, 46), (60, 47)):                                                       # sacos de aniagem
        c.b.ellipse([sx - 4, sy_ - 3, sx + 4, sy_ + 6], fill=(168, 140, 92, 255), outline=LEATHER_D)
        c.b.rectangle([sx - 1, sy_ - 5, sx + 1, sy_ - 2], fill=(130, 104, 66, 255))
    if i % 3 == 0 or anim == "count":                                                          # brilho das moedas
        c.f.rectangle([ex2, ey2 + 3, ex2 + 1, ey2 + 4], fill=(255, 255, 220, 230))
    return c.finish()


# ------------------------------------------------------------------ OSSIAN, o leiloeiro
def draw_auctioneer(direction, anim, i, n):
    back = direction == "ne"
    t = i / n
    c = Canvas()
    cx = 22
    bob = math.sin(2 * math.pi * t) * 0.6
    arm = 0.9 + math.sin(2 * math.pi * t) * 0.12      # ângulo do braço do martelo (para cima = menor)
    mouth = 0
    flash = 0.0
    if anim == "talk":
        arm = 0.3 + 0.6 * abs(math.sin(math.pi * t))
        mouth = 1 if i % 2 == 0 else 0
    elif anim == "gavel":
        arm = (1.0, 0.2, -0.3, 1.5, 1.7, 1.2)[i]
        flash = 1.0 if i == 3 else (0.5 if i == 4 else 0.0)
        bob = (0, -1, -2, 1, 0, 0)[i]
    y = bob
    COAT, COAT_D, COAT_L = (46, 30, 64, 255), (26, 16, 40, 255), (84, 58, 112, 255)
    # pernas finas e sapatos
    for s in (-1, 1):
        c.b.rectangle([cx + s * 3 - 2, 42 + y, cx + s * 3 + 1, 51], fill=(24, 18, 30, 255))
        c.b.rectangle([cx + s * 3 - 3, 49, cx + s * 3 + 2, 52], fill=(14, 10, 18, 255))
    # casaca longa com abas
    c.b.polygon([(cx - 8, 27 + y), (cx + 8, 27 + y), (cx + 10, 50), (cx + 3, 46), (cx, 51), (cx - 3, 46), (cx - 10, 50)], fill=COAT)
    c.b.polygon([(cx + 2, 28 + y), (cx + 8, 27 + y), (cx + 10, 50), (cx + 3, 46)], fill=COAT_D)
    if not back:
        c.b.polygon([(cx - 3, 28 + y), (cx + 3, 28 + y), (cx + 1, 38 + y), (cx - 1, 38 + y)], fill=CLOTH)   # peitilho/jabô
        for by in (33, 38, 43):
            c.b.point((cx - 4, by + y), fill=GOLD)                                                         # botões
            c.b.point((cx + 4, by + y), fill=GOLD)
        c.b.line([(cx - 8, 28 + y), (cx - 4, 27 + y)], fill=COAT_L)
    # colarinho alto
    c.b.polygon([(cx - 7, 26 + y), (cx - 3, 22 + y), (cx + 3, 22 + y), (cx + 7, 26 + y)], fill=COAT_L)
    # cabeça pálida, cartola, monóculo
    hx, hy = cx + (0 if back else 1), 19 + y
    c.b.ellipse([hx - 5, hy - 5, hx + 5, hy + 6], fill=SKIN_PALE)
    c.b.rectangle([hx - 4, hy + 3, hx + 4, hy + 6], fill=SKIN_PALE_D)
    c.b.rectangle([hx - 6, hy - 9, hx + 6, hy - 7], fill=COAT_D)                                  # aba
    c.b.rectangle([hx - 4, hy - 17, hx + 4, hy - 8], fill=COAT)                                   # copa
    c.b.rectangle([hx - 4, hy - 11, hx + 4, hy - 9], fill=(150, 36, 60, 255))                     # fita vermelha
    if not back:
        face_dots(c, hx, hy, back, eye=(60, 10, 30, 255), dx=0)
        c.b.ellipse([hx + 1, hy - 3, hx + 5, hy + 1], outline=GOLD)                               # monóculo
        c.b.line([(hx + 5, hy - 1), (hx + 7, hy + 6)], fill=GOLD_D)
        c.b.line([(hx - 3, hy + 3), (hx + 3, hy + 3)], fill=(40, 28, 36, 255))                    # bigode fino
        if mouth:
            c.b.rectangle([hx - 1, hy + 4, hx + 2, hy + 5], fill=(50, 14, 24, 255))
    # braço do martelo de leilão
    sx, sy = cx + 8, 29 + y
    ex, ey = sx + math.cos(arm) * 10, sy + math.sin(arm) * 10 - 4
    limb(c, sx, sy, ex, ey, 4, COAT_L, COAT_D)
    c.b.rectangle([ex - 2, ey - 2, ex + 2, ey + 2], fill=CLOTH)                                   # luva branca
    gx, gy = ex + math.cos(arm - 1.2) * 7, ey + math.sin(arm - 1.2) * 7
    limb(c, ex, ey, gx, gy, 2, WOOD, WOOD_D)
    c.b.rectangle([gx - 3, gy - 2, gx + 3, gy + 2], fill=WOOD_L, outline=WOOD_D)
    c.b.rectangle([gx - 3, gy - 2, gx - 2, gy + 2], fill=GOLD)
    # braço de trás segurando o livro-caixa
    limb(c, cx - 8, 30 + y, cx - 10, 39 + y, 4, COAT_L, COAT_D)
    c.b.ellipse([cx - 13, 38 + y, cx - 8, 43 + y], fill=CLOTH)
    # púlpito com livro, sino e vela
    c.b.polygon([(40, 36), (60, 36), (58, 40), (42, 40)], fill=WOOD_L, outline=WOOD_D)            # tampo inclinado
    c.b.rectangle([43, 40, 57, 52], fill=WOOD, outline=WOOD_D)
    c.b.line([(50, 40), (50, 52)], fill=WOOD_D)
    c.b.rectangle([43, 49, 57, 51], fill=GOLD_D)                                                  # filete dourado
    c.b.polygon([(44, 33), (51, 31), (51, 36), (44, 37)], fill=CLOTH)                             # páginas do livro-caixa
    c.b.polygon([(51, 31), (58, 33), (58, 37), (51, 36)], fill=shade(CLOTH, 0.9))
    c.b.line([(46, 34), (49, 33)], fill=LEATHER_D); c.b.line([(53, 33), (56, 34)], fill=LEATHER_D)
    bell_y = 31 - (2 if (anim == "gavel" and i in (3, 4)) else 0)
    c.b.polygon([(56, bell_y + 4), (61, bell_y + 4), (60, bell_y), (57, bell_y)], fill=GOLD, outline=GOLD_D)   # sininho
    c.b.point((58, bell_y - 1), fill=GOLD_D)
    c.b.rectangle([41, 28, 43, 36], fill=(220, 214, 196, 255), outline=CLOTH_D)                    # vela
    flick = 0.6 + 0.4 * math.sin(2 * math.pi * t * 2 + 2)
    c.b.polygon([(41, 28), (43, 28), (42, int(24 - 2 * flick))], fill=(255, int(170 + 60 * flick), 70, 255))
    glow(c, 42, 27, 11, (255, 190, 100), 60 + int(50 * flick))
    if flash:
        glow(c, 52, 36, 12, (255, 240, 200), int(150 * flash))
        for dx, dy in ((-9, -4), (9, -5), (0, -10), (-6, 5), (7, 5)):
            c.f.line([(52, 36), (52 + dx, 36 + dy)], fill=(255, 244, 210, int(220 * flash)), width=1)
    return c.finish()


DRAW = {"smith": draw_smith, "merchant": draw_merchant, "auctioneer": draw_auctioneer}
_orig = gp.draw_body
gp.draw_body = lambda kind, direction, anim, i, n, base: DRAW[kind[4:]](direction, anim, i, n) if kind.startswith("npc_") and kind[4:] in DRAW else _orig(kind, direction, anim, i, n, base)


def preview(path):
    """Folha de prévia ampliada (idle + talk + ofício, SE e NE) sobre o chão escuro do jogo."""
    rows = []
    for k in ("smith", "merchant", "auctioneer"):
        for d in ("se", "ne"):
            row = Image.new("RGBA", (F * 12, F), (34, 36, 46, 255))
            x = 0
            for anim, n, _ in ANIMS[k]:
                for i in range(n):
                    row.alpha_composite(DRAW[k](d, anim, i, n), (x, 0))
                    x += F
            rows.append(row)
    sheet = Image.new("RGBA", (F * 12, F * len(rows)), (34, 36, 46, 255))
    for j, r in enumerate(rows):
        sheet.paste(r, (0, j * F))
    sheet = sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST)
    sheet.save(path)


if __name__ == "__main__":
    for kind in ("smith", "merchant", "auctioneer"):
        gp.build(f"npc_{kind}", f"npc_{kind}", ANIMS[kind])
    if len(sys.argv) > 1:
        preview(sys.argv[1])
        print("prévia em", sys.argv[1])
