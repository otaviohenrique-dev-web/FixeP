"""Monta o kit do Guerreiro (assets/characters/warrior.png + warrior.json) a partir da folha de poses em
assets/source/warrior_sheet.png. Precisa de Pillow e numpy.  Uso: python tools/build_warrior_kit.py

A folha tem 1 pose por animação e direção, sobre painéis cinza lisos; o script recorta cada painel, apaga o fundo
(por cor, a partir das bordas) e junta tudo num atlas no formato do Phaser, com tags <animacao>_<direcao>.
Mapa de direções (o jogo espelha o que faltar): Down=se, Up=ne, Left=w, Right=e.
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "assets/source/warrior_sheet.png"
OUT = ROOT / "assets/characters"

COLS = [(98, 227), (237, 366), (375, 504), (514, 643)]  # Down, Left, Right, Up
ROWS = [(30, 140), (152, 261), (274, 384), (398, 509), (522, 632)]  # idle, walk, attack, dodge, hit/death
DIR_OF_COL = ["se", "w", "e", "ne"]
FRAME = 64  # o carregador do jogo exige quadros de 64x64; os pés ficam em y=52
SCALE = 0.45  # a folha tem ~110 px por quadro: reduz a 45% para caber no quadro de 64
FOOT_Y = round(FRAME * 52 / 64)
BG = np.array([78, 78, 78])
TOL = 38


def cut(im: np.ndarray, box):
    (x0, x1), (y0, y1) = box
    cell = im[y0 + 4 : y1 - 4, x0 + 4 : x1 - 4].astype(int)
    h, w, _ = cell.shape
    near = np.abs(cell - BG).sum(axis=2) < TOL
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # tira pontinhos soltos (ruído do fundo): componentes com menos de 12 pixels
    seen = np.zeros((h, w), bool)
    for sy in range(h):
        for sx in range(w):
            if alpha[sy, sx] and not seen[sy, sx]:
                comp = [(sy, sx)]; seen[sy, sx] = True; i = 0
                while i < len(comp):
                    y, x = comp[i]; i += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and alpha[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; comp.append((ny, nx))
                if len(comp) < 12:
                    for y, x in comp: alpha[y, x] = 0
    rgba = np.dstack([cell.astype(np.uint8), alpha])
    img = Image.fromarray(rgba, "RGBA")
    img = img.resize((round(img.width * SCALE), round(img.height * SCALE)), Image.LANCZOS)
    a = img.getchannel("A").point(lambda v: 255 if v > 110 else 0)  # bordas nítidas (pixel art, sem meio-transparência)
    img.putalpha(a)
    return img


def main():
    im = np.array(Image.open(SHEET).convert("RGB"))
    cells = {}
    for r in range(5):
        for c in range(4):
            cells[(r, c)] = cut(im, (COLS[c], ROWS[r]))
    # alinha: a base dos pés da idle Down vira o ponto FOOT_Y; todos os quadros usam o mesmo deslocamento
    bb = cells[(0, 0)].getbbox()
    dy = FOOT_Y - bb[3]  # do recorte; bb[3] = base do desenho
    ox = (FRAME - cells[(0, 0)].width) // 2

    anims = ["idle", "walk", "attack", "dodge", "hit"]  # linha 5: Down=hit, o resto = morte
    order = []  # (tag, imagem)
    for c, d in enumerate(DIR_OF_COL):
        for r, a in enumerate(anims):
            if r == 4 and c != 0:
                continue
            order.append((f"{a}_{d}", cells[(r, c)]))
    # morte: Left/Right/Up têm corpo caído; Down (se) reaproveita o de Right (corpo caído vale para qualquer lado)
    order.append(("death_se", cells[(4, 2)]))
    order.append(("death_w", cells[(4, 1)]))
    order.append(("death_e", cells[(4, 2)]))
    order.append(("death_ne", cells[(4, 3)]))
    # skill = ataque (a folha só tem uma pose de ataque por direção)
    for c, d in enumerate(DIR_OF_COL):
        order.append((f"skill_{d}", cells[(2, c)]))

    cols = 8
    rows = (len(order) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * FRAME, rows * FRAME), (0, 0, 0, 0))
    frames, tags = [], []
    for i, (tag, img) in enumerate(order):
        x, y = (i % cols) * FRAME, (i // cols) * FRAME
        tile = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
        tile.alpha_composite(img, (ox, dy))
        a = np.array(tile)
        a[:, 0, 3] = 0; a[:, -1, 3] = 0  # sobras da borda do painel
        atlas.alpha_composite(Image.fromarray(a, "RGBA"), (x, y))
        frames.append({"filename": f"warrior {i}.aseprite", "frame": {"x": x, "y": y, "w": FRAME, "h": FRAME}, "rotated": False, "trimmed": False,
                       "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME, "h": FRAME}, "sourceSize": {"w": FRAME, "h": FRAME}, "duration": 167 if tag.startswith(("idle", "walk")) else 120})
        tags.append({"name": tag, "from": i, "to": i, "direction": "forward"})
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / "warrior.png")
    json.dump({"frames": frames, "meta": {"app": "frixep-kit", "version": "1.0", "image": "warrior.png", "format": "RGBA8888",
              "size": {"w": atlas.width, "h": atlas.height}, "scale": "1", "frameTags": tags}}, open(OUT / "warrior.json", "w"), indent=1)
    print(f"{len(order)} quadros, atlas {atlas.width}x{atlas.height}")


main()
