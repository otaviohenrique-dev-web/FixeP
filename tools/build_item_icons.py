"""Recorta os ícones de item da folha assets/source/items_sheet.webp e grava assets/items/item_<id>.png (48x48, fundo transparente).
Precisa de Pillow e numpy.  Uso: python tools/build_item_icons.py

O fundo da folha é uma parede de pedra: o script estima a cor da pedra pelas bordas de cada célula, marca o que
difere dela, fecha buracos e fica com o maior objeto (mais brilhos próximos, como o aro azul do cajado).
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "assets/source/items_sheet.webp"
OUT = ROOT / "assets/items"
SIZE = 48

COLS = [(135, 293), (298, 456), (461, 618)]  # comum, incomum, raro
ROWS = [(44, 148), (153, 267), (272, 387), (392, 547), (552, 656)]  # arco, espada, escudo, cajado, poção
# (linha, coluna) -> id do item no jogo. O escudo ocupa a vaga da armadura (o jogo ainda não tem escudos).
ITEMS = {
    (0, 0): "arco_curto", (0, 1): "arco_composto", (0, 2): "arco_da_geada",
    (1, 0): "espada_enferrujada", (1, 1): "espada_de_ferro", (1, 2): "lamina_da_geada",
    (2, 0): "gibao_surrado", (2, 1): "cota_de_malha", (2, 2): "armadura_de_brasa",
    (3, 0): "cajado_de_galho", (3, 1): "cajado_de_cinzas", (3, 2): "cajado_da_brasa",
    (4, 0): "pocao_de_vida",
}
EXTRA = {(4, 1): "pocao_de_vida_verde"}  # sobra da folha (poção incomum); ainda sem item no jogo


def neighbors(y, x, h, w):
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w:
            yield ny, nx


def components(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    out = []
    for sy in range(h):
        for sx in range(w):
            if mask[sy, sx] and not seen[sy, sx]:
                comp = [(sy, sx)]; seen[sy, sx] = True; i = 0
                while i < len(comp):
                    y, x = comp[i]; i += 1
                    for ny, nx in neighbors(y, x, h, w):
                        if mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; comp.append((ny, nx))
                out.append(comp)
    return out


def dilate(mask, n=1):
    for _ in range(n):
        m = mask.copy()
        m[1:] |= mask[:-1]; m[:-1] |= mask[1:]; m[:, 1:] |= mask[:, :-1]; m[:, :-1] |= mask[:, 1:]
        mask = m
    return mask


def erode(mask, n=1):
    return ~dilate(~mask, n)


def fill_holes(mask):
    h, w = mask.shape
    out = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not mask[y, x] and not out[y, x]:
                out[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not mask[y, x] and not out[y, x]:
                out[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in neighbors(y, x, h, w):
            if not mask[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True; q.append((ny, nx))
    return ~out


def extract(cell: np.ndarray) -> Image.Image:
    h, w, _ = cell.shape
    c = cell.astype(int)
    ring = np.concatenate([c[:4].reshape(-1, 3), c[-4:].reshape(-1, 3), c[:, :4].reshape(-1, 3), c[:, -4:].reshape(-1, 3)])
    stone = np.median(ring, axis=0)
    diff = np.abs(c - stone).sum(axis=2)
    sat = c.max(axis=2) - c.min(axis=2)
    bright = c.sum(axis=2)
    # item = bem diferente da pedra, ou colorido, ou claro
    # linhas da grade da folha (claras e atravessando a célula inteira) não fazem parte do item
    line = bright > 330
    rows = line.mean(axis=1) > 0.4
    cols_ = line.mean(axis=0) > 0.4
    drop = np.zeros((h, w), bool)
    drop[rows, :] = True
    drop[:, cols_] = True
    mask = ((diff > 70) | (sat > 55) | (bright > 330))
    mask &= ~dilate(drop, 1)
    mask = erode(dilate(mask, 2), 2)  # fecha frestas
    mask = fill_holes(mask)
    comps = [cp for cp in components(mask) if len(cp) > 25]
    if not comps:
        raise SystemExit("nada encontrado na célula")
    biggest = max(comps, key=len)
    keep = np.zeros((h, w), bool)
    ys = [p[0] for p in biggest]; xs = [p[1] for p in biggest]
    by0, by1, bx0, bx1 = min(ys) - 14, max(ys) + 14, min(xs) - 14, max(xs) + 14
    for cp in comps:  # junta pedaços perto do principal (brilhos, aros, rolha)
        cy = sum(p[0] for p in cp) / len(cp); cx = sum(p[1] for p in cp) / len(cp)
        if by0 <= cy <= by1 and bx0 <= cx <= bx1:
            for y, x in cp: keep[y, x] = True
    alpha = np.where(erode(keep, 1) | (keep & ~erode(keep, 1)), 255, 0).astype(np.uint8)
    img = Image.fromarray(np.dstack([cell.astype(np.uint8), alpha]), "RGBA")
    box = img.getchannel("A").getbbox()
    img = img.crop(box)
    s = min((SIZE - 4) / img.width, (SIZE - 4) / img.height)
    img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    img.putalpha(img.getchannel("A").point(lambda v: 255 if v > 110 else 0))
    tile = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tile.alpha_composite(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2))
    return tile


def main():
    im = np.array(Image.open(SHEET).convert("RGB"))
    OUT.mkdir(parents=True, exist_ok=True)
    for (r, c), name in {**ITEMS, **EXTRA}.items():
        (x0, x1), (y0, y1) = COLS[c], ROWS[r]
        extract(im[y0 + 3 : y1 - 3, x0 + 3 : x1 - 3]).save(OUT / f"item_{name}.png")
    print(len(ITEMS) + len(EXTRA), "ícones em", OUT)


main()
