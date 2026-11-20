"""Gera o brasão do FrixeP (escudo escuro, moldura de ouro com rebites, "F" rúnico em gradiente gelo→ouro,
brasa viva no vão do F e cristais de geada) em todos os tamanhos, a partir de UMA descrição de cena.

A mesma cena vira SVG (vetorial, com gradientes e brilhos) e PNG (Pillow, supersampling).
Uso:  python tools/gen_icons.py        (precisa de:  pip install pillow numpy)
Saída em packages/client/public/:
  favicon.svg (rico) · favicon-small.svg (alto contraste, 16/32) · favicon.ico (16/32/48) · favicon-32.png
  apple-touch-icon.png (180) · icon-192.png · icon-512.png · icon-maskable-512.png (zona segura 80%)
Coordenadas da cena: 0..100."""
import os, re
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "packages", "client", "public")
NIGHT, NIGHT2 = "#05080d", "#0d1420"
GOLD_L, GOLD, GOLD_D = "#f6e1a0", "#d9b25a", "#7a5a22"
ICE_L, ICE, ICE_D = "#e4f6ff", "#8fd3ff", "#3f86c4"
EMBER_L, EMBER, EMBER_D = "#fff0b8", "#ff9a3d", "#d8400e"

SHIELD = "M50 3C62 8 76 12 91 13C93 44 82 72 50 97C18 72 7 44 9 13C24 12 38 8 50 3Z"
SHIELD_IN = "M50 9C61 13.5 73 17 85 18C86 44 76 67 50 90C24 67 14 44 15 18C27 17 39 13.5 50 9Z"
def xf(d, s=1.0, dx=0.0, dy=0.0):
    """Escala (em torno de 50,50) e desloca um caminho M/L/C/Z absoluto."""
    it = iter(re.findall(r"[MLCZ]|-?\d+\.?\d*", d))
    out, buf = [], []
    for t in it:
        if t in "MLCZ":
            out.append(t)
        else:
            buf.append(float(t))
            if len(buf) == 2:
                out.append(f"{50 + (buf[0] - 50) * s + dx:.2f} {50 + (buf[1] - 50) * s + dy:.2f}"); buf = []
    return " ".join(out)


F_RUNE = xf("M35 25L44 19L77 19L71 30L53 30L53 43L67 43L62 54L53 54L53 79L44 88L35 79Z", .9, -5.4, -1)
F_HI = xf("M39 26L45 22.5L70 22.5L67.5 27L47 27Z", .9, -5.4, -1)
FLAME = "M57 78C50 75.5 48.5 68 52 62C53 65.5 55.5 66.5 57 64C56.2 58.5 58.5 53.5 62.5 49.5C62.5 56.5 67 60 67 66.5C67 73.5 63.5 77.5 57 78Z"
FLAME_IN = "M58 76.5C54.5 75 54.5 70.5 57 67.5C57.8 69.5 59.2 69.5 60 67.8C60 65.5 61.5 63.8 63 62C63 66 66 68 65.2 71.5C64.6 74.5 62 76.5 58 76.5Z"
CRYSTALS = ["M23 60L26.5 50L30 60L26.5 66Z", "M31 71L33.5 63L37 72L34 77Z", "M80 26L83 33L78 35Z", "M20 26L17.5 33L22 35Z"]
RIVETS = [(50, 7.4), (14, 14.5), (86, 14.5), (21, 51), (79, 51)]


# ---------- mini-motor de cena: o mesmo desenho vira SVG e vira PNG (Pillow) ----------
def lin(x1, y1, x2, y2, stops):
    return ("lin", x1, y1, x2, y2, stops)


def rad(cx, cy, r, stops):
    return ("rad", cx, cy, r, stops)


def hexrgb(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def flatten(d, steps=80):
    """Caminho absoluto com M/L/C/Z -> lista de pontos."""
    tok = re.findall(r"[MLCZ]|-?\d+\.?\d*", d)
    pts, i, cur = [], 0, (0.0, 0.0)
    while i < len(tok):
        t = tok[i]
        if t in "ML":
            i += 1
            while i < len(tok) and tok[i] not in "MLCZ":
                cur = (float(tok[i]), float(tok[i + 1])); pts.append(cur); i += 2
        elif t == "C":
            i += 1
            while i < len(tok) and tok[i] not in "MLCZ":
                p = [float(v) for v in tok[i:i + 6]]; i += 6
                x0, y0 = cur
                for s in range(1, steps + 1):
                    u = s / steps; v = 1 - u
                    pts.append((v**3 * x0 + 3 * v * v * u * p[0] + 3 * v * u * u * p[2] + u**3 * p[4],
                                v**3 * y0 + 3 * v * v * u * p[1] + 3 * v * u * u * p[3] + u**3 * p[5]))
                cur = (p[4], p[5])
        else:
            i += 1
    return pts


class Scene:
    def __init__(self, sc=1.0, full_bleed=False):
        self.items, self.sc, self.full_bleed, self.gid = [], sc, full_bleed, 0

    def add(self, d=None, circle=None, fill=None, stroke=None, sw=0, opacity=1.0, glow=None):
        self.items.append(dict(d=d, circle=circle, fill=fill, stroke=stroke, sw=sw, op=opacity, glow=glow))

    # ----- SVG
    def _paint(self, p, defs):
        if isinstance(p, str):
            return p
        self.gid += 1
        gid = f"g{self.gid}"
        st = "".join(f'<stop offset="{o}" stop-color="{c}"' + (f' stop-opacity="{a}"' if a < 1 else "") + "/>"
                     for o, c, a in [(s + (1.0,))[:3] for s in p[-1]])
        if p[0] == "lin":
            defs.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{p[1]}" y1="{p[2]}" x2="{p[3]}" y2="{p[4]}">{st}</linearGradient>')
        else:
            defs.append(f'<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" cx="{p[1]}" cy="{p[2]}" r="{p[3]}">{st}</radialGradient>')
        return f"url(#{gid})"

    def svg(self, size=512):
        defs, body = [], []
        for it in self.items:
            shape = (f'<path d="{it["d"]}"' if it["d"] else f'<circle cx="{it["circle"][0]}" cy="{it["circle"][1]}" r="{it["circle"][2]}"')
            if it["glow"]:
                c, r, o = it["glow"]
                self.gid += 1
                defs.append(f'<filter id="f{self.gid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{r}"/></filter>')
                body.append(f'{shape} fill="{c}" opacity="{o}" filter="url(#f{self.gid})"/>')
            if not it["fill"] and not it["stroke"]:
                continue
            a = f' fill="{self._paint(it["fill"], defs)}"' if it["fill"] else ' fill="none"'
            if it["stroke"]:
                a += f' stroke="{self._paint(it["stroke"], defs)}" stroke-width="{it["sw"]}" stroke-linejoin="round"'
            if it["op"] < 1:
                a += f' opacity="{it["op"]}"'
            body.append(f"{shape}{a}/>")
        bg = ""
        if self.full_bleed:
            bg = '<rect width="100" height="100" fill="url(#bgfull)"/>'
            defs.insert(0, f'<radialGradient id="bgfull" cx=".5" cy=".42" r=".72"><stop offset="0" stop-color="{NIGHT2}"/><stop offset="1" stop-color="{NIGHT}"/></radialGradient>')
        t = f' transform="translate(50 50) scale({self.sc}) translate(-50 -50)"'
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="{size}" height="{size}">'
                f'<title>FrixeP</title><defs>{"".join(defs)}</defs>{bg}<g{t}>{"".join(body)}</g></svg>\n')

    # ----- Pillow
    def _T(self, x, y):
        return ((x - 50) * self.sc + 50, (y - 50) * self.sc + 50)

    def _paint_img(self, p, S):
        if isinstance(p, str):
            return Image.new("RGBA", (S, S), hexrgb(p) + (255,))
        k = S / 100
        stops = [(s + (1.0,))[:3] for s in p[-1]]
        offs = np.array([s[0] for s in stops])
        ch = np.array([hexrgb(s[1]) + (s[2] * 255,) for s in stops], dtype=float)
        ys, xs = np.mgrid[0:S, 0:S]
        X, Y = (xs + .5) / k, (ys + .5) / k
        if p[0] == "lin":
            x1, y1 = self._T(p[1], p[2]); x2, y2 = self._T(p[3], p[4])
            dx, dy = x2 - x1, y2 - y1
            u = ((X - x1) * dx + (Y - y1) * dy) / (dx * dx + dy * dy)
        else:
            cx, cy = self._T(p[1], p[2])
            u = np.hypot(X - cx, Y - cy) / (p[3] * self.sc)
        u = np.clip(u, 0, 1)
        out = np.stack([np.interp(u, offs, ch[:, j]) for j in range(4)], axis=-1)
        return Image.fromarray(out.astype(np.uint8), "RGBA")

    def raster(self, size, S=1024):
        k = S / 100
        if self.full_bleed:
            im = self._paint_img(rad(50, 42, 72, [(0, NIGHT2), (1, NIGHT)]), S)
        else:
            im = Image.new("RGBA", (S, S), (0, 0, 0, 0))

        def pts_of(it):
            return [(x * k, y * k) for x, y in (self._T(*p) for p in flatten(it["d"]))]

        def shape_mask(it):
            m = Image.new("L", (S, S), 0)
            dr = ImageDraw.Draw(m)
            if it["circle"]:
                cx, cy = self._T(*it["circle"][:2]); r = it["circle"][2] * self.sc
                dr.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], fill=255)
            else:
                dr.polygon(pts_of(it), fill=255)
            return m

        def over(base, paint, mask, op):
            paint.putalpha(Image.fromarray((np.asarray(paint.getchannel("A"), dtype=float) * np.asarray(mask, dtype=float) / 255 * op).astype(np.uint8)))
            return Image.alpha_composite(base, paint)

        for it in self.items:
            if it["glow"]:
                c, r, o = it["glow"]
                gm = shape_mask(it).filter(ImageFilter.GaussianBlur(r * self.sc * k))
                im = over(im, Image.new("RGBA", (S, S), hexrgb(c) + (255,)), gm, o)
            if it["fill"]:
                im = over(im, self._paint_img(it["fill"], S), shape_mask(it), it["op"])
            if it["stroke"] and it["sw"]:
                sm = Image.new("L", (S, S), 0)
                dr = ImageDraw.Draw(sm)
                w = max(1, int(round(it["sw"] * self.sc * k)))
                if it["circle"]:
                    cx, cy = self._T(*it["circle"][:2]); r = it["circle"][2] * self.sc
                    dr.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], outline=255, width=w)
                else:
                    pts = pts_of(it)
                    dr.line(pts + [pts[0]], fill=255, width=w, joint="curve")
                    for x, y in pts:  # junções arredondadas, como stroke-linejoin=round
                        dr.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
                im = over(im, self._paint_img(it["stroke"], S), sm, it["op"])
        return im.resize((size, size), Image.LANCZOS)


GOLD_V = lin(0, 3, 0, 97, [(0, GOLD_L), (.45, GOLD), (1, GOLD_D)])
ICE_GOLD = lin(0, 19, 0, 88, [(0, ICE_L), (.32, ICE), (.62, GOLD_L), (1, GOLD)])
FLAME_G = lin(0, 50, 0, 86, [(0, EMBER_L), (.45, EMBER), (1, EMBER_D)])


def rich(sc=1.0, full_bleed=False):
    s = Scene(sc, full_bleed)
    s.add(d=SHIELD, glow=("#000000", 2.2, .6))                                               # sombra
    s.add(d=SHIELD, fill=GOLD_V, stroke="#2a1d08", sw=1.2)                                   # moldura de ouro
    s.add(d=SHIELD, stroke=lin(0, 3, 0, 60, [(0, "#ffffff", .6), (1, "#ffffff", 0.0)]), sw=.5)   # brilho no topo da moldura
    s.add(d=SHIELD_IN, fill=rad(50, 40, 52, [(0, "#1a2a44"), (.6, NIGHT2), (1, NIGHT)]), stroke="#2a1d08", sw=.9)
    s.add(d=SHIELD_IN, stroke=lin(0, 9, 0, 90, [(0, GOLD_L, .55), (1, GOLD_D, .15)]), sw=.7)  # fio de luz interno
    s.add(circle=(50, 47, 30), fill=rad(50, 47, 30, [(0, ICE, .38), (1, ICE, 0.0)]))         # névoa gelada
    s.add(circle=(66, 70, 17), fill=rad(66, 70, 17, [(0, EMBER, .55), (1, EMBER, 0.0)]))     # luz da brasa
    for d in CRYSTALS:
        s.add(d=d, fill=lin(0, 24, 0, 88, [(0, ICE_L), (1, ICE_D)]), stroke="#0a1a2c", sw=.5, opacity=.9)
    s.add(d=FLAME, glow=(EMBER, 2.5, .9))
    s.add(d=F_RUNE, glow=(ICE, 2.2, .55))
    s.add(d=FLAME, fill=FLAME_G, stroke="#7a2308", sw=.6)
    s.add(d=FLAME_IN, fill=lin(0, 64, 0, 84, [(0, "#fffbe0"), (1, EMBER_L)]))
    s.add(d=F_RUNE, fill=ICE_GOLD, stroke="#06101c", sw=1.5)
    s.add(d=F_HI, fill="#ffffff", opacity=.5)
    for x, y in RIVETS:
        s.add(circle=(x, y, 1.9), fill=rad(x - .5, y - .6, 2.2, [(0, "#fff6d0"), (.5, GOLD), (1, GOLD_D)]), stroke="#2a1d08", sw=.4)
    return s


def small(sc=1.0, full_bleed=False):
    """16/32 px: poucos detalhes, contraste máximo (borda grossa, F sólido claro, brasa sólida)."""
    s = Scene(sc, full_bleed)
    s.add(d=SHIELD, fill="#e0b650", stroke="#1a1204", sw=2.2)
    s.add(d=SHIELD_IN, fill=NIGHT, stroke="#1a1204", sw=1.2)
    s.add(d=FLAME, fill=EMBER, stroke="#3a1204", sw=1.2)
    s.add(d=F_RUNE, fill=lin(0, 19, 0, 88, [(0, "#ffffff"), (.5, ICE), (1, GOLD_L)]), stroke="#06101c", sw=2.6)
    return s


def main():
    os.makedirs(OUT, exist_ok=True)
    w = lambda n, t: open(os.path.join(OUT, n), "w", encoding="utf8").write(t)
    w("favicon.svg", rich().svg())
    w("favicon-small.svg", small().svg(32))
    sm = small()
    sm.raster(32).save(os.path.join(OUT, "favicon-32.png"))
    sm.raster(256).save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    rich(0.84, True).raster(180).save(os.path.join(OUT, "apple-touch-icon.png"))  # iOS arredonda sozinho: sem cantos transparentes
    rich().raster(192).save(os.path.join(OUT, "icon-192.png"))
    rich().raster(512).save(os.path.join(OUT, "icon-512.png"))
    rich(0.78, True).raster(512).save(os.path.join(OUT, "icon-maskable-512.png"))  # conteúdo dentro da zona segura (80%)
    print("ícones gerados em", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
