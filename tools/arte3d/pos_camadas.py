"""Pós-processo das camadas do personagem (paper-doll): 512 -> 128 px com a MESMA escala e o MESMO deslocamento para
todas as camadas e frames (pés em (64,104)), paleta própria de cada camada (somadas <= 32 cores), contorno de 1 px nas
camadas de base, camada de acento em branco (o jogo pinta com a cor da raridade). Gera folhas + JSON por camada e
prévias compostas (sem equipamento / comum / épico).
Uso: python pos_camadas.py <render> <saida>"""
import sys, os, json
from PIL import Image, ImageFilter, ImageChops
R, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CAMADAS = {"corpo": 12, "couraca": 9, "espada": 5}   # cores por camada (12 + 9 + 5 + contorno + acento <= 32)
ACENTOS = ["couraca_acento", "espada_acento"]
CONTORNO = (16, 13, 18, 255)
anims_dirs = sorted({f.rsplit("_", 1)[0] for f in os.listdir(os.path.join(R, "corpo")) if f.endswith(".png")})  # ex.: idle_se

# escala e deslocamento fixos, medidos no corpo parado (idle) SE: personagem com ~96 px de altura, pés em y=104
ref = Image.open(os.path.join(R, "corpo", "idle_se_01.png")).getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
ESC = 96 / (ref[3] - ref[1])
OX = 64 - (ref[0] + ref[2]) / 2 * ESC
OY = 104 - ref[3] * ESC

def reduzir(img):
    w = round(img.width * ESC)
    p = img.resize((w, w), Image.BOX)
    q = Image.new("RGBA", (128, 128), (0, 0, 0, 0)); q.alpha_composite(p, (round(OX), round(OY)))
    q.putalpha(q.getchannel("A").point(lambda v: 255 if v >= 110 else 0))
    return q

def paleta(frames, n):
    vis = [c[:3] for f in frames for c in f.get_flattened_data() if c[3]]
    if not vis: return None
    a = Image.new("RGB", (len(vis), 1)); a.putdata(vis)
    return a.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)

def contorno(f):
    a = f.getchannel("A"); borda = a.filter(ImageFilter.MaxFilter(3))
    o = Image.new("RGBA", f.size, (0, 0, 0, 0)); o.paste(Image.new("RGBA", f.size, CONTORNO), mask=borda); o.alpha_composite(f)
    return o

saida = {}  # camada -> {anim_dir: [frames]}
for cam, ncores in CAMADAS.items():
    todos = {ad: [reduzir(Image.open(os.path.join(R, cam, f)).convert("RGBA")) for f in sorted(os.listdir(os.path.join(R, cam))) if f.startswith(ad + "_")] for ad in anims_dirs}
    pal = paleta([f for fs in todos.values() for f in fs], ncores)
    saida[cam] = {}
    for ad, fs in todos.items():
        res = []
        for f in fs:
            a = f.getchannel("A")
            rgb = Image.new("RGB", f.size); rgb.paste(f.convert("RGB"), mask=a)
            q = rgb.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA") if pal else f; q.putalpha(a)
            res.append(contorno(q))
        saida[cam][ad] = res
for cam in ACENTOS:  # branco puro onde há acento (o jogo multiplica pela cor da raridade)
    saida[cam] = {}
    for ad in anims_dirs:
        res = []
        for f in sorted(os.listdir(os.path.join(R, cam))):
            if not f.startswith(ad + "_"): continue
            q = reduzir(Image.open(os.path.join(R, cam, f)).convert("RGBA"))
            lum = q.convert("L").point(lambda v: 255 if v > 60 else 0)
            m = ImageChops.multiply(q.getchannel("A"), lum)
            w = Image.new("RGBA", q.size, (255, 255, 255, 0)); w.putalpha(m); res.append(w)
        saida[cam][ad] = res

# folhas + JSON por camada (todas as animações e direções numa folha só, uma tag por animação_direção)
for cam, porad in saida.items():
    lista = [(ad, i, f) for ad in anims_dirs for i, f in enumerate(porad[ad])]
    cols = min(len(lista), 16); linhas = (len(lista) + cols - 1) // cols
    sheet = Image.new("RGBA", (128 * cols, 128 * linhas), (0, 0, 0, 0)); frames = []; tags = []
    for k, (ad, i, f) in enumerate(lista):
        x, y = (k % cols) * 128, (k // cols) * 128; sheet.paste(f, (x, y))
        frames.append({"filename": f"{cam} {ad} {i}", "frame": {"x": x, "y": y, "w": 128, "h": 128}, "rotated": False, "trimmed": False,
                       "spriteSourceSize": {"x": 0, "y": 0, "w": 128, "h": 128}, "sourceSize": {"w": 128, "h": 128},
                       "duration": 120 if ad.startswith("walk") else 240})
        if i == 0: tags.append({"name": ad, "from": k, "to": k + len(porad[ad]) - 1, "direction": "forward"})
    sheet.save(os.path.join(OUT, f"{cam}.png"))
    json.dump({"frames": frames, "meta": {"app": "FrixeP pos_camadas.py (json-array do Aseprite)", "image": f"{cam}.png", "size": {"w": sheet.width, "h": sheet.height}, "scale": "1", "frameTags": tags}},
              open(os.path.join(OUT, f"{cam}.json"), "w"), indent=1)

# prévias compostas: sem equipamento / comum / épico (acento tingido com a cor da raridade; épico+ ganha brilho)
RARIDADE = {"comum": (242, 242, 242), "epico": (168, 85, 247)}
def tingir(acento, cor, brilho=False):
    t = Image.new("RGBA", acento.size, (*cor, 255)); t.putalpha(acento.getchannel("A"))
    if brilho:
        g = acento.getchannel("A").filter(ImageFilter.GaussianBlur(1.6)).point(lambda v: min(255, v * 2))
        halo = Image.new("RGBA", acento.size, (*cor, 0)); halo.putalpha(g.point(lambda v: v // 2))
        halo.alpha_composite(t); t = halo
    return t
FUNDO = (64, 60, 54, 255)   # chão escuro do jogo
def compor(ad, i, estado):
    b = Image.new("RGBA", (128, 128), FUNDO); b.alpha_composite(saida["corpo"][ad][i])
    if estado == "sem": return b
    cor = RARIDADE[estado]
    for peca in ("couraca", "espada"):
        b.alpha_composite(saida[peca][ad][i])
        base = saida[peca][ad][i]
        tint = tingir(saida[peca + "_acento"][ad][i], cor, brilho=estado == "epico")
        # o acento pinta por cima do metal (multiplica o branco pela cor)
        b.alpha_composite(tint)
    return b
k = 3
for ad in anims_dirs:
    n = len(saida["corpo"][ad])
    fila = Image.new("RGBA", (128 * k * n, 128 * k * 3), FUNDO)
    gifs = {e: [] for e in ("sem", "comum", "epico")}
    for j, e in enumerate(("sem", "comum", "epico")):
        for i in range(n):
            c = compor(ad, i, e)
            fila.paste(c.resize((128 * k, 128 * k), Image.NEAREST), (i * 128 * k, j * 128 * k))
            gifs[e].append(c.resize((128 * k, 128 * k), Image.NEAREST))
    fila.save(os.path.join(OUT, f"previa_{ad}.png"))
    # GIF lado a lado: sem equipamento | comum | épico
    quadros = []
    for i in range(n):
        q = Image.new("RGBA", (128 * k * 3, 128 * k), FUNDO)
        for j, e in enumerate(("sem", "comum", "epico")): q.paste(gifs[e][i], (j * 128 * k, 0))
        quadros.append(q.convert("P", palette=Image.ADAPTIVE))
    quadros[0].save(os.path.join(OUT, f"previa_{ad}.gif"), save_all=True, append_images=quadros[1:], duration=120 if ad.startswith("walk") else 240, loop=0, disposal=2)
cores = len({c[:3] for cam in CAMADAS for fs in saida[cam].values() for f in fs for c in f.get_flattened_data() if c[3]})
print("ok; cores nas camadas de base (com contorno):", cores, "; animações:", anims_dirs)
