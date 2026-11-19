"""Gera o emblema do FrixeP (F gótico-espada num medalhão escuro com contorno dourado) em todos os tamanhos.
Uso:  python tools/gen_icons.py      (precisa de Pillow: pip install pillow)
Saída em packages/client/public/: favicon.svg, favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png,
icon-512.png, icon-maskable-512.png. Tudo é desenhado a partir da mesma geometria (coordenadas 0..100)."""
import math, os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "packages", "client", "public")
GOLD, GOLD_D, NIGHT, NIGHT2, ICE, EMBER = "#d9b25a", "#7a5a22", "#05080d", "#0d1420", "#8fd3ff", "#ff9a3d"

# O "F": haste = lâmina de espada apontando para baixo; braços = guarda e lâmina curva com ponta afiada.
STEM = [(38, 22), (50, 17), (62, 22), (62, 70), (50, 84), (38, 70)]                   # lâmina (ponta embaixo)
TOP = [(38, 22), (50, 17), (78, 17), (84, 26), (62, 26), (62, 34), (38, 34)]          # braço superior com ponta
MID = [(62, 44), (76, 44), (80, 51), (62, 51)]                                         # braço do meio
GUARD = [(30, 38), (70, 38), (66, 43), (34, 43)]                                       # guarda cruzada
FLAME = [(50, 2.5), (55, 10), (53, 13), (50, 9.5), (47, 13), (45, 10)]                 # chama acima
SHIELD = [(50, 4), (88, 14), (88, 52), (50, 96), (12, 52), (12, 14)]                   # só no SVG (opcional)


def poly(pts):
    return " ".join(f"{x},{y}" for x, y in pts)


def svg(maskable=False):
    s = 0.8 if maskable else 1.0  # maskable: emblema menor, dentro da zona segura (círculo de 80%)
    t = f' transform="translate(50 50) scale({s}) translate(-50 -50)"' if maskable else ""
    bg = ('<rect width="100" height="100" fill="url(#bg)"/>' if maskable else
          '<circle cx="50" cy="50" r="48" fill="url(#bg)" stroke="url(#gd)" stroke-width="3"/>'
          '<circle cx="50" cy="50" r="43" fill="none" stroke="#d9b25a" stroke-opacity=".35" stroke-width=".8"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">
<defs>
<radialGradient id="bg" cx=".5" cy=".42" r=".7"><stop offset="0" stop-color="{NIGHT2}"/><stop offset="1" stop-color="{NIGHT}"/></radialGradient>
<linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d98c"/><stop offset=".5" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_D}"/></linearGradient>
<radialGradient id="gl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="{ICE}" stop-opacity=".55"/><stop offset="1" stop-color="{ICE}" stop-opacity="0"/></radialGradient>
<linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd48a"/><stop offset="1" stop-color="{EMBER}"/></linearGradient>
</defs>
{bg}
<g{t}>
<circle cx="50" cy="48" r="34" fill="url(#gl)"/>
<g fill="url(#gd)" stroke="#2a1d08" stroke-width="1.2" stroke-linejoin="round">
<polygon points="{poly(STEM)}"/><polygon points="{poly(TOP)}"/><polygon points="{poly(MID)}"/><polygon points="{poly(GUARD)}"/></g>
<path d="M50 20 L50 78" stroke="#fff3cf" stroke-opacity=".55" stroke-width="1.2"/>
<polygon points="{poly(FLAME)}" fill="url(#fl)" stroke="#8a3d08" stroke-width=".8" stroke-linejoin="round"/>
</g></svg>'''


def render(size, maskable=False):
    S = 1024
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    k = S / 100
    d = ImageDraw.Draw(im)

    def P(pts, sc=1.0):
        return [(((x - 50) * sc + 50) * k, ((y - 50) * sc + 50) * k) for x, y in pts]

    # fundo: degradê radial noturno
    bg = Image.new("RGBA", (S, S), NIGHT)
    px = bg.load()
    c1, c2 = (13, 20, 32), (5, 8, 13)
    for y in range(S):
        for x in range(S):
            r = min(1, math.hypot(x - S * .5, y - S * .42) / (S * .7))
            px[x, y] = (int(c1[0] + (c2[0] - c1[0]) * r), int(c1[1] + (c2[1] - c1[1]) * r), int(c1[2] + (c2[2] - c1[2]) * r), 255)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    if maskable:
        md.rectangle([0, 0, S, S], fill=255)
    else:
        md.ellipse([2 * k, 2 * k, 98 * k, 98 * k], fill=255)
    im.paste(bg, (0, 0), mask)
    if not maskable:
        d.ellipse([2 * k, 2 * k, 98 * k, 98 * k], outline=GOLD, width=int(3.2 * k))
        d.ellipse([7 * k, 7 * k, 93 * k, 93 * k], outline=(217, 178, 90, 90), width=int(.9 * k))
    sc = 0.8 if maskable else 1.0
    # brilho azul-gelo atrás do emblema
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([(50 - 30 * sc) * k, (48 - 30 * sc) * k, (50 + 30 * sc) * k, (48 + 30 * sc) * k], fill=(143, 211, 255, 120))
    im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(S * .07)))
    d = ImageDraw.Draw(im)
    for pts in (STEM, TOP, MID, GUARD):
        d.polygon(P(pts, sc), fill=GOLD, outline="#2a1d08", width=int(1.2 * k))
        # luz na metade esquerda (dá volume)
    d.line(P([(50, 20), (50, 78)], sc), fill=(255, 243, 207, 150), width=int(1.4 * k))
    d.polygon(P(FLAME, sc), fill=EMBER, outline="#8a3d08", width=int(.8 * k))
    d.polygon(P([(50, 5), (52, 11), (50, 10), (48, 11)], sc), fill="#ffd48a")
    return im.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "favicon.svg"), "w", encoding="utf8").write(svg())
    render(32).save(os.path.join(OUT, "favicon-32.png"))
    render(180, maskable=True).save(os.path.join(OUT, "apple-touch-icon.png"))  # iOS arredonda sozinho: sem cantos transparentes
    render(192).save(os.path.join(OUT, "icon-192.png"))
    render(512).save(os.path.join(OUT, "icon-512.png"))
    render(512, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"))
    render(256).save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    print("ícones gerados em", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
