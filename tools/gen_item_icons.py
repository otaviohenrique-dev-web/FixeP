"""Gera o kit de ícones de itens do FrixeP (pixel art, 48x48) por código. Original do projeto.

Desenha em grade de 24x24 e amplia 2x (pixels grossos, nítidos). Contorno automático. Saída: assets/items/item_<id>.png.
Precisa de Pillow.  Uso: python tools/gen_item_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/items"
N = 24
OL = (14, 18, 26, 255)


def C(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class Icon:
    def __init__(self):
        self.im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def line(self, a, b, col, w=1):
        self.d.line([a, b], fill=col, width=w)

    def poly(self, pts, col):
        self.d.polygon(pts, fill=col)

    def rect(self, x0, y0, x1, y1, col):
        self.d.rectangle([x0, y0, x1, y1], fill=col)

    def dot(self, x, y, col):
        if 0 <= x < N and 0 <= y < N:
            self.im.putpixel((x, y), col)

    def ellipse(self, box, col):
        self.d.ellipse(box, fill=col)

    def arc(self, box, a0, a1, col, w=2):
        self.d.arc(box, a0, a1, fill=col, width=w)

    def finish(self):
        """contorno escuro de 1 px ao redor + sombra suave embaixo; devolve 48x48"""
        src = self.im
        out = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        px = src.load()
        po = out.load()
        for y in range(N):
            for x in range(N):
                if px[x, y][3] == 0:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < N and 0 <= ny < N and px[nx, ny][3] > 0:
                            po[x, y] = OL
                            break
        out.alpha_composite(src)
        return out.resize((N * 2, N * 2), Image.NEAREST)


# ---- paleta
STEEL = [C("#6c7684"), C("#a3adbb"), C("#dfe7f1")]  # escuro, médio, brilho
RUST = [C("#5a3a22"), C("#8d5a34"), C("#b9824f")]
ICE = [C("#3a78a8"), C("#7fc4ee"), C("#e6f7ff")]
WOOD = [C("#4a2e1a"), C("#7a4d2b"), C("#a8723f")]
LEATHER = [C("#4b3322"), C("#7a5636"), C("#a47a4e")]
GOLD = C("#d9b25a")
EMBER = [C("#7a1f0c"), C("#e0551f"), C("#ffd27a")]
ASH = [C("#4a4a52"), C("#85858f"), C("#c9c9d2")]
DARK = [C("#1f2430"), C("#343b4c"), C("#4d566b")]


def sword(blade, guard, grip, notch=False, sparkle=None):
    i = Icon()
    i.line((8, 15), (19, 4), blade[0], 4)  # lâmina (escura por baixo)
    i.line((8, 15), (19, 4), blade[1], 3)
    i.line((8, 14), (18, 4), blade[2], 1)  # fio brilhante
    i.poly([(18, 2), (21, 2), (21, 5)], blade[2])  # ponta
    i.line((6, 12), (11, 17), guard, 2)  # guarda
    i.line((8, 15), (4, 19), grip[1], 2)  # empunhadura
    i.rect(2, 19, 3, 20, GOLD)  # pomo
    if notch:  # ferrugem e dentes no fio
        for p in ((12, 11), (15, 8), (10, 13), (17, 6)):
            i.dot(p[0], p[1], RUST[0])
        i.dot(14, 11, OL)
        i.dot(16, 9, OL)
    if sparkle:
        for p in ((20, 8), (16, 3), (10, 10)):
            i.dot(p[0], p[1], sparkle)
        i.dot(21, 8, sparkle)
        i.dot(20, 7, sparkle)
        i.dot(20, 9, sparkle)
    return i.finish()


def bow(wood, tip, string, ice=False, wrap=None):
    i = Icon()
    i.arc([-7, 1, 15, 23], -80, 80, wood[0], 4)
    i.arc([-7, 1, 15, 23], -80, 80, wood[1], 3)
    i.arc([-6, 2, 14, 22], -70, 40, wood[2], 1)
    i.line((8, 2), (8, 22), string, 1)
    i.dot(7, 2, tip)
    i.dot(7, 22, tip)
    i.dot(8, 1, tip)
    i.dot(8, 23, tip)
    if wrap:  # empunhadura enrolada
        i.rect(13, 10, 14, 14, wrap)
    if ice:
        for p in ((15, 6), (16, 17), (14, 20), (12, 4)):
            i.dot(p[0], p[1], ICE[2])
            i.dot(p[0] + 1, p[1], ICE[1])
    # flecha encaixada
    i.line((8, 12), (20, 12), WOOD[2], 1)
    i.poly([(20, 10), (22, 12), (20, 14)], STEEL[1])
    i.line((8, 12), (9, 10), C("#d8c9a8"), 1)
    i.line((8, 12), (9, 14), C("#d8c9a8"), 1)
    return i.finish()


def staff(head):
    i = Icon()
    i.line((5, 21), (16, 8), WOOD[0], 3)
    i.line((5, 21), (16, 8), WOOD[1], 2)
    i.line((5, 20), (15, 8), WOOD[2], 1)
    head(i)
    return i.finish()


def head_galho(i):
    i.line((16, 8), (19, 4), WOOD[1], 2)
    i.line((16, 8), (20, 8), WOOD[1], 2)
    i.line((16, 8), (14, 3), WOOD[1], 2)
    i.dot(19, 3, C("#7fa04a"))
    i.dot(21, 8, C("#7fa04a"))
    i.dot(13, 2, C("#7fa04a"))


def head_cinzas(i):
    i.ellipse([15, 2, 21, 8], ASH[0])
    i.ellipse([16, 3, 20, 7], ASH[1])
    i.dot(17, 4, ASH[2])
    i.dot(18, 3, ASH[2])
    i.line((14, 9), (17, 6), STEEL[0], 1)
    i.dot(20, 1, ASH[2])


def head_brasa(i):
    i.ellipse([13, 0, 23, 10], C("#ff9a3d", 90))  # brilho
    i.ellipse([15, 2, 21, 8], EMBER[0])
    i.ellipse([16, 3, 20, 7], EMBER[1])
    i.ellipse([17, 4, 19, 6], EMBER[2])
    i.line((14, 10), (17, 7), GOLD, 1)
    i.line((17, 9), (14, 6), GOLD, 1)


def tunic(main, trim, seam=None, plates=None, rings=False):
    i = Icon()
    pts = [(8, 3), (10, 3), (12, 6), (14, 3), (16, 3), (21, 6), (19, 11), (17, 10), (17, 21), (7, 21), (7, 10), (5, 11), (3, 6)]
    i.poly(pts, main[0])
    i.poly([(9, 4), (10, 4), (12, 7), (14, 4), (15, 4), (19, 6), (17, 9), (16, 9), (16, 20), (8, 20), (8, 9), (7, 9), (5, 6)], main[1])
    i.line((9, 5), (6, 7), main[2], 1)  # brilho no ombro
    i.line((9, 8), (9, 19), main[2], 1)
    i.line((8, 20), (16, 20), trim, 1)  # barra
    i.line((10, 15), (14, 15), trim, 1)  # cinto
    i.dot(12, 15, GOLD)
    if rings:
        for y in range(8, 20, 2):
            for x in range(9 + (y // 2) % 2, 16, 2):
                i.dot(x, y, main[2])
    if seam:
        i.line((12, 7), (12, 14), seam, 1)
        i.line((9, 10), (11, 12), seam, 1)
        i.line((15, 10), (13, 12), seam, 1)
        i.dot(10, 18, seam)
        i.dot(14, 18, seam)
    if plates:
        i.rect(3, 5, 7, 7, plates)
        i.rect(17, 5, 21, 7, plates)
        i.line((3, 5), (7, 5), GOLD, 1)
        i.line((17, 5), (21, 5), GOLD, 1)
    else:
        i.dot(11, 3, trim)
        i.dot(13, 3, trim)
    return i.finish()


def potion(liquid):
    i = Icon()
    i.ellipse([5, 9, 18, 22], C("#aee0f0", 150))  # vidro
    i.rect(10, 5, 13, 10, C("#aee0f0", 150))
    i.ellipse([6, 12, 17, 21], liquid[0])  # líquido
    i.ellipse([7, 13, 16, 20], liquid[1])
    i.rect(6, 12, 17, 13, C("#aee0f0", 0))
    i.dot(9, 15, liquid[2])
    i.dot(10, 14, liquid[2])
    i.dot(9, 16, liquid[2])
    i.dot(14, 19, liquid[0])
    i.rect(9, 3, 14, 5, WOOD[1])  # rolha
    i.line((9, 3), (14, 3), WOOD[2], 1)
    i.dot(12, 7, C("#ffffff", 200))
    i.line((8, 11), (7, 13), C("#ffffff", 220), 1)
    return i.finish()


ICONS = {
    "espada_enferrujada": lambda: sword(RUST, STEEL[0], LEATHER, notch=True),
    "espada_de_ferro": lambda: sword(STEEL, GOLD, LEATHER),
    "lamina_da_geada": lambda: sword(ICE, STEEL[2], DARK, sparkle=ICE[2]),
    "arco_curto": lambda: bow(WOOD, WOOD[2], C("#e8e0c8")),
    "arco_composto": lambda: bow([C("#5a3a22"), C("#9a6a3a"), C("#d8a866")], C("#e8e0c8"), C("#e8e0c8"), wrap=GOLD),
    "arco_da_geada": lambda: bow(ICE, ICE[2], ICE[2], ice=True),
    "cajado_de_galho": lambda: staff(head_galho),
    "cajado_de_cinzas": lambda: staff(head_cinzas),
    "cajado_da_brasa": lambda: staff(head_brasa),
    "gibao_surrado": lambda: tunic(LEATHER, C("#3a2819")),
    "cota_de_malha": lambda: tunic(STEEL, C("#4d566b"), rings=True),
    "armadura_de_brasa": lambda: tunic(DARK, C("#7a1f0c"), seam=EMBER[1], plates=C("#4d566b")),
    "pocao_de_vida": lambda: potion([C("#7a0f1c"), C("#d6283f"), C("#ff8d9a")]),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("item_*.png"):  # recomeça do zero: o kit antigo sai
        f.unlink()
    for name, make in ICONS.items():
        make().save(OUT / f"item_{name}.png")
    print(f"{len(ICONS)} icones em {OUT}")


if __name__ == "__main__":
    main()
