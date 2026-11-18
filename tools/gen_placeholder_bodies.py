"""
Gera os CORPOS PROVISÓRIOS dos personagens (Guerreiro, Arqueiro, Clérigo) e do Esqueleto.

São bonecos procedurais com silhueta própria por classe, no MESMO formato que o Aseprite exporta (PNG + JSON json-array com tags),
para o jogo já ter corpos enquanto a arte final não chega. NÃO são a arte do jogo: a arte real, salva em assets/characters/ e
assets/monsters/, tem prioridade e os substitui automaticamente. Obra própria (gerada por código), sem direitos de terceiros.

Saída: assets/placeholder/  (commitada; PNG pequenos, fora do Git LFS de propósito)
Uso:   python tools/gen_placeholder_bodies.py        (precisa de Python e Pillow)
"""
import json
import math
import os

from PIL import Image, ImageDraw

from gen_heroes import HEROES, draw_hero

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "placeholder")
os.makedirs(OUT, exist_ok=True)

F = 64
CX, FEET = 32, 52  # ponto dos pés (pivô do guia)
DIRS = ["se", "ne"]  # 4 diagonais: o jogo espelha SW e NW

CHAR_ANIMS = [("idle", 4, 167), ("walk", 6, 100), ("attack", 5, 83), ("skill", 5, 83), ("dodge", 3, 83), ("hit", 2, 83), ("death", 5, 125)]
SKEL_ANIMS = [("idle", 4, 167), ("walk", 6, 125), ("windup", 4, 167), ("attack", 4, 83), ("hit", 2, 83), ("death", 6, 100)]

OL = (2, 5, 11, 255)  # contorno escuro (cor da paleta: noite profunda)
SKIN = (224, 176, 128, 255)
GOLD = (255, 208, 138, 255)
STEEL = (122, 138, 160, 255)
STEEL_L = (191, 227, 255, 255)
WOOD = (107, 74, 46, 255)
BONE = (216, 210, 192, 255)
BONE_D = (90, 84, 72, 255)


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (255,)


class Pose:
    """Parâmetros de uma pose (todos os números em pixels / radianos)."""
    def __init__(self):
        self.bob = 0.0      # corpo sobe/desce
        self.lean = 0.0     # corpo inclina para a frente (x)
        self.step = 0.0     # passada das pernas
        self.arm = 0.35     # ângulo do braço/arma da frente
        self.off = 0.1      # ângulo do braço de trás
        self.glow = 0       # brilho do cajado/habilidade
        self.white = 0.0    # clarão branco (dano)
        self.fall = 0.0     # 0..90 graus (morte)
        self.sink = 0.0
        self.crouch = 0.0


def pose_for(anim, i, n):
    t = i / n
    p = Pose()
    if anim == "idle":
        p.bob = math.sin(2 * math.pi * t) * 1.0
        p.arm = 0.35 + math.sin(2 * math.pi * t) * 0.05
    elif anim == "walk":
        p.bob = -abs(math.sin(2 * math.pi * t)) * 2.0
        p.step = math.sin(2 * math.pi * t) * 4.5
        p.arm = 0.35 - math.sin(2 * math.pi * t) * 0.5
        p.off = 0.1 + math.sin(2 * math.pi * t) * 0.5
    elif anim == "attack":
        k = i / max(1, n - 1)
        p.arm = -1.9 + k * 3.0          # arma sobe e desce rápido: impacto no quadro 2 ou 3
        p.lean = 2.0 if i in (2, 3) else 0.0
        p.bob = 1.0 if i in (2, 3) else 0.0
    elif anim == "skill":
        k = i / max(1, n - 1)
        p.arm = -1.7
        p.off = -1.5
        p.glow = int(3 + k * 7)
        p.bob = -1.0 - k
    elif anim == "dodge":
        p.lean = 3 + i * 2
        p.crouch = 5.0
        p.step = 3.0
    elif anim == "hit":
        p.lean = -3.0 + i
        p.white = 0.55
        p.arm = 0.8
    elif anim == "windup":
        k = i / max(1, n - 1)
        p.arm = 0.35 - k * 2.0
        p.off = 0.1 - k * 0.8
    elif anim == "death":
        k = i / max(1, n - 1)
        p.fall = k * 90
        p.sink = k * 6
        p.arm = 0.35 + k
    return p


def limb(d, x0, y0, ang, length, width, color, along=1):
    x1 = x0 + math.sin(ang) * length * along
    y1 = y0 + math.cos(ang) * length
    d.line([(x0, y0), (x1, y1)], fill=OL, width=width + 2)
    d.line([(x0, y0), (x1, y1)], fill=color, width=width)
    return x1, y1


def box(d, x0, y0, x1, y1, fill, r=2):
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill, outline=OL)


def draw_body(kind, direction, anim, i, n, base):
    back = direction == "ne"
    p = pose_for(anim, i, n)
    img = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fx = 1 if not back else -1  # lado da "frente" para as armas
    cx = CX + p.lean
    by = p.bob + p.crouch + p.sink  # deslocamento vertical do corpo
    hip = FEET - 10 + p.crouch
    # ---------------- cores por tipo
    if kind == "warrior":
        tunic, trim, skin = (200, 86, 26, 255), STEEL, SKIN
    elif kind == "archer":
        tunic, trim, skin = (47, 107, 58, 255), WOOD, SKIN
    elif kind == "cleric":
        tunic, trim, skin = (242, 230, 160, 255), GOLD, SKIN
    else:
        tunic, trim, skin = BONE, BONE_D, BONE

    # ---------------- equipamento de trás (aparece atrás do corpo)
    if kind == "archer":  # aljava nas costas
        qx = cx - 6 * fx
        d.rounded_rectangle([qx - 2, hip - 24 + by, qx + 3, hip - 6 + by], radius=1, fill=WOOD, outline=OL)
        for k in range(3):
            d.line([(qx - 1 + k * 2, hip - 27 + by), (qx - 1 + k * 2, hip - 24 + by)], fill=STEEL_L, width=1)
    if kind == "warrior" and back:  # escudo visto de trás
        d.ellipse([cx - 14, hip - 24 + by, cx - 2, hip - 8 + by], fill=WOOD, outline=OL)

    # ---------------- pernas
    legc = shade(tunic, 0.55) if kind != "skeleton" else BONE_D
    for sgn in (-1, 1):
        sx = cx + sgn * 3 + sgn * p.step * 0.6
        lift = max(0.0, p.step * sgn) * 0.4
        d.line([(cx + sgn * 3, hip + by), (sx, FEET - lift)], fill=OL, width=5 if kind != "skeleton" else 4)
        d.line([(cx + sgn * 3, hip + by), (sx, FEET - lift)], fill=legc, width=3 if kind != "skeleton" else 2)
        d.rectangle([sx - 3, FEET - 2 - lift, sx + 3, FEET - lift], fill=OL)

    # ---------------- manto/saia (Clérigo e Arqueiro)
    if kind == "cleric":
        d.polygon([(cx - 8, hip - 14 + by), (cx + 8, hip - 14 + by), (cx + 11, FEET - 2), (cx - 11, FEET - 2)], fill=tunic, outline=OL)
        d.line([(cx - 11, FEET - 3), (cx + 11, FEET - 3)], fill=GOLD, width=2)
    if kind == "archer":
        d.polygon([(cx - 8, hip - 14 + by), (cx + 8, hip - 14 + by), (cx + 9, hip + 2 + by), (cx - 9, hip + 2 + by)], fill=shade(tunic, 0.8), outline=OL)

    # ---------------- braço de trás (off-hand)
    sh_y = hip - 13 + by
    ox, oy = limb(d, cx - 8 * fx, sh_y, p.off * -fx, 11, 3, shade(tunic, 0.8) if kind != "skeleton" else BONE, 1)
    if kind == "warrior" and not back:  # escudo
        d.ellipse([ox - 7, oy - 8, ox + 7, oy + 8], fill=WOOD, outline=OL)
        d.ellipse([ox - 4, oy - 5, ox + 4, oy + 5], fill=(255, 138, 61, 255), outline=GOLD)
    if kind == "archer":  # arco na mão de trás
        d.arc([ox - 8, oy - 14, ox + 6, oy + 14], 270, 90, fill=WOOD, width=2)
        d.line([(ox - 1, oy - 14), (ox - 1, oy + 14)], fill=(230, 230, 235, 255), width=1)

    # ---------------- tronco
    top, bot = hip - 17 + by, hip + 1 + by
    if kind == "skeleton":
        d.rounded_rectangle([cx - 6, top, cx + 6, bot - 3], radius=2, fill=BONE_D, outline=OL)
        for k in range(4):
            d.line([(cx - 5, top + 3 + k * 3), (cx + 5, top + 3 + k * 3)], fill=BONE, width=1)
        d.line([(cx, top), (cx, bot - 3)], fill=BONE, width=1)
    else:
        torso_w = 7 if kind == "warrior" else 6
        box(d, cx - torso_w, top, cx + torso_w, bot, tunic, 3)
        if kind == "warrior":  # peitoral de aço
            d.rectangle([cx - 5, top + 2, cx + 5, top + 9], fill=STEEL, outline=OL)
            d.line([(cx - 5, top + 11), (cx + 5, top + 11)], fill=WOOD, width=2)
        if kind == "cleric":
            d.line([(cx, top + 1), (cx, bot)], fill=GOLD, width=1)
            d.line([(cx - 6, top + 8), (cx + 6, top + 8)], fill=GOLD, width=2)
        if kind == "archer":
            d.line([(cx - 6, top + 2), (cx + 5, bot - 2)], fill=WOOD, width=2)  # tira da aljava

    # ---------------- cabeça
    hy = top - 7
    if kind == "skeleton":
        d.ellipse([cx - 6, hy - 6, cx + 6, hy + 6], fill=BONE, outline=OL)
        if not back:
            d.rectangle([cx - 4, hy - 2, cx - 2, hy + 1], fill=(26, 26, 36, 255))
            d.rectangle([cx + 1, hy - 2, cx + 3, hy + 1], fill=(26, 26, 36, 255))
            d.point((cx - 3, hy - 1), fill=(224, 71, 43, 255)); d.point((cx + 2, hy - 1), fill=(224, 71, 43, 255))
            d.line([(cx - 3, hy + 4), (cx + 3, hy + 4)], fill=OL, width=1)
        d.line([(cx - 3, hy + 5), (cx - 3, hy + 6)], fill=OL); d.line([(cx + 1, hy + 5), (cx + 1, hy + 6)], fill=OL)
    else:
        d.ellipse([cx - 6, hy - 6, cx + 6, hy + 6], fill=skin, outline=OL)
        if not back:
            d.rectangle([cx - 3, hy - 1, cx - 2, hy + 1], fill=OL)
            d.rectangle([cx + 2, hy - 1, cx + 3, hy + 1], fill=OL)
        if kind == "warrior":  # elmo com pluma
            d.pieslice([cx - 7, hy - 8, cx + 7, hy + 6], 180, 360, fill=STEEL, outline=OL)
            d.rectangle([cx - 7, hy - 2, cx + 7, hy], fill=STEEL, outline=OL)
            d.polygon([(cx - 1, hy - 8), (cx + 2, hy - 8), (cx + 5 * (-fx), hy - 13)], fill=(255, 90, 26, 255), outline=OL)
            if not back:
                d.rectangle([cx - 1, hy - 1, cx + 1, hy + 4], fill=STEEL, outline=OL)
        if kind == "archer":  # capuz
            d.pieslice([cx - 8, hy - 9, cx + 8, hy + 7], 160, 380, fill=(47, 107, 58, 255), outline=OL)
            d.polygon([(cx - 8, hy), (cx - 5, hy + 8), (cx + 5, hy + 8), (cx + 8, hy)], fill=(47, 107, 58, 255), outline=OL)
            if not back:
                d.ellipse([cx - 4, hy - 3, cx + 4, hy + 4], fill=skin)
                d.rectangle([cx - 3, hy - 1, cx - 2, hy + 1], fill=OL); d.rectangle([cx + 2, hy - 1, cx + 3, hy + 1], fill=OL)
        if kind == "cleric":  # cabelo e auréola discreta
            d.pieslice([cx - 7, hy - 8, cx + 7, hy + 5], 180, 360, fill=(200, 86, 26, 255), outline=OL)
            d.ellipse([cx - 7, hy - 12, cx + 7, hy - 9], outline=GOLD)

    # ---------------- braço da frente com a arma
    fx0, fy0 = cx + 8 * fx, sh_y
    hx, hy2 = limb(d, fx0, fy0, p.arm * fx if not back else p.arm * -1 * -1, 11, 3, shade(tunic, 0.9) if kind != "skeleton" else BONE, 1)
    ang = p.arm
    wx, wy = hx + math.sin(ang) * 14 * fx, hy2 + math.cos(ang) * 14
    if kind == "warrior":
        d.line([(hx, hy2), (wx, wy)], fill=OL, width=4); d.line([(hx, hy2), (wx, wy)], fill=STEEL_L, width=2)
        d.line([(hx - 2, hy2), (hx + 2, hy2)], fill=GOLD, width=2)
    elif kind == "archer":
        pass  # o arco já está na outra mão
    elif kind == "cleric":
        d.line([(hx, hy2 + 14), (hx, hy2 - 22)], fill=OL, width=4); d.line([(hx, hy2 + 14), (hx, hy2 - 22)], fill=WOOD, width=2)
        r = 3 + int(p.glow * 0.4)  # o orbe cresce um pouco na habilidade (sem virar uma cúpula)
        d.ellipse([hx - r, hy2 - 24 - r, hx + r, hy2 - 24 + r], fill=(255, 242, 201, 255), outline=GOLD)
    else:  # esqueleto: arma enferrujada
        d.line([(hx, hy2), (wx, wy)], fill=OL, width=4); d.line([(hx, hy2), (wx, wy)], fill=(122, 90, 70, 255), width=2)
    if p.glow and kind != "cleric":
        d.ellipse([cx - p.glow, top - 20 - p.glow, cx + p.glow, top - 20 + p.glow], outline=GOLD, width=2)
    if p.glow and kind == "cleric":
        d.ellipse([hx - p.glow - 3, hy2 - 27 - p.glow, hx + p.glow + 3, hy2 - 21 + p.glow], outline=GOLD, width=1)

    # ---------------- queda (morte): gira em torno dos pés
    if p.fall:
        side = -1 if not back else 1
        img = img.rotate(side * p.fall, center=(CX, FEET), resample=Image.NEAREST)
        # ao cair, o corpo vai para o lado; recentraliza para o personagem deitado caber no quadro de 64 px
        moved = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        moved.alpha_composite(img, (int(side * 20 * (p.fall / 90)), 0))
        img = moved
    # ---------------- clarão branco (dano)
    if p.white:
        wh = Image.new("RGBA", (F, F), (255, 255, 255, int(255 * p.white)))
        img = Image.composite(Image.alpha_composite(img, wh), img, img.split()[3])
    return img


def build(name, kind, anims):
    images, tags = [], []
    for direction in DIRS:
        for anim, n, ms in anims:
            start = len(images)
            for i in range(n):
                if kind in HEROES:  # os 3 jogáveis: desenho dark fantasy em tools/gen_heroes.py
                    images.append((draw_hero(kind, direction, anim, pose_for(anim, i, n), i, n), ms))
                else:
                    images.append((draw_body(kind, direction, anim, i, n, None), ms))
            tags.append({"name": f"{anim}_{direction}", "from": start, "to": start + n - 1, "direction": "forward"})
    cols = 10
    rows = math.ceil(len(images) / cols)
    sheet = Image.new("RGBA", (cols * F, rows * F), (0, 0, 0, 0))
    frames = []
    for idx, (im, ms) in enumerate(images):
        x, y = (idx % cols) * F, (idx // cols) * F
        sheet.alpha_composite(im, (x, y))
        frames.append({
            "filename": f"{name} {idx}.aseprite",
            "frame": {"x": x, "y": y, "w": F, "h": F}, "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": F, "h": F}, "sourceSize": {"w": F, "h": F}, "duration": ms,
        })
    sheet.save(os.path.join(OUT, f"{name}.png"), optimize=True)
    meta = {"app": "frixep-placeholder", "version": "1.0", "image": f"{name}.png", "format": "RGBA8888",
            "size": {"w": sheet.width, "h": sheet.height}, "scale": "1", "frameTags": tags}
    with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as fh:
        json.dump({"frames": frames, "meta": meta}, fh, ensure_ascii=False)
    print(f"{name}: {len(images)} quadros, {len(tags)} tags -> {sheet.width}x{sheet.height}")


if __name__ == "__main__":
    build("warrior", "warrior", CHAR_ANIMS)
    build("archer", "archer", CHAR_ANIMS)
    build("cleric", "cleric", CHAR_ANIMS)
    build("skeleton", "skeleton", SKEL_ANIMS)
    print("pronto em", os.path.normpath(OUT))
