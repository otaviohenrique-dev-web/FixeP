"""
Gera o kit de sprites do LOBO GÉLIDO (assets/placeholder/wolf.png + wolf.json), por código, no mesmo formato do Aseprite
(quadros 64x64, tags <animacao>_<direcao>, 4 diagonais: desenha SE e NE; o jogo espelha SW e NW). Obra própria do projeto.

Animações: idle, walk, windup (agacha e recua), attack (bote), hit, death. A arte final, se salva em assets/monsters/wolf.*, tem prioridade.
Uso: python tools/gen_wolf.py        (precisa de Python e Pillow; reaproveita as definições de gen_placeholder_bodies.py)
"""
import math
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_placeholder_bodies as gp  # noqa: E402

F, CX, FEET, OL = gp.F, gp.CX, gp.FEET, gp.OL
FUR = (143, 179, 217, 255)       # pelagem azul-gelo
FUR_D = (84, 112, 150, 255)      # sombra
FUR_L = (206, 230, 250, 255)     # luz / neve no dorso
ICE = (232, 247, 255, 255)       # espinhos de gelo
EYE = (110, 230, 255, 255)
FANG = (245, 250, 255, 255)
WOLF_ANIMS = [("idle", 4, 167), ("walk", 6, 100), ("windup", 4, 167), ("attack", 4, 83), ("hit", 2, 83), ("death", 6, 100)]


def draw_wolf(direction, anim, i, n):
    back = direction == "ne"
    t = i / n
    k = i / max(1, n - 1)
    img = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    bob = lean = step = 0.0
    head_dy = 0.0   # cabeça abaixa (+) / sobe (-)
    jaw = 0         # boca aberta
    tail_up = 0.0
    white = 0.0
    fall = 0.0
    if anim == "idle":
        bob = math.sin(2 * math.pi * t) * 0.8
        head_dy = math.sin(2 * math.pi * t + 1) * 0.8
        tail_up = math.sin(2 * math.pi * t) * 1.5
    elif anim == "walk":
        bob = -abs(math.sin(2 * math.pi * t)) * 1.8
        step = math.sin(2 * math.pi * t) * 5.0
        tail_up = math.sin(2 * math.pi * t) * 2
    elif anim == "windup":
        lean = -k * 4          # recua o corpo
        bob = k * 4            # abaixa
        head_dy = k * 3
        tail_up = -k * 3
        jaw = 1 if i >= 2 else 0
    elif anim == "attack":
        lean = (-1, 6, 7, 3)[i]  # bote para a frente
        bob = (2, -2, -1, 0)[i]
        head_dy = (2, -1, 0, 0)[i]
        jaw = 3 if i in (1, 2) else 0
        step = 2.0
    elif anim == "hit":
        lean = -3 + i
        white = 0.55
        head_dy = -2
        jaw = 2
    elif anim == "death":
        fall = k * 90
        bob = k * 5
        jaw = 1

    cx = CX + lean
    body_y = 38 + bob          # centro do corpo
    fx = 1                     # o lobo olha sempre para a direita (SE/NE); o jogo espelha os outros lados

    def line(a, b, col, w):
        d.line([a, b], fill=OL, width=w + 2)
        d.line([a, b], fill=col, width=w)

    # ----- cauda (atrás)
    tx, ty = cx - 14, body_y - 2
    line((tx, ty), (tx - 7, ty + 3 - tail_up), FUR_D, 4)
    d.ellipse([tx - 10, ty + 1 - tail_up, tx - 5, ty + 6 - tail_up], fill=FUR_L, outline=OL)

    # ----- pernas: duas do outro lado (escuras) e duas do lado do jogador
    def leg(x, phase, col):
        sw = step * phase
        lift = max(0.0, -sw) * 0.5 if anim == "walk" else 0
        hip = (x, body_y + 4)
        foot = (x + sw * 0.6, FEET - lift - (0 if fall else 0))
        line(hip, foot, col, 4)
        d.rectangle([foot[0] - 2, foot[1] - 1, foot[0] + 3, foot[1] + 1], fill=OL)
    leg(cx - 10, -1, FUR_D)
    leg(cx + 8, 1, FUR_D)
    leg(cx - 8, 1, FUR)
    leg(cx + 10, -1, FUR)

    # ----- corpo
    d.ellipse([cx - 16, body_y - 8, cx + 14, body_y + 8], fill=FUR, outline=OL)
    d.ellipse([cx - 13, body_y - 7, cx + 10, body_y - 1], fill=FUR_L)           # neve no dorso
    d.ellipse([cx - 12, body_y + 1, cx + 11, body_y + 7], fill=FUR_D)           # barriga
    d.arc([cx - 16, body_y - 8, cx + 14, body_y + 8], 0, 360, fill=OL)
    # espinhos de gelo no dorso
    for sx in range(-9, 9, 5):
        d.polygon([(cx + sx - 2, body_y - 7), (cx + sx + 2, body_y - 7), (cx + sx + 1, body_y - 12 - (sx % 3)), ], fill=ICE, outline=OL)

    # ----- cabeça
    hx, hy = cx + 15, body_y - 4 + head_dy
    d.polygon([(hx - 6, hy - 6), (hx - 2, hy - 12), (hx + 1, hy - 5)], fill=FUR_D, outline=OL)  # orelha
    d.polygon([(hx + 1, hy - 6), (hx + 5, hy - 11), (hx + 6, hy - 4)], fill=FUR, outline=OL)    # orelha 2
    d.ellipse([hx - 7, hy - 6, hx + 6, hy + 6], fill=FUR, outline=OL)
    if not back:
        sn = 4 + jaw
        d.polygon([(hx + 2, hy - 1), (hx + 11, hy + 1), (hx + 11, hy + 3 + jaw), (hx + 2, hy + 5)], fill=FUR_L, outline=OL)  # focinho
        d.rectangle([hx + 9, hy - 1, hx + 11, hy + 1], fill=OL)                                                          # nariz
        if jaw:
            d.polygon([(hx + 3, hy + 3), (hx + 10, hy + 3 + jaw), (hx + 3, hy + 5 + jaw)], fill=(120, 30, 40, 255))
            d.rectangle([hx + 4, hy + 2, hx + 5, hy + 3 + min(jaw, 2)], fill=FANG)
            d.rectangle([hx + 8, hy + 2, hx + 9, hy + 3 + min(jaw, 2)], fill=FANG)
        d.rectangle([hx - 1, hy - 3, hx + 2, hy - 1], fill=EYE)                                                          # olho brilhante
        d.point((hx + 2, hy - 2), fill=(255, 255, 255, 255))
        _ = sn
    else:
        d.ellipse([hx - 5, hy - 4, hx + 4, hy + 4], fill=FUR_D)

    # ----- queda: o lobo tomba de lado (achata contra o chão, pés para fora) em vez de girar em pé
    if fall:
        kk = fall / 90
        h = max(10, int(F * (1 - 0.55 * kk)))
        squashed = img.resize((F, h), Image.NEAREST)
        img = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        img.alpha_composite(squashed, (0, FEET + 2 - h))
    if white:
        wh = Image.new("RGBA", (F, F), (255, 255, 255, int(255 * white)))
        img = Image.composite(Image.alpha_composite(img, wh), img, img.split()[3])
    return img


_orig = gp.draw_body


def _dispatch(kind, direction, anim, i, n, base):
    return draw_wolf(direction, anim, i, n) if kind == "wolf" else _orig(kind, direction, anim, i, n, base)


gp.draw_body = _dispatch

if __name__ == "__main__":
    gp.build("wolf", "wolf", WOLF_ANIMS)
