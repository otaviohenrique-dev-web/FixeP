"""
Gera o kit de sprites do ESPECTRO das Catacumbas (assets/placeholder/wraith.png + wraith.json), por código, no formato do Aseprite
(quadros 64x64, tags <animacao>_<direcao>, 4 diagonais: desenha SE e NE; o jogo espelha SW e NW). Obra própria do projeto.

Um espectro encapuzado que flutua (sem pernas), com a barra do manto esfarrapada, olhos violeta e mãos em garra.
Animações: idle, walk (desliza), windup (ergue as garras), attack (golpe), hit, death (dissolve). Arte final em assets/monsters/wraith.* tem prioridade.
Uso: python tools/gen_wraith.py        (precisa de Python e Pillow)
"""
import math
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_placeholder_bodies as gp  # noqa: E402

F, CX, FEET, OL = gp.F, gp.CX, gp.FEET, gp.OL
ROBE = (74, 58, 110, 255)
ROBE_D = (44, 34, 72, 255)
ROBE_L = (122, 98, 170, 255)
VOID = (14, 8, 26, 255)
EYE = (190, 120, 255, 255)
EYE_C = (255, 230, 255, 255)
WISP = (154, 122, 208, 150)
CLAW = (214, 200, 236, 255)
ANIMS = [("idle", 4, 167), ("walk", 6, 125), ("windup", 4, 167), ("attack", 4, 83), ("hit", 2, 83), ("death", 6, 100)]


def draw_wraith(direction, anim, i, n):
    back = direction == "ne"
    t = i / n
    k = i / max(1, n - 1)
    img = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    float_y = 6 + math.sin(2 * math.pi * t) * 2.0   # paira acima do chão
    lean = 0.0
    arms = 0.0   # 0 baixos, 1 erguidos
    sway = math.sin(2 * math.pi * t) * 1.5
    white = 0.0
    fade = 1.0
    jaw = 0
    if anim == "walk":
        lean = 2.0
        sway = math.sin(2 * math.pi * t) * 3.0
    elif anim == "windup":
        arms = k
        lean = -k * 3
        float_y += k * 2
        jaw = 1 if i >= 2 else 0
    elif anim == "attack":
        arms = (1.0, 1.0, 0.2, 0.0)[i]
        lean = (-1, 6, 8, 3)[i]
        jaw = 2 if i in (1, 2) else 0
    elif anim == "hit":
        lean = -3 + i
        white = 0.5
        jaw = 2
    elif anim == "death":
        float_y += k * 4
        fade = 1 - k
        jaw = 2

    cx = CX + lean
    base_y = FEET - float_y          # ponta mais baixa do manto
    top = base_y - 36                # topo do capuz

    # sombra de névoa embaixo
    d.ellipse([cx - 12, FEET - 2, cx + 12, FEET + 3], fill=(20, 10, 40, 90))

    # ----- manto: corpo afunilado com barra esfarrapada
    body = [(cx - 6, top + 12), (cx + 6, top + 12), (cx + 12, base_y - 6), (cx - 12, base_y - 6)]
    d.polygon(body, fill=ROBE, outline=OL)
    # barra rasgada: pontas que ondulam
    tips = []
    for j in range(7):
        x = cx - 12 + j * 4
        y = base_y - 2 + (4 if j % 2 else -2) + math.sin(2 * math.pi * t + j) * 1.5
        tips.append((x + sway * 0.3, y))
    d.polygon([(cx - 12, base_y - 6)] + tips + [(cx + 12, base_y - 6)], fill=ROBE_D, outline=OL)
    d.line([(cx - 3, top + 14), (cx - 5, base_y - 8)], fill=ROBE_L, width=1)   # dobra clara
    d.line([(cx + 4, top + 16), (cx + 6, base_y - 8)], fill=ROBE_D, width=1)

    # ----- braços e garras
    def arm(sgn):
        sx, sy = cx + sgn * 6, top + 17
        ang = -arms * 1.3 + 0.3 * math.sin(2 * math.pi * t + sgn)
        ex, ey = sx + sgn * (6 + 4 * arms), sy + 9 * math.cos(ang) - 9 * arms
        d.line([(sx, sy), (ex, ey)], fill=OL, width=5)
        d.line([(sx, sy), (ex, ey)], fill=ROBE_L, width=3)
        for c in (-2, 0, 2):                                    # garras
            d.line([(ex, ey), (ex + sgn * 3, ey + c + 2)], fill=CLAW, width=1)
    arm(-1)
    arm(1)

    # ----- capuz e rosto
    hx, hy = cx + (1 if not back else -1), top + 7
    d.polygon([(hx - 9, hy + 6), (hx - 6, hy - 8), (hx, hy - 13), (hx + 6, hy - 8), (hx + 9, hy + 6)], fill=ROBE, outline=OL)
    d.ellipse([hx - 6, hy - 6, hx + 6, hy + 6], fill=VOID, outline=OL)
    if not back:
        d.rectangle([hx - 4, hy - 2, hx - 2, hy], fill=EYE)
        d.rectangle([hx + 2, hy - 2, hx + 4, hy], fill=EYE)
        d.point((hx - 3, hy - 2), fill=EYE_C)
        d.point((hx + 3, hy - 2), fill=EYE_C)
        if jaw:
            d.rectangle([hx - 2, hy + 2, hx + 2, hy + 3 + jaw], fill=(30, 10, 50, 255))
    else:
        d.polygon([(hx - 7, hy), (hx, hy + 6), (hx + 7, hy)], fill=ROBE_D)   # costas do capuz fechado

    # fiapos de energia soltando do manto
    for j in range(3):
        wx = cx - 10 + j * 10 + sway
        wy = base_y - 12 - ((i * 3 + j * 5) % 14)
        d.ellipse([wx - 1, wy - 1, wx + 1, wy + 1], fill=WISP)

    if fade < 1:  # morte: dissolve (some aos poucos e sobe)
        a = img.split()[3].point(lambda v: int(v * fade))
        img.putalpha(a)
        img = img.transform(img.size, Image.AFFINE, (1, 0, 0, 0, 1, int(8 * (1 - fade))), resample=Image.NEAREST)
    if white:
        wh = Image.new("RGBA", (F, F), (255, 255, 255, int(255 * white)))
        img = Image.composite(Image.alpha_composite(img, wh), img, img.split()[3])
    return img


_orig = gp.draw_body
gp.draw_body = lambda kind, direction, anim, i, n, base: draw_wraith(direction, anim, i, n) if kind == "wraith" else _orig(kind, direction, anim, i, n, base)

if __name__ == "__main__":
    gp.build("wraith", "wraith", ANIMS)
