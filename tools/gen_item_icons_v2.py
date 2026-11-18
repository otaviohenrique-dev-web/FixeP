"""Icones de TODOS os itens novos (armas por tipo, maos secundarias, elmo, armadura, botas, capa) em pixel art 48x48, por codigo.
Original do projeto. Cor do metal pela raridade; detalhe de cor pela classe; brilho de epico para cima.
Le tools/items_catalog.json (gerado de packages/shared: em packages/server rode um script tsx que imprima Object.values(ITEMS)).
Saida: assets/items/item_<id>.png.  Uso: python tools/gen_item_icons_v2.py   (precisa de Pillow)"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/items"
N = 24
OL = (14, 18, 26, 255)


def C(r, g, b):
    return (r, g, b, 255)


METAL = {  # escuro, medio, brilho
    "common": (C(70, 76, 88), C(132, 140, 154), C(204, 212, 224)),
    "uncommon": (C(30, 84, 48), C(72, 170, 100), C(170, 240, 190)),
    "rare": (C(18, 58, 140), C(48, 130, 236), C(150, 205, 255)),
    "epic": (C(128, 88, 10), C(236, 180, 40), C(255, 240, 160)),
    "legendary": (C(120, 12, 12), C(236, 50, 40), C(255, 160, 130)),
    "mythic": (C(70, 20, 130), C(170, 80, 250), C(235, 190, 255)),
}
ACCENT = {"warrior": C(224, 120, 40), "archer": C(96, 190, 96), "cleric": C(246, 232, 170), "mage": C(160, 112, 255)}
WOOD = (C(60, 38, 22), C(110, 72, 42), C(160, 112, 66))
GLOW = {"epic": (255, 200, 60), "legendary": (255, 60, 40), "mythic": (180, 80, 255), "rare": (60, 140, 255)}


class Icon:
    def __init__(self):
        self.im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def line(self, a, b, col, w=1): self.d.line([a, b], fill=col, width=w)
    def poly(self, pts, col): self.d.polygon(pts, fill=col)
    def rect(self, x0, y0, x1, y1, col): self.d.rectangle([x0, y0, x1, y1], fill=col)
    def ell(self, box, col): self.d.ellipse(box, fill=col)

    def dot(self, x, y, col):
        if 0 <= x < N and 0 <= y < N:
            self.im.putpixel((int(x), int(y)), col)

    def finish(self, rarity):
        src, out = self.im, Image.new("RGBA", (N, N), (0, 0, 0, 0))
        px, po = src.load(), out.load()
        for y in range(N):
            for x in range(N):
                if px[x, y][3] == 0:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < N and 0 <= ny < N and px[nx, ny][3] > 0:
                            po[x, y] = OL
                            break
        out.alpha_composite(src)
        big = out.resize((N * 2, N * 2), Image.NEAREST)
        if rarity in GLOW:  # aura atras do item (mais forte nas raridades maiores)
            a = {"rare": 50, "epic": 90, "legendary": 120, "mythic": 150}[rarity]
            sil = big.split()[3].filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))
            glow = Image.new("RGBA", big.size, GLOW[rarity] + (0,))
            glow.putalpha(sil.point(lambda v: min(255, v * a // 255)))
            glow.alpha_composite(big)
            big = glow
        if rarity in ("epic", "legendary", "mythic"):  # faiscas nos cantos
            bp = big.load()
            for (x, y) in ((4, 5), (43, 8), (6, 42), (42, 41)):
                for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                    bp[x + dx, y + dy] = GLOW[rarity] + (255 if (dx, dy) == (0, 0) else 190,)
        return big


def sword(i, m, acc, length=15, wide=3, rune=False):
    x1, y1 = 5 + length, 19 - length
    i.line((6, 18), (x1, y1), m[0], wide + 1)
    i.line((6, 18), (x1, y1), m[1], wide)
    i.line((7, 17), (x1 - 1, y1 + 1), m[2], 1)
    i.poly([(x1 - 1, y1 - 2), (x1 + 2, y1 - 2), (x1 + 2, y1 + 1)], m[2])
    i.line((5, 13), (11, 19), WOOD[2], 2)
    i.line((6, 18), (3, 21), WOOD[1], 2)
    i.rect(2, 21, 3, 22, acc)
    if rune:
        for k in (4, 7, 10):
            i.dot(6 + k, 16 - k, acc)


def bow(i, m, acc, big=True):
    h = 11 if big else 8
    i.d.arc([-6, 12 - h, 14, 12 + h], -80, 80, m[0], 3)
    i.d.arc([-6, 12 - h, 14, 12 + h], -80, 80, m[1], 2)
    i.line((8, 12 - h + 1), (8, 12 + h - 1), C(230, 230, 236), 1)
    i.line((8, 12), (20, 12), WOOD[2], 1)
    i.poly([(20, 10), (23, 12), (20, 14)], m[2])
    i.dot(11, 12, acc)


def crossbow(i, m, acc):
    i.line((12, 6), (12, 20), m[1], 2)
    i.line((6, 8), (12, 6), m[1], 1)
    i.line((6, 18), (12, 20), m[1], 1)
    i.line((6, 8), (6, 18), C(230, 230, 236), 1)
    i.rect(6, 12, 20, 13, WOOD[1])
    i.rect(18, 11, 21, 14, WOOD[0])
    i.poly([(21, 11), (23, 12), (21, 13)], m[2])
    i.dot(14, 11, acc)


def staff(i, m, acc):
    i.line((6, 22), (16, 6), WOOD[0], 3)
    i.line((6, 22), (16, 6), WOOD[1], 2)
    i.poly([(13, 8), (14, 3), (16, 6), (19, 3), (19, 8)], m[1])
    i.ell((14, 1, 19, 6), acc)
    i.dot(15, 2, C(255, 255, 255))


def mace(i, m, acc, wand=False):
    i.line((6, 22), (15, 9), WOOD[0], 3)
    i.line((6, 22), (15, 9), WOOD[1], 2)
    if wand:
        i.poly([(15, 3), (16, 6), (19, 6), (17, 8), (18, 11), (15, 9), (12, 11), (13, 8), (11, 6), (14, 6)], acc)
    else:
        i.ell((11, 3, 19, 11), m[1])
        i.rect(14, 1, 16, 12, m[0])
        i.rect(10, 6, 20, 8, m[2])


def orb_stand(i, m, acc):
    i.poly([(8, 22), (16, 22), (14, 17), (10, 17)], m[0])
    i.ell((5, 3, 19, 17), acc)
    i.ell((7, 5, 12, 10), C(255, 255, 255))
    i.d.arc([4, 2, 20, 18], 200, 340, m[2], 1)


def shield(i, m, acc):
    i.poly([(4, 3), (20, 3), (20, 13), (12, 22), (4, 13)], m[0])
    i.poly([(6, 5), (18, 5), (18, 12), (12, 19), (6, 12)], m[1])
    i.rect(11, 5, 12, 19, m[2])
    i.rect(6, 10, 18, 11, m[2])
    i.ell((10, 8, 14, 12), acc)


def dagger(i, m, acc):
    i.line((7, 17), (18, 5), m[0], 3)
    i.line((7, 17), (18, 5), m[1], 2)
    i.line((8, 16), (18, 6), m[2], 1)
    i.line((5, 13), (11, 19), acc, 2)
    i.line((6, 18), (4, 20), WOOD[1], 2)


def quiver(i, m, acc):
    i.poly([(8, 8), (15, 6), (18, 20), (11, 22)], WOOD[1])
    i.poly([(8, 8), (15, 6), (16, 10), (9, 12)], WOOD[2])
    for k, x in enumerate((9, 12, 15)):
        i.line((x, 7 - k % 2), (x + 1, 2 - k % 2), WOOD[2], 1)
        i.poly([(x - 1, 3), (x + 2, 3), (x + 1, 0)], m[2])
    i.dot(13, 15, acc)


def tome(i, m, acc):
    i.rect(5, 4, 18, 21, m[0])
    i.rect(6, 5, 18, 20, m[1])
    i.rect(5, 4, 7, 21, m[2])
    i.rect(8, 7, 17, 8, C(235, 228, 200))
    i.ell((10, 10, 15, 15), acc)
    i.dot(12, 12, C(255, 255, 255))


def orb_float(i, m, acc):
    i.ell((6, 5, 18, 17), acc)
    i.ell((8, 7, 12, 11), C(255, 255, 255))
    i.d.arc([4, 3, 20, 19], 20, 160, m[2], 1)
    i.line((8, 21), (16, 21), m[1], 1)


def chest(i, m, acc):
    i.poly([(3, 6), (8, 3), (11, 6), (13, 6), (16, 3), (21, 6), (19, 12), (18, 21), (6, 21), (5, 12)], m[0])
    i.poly([(5, 7), (9, 5), (12, 8), (15, 5), (19, 7), (17, 12), (16, 20), (8, 20), (7, 12)], m[1])
    i.rect(11, 8, 12, 20, m[2])
    i.rect(7, 15, 17, 16, acc)


def helmet(i, m, acc, cls):
    if cls == "mage":
        i.poly([(2, 18), (22, 18), (14, 16), (13, 3), (10, 15)], m[0])
        i.poly([(5, 17), (19, 17), (13, 15), (12, 5), (10, 15)], m[1])
        i.rect(5, 16, 19, 17, acc)
    elif cls == "archer":
        i.ell((4, 4, 20, 22), m[0])
        i.ell((6, 6, 18, 20), m[1])
        i.ell((9, 10, 15, 17), C(24, 20, 30))
        i.dot(12, 5, m[2])
    elif cls == "cleric":
        i.poly([(4, 20), (7, 8), (12, 3), (17, 8), (20, 20)], m[0])
        i.poly([(7, 19), (9, 9), (12, 5), (15, 9), (17, 19)], m[1])
        i.rect(11, 5, 12, 12, acc)
        i.rect(9, 8, 14, 9, acc)
    else:
        i.ell((4, 3, 20, 19), m[0])
        i.rect(4, 11, 20, 21, m[0])
        i.ell((6, 5, 18, 17), m[1])
        i.rect(6, 12, 18, 20, m[1])
        i.rect(8, 12, 16, 14, C(24, 20, 30))
        i.rect(11, 2, 12, 6, acc)


def boots(i, m, acc):
    i.poly([(7, 3), (14, 3), (14, 13), (21, 16), (21, 21), (5, 21), (5, 12)], m[0])
    i.poly([(8, 4), (13, 4), (13, 14), (19, 17), (19, 20), (7, 20), (7, 12)], m[1])
    i.rect(8, 5, 13, 6, acc)
    i.rect(7, 19, 20, 20, m[2])


def cape(i, m, acc):
    i.poly([(5, 3), (19, 3), (22, 21), (16, 19), (12, 22), (8, 19), (2, 21)], m[0])
    i.poly([(7, 5), (17, 5), (19, 19), (16, 17), (12, 20), (8, 17), (5, 19)], m[1])
    i.rect(5, 3, 19, 5, acc)
    i.dot(12, 4, m[2])
    i.line((12, 7), (12, 17), m[0], 1)


OFF = {"escudo_guerra": shield, "escudo_sagrado": shield, "adaga_sombria": dagger, "aljava": quiver, "relicario": tome, "tomo_arcano": tome, "orbe_flutuante": orb_float}


def draw(it):
    m, acc = METAL[it["rarity"]], ACCENT.get(it["cls"] or "warrior")
    i, k, t = Icon(), it["kind"], it["wtype"]
    if k == "weapon":
        if t == "montante": sword(i, m, acc, 17, 4)
        elif t == "espada_larga": sword(i, m, acc, 15, 3)
        elif t == "lamina_runica": sword(i, m, acc, 15, 3, True)
        elif t == "espada_1m": sword(i, m, acc, 11, 2)
        elif t == "arco_longo": bow(i, m, acc, True)
        elif t == "arco_curto": bow(i, m, acc, False)
        elif t == "besta": crossbow(i, m, acc)
        elif t in ("cajado_sagrado", "cajado_arcano"): staff(i, m, acc)
        elif t in ("cetro", "maca"): mace(i, m, acc)
        elif t == "varinha": mace(i, m, acc, True)
        else: orb_stand(i, m, acc)
    elif k == "offhand":
        OFF[it["id"].rsplit("_", 1)[0]](i, m, acc)
    elif k == "armor": chest(i, m, acc)
    elif k == "helmet": helmet(i, m, acc, it["cls"])
    elif k == "boots": boots(i, m, acc)
    elif k == "cape": cape(i, m, acc)
    else:
        return None
    return i.finish(it["rarity"])


def main():
    items = json.load(open(ROOT / "tools/items_catalog.json", encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    for it in items:
        im = draw(it)
        if im:
            im.save(OUT / f"item_{it['id']}.png")
            n += 1
    print(f"{n} icones em {OUT}")


if __name__ == "__main__":
    main()
