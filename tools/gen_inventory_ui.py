"""Deriva as peças do painel de Inventário da ARTE OFICIAL (assets/source/mochila_oficial.jpg, 896x1200).
Nada é redesenhado: tudo é recorte da própria imagem, reduzido 3x (a arte original é pixel art ampliada ~3x),
com fundo removido onde a peça sobrepõe a cena.

Uso:  python tools/gen_inventory_ui.py      (pip install pillow numpy)
Saída em packages/client/public/ui/ (fora do Git LFS de propósito: o Render pode não baixar LFS):
  inv_frame.png    moldura de ferro (fonte do border-image, 3x3, canto 8px)
  inv_parch.png    textura de pergaminho (ladrilho espelhado 2x2, sem emenda)
  inv_slot_c.png   o mesmo com o miolo vazado (coluna do meio)
  inv_slot.png     moldura de espaço de equipamento/mochila (9-slice, borda 5px)
  inv_medal.png    medalhão com espinhos, com o miolo vazado (o retrato do jogador entra por baixo)
  inv_chain_tr.png / inv_chain_bl.png   correntes dos cantos superior direito e inferior esquerdo
  inv_x.png        botão X vermelho
  inv_title.png    título "Inventário" (tinta sobre alfa)
  inv_sil_body.png silhueta escura com olhos roxos · inv_sil_smoke.png fumaça roxa (animada por CSS)
  inv_meta.json    posições (coordenadas da referência) usadas pelo cliente"""
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "assets", "source", "mochila_oficial.jpg")
OUT = os.path.join(HERE, "..", "packages", "client", "public", "ui")
os.makedirs(OUT, exist_ok=True)
ref = Image.open(SRC).convert("RGB")
K = 3  # fator de redução


def crop(box, rgba=False):
    """Recorta em coordenadas da referência e reduz K vezes (média de caixa)."""
    c = ref.crop(box)
    c = c.resize((c.width // K, c.height // K), Image.BOX)
    return c.convert("RGBA")


def save(im, name):
    im.save(os.path.join(OUT, name), optimize=True)


def flood_transparent(im, dark_lum=50, seeds=None):
    """Torna transparente o fundo escuro conectado às bordas (cena do jogo atrás do painel)."""
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    lum = a.mean(axis=2)
    mask = Image.fromarray(((lum < dark_lum) * 255).astype(np.uint8)).copy()
    W, H = mask.size
    for x in range(W):
        for y in (0, H - 1):
            if mask.getpixel((x, y)) == 255: ImageDraw.floodfill(mask, (x, y), 128)
    for y in range(H):
        for x in (0, W - 1):
            if mask.getpixel((x, y)) == 255: ImageDraw.floodfill(mask, (x, y), 128)
    bg = np.asarray(mask) == 128
    out = np.asarray(im).copy()
    out[bg, 3] = 0
    return Image.fromarray(out, "RGBA")


# ---------- espaço (slot): moldura de ferro com miolo de pergaminho ----------
slot = crop((165, 255, 330, 450))
save(slot, "inv_slot.png")
sc = np.asarray(slot).copy()
sc[5:-5, 5:-5, 3] = 0                          # versão de miolo vazado: a silhueta aparece por trás dos espaços do centro
save(Image.fromarray(sc, "RGBA"), "inv_slot_c.png")

# ---------- pergaminho: região limpa, espelhada 2x2 para não aparecer emenda ----------
p = crop((201, 933, 360, 1098))
pa = np.asarray(p.convert("RGB")).astype(np.float32)
low = np.asarray(p.convert("RGB").filter(ImageFilter.GaussianBlur(9))).astype(np.float32)
tile = np.clip(pa.reshape(-1, 3).mean(axis=0) + (pa - low) * 0.55, 0, 255).astype(np.uint8)   # só o grão: sem manchas nem emenda
t = Image.fromarray(tile, "RGB").convert("RGBA")
save(t, "inv_parch.png")

# ---------- moldura: cantos do canto inferior direito (sem corrente), bordas das tiras limpas ----------
FT = 8  # espessura em px nativos
left = crop((63, 480, 63 + FT * K, 600))      # tira da borda esquerda
top = crop((300, 54, 600, 54 + FT * K))       # tira da borda superior
right = left.transpose(Image.FLIP_LEFT_RIGHT)
bottom = top.transpose(Image.FLIP_TOP_BOTTOM)
corner = crop((819, 1137, 819 + FT * K, 1137 + FT * K))  # canto inferior direito
S = FT * 2 + 8
fr = Image.new("RGBA", (S, S), (0, 0, 0, 0))
fr.paste(corner.transpose(Image.ROTATE_180), (0, 0))
fr.paste(corner.transpose(Image.FLIP_TOP_BOTTOM), (S - FT, 0))
fr.paste(corner.transpose(Image.FLIP_LEFT_RIGHT), (0, S - FT))
fr.paste(corner, (S - FT, S - FT))
fr.paste(top.crop((0, 0, 8, FT)).resize((S - 2 * FT, FT), Image.NEAREST), (FT, 0))
fr.paste(bottom.crop((0, 0, 8, FT)).resize((S - 2 * FT, FT), Image.NEAREST), (FT, S - FT))
fr.paste(left.crop((0, 0, FT, 8)).resize((FT, S - 2 * FT), Image.NEAREST), (0, FT))
fr.paste(right.crop((0, 0, FT, 8)).resize((FT, S - 2 * FT), Image.NEAREST), (S - FT, FT))
save(fr, "inv_frame.png")

# ---------- peças de metal (medalhão, correntes, botão X): máscara por cor, sem fundo nem pergaminho ----------
def metal_mask(box, lum_lo=50, lum_hi=175, limit=None):
    """Cinza/ferro (pouca saturação) + contorno escuro colado nele; descarta pergaminho amarelo e a cena escura."""
    c = np.asarray(ref.crop(box)).astype(np.float32)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    lum = c.mean(axis=2)
    sat = c.max(axis=2) - c.min(axis=2)
    parch = (r - b > 30) & (lum > 85)
    m = (sat < 26) & (lum > lum_lo) & (lum < lum_hi) & ~parch
    if limit is not None: m &= limit
    mi = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
    near = np.asarray(mi.filter(ImageFilter.MaxFilter(7))) > 0     # contorno escuro até 3 px do metal
    dk = (lum <= lum_lo) & near & ~parch
    return (np.asarray(mi) > 0) | dk


def piece(box, mask, name):
    c = ref.crop(box).convert("RGBA")
    arr = np.asarray(c).copy()
    arr[..., 3] = mask * 255
    im = Image.fromarray(arr, "RGBA")
    im = im.resize((im.width // K, im.height // K), Image.BOX)
    q = np.asarray(im).copy()
    q[..., 3] = np.where(q[..., 3] > 120, 255, 0)
    save(Image.fromarray(q, "RGBA"), name)
    return im


mx0, my0, mx1, my1 = 39, 0, 243, 258
yy, xx = np.mgrid[my0:my1, mx0:mx1]
cx, cy, hrx, hry = 145, 121, 70, 84
outer = ((xx - cx) / 108.0) ** 2 + ((yy - cy) / 120.0) ** 2 < 1                # inclui espinhos, exclui a corrente
hole = ((xx - cx) / hrx) ** 2 + ((yy - cy) / hry) ** 2 < 1
mm = metal_mask((mx0, my0, mx1, my1), 40, 175, outer) & ~hole
piece((mx0, my0, mx1, my1), mm, "inv_medal.png")

def tube(box, lines, parch_cut=True):
    """Máscara de uma corrente: o "tubo" ao redor de uma polilinha, sem os pixels de pergaminho."""
    w, h = box[2] - box[0], box[3] - box[1]
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    for pts, width in lines:
        pts = [(x - box[0], y - box[1]) for x, y in pts]
        d.line(pts, fill=255, width=width, joint="curve")
        for x, y in pts: d.ellipse([x - width / 2, y - width / 2, x + width / 2, y + width / 2], fill=255)
    c = np.asarray(ref.crop(box)).astype(np.float32)
    parch = (c[..., 0] - c[..., 2] > 30) & (c.mean(axis=2) > 85)
    return (np.asarray(m) > 0) & ~parch


tr_box = (693, 18, 897, 444)
mtr = tube(tr_box, [([(692, 36), (712, 70), (740, 120), (775, 160), (808, 183), (835, 198), (858, 206)], 40),
                    ([(858, 130), (864, 200), (860, 300), (858, 432)], 30)])
piece(tr_box, mtr, "inv_chain_tr.png")
bl_box = (39, 987, 243, 1200)
mbl = tube(bl_box, [([(58, 987), (60, 1000), (66, 1040), (95, 1075), (125, 1100), (160, 1125), (190, 1150), (212, 1172)], 38)])
piece(bl_box, mbl, "inv_chain_bl.png")

# botão X: retângulo arredondado
xb = (789, 30, 870, 126)
yy, xx = np.mgrid[xb[1]:xb[3], xb[0]:xb[2]]
rr = 12
inx = (xx >= 792) & (xx < 868) & (yy >= 34) & (yy < 122)
cxm = np.clip(xx, 792 + rr, 868 - rr - 1); cym = np.clip(yy, 34 + rr, 122 - rr - 1)
inx &= ((xx - cxm) ** 2 + (yy - cym) ** 2) <= rr * rr
piece(xb, inx, "inv_x.png")

# ---------- título ----------
tt = np.asarray(ref.crop((243, 102, 558, 183)).convert("RGB")).astype(np.float32)
lum = tt.mean(axis=2)
alpha = np.clip((150 - lum) / 90, 0, 1)
ink = np.dstack([np.full_like(lum, 38), np.full_like(lum, 22), np.full_like(lum, 14), alpha * 255]).astype(np.uint8)
ti = Image.fromarray(ink, "RGBA")
ti = ti.resize((ti.width // K, ti.height // K), Image.BOX)
save(ti, "inv_title.png")

# ---------- silhueta: corpo escuro + olhos, e fumaça roxa separada ----------
bx0, by0, bx1, by1 = 240, 258, 702, 861
reg = np.asarray(ref.crop((bx0, by0, bx1, by1))).astype(np.float32)
R, G, B = reg[..., 0], reg[..., 1], reg[..., 2]
lum = reg.mean(axis=2)
dark = Image.fromarray(((lum < 31) * 255).astype(np.uint8)).copy()
op = dark.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))   # tira as linhas finas das molduras
seed = (460 - bx0, 520 - by0)
ImageDraw.floodfill(op, seed, 128)
body = np.asarray(op) == 128
body = np.asarray(Image.fromarray((body * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
body &= (lum < 42)
body_img = np.zeros(reg.shape[:2] + (4,), np.uint8)
body_img[..., :3] = (18, 13, 22)
body_img[..., 3] = body * 255
# olhos: pixels claros/violeta dentro da cabeça
eyes = np.zeros_like(body)
ey0, ey1, ex0, ex1 = 310 - by0, 360 - by0, 420 - bx0, 495 - bx0
sub = (R[ey0:ey1, ex0:ex1] + B[ey0:ey1, ex0:ex1]) / 2 > 120
eyes[ey0:ey1, ex0:ex1] = sub
body_img[eyes] = np.concatenate([np.clip(reg[eyes], 0, 255), np.full((eyes.sum(), 1), 255)], axis=1).astype(np.uint8)
bi = Image.fromarray(body_img, "RGBA")
bi = bi.resize((bi.width // K, bi.height // K), Image.BOX)
bi_a = np.asarray(bi).copy()
bi_a[..., 3] = np.where(bi_a[..., 3] > 110, 255, 0)
save(Image.fromarray(bi_a, "RGBA"), "inv_sil_body.png")
# fumaça: tom roxo (r e b acima de g) fora do corpo; alfa pelo escurecimento contra o pergaminho
purple = ((B - G) > 6) & ((R - G) > 6)
sm = np.clip((150 - R) / 110.0, 0, 1) * purple * (~body)
sm_img = np.zeros(reg.shape[:2] + (4,), np.uint8)
sm_img[..., 0], sm_img[..., 1], sm_img[..., 2] = 52, 24, 66
sm_img[..., 3] = (np.clip(sm * 1.35, 0, 1) * 255).astype(np.uint8)
si = Image.fromarray(sm_img, "RGBA")
si = si.resize((si.width // K, si.height // K), Image.BOX)
save(si, "inv_sil_smoke.png")

meta = {
    "K": K, "frameThick": FT, "slotSlice": 5,
    "doll": {"x": 165, "y": 230, "w": 590, "h": 685},         # caixa dos espaços (coordenadas da referência)
    "sil": {"x": bx0, "y": by0, "w": bx1 - bx0, "h": by1 - by0},
    "slotSize": {"w": 165, "h": 200},
    "medal": {"x": mx0, "y": my0, "w": 204, "h": 258, "hole": {"cx": 145, "cy": 121, "rx": 70, "ry": 84}},
    "card": {"x": 62, "y": 54, "w": 780, "h": 1108},
}
json.dump(meta, open(os.path.join(OUT, "inv_meta.json"), "w"), indent=1)
print("peças geradas em", os.path.abspath(OUT))
