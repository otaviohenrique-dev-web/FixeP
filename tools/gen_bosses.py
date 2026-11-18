"""Kits provisorios dos 3 CHEFES (Rei Ossudo, Lobo Alfa, Soberano das Catacumbas), por codigo, a partir dos corpos dos monstros.

Cada quadro do atlas base (assets/placeholder/skeleton|wolf|wraith) recebe cor propria, aura e adornos (coroa e capa, espinhos de gelo, chifres),
posicionados pelo contorno do quadro (funciona em todas as animacoes). Saida: assets/placeholder/bone_king|frost_alpha|crypt_lord (.png + .json).
O jogo os desenha ampliados (kind.scale em packages/shared). A arte final do dev de arte, em assets/monsters/, tem prioridade.
Uso: python tools/gen_bosses.py   (precisa de Pillow; rode antes tools/gen_placeholder_bodies.py / gen_wolf.py / gen_wraith.py se mudar os corpos base)
"""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "assets/placeholder"
F = 64
OL = (10, 8, 16, 255)


def tint(im, rgb, k):
    """mistura as cores opacas com `rgb` (k de 0 a 1) mantendo o contorno escuro e a transparencia"""
    a = im.split()[3]
    solid = Image.new("RGBA", im.size, rgb + (255,))
    mixed = Image.blend(im, solid, k)
    mixed.putalpha(a)
    return mixed


def aura(im, rgb, power):
    sil = im.split()[3].filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))
    g = Image.new("RGBA", im.size, rgb + (0,))
    g.putalpha(sil.point(lambda v: min(255, v * power // 255)))
    return g


def bone_king(im):
    bb = im.getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    cx = (x0 + x1) // 2
    back = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(back)
    top = y0 + (y1 - y0) // 4
    d.polygon([(cx - 9, top), (cx + 9, top), (cx + 13, y1 - 3), (cx + 6, y1), (cx - 6, y1), (cx - 13, y1 - 3)], fill=(150, 20, 28, 255), outline=OL)  # capa carmesim atras
    body = tint(im, (255, 215, 150), 0.18)
    out = Image.alpha_composite(aura(im, (255, 170, 60), 110), back)
    out.alpha_composite(body)
    d = ImageDraw.Draw(out)
    cy = y0 + 1
    d.polygon([(cx - 6, cy), (cx - 6, cy - 5), (cx - 3, cy - 2), (cx, cy - 7), (cx + 3, cy - 2), (cx + 6, cy - 5), (cx + 6, cy)], fill=(238, 190, 60, 255), outline=OL)  # coroa
    d.point((cx, cy - 5), fill=(255, 70, 70, 255))
    return out


def frost_alpha(im):
    bb = im.getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    body = tint(im, (170, 215, 255), 0.35)
    out = aura(im, (110, 190, 255), 170)
    out.alpha_composite(body)
    d = ImageDraw.Draw(out)
    n = 5
    for k in range(n):  # espinhos de gelo ao longo do dorso
        x = x0 + (x1 - x0) * (k + 0.5) / n
        y = y0 + 3 + (abs(k - n / 2 + 0.5) * 1.5)
        d.polygon([(x - 2, y + 2), (x, y - 6 - (k % 2) * 2), (x + 2, y + 2)], fill=(210, 240, 255, 255), outline=OL)
    return out


def crypt_lord(im):
    bb = im.getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    cx = (x0 + x1) // 2
    body = tint(im, (200, 150, 255), 0.3)
    out = aura(im, (170, 90, 255), 230)
    out.alpha_composite(body)
    d = ImageDraw.Draw(out)
    for s in (-1, 1):  # chifres curvos
        d.polygon([(cx + s * 3, y0 + 4), (cx + s * 9, y0 - 1), (cx + s * 11, y0 - 8), (cx + s * 7, y0 - 3), (cx + s * 2, y0 + 1)], fill=(230, 220, 250, 255), outline=OL)
    d.polygon([(cx - 2, y0 + 8), (cx + 2, y0 + 8), (cx, y0 + 12)], fill=(255, 90, 255, 255))  # gema na testa
    for k in range(4):  # chamas arcanas nos ombros
        x = x0 + (x1 - x0) * (k + 0.5) / 4
        d.polygon([(x - 2, y0 + 10 + k % 2 * 3), (x, y0 + 2 + k % 2 * 3), (x + 2, y0 + 10 + k % 2 * 3)], fill=(190, 110, 255, 200))
    return out


KITS = {"bone_king": ("skeleton", bone_king), "frost_alpha": ("wolf", frost_alpha), "crypt_lord": ("wraith", crypt_lord)}


def main():
    for name, (base, fn) in KITS.items():
        sheet = Image.open(DIR / f"{base}.png").convert("RGBA")
        meta = json.load(open(DIR / f"{base}.json", encoding="utf-8"))
        out = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
        for fr in meta["frames"]:
            r = fr["frame"]
            box = (r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])
            out.paste(fn(sheet.crop(box)), box[:2])
        out.save(DIR / f"{name}.png", optimize=True)
        meta["meta"]["image"] = f"{name}.png"
        for fr in meta["frames"]:
            fr["filename"] = fr["filename"].replace(base, name)
        json.dump(meta, open(DIR / f"{name}.json", "w", encoding="utf-8"), ensure_ascii=False)
        print(f"{name}: {len(meta['frames'])} quadros (base {base})")


if __name__ == "__main__":
    main()
