"""Monta os kits do jogo a partir das folhas de poses com FUNDO MAGENTA em assets/source/:
  - assets/characters/{warrior,archer,cleric}.png + .json  (atlas no formato do Phaser, quadros 64x64, tags <animacao>_<direcao>)
  - assets/items/item_<id>.png                              (ícones 48x48)
Precisa de Pillow e numpy.  Uso: python tools/build_kits.py [warrior|archer|cleric|items]   (sem argumento: tudo)

Cada folha tem 1 pose (ou 2 quadros) por animação e direção. O script recorta cada célula, apaga o magenta (e a sombra roxa
do chão, que o jogo desenha por conta própria), reduz tudo pela MESMA escala (a idle de frente define a altura) e alinha os pés em y=52.
Direções do jogo: o que a folha não tem vem do que há (o jogo também espelha SW/NW a partir de SE/NE).
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/source"
CHARS = ROOT / "assets/characters"
ITEMS_OUT = ROOT / "assets/items"
FRAME, FOOT_Y, ITEM = 64, 52, 48
STAND_H = 50  # altura (px no jogo) da pose idle de frente

# ----------------------------------------------------------------------------- configuração das folhas
# rows: faixa y de cada animação na folha. cells[anim][dir] = lista de centros x (um por quadro) ou None.
WARRIOR = {
    "sheet": "warrior_sheet.jpg",
    "rows": {"idle": (43, 218), "walk": (233, 408), "attack": (423, 600), "dodge": (616, 793), "hit": (809, 986)},
    # caixas x das células: Down, Left, Right, Up
    "cols": {"se": (147, 345), "w": (364, 561), "e": (579, 776), "ne": (796, 995)},
    "anims": ["idle", "walk", "attack", "dodge"],
    "hit": {"se": (147, 345)}, "death": {"se": (579, 776), "w": (364, 561), "e": (579, 776), "ne": (796, 995)},
    "skill_from": "attack",
}
ARCHER = {
    "sheet": "archer_sheet.jpg",
    "rows": {"idle": (47, 190), "walk": (195, 338), "attack": (517, 680), "dodge": (688, 850), "hit": (858, 1020)},
    # Down, N, S, Right, Up (rótulos da folha). Down=se, Up=ne, Right=e, N=n, S=s
    "cols": {"se": (190, 327), "n": (328, 463), "s": (464, 599), "e": (600, 735), "ne": (736, 866)},
    # as linhas de ataque, esquiva e hit/morte têm células mais largas que a de idle/walk
    "wide": {
        "attack": {"se": (188, 350), "n": (352, 512), "s": (514, 675), "e": (678, 840)},  # sem célula "Up" (ali ficam as flechas)
        "dodge": {"se": (188, 350), "n": (352, 512), "s": (514, 675), "e": (678, 840), "ne": (842, 1020)},
    },
    "anims": ["idle", "walk", "attack", "dodge"],
    "hit": {"se": (188, 350), "n": (352, 512)}, "death": {"s": (514, 675), "e": (678, 840), "ne": (842, 1020)},
    "skill_from": "attack",
}
CLERIC = {
    "sheet": "cleric_sheet.jpg",
    "rows": {"idle": (60, 198), "walk": (202, 339), "skill": (343, 510), "attack": (514, 681), "dodge": (685, 852), "hit": (855, 1022)},
    # Down(S/SW), Left(W/NW), Right(E/NE), Up(N/SE): 2 quadros cada, exceto Up
    "cols": {"sw": [(206, 308), (309, 410)], "nw": [(413, 514), (515, 616)], "ne": [(620, 736), (737, 853)], "se": [(855, 1021)]},
    "anims": ["idle", "walk", "skill", "attack", "dodge"],
    "hit": {"sw": (206, 308)}, "death": {"sw": (309, 410), "nw": (515, 616), "ne": (737, 853), "se": (855, 1021)},
}

# ----------------------------------------------------------------------------- recorte
def magenta(a: np.ndarray) -> np.ndarray:
    r, g, b = (a[..., i].astype(int) for i in range(3))
    mn, mx = np.minimum(r, b), np.maximum(r, b)
    base = (mn > 55) & (g < 0.55 * mn) & ((mx - mn) < 0.4 * mx)
    pink = (mn > 90) & (b > g * 1.15 + 10) & (r > g * 1.15 + 10) & ((mx - mn) < 0.4 * mx)  # brilhos misturados com o magenta
    return base | pink


def nb(y, x, h, w):
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        if 0 <= y + dy < h and 0 <= x + dx < w:
            yield y + dy, x + dx


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
                    for ny, nx in nb(y, x, h, w):
                        if mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; comp.append((ny, nx))
                out.append(comp)
    return out


def dilate(m, n=1):
    for _ in range(n):
        o = m.copy()
        o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
        m = o
    return m


def erode(m, n=1):
    return ~dilate(~m, n)


def key(win: np.ndarray, keep_far=False) -> Image.Image:
    """RGB -> RGBA sem o magenta. Fica com o objeto principal e o que estiver colado/perto dele."""
    h, w, _ = win.shape
    fg = ~magenta(win)
    fg = dilate(erode(fg, 1), 1)  # tira o fiapo rosado do JPEG
    comps = [c for c in components(fg) if len(c) >= 20]
    if not comps:
        return Image.new("RGBA", (w, h), (0, 0, 0, 0))
    big = max(comps, key=len)
    ys = [p[0] for p in big]; xs = [p[1] for p in big]
    y0, y1, x0, x1 = min(ys) - 12, max(ys) + 12, min(xs) - 12, max(xs) + 12
    keep = np.zeros((h, w), bool)
    for c in comps:
        cy = sum(p[0] for p in c) / len(c); cx = sum(p[1] for p in c) / len(c)
        if keep_far or (y0 <= cy <= y1 and x0 <= cx <= x1):
            for y, x in c: keep[y, x] = True
    return Image.fromarray(np.dstack([win.astype(np.uint8), np.where(keep, 255, 0).astype(np.uint8)]), "RGBA")


def window(sheet, box, top, bot, half=None):
    H, W, _ = sheet.shape
    x0, x1 = max(0, box[0] + 6), min(W, box[1] - 6)  # recua da moldura da célula
    y0, y1 = max(0, top + 5), min(H, bot - 5)
    return sheet[y0:y1, x0:x1], x0, y0


# ----------------------------------------------------------------------------- personagens
def build_char(name, cfg):
    sheet = np.array(Image.open(SRC / cfg["sheet"]).convert("RGB"))
    rows = cfg["rows"]

    def grab(anim, cx):
        top, bot = rows.get(anim) or rows["hit" if anim == "death" else cfg["skill_from"]]
        win, _, _ = window(sheet, cx, top, bot)
        return key(win), top

    # escala: a idle de frente define a altura
    first_dir = next(iter(cfg["cols"]))
    cx0 = cfg["cols"][first_dir]
    cx0 = cx0[0] if isinstance(cx0, list) else cx0
    ref, _ = grab("idle", cx0)
    bb = ref.getbbox()
    scale = STAND_H / (bb[3] - bb[1])
    feet_rel = bb[3]  # base dos pés dentro da janela, a partir do topo da janela (y0 = top+5)

    def place(img):
        # alinhamento: pés da idle = FOOT_Y; todos os quadros usam o mesmo deslocamento; centro x = centro da janela
        s = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
        s.putalpha(s.getchannel("A").point(lambda v: 255 if v > 110 else 0))
        tile = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
        tile.alpha_composite(s, ((FRAME - s.width) // 2, round(FOOT_Y - feet_rel * scale)))
        a = np.array(tile)
        return Image.fromarray(a, "RGBA")

    order = []  # (tag, imagem)
    dirs = cfg["cols"]

    def add(anim, d, cxs):
        for cx in (cxs if isinstance(cxs, list) else [cxs]):
            order.append((f"{anim}_{d}", place(grab(anim, cx)[0])))

    for d, cxs in dirs.items():
        wide = cfg.get("wide", {})
        for anim in cfg["anims"]:
            if anim in wide:
                if d in wide[anim]:
                    add(anim, d, wide[anim][d])
            else:
                add(anim, d, cxs)
        if "skill_from" in cfg and cfg["skill_from"] in wide and d in wide[cfg["skill_from"]]:
            add("skill", d, wide[cfg["skill_from"]][d])
        elif "skill_from" in cfg and cfg["skill_from"] not in wide:
            add("skill", d, cxs)
        if d in cfg["hit"]:
            add("hit", d, cfg["hit"][d])
        if d in cfg["death"]:
            add("death", d, cfg["death"][d])
    # direções sem quadro próprio de ataque/esquiva/hit/morte copiam o de SE (assim o boneco nunca fica sem animação)
    have = {t for t, _ in order}
    for anim in ("attack", "skill", "dodge", "hit", "death"):
        src = next((t for t, _ in order if t.startswith(anim + "_")), None)
        if not src:
            continue
        for d in dirs:
            if f"{anim}_{d}" not in have:
                for t, im in [x for x in order if x[0] == src]:
                    order.append((f"{anim}_{d}", im))
    order.sort(key=lambda x: x[0])  # agrupa por tag (os quadros de uma tag ficam seguidos)

    cols = 8
    n_rows = (len(order) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * FRAME, n_rows * FRAME), (0, 0, 0, 0))
    frames, tags, cur = [], [], None
    for i, (tag, im) in enumerate(order):
        x, y = (i % cols) * FRAME, (i // cols) * FRAME
        atlas.alpha_composite(im, (x, y))
        anim = tag.split("_")[0]
        frames.append({"filename": f"{name} {i}.aseprite", "frame": {"x": x, "y": y, "w": FRAME, "h": FRAME}, "rotated": False, "trimmed": False,
                       "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME, "h": FRAME}, "sourceSize": {"w": FRAME, "h": FRAME},
                       "duration": 220 if anim in ("idle", "walk") else 130})
        if cur and cur["name"] == tag:
            cur["to"] = i
        else:
            cur = {"name": tag, "from": i, "to": i, "direction": "forward"}
            tags.append(cur)
    CHARS.mkdir(parents=True, exist_ok=True)
    atlas.save(CHARS / f"{name}.png")
    json.dump({"frames": frames, "meta": {"app": "frixep-kit", "version": "2.0", "image": f"{name}.png", "format": "RGBA8888",
              "size": {"w": atlas.width, "h": atlas.height}, "scale": "1", "frameTags": tags}}, open(CHARS / f"{name}.json", "w"), indent=1)
    print(f"{name}: {len(order)} quadros, {len(tags)} tags (escala {scale:.2f})")


# ----------------------------------------------------------------------------- ícones dos itens
ICON_COLS = [(205, 457), (459, 735), (737, 1010)]  # comum, incomum, raro
ICON_ROWS = [(58, 228), (230, 414), (417, 600), (603, 852), (855, 1022)]  # arco, espada, escudo, cajado, poção
ICONS = {
    (0, 0): "arco_curto", (0, 1): "arco_composto", (0, 2): "arco_da_geada",
    (1, 0): "espada_enferrujada", (1, 1): "espada_de_ferro", (1, 2): "lamina_da_geada",
    (2, 0): "gibao_surrado", (2, 1): "cota_de_malha", (2, 2): "armadura_de_brasa",  # o escudo ocupa a vaga da armadura
    (3, 0): "cajado_de_galho", (3, 1): "cajado_de_cinzas", (3, 2): "cajado_da_brasa",
    (4, 0): "pocao_de_vida", (4, 1): "pocao_de_vida_verde",  # a verde ainda não existe no jogo
}


def build_items():
    sheet = np.array(Image.open(SRC / "items_sheet.jpg").convert("RGB"))
    ITEMS_OUT.mkdir(parents=True, exist_ok=True)
    for (r, c), name in ICONS.items():
        (x0, x1), (y0, y1) = ICON_COLS[c], ICON_ROWS[r]
        img = key(sheet[y0 + 6 : y1 - 6, x0 + 6 : x1 - 6], keep_far=True)
        img = img.crop(img.getchannel("A").getbbox())
        s = min((ITEM - 4) / img.width, (ITEM - 4) / img.height)
        img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
        img.putalpha(img.getchannel("A").point(lambda v: 255 if v > 110 else 0))
        tile = Image.new("RGBA", (ITEM, ITEM), (0, 0, 0, 0))
        tile.alpha_composite(img, ((ITEM - img.width) // 2, (ITEM - img.height) // 2))
        tile.save(ITEMS_OUT / f"item_{name}.png")
    print(len(ICONS), "ícones")


if __name__ == "__main__":
    which = sys.argv[1:] or ["warrior", "archer", "cleric", "items"]
    for w in which:
        if w == "items":
            build_items()
        else:
            build_char(w, {"warrior": WARRIOR, "archer": ARCHER, "cleric": CLERIC}[w])
