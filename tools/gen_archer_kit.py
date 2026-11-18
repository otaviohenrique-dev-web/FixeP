"""Gera o kit do ARQUEIRO (assets/characters/archer.png + archer.json): pixel art desenhada por código, em quadros de 64x64.
Paleta de fantasia sombria (capuz verde-musgo, couro escuro, arco de madeira). Desenha SE (de frente) e NE (de costas);
o jogo espelha SW e NW. É uma base para o dev de arte refinar: arte final dele, salva no mesmo lugar, substitui este kit.
Precisa de Pillow.  Uso: python tools/gen_archer_kit.py
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets/characters"
F, CX, FEET = 64, 32, 52

OL = (10, 10, 14, 255)
CLOAK, CLOAK_L, CLOAK_D = (54, 68, 44, 255), (78, 98, 60, 255), (34, 44, 30, 255)
LEATHER, LEATHER_L = (58, 44, 36, 255), (96, 72, 50, 255)
TUNIC, TUNIC_L = (52, 54, 60, 255), (82, 86, 94, 255)
SKIN, SKIN_D = (176, 132, 104, 255), (112, 78, 62, 255)
WOOD, WOOD_L = (92, 62, 40, 255), (140, 100, 62, 255)
STRING, ARROW = (206, 200, 184, 255), (222, 218, 206, 255)
SHADOW = (0, 0, 0, 90)


class P:  # parâmetros de uma pose
    def __init__(s, **k):
        s.bob = 0; s.step = 0; s.draw = 0.0; s.lean = 0; s.crouch = 0; s.flash = False; s.fall = 0.0
        s.__dict__.update(k)


def px(d, pts, col):
    d.polygon(pts, fill=col)


def archer(front: bool, p: P) -> Image.Image:
    im = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    bob, lean, cr = p.bob, p.lean, p.crouch
    if p.fall < 0.5:
        d.ellipse([CX - 11, FEET - 3, CX + 11, FEET + 3], fill=SHADOW)
    top = -bob + cr  # deslocamento vertical do tronco
    # pernas
    sw = p.step
    for i, off in enumerate((-4, 3)):
        lx = CX + off + (sw if i == 0 else -sw) * 0.5 + lean * 0.3
        ly0 = FEET - 14 + cr * 0.6
        d.rectangle([lx, ly0, lx + 3, FEET - 2 - (abs(sw) * 0.3 if i else 0)], fill=LEATHER, outline=OL)
        d.rectangle([lx - 1, FEET - 4 - (abs(sw) * 0.3 if i else 0), lx + 4, FEET - (abs(sw) * 0.3 if i else 0)], fill=(30, 24, 22, 255), outline=OL)
    # manto atrás (cai das costas)
    cl = [(CX - 10 + lean, 24 + top), (CX + 8 + lean, 24 + top), (CX + 10 + lean * 0.5 + (2 if not front else 0), 47), (CX - 12 - sw * 0.3, 49)]
    if not front:
        cl = [(CX - 10 + lean, 22 + top), (CX + 10 + lean, 22 + top), (CX + 11, 47), (CX - 11, 47)]
    px(d, cl, CLOAK_D)
    d.line([cl[0], cl[3]], fill=OL)
    # tronco
    tx0, tx1 = CX - 7 + lean, CX + 7 + lean
    if front:
        d.rectangle([tx0, 25 + top, tx1, 40 + top + cr * 0.3], fill=TUNIC, outline=OL)
        d.rectangle([tx0 + 1, 26 + top, tx0 + 4, 38 + top], fill=TUNIC_L)
        d.rectangle([tx0, 37 + top, tx1, 39 + top], fill=LEATHER_L, outline=OL)  # cinto
        d.rectangle([CX - 1 + lean, 37 + top, CX + 1 + lean, 39 + top], fill=(190, 160, 90, 255))  # fivela
        # tira da aljava cruzando o peito
        d.line([(tx0 + 1, 26 + top), (tx1 - 1, 38 + top)], fill=LEATHER, width=2)
    else:
        px(d, [(tx0 - 2, 24 + top), (tx1 + 2, 24 + top), (tx1 + 3, 44), (tx0 - 3, 44)], CLOAK)
        d.line([(CX + lean, 26 + top), (CX + lean, 44)], fill=CLOAK_D)
        d.polygon([(tx0 - 2, 24 + top), (CX + lean, 24 + top), (CX - 1 + lean, 40), (tx0 - 3, 44)], fill=CLOAK_L)
    # aljava (sempre nas costas): aparece sobre o ombro
    qx = CX - 10 + lean if front else CX + 2 + lean
    d.polygon([(qx, 18 + top), (qx + 4, 20 + top), (qx + 5, 34 + top), (qx + 1, 35 + top)], fill=LEATHER, outline=OL)
    for k in range(3):
        d.line([(qx + 1 + k, 18 + top), (qx + 1 + k - 1, 13 + top - k % 2)], fill=ARROW)
    # cabeça / capuz
    hx, hy = CX + lean * 1.2 + (2 if front else 0), 19 + top
    d.ellipse([hx - 7, hy - 7, hx + 7, hy + 7], fill=CLOAK, outline=OL)
    d.ellipse([hx - 6, hy - 6, hx + 2, hy], fill=CLOAK_L)
    if front:
        d.ellipse([hx - 3, hy - 3, hx + 5, hy + 5], fill=(18, 16, 18, 255))  # sombra do rosto
        d.rectangle([hx - 1, hy + 1, hx + 3, hy + 2], fill=SKIN)
        d.point([(hx, hy), (hx + 3, hy)], fill=(240, 220, 180, 255))
    else:
        d.polygon([(hx - 6, hy + 2), (hx + 6, hy + 2), (hx + 4, hy + 9), (hx - 4, hy + 9)], fill=CLOAK_D)
    # braços e arco
    draw = p.draw  # 0 = arco baixo, 1 = corda esticada
    sx, sy = (CX + 6 + lean, 28 + top) if front else (CX + 5 + lean, 28 + top)
    bx = sx + 8 + 4 * draw; by = sy - 1 - 2 * draw  # mão da frente (segura o arco)
    d.line([(sx, sy), (bx, by)], fill=TUNIC_L, width=3)
    d.rectangle([bx - 1, by - 1, bx + 1, by + 1], fill=SKIN)
    # arco: arco de madeira com a corda
    top_pt, bot_pt = (bx + 1, by - 13), (bx + 1, by + 13)
    curve = [(bx + 1 + 6 * math.sin(math.pi * t / 10), by - 13 + 26 * t / 10) for t in range(11)]
    d.line(curve, fill=WOOD, width=2)
    d.line([(x - 1, y) for x, y in curve[::2]], fill=WOOD_L)
    pull = (bx - 3 - 7 * draw, by)
    d.line([top_pt, pull, bot_pt], fill=STRING)
    if draw > 0.4:  # flecha encaixada
        d.line([(pull[0], pull[1]), (bx + 14, by)], fill=ARROW, width=1)
        d.point([(bx + 15, by)], fill=(200, 200, 210, 255))
        d.line([(sx - 1, sy + 1), (pull[0], pull[1])], fill=TUNIC_L, width=2)  # mão que puxa
    else:
        d.line([(sx - 2, sy + 2), (sx - 3, sy + 10)], fill=TUNIC_L, width=2)
        d.point([(sx - 3, sy + 11)], fill=SKIN)
    if p.flash:
        r, g, b, a = im.split()
        im = Image.merge("RGBA", (r.point(lambda v: min(255, v + 45)), g.point(lambda v: min(255, v + 45)), b.point(lambda v: min(255, v + 45)), a))
    if p.fall:
        im = im.rotate(-90 * p.fall, resample=Image.NEAREST, center=(CX - 2, FEET - 6), expand=False)
    return im


ANIMS = [
    ("idle", [P(bob=0), P(bob=1), P(bob=1), P(bob=0)], 220),
    ("walk", [P(step=s, bob=b) for s, b in ((-4, 0), (-2, 1), (0, 0), (4, 0), (2, 1), (0, 0))], 110),
    ("attack", [P(draw=0.3), P(draw=0.7, lean=-1), P(draw=1.0, lean=-1), P(draw=1.0, lean=-1), P(draw=0.0, lean=1)], 90),
    ("skill", [P(draw=0.5), P(draw=1.0, lean=-1), P(draw=1.0, lean=-1), P(draw=0.0, lean=2, bob=1), P(draw=0.0)], 90),
    ("dodge", [P(crouch=4, lean=-3), P(crouch=6, lean=-5, bob=-2), P(crouch=3, lean=-2)], 90),
    ("hit", [P(flash=True, lean=-2), P(lean=-1)], 90),
    ("death", [P(lean=-2, fall=0.0, flash=True), P(fall=0.3), P(fall=0.7), P(fall=1.0), P(fall=1.0)], 130),
]


def main():
    frames, tags, imgs = [], [], []
    for dname, front in (("se", True), ("ne", False)):
        for anim, poses, dur in ANIMS:
            start = len(imgs)
            for p in poses:
                imgs.append(archer(front, p))
                frames.append({"filename": f"archer {len(imgs) - 1}.aseprite", "frame": {"x": 0, "y": 0, "w": F, "h": F}, "rotated": False, "trimmed": False,
                               "spriteSourceSize": {"x": 0, "y": 0, "w": F, "h": F}, "sourceSize": {"w": F, "h": F}, "duration": dur})
            tags.append({"name": f"{anim}_{dname}", "from": start, "to": len(imgs) - 1, "direction": "forward"})
    cols = 8
    rows = (len(imgs) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * F, rows * F), (0, 0, 0, 0))
    for i, im in enumerate(imgs):
        x, y = (i % cols) * F, (i // cols) * F
        atlas.alpha_composite(im, (x, y))
        frames[i]["frame"].update(x=x, y=y)
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / "archer.png")
    json.dump({"frames": frames, "meta": {"app": "frixep-kit", "version": "1.0", "image": "archer.png", "format": "RGBA8888",
              "size": {"w": atlas.width, "h": atlas.height}, "scale": "1", "frameTags": tags}}, open(OUT / "archer.json", "w"), indent=1)
    print(len(imgs), "quadros")


main()
