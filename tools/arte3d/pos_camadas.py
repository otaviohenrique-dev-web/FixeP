"""Pós-processo do paper-doll: 512 -> 128 px com a MESMA escala e deslocamento para todas as camadas e frames
(pés em (64,104)), paletas (corpo+cabelo / todo o equipamento) somando <= 32 cores, contorno de 1 px, camadas de acento
em branco (o jogo pinta com a cor da raridade), folhas + JSON por camada, ordem de desenho por direção (ordem.json) e
prévias de jogo: sem equipamento, cada peça vestida sozinha e o conjunto completo.
Uso: python pos_camadas.py <render> <saida> [cor_acento_hex]   (padrão: laranja #ff9a4d das referências)"""
import sys, os, json
from PIL import Image, ImageFilter, ImageChops
R, OUT = sys.argv[1], sys.argv[2]
COR_ACENTO = tuple(int((sys.argv[3] if len(sys.argv) > 3 else "ff9a4d")[i:i + 2], 16) for i in (0, 2, 4))
os.makedirs(OUT, exist_ok=True)
PECAS = [p for p in ("botas", "couraca", "capa", "elmo", "espada", "escudo") if os.path.isdir(os.path.join(R, p))]
BASE = ["corpo", "cabelo"] + PECAS
PALETAS = {"pele": (["corpo", "cabelo"], 14), "equip": (PECAS, 15)}   # 14 + 15 + contorno + acento = 31
CONTORNO = (16, 13, 18, 255)
# ordem de desenho (de trás para a frente) por direção; o acento de cada peça vai logo depois dela
ORDEM = {
    "se": ["capa", "escudo", "corpo", "cabelo", "botas", "couraca", "elmo", "espada"],
    "ne": ["escudo", "corpo", "cabelo", "botas", "couraca", "elmo", "capa", "espada"],
}
anims_dirs = sorted({f.rsplit("_", 1)[0] for f in os.listdir(os.path.join(R, "corpo")) if f.endswith(".png")})

ref = Image.open(os.path.join(R, "corpo", "idle_se_01.png")).getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
ESC = 88 / (ref[3] - ref[1])          # corpo com ~88 px: sobra espaço em cima para elmo/crista e ataques
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
    return a.quantize(colors=n, method=Image.Quantize.FASTOCTREE, kmeans=3, dither=Image.Dither.NONE)

def contorno(f):
    a = f.getchannel("A"); borda = a.filter(ImageFilter.MaxFilter(3))
    o = Image.new("RGBA", f.size, (0, 0, 0, 0)); o.paste(Image.new("RGBA", f.size, CONTORNO), mask=borda); o.alpha_composite(f)
    return o

def carregar(cam):
    return {ad: [reduzir(Image.open(os.path.join(R, cam, f)).convert("RGBA")) for f in sorted(os.listdir(os.path.join(R, cam))) if f.startswith(ad + "_")] for ad in anims_dirs}

saida = {}
for nome, (cams, n) in PALETAS.items():
    cru = {c: carregar(c) for c in cams if os.path.isdir(os.path.join(R, c))}
    pal = paleta([f for fs in cru.values() for lst in fs.values() for f in lst], n)
    for c, porad in cru.items():
        saida[c] = {}
        for ad, fs in porad.items():
            res = []
            for f in fs:
                a = f.getchannel("A"); rgb = Image.new("RGB", f.size); rgb.paste(f.convert("RGB"), mask=a)
                q = rgb.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA") if pal else f; q.putalpha(a)
                res.append(contorno(q))
            saida[c][ad] = res
for p in PECAS:  # acento: branco onde há acento
    cam = p + "_acento"; saida[cam] = {}
    for ad in anims_dirs:
        res = []
        for f in sorted(os.listdir(os.path.join(R, cam))):
            if not f.startswith(ad + "_"): continue
            q = reduzir(Image.open(os.path.join(R, cam, f)).convert("RGBA"))
            m = ImageChops.multiply(q.getchannel("A"), q.convert("L").point(lambda v: 255 if v > 60 else 0))
            w = Image.new("RGBA", q.size, (255, 255, 255, 0)); w.putalpha(m); res.append(w)
        saida[cam][ad] = res

# folhas + JSON por camada
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
json.dump({"ordem_por_direcao": ORDEM, "espelho": {"sw": "se", "nw": "ne"},
           "regra": "desenhar de trás para a frente; o acento de cada peça vai logo depois dela, tingido com a cor da raridade; com elmo, não desenhar 'cabelo'"},
          open(os.path.join(OUT, "ordem.json"), "w"), indent=1, ensure_ascii=False)

# prévias de jogo
FUNDO = (64, 60, 54, 255)
def tingir(acento, cor):
    t = Image.new("RGBA", acento.size, (*cor, 255)); t.putalpha(acento.getchannel("A")); return t
def compor(ad, i, vestido):
    d = ad.rsplit("_", 1)[1]; ordem = ORDEM.get(d, ORDEM["se"])
    b = Image.new("RGBA", (128, 128), FUNDO)
    for cam in ordem:
        if cam == "cabelo" and "elmo" in vestido: continue
        if cam in PECAS and cam not in vestido: continue
        b.alpha_composite(saida[cam][ad][i])
        if cam in PECAS: b.alpha_composite(tingir(saida[cam + "_acento"][ad][i], COR_ACENTO))
    return b
ESTADOS = [("sem", [])] + [(p, [p]) for p in PECAS] + [("completo", PECAS)]
k = 3
for ad in anims_dirs:
    n = len(saida["corpo"][ad])
    fila = Image.new("RGBA", (128 * k * n, 128 * k * len(ESTADOS)), FUNDO)
    quadros = []
    for i in range(n):
        q = Image.new("RGBA", (128 * 2 * len(ESTADOS), 128 * 2), FUNDO)
        for j, (nome, vest) in enumerate(ESTADOS):
            c = compor(ad, i, vest)
            fila.paste(c.resize((128 * k, 128 * k), Image.NEAREST), (i * 128 * k, j * 128 * k))
            q.paste(c.resize((256, 256), Image.NEAREST), (j * 256, 0))
        quadros.append(q.convert("P", palette=Image.ADAPTIVE))
    fila.save(os.path.join(OUT, f"previa_{ad}.png"))
    quadros[0].save(os.path.join(OUT, f"previa_{ad}.gif"), save_all=True, append_images=quadros[1:], duration=120 if ad.startswith("walk") else 240, loop=0, disposal=2)
cores = len({c[:3] for cam in BASE if cam in saida for fs in saida[cam].values() for f in fs for c in f.get_flattened_data() if c[3]})
print("ok; cores (com contorno):", cores, "+ acento; estados:", [e for e, _ in ESTADOS], "; animações:", anims_dirs)
