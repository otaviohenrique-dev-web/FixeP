"""Monta o kit (atlas PNG + JSON do Phaser, quadros 64x64) do Clérigo a partir das folhas de poses em assets/source/.
Precisa de Pillow e numpy.  Uso: python tools/build_sheet_kit.py cleric

As folhas têm o personagem sobre uma parede de pedra. Para cada quadro o script recorta uma janela de 64x64 em volta do
personagem, estima a cor da pedra pelas bordas, marca o que difere dela e apaga o resto (fundo transparente).
Todos os quadros de uma linha usam o mesmo deslocamento vertical, então os pés ficam alinhados em y=52.
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/characters"
FRAME, FOOT_Y = 64, 52

# Configuração por classe: arquivo da folha, topo e base de cada linha (idle, walk, skill, attack, dodge, hit/death),
# e, por direção, os centros x dos quadros de cada linha (lista de listas; None = a folha não tem esse desenho).
CONFIG = {
    "cleric": {
        "sheet": "cleric_sheet.webp",
        "rows": {"idle": (40, 131), "walk": (131, 221), "skill": (221, 330), "attack": (330, 440), "dodge": (440, 550), "hit": (550, 659)},
        "feet_from_top": 0.80,  # fração da altura da linha onde ficam os pés
        "dirs": {
            # direção do jogo: (centros x por linha). Down=S/SW, Left=W/NW, Right=E/NE, Up=N/SE (rótulos da folha)
            "sw": {"idle": [175, 232], "walk": [175, 232], "attack": [175, 232], "dodge": [175, 232], "hit": [175]},
            "nw": {"idle": [305, 367], "walk": [305, 367], "attack": [305, 367], "dodge": [305, 367]},
            "ne": {"idle": [440, 505], "walk": [440, 505], "attack": [440, 505], "dodge": [440, 505]},
            "se": {"idle": [605], "walk": [605], "attack": [605], "dodge": [605]},
        },
        "death": {"sw": 232, "nw": 367, "ne": 505, "se": 605},  # corpo caído: último quadro da linha hit/death
        "thr": 28,
        "scale": 0.85,
    },
}


def neighbors(y, x, h, w):
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w:
            yield ny, nx


def dilate(m, n=1):
    for _ in range(n):
        o = m.copy()
        o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
        m = o
    return m


def erode(m, n=1):
    return ~dilate(~m, n)


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


def cutout(win: np.ndarray, thr: int, glow: bool = False) -> Image.Image:
    h, w, _ = win.shape
    c = win.astype(int)
    ring = np.concatenate([c[:3].reshape(-1, 3), c[-3:].reshape(-1, 3), c[:, :3].reshape(-1, 3), c[:, -3:].reshape(-1, 3)])
    stone = np.median(ring, axis=0)
    diff = np.abs(c - stone).sum(axis=2)
    sat = c.max(axis=2) - c.min(axis=2)
    mask = (diff > thr) | (sat > 60)
    if glow:  # brilho quente de cura/buff: não faz parte do corpo
        mask &= ~(((c[:, :, 0] - c[:, :, 2]) > 14) & (c[:, :, 0] > 70) & (sat < 120))
    # linhas finas da parede de pedra: abertura morfológica (apaga traços de 1-2 px; o corpo e o cajado ficam)
    mask = dilate(erode(mask, 1), 1)
    mask = erode(dilate(mask, 3), 3)  # fecha buracos e frestas (mantos escuros parecidos com a pedra)
    mask = fill_holes(mask)
    mask = dilate(erode(mask, 1), 1)
    mask[:, :5] = False; mask[:, -5:] = False  # sobras dos quadros vizinhos / bordas da folha
    comps = [cp for cp in components(mask) if len(cp) >= 14]
    if not comps:
        return Image.new("RGBA", (w, h), (0, 0, 0, 0))
    big = max(comps, key=len)
    ys = [p[0] for p in big]; xs = [p[1] for p in big]
    y0, y1, x0, x1 = min(ys) - 10, max(ys) + 10, min(xs) - 10, max(xs) + 10
    keep = np.zeros((h, w), bool)
    for cp in comps:
        cy = sum(p[0] for p in cp) / len(cp); cx = sum(p[1] for p in cp) / len(cp)
        if y0 <= cy <= y1 and x0 <= cx <= x1:
            for y, x in cp: keep[y, x] = True
    alpha = np.where(keep, 255, 0).astype(np.uint8)
    return Image.fromarray(np.dstack([win.astype(np.uint8), alpha]), "RGBA")


def main(name: str):
    cfg = CONFIG[name]
    sheet = np.array(Image.open(ROOT / "assets/source" / cfg["sheet"]).convert("RGB"))
    H, W, _ = sheet.shape

    def window(cx, row):
        top, bot = cfg["rows"][row]
        feet = top + (bot - top) * cfg["feet_from_top"]
        sc = cfg.get("scale", 1.0)  # <1: reduz a folha para o personagem caber no quadro com folga
        WIN = round(FRAME / sc)
        y0 = int(round(feet - FOOT_Y / sc))
        x0 = int(round(cx - WIN / 2))
        win = np.zeros((WIN, WIN, 3), np.uint8)
        sy0, sy1, sx0, sx1 = max(0, y0), min(H, y0 + WIN), max(0, x0), min(W, x0 + WIN)
        win[sy0 - y0 : sy1 - y0, sx0 - x0 : sx1 - x0] = sheet[sy0:sy1, sx0:sx1]
        img = cutout(win, cfg["thr"], row == "skill")
        if sc != 1.0:
            img = img.resize((FRAME, FRAME), Image.LANCZOS)
            img.putalpha(img.getchannel("A").point(lambda v: 255 if v > 110 else 0))
        return img

    order = []
    for d, rows in cfg["dirs"].items():
        for anim, xs in rows.items():
            for cx in xs:
                order.append((f"{anim}_{d}", window(cx, anim)))
        for cx_death in [cfg["death"][d]]:
            order.append((f"death_{d}", window(cx_death, "hit")))
    # junta quadros da mesma tag (ficam seguidos por construção: a ordem de inserção agrupa por tag)
    frames, tags, cols = [], [], 8
    rows_n = (len(order) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * FRAME, rows_n * FRAME), (0, 0, 0, 0))
    cur = None
    for i, (tag, img) in enumerate(order):
        atlas.alpha_composite(img, ((i % cols) * FRAME, (i // cols) * FRAME))
        frames.append({"filename": f"{name} {i}.aseprite", "frame": {"x": (i % cols) * FRAME, "y": (i // cols) * FRAME, "w": FRAME, "h": FRAME}, "rotated": False,
                       "trimmed": False, "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME, "h": FRAME}, "sourceSize": {"w": FRAME, "h": FRAME},
                       "duration": 220 if tag.startswith(("idle", "walk")) else 140})
        if cur and cur["name"] == tag:
            cur["to"] = i
        else:
            cur = {"name": tag, "from": i, "to": i, "direction": "forward"}
            tags.append(cur)
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / f"{name}.png")
    json.dump({"frames": frames, "meta": {"app": "frixep-kit", "version": "1.0", "image": f"{name}.png", "format": "RGBA8888",
              "size": {"w": atlas.width, "h": atlas.height}, "scale": "1", "frameTags": tags}}, open(OUT / f"{name}.json", "w"), indent=1)
    print(name, len(order), "quadros,", len(tags), "tags")


main(sys.argv[1])
