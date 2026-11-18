"""
Gera ATLAS DE DEPURAÇÃO (bonecos provisórios) no mesmo formato que o Aseprite exporta
(PNG + JSON json-array com tags). Serve para testar o carregador de sprites sem esperar a arte.

NÃO é arte do jogo. A saída vai para packages/client/public/debug-atlas/ (ignorada pelo Git).
Para ver no jogo, abra  http://localhost:5173/?atlas=debug

Uso:  python tools/gen_debug_atlas.py        (precisa de Python e da biblioteca Pillow)
"""
import json
import math
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "packages", "client", "public", "debug-atlas")
os.makedirs(OUT, exist_ok=True)

F = 64
PIVOT = (32, 52)
DIRS = ["se", "ne"]  # Fase A: as outras direções são espelhadas pelo jogo

# (nome, quadros, duração por quadro em ms) -- iguais ao guia de arte
CHAR_ANIMS = [("idle", 4, 167), ("walk", 6, 100), ("attack", 5, 83), ("skill", 5, 83), ("dodge", 3, 83), ("hit", 2, 83), ("death", 5, 125)]
SKEL_ANIMS = [("idle", 4, 167), ("walk", 6, 125), ("windup", 4, 167), ("attack", 4, 83), ("hit", 2, 83), ("death", 6, 100)]

ENTITIES = {
    "warrior": ((255, 138, 61), CHAR_ANIMS),
    "archer": ((111, 207, 111), CHAR_ANIMS),
    "cleric": ((242, 230, 160), CHAR_ANIMS),
    "skeleton": ((216, 210, 192), SKEL_ANIMS),
}


def draw_frame(color, anim, i, n, direction):
    """Um boneco simples: corpo, cabeça, pernas e uma 'arma'. Orienta pela direção para dar para conferir o espelhamento."""
    t = i / n
    img = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    px, py = PIVOT
    away = direction == "ne"  # de costas
    face = 1 if not away else -1

    bob = 0.0
    leg = 0.0
    arm_angle = 0.35  # arma baixa
    shift_x = 0.0
    tilt = 0.0
    glow = 0
    white = 0.0
    if anim == "idle":
        bob = math.sin(2 * math.pi * t) * 1.2
    elif anim == "walk":
        bob = abs(math.sin(2 * math.pi * t)) * -2.5
        leg = math.sin(2 * math.pi * t) * 5
    elif anim in ("attack",):
        arm_angle = -1.2 + (i / max(1, n - 1)) * 2.6
    elif anim == "skill":
        arm_angle = -1.5
        glow = int(4 + i * 3)
    elif anim == "dodge":
        shift_x = 4 + i * 2
        tilt = 0.35
        bob = 2
    elif anim == "hit":
        shift_x = -4 + i
        white = 0.55
    elif anim == "windup":
        arm_angle = 0.35 - (i / max(1, n - 1)) * 1.8
    # ---- corpo
    cx = px + shift_x
    base = py + bob
    body_top = base - 26
    d.ellipse([cx - 7, body_top - 12, cx + 7, body_top + 2], fill=color + (255,), outline=(2, 5, 11, 255))  # cabeça
    d.rounded_rectangle([cx - 7, body_top, cx + 7, base - 4], radius=3, fill=tuple(int(c * 0.8) for c in color) + (255,), outline=(2, 5, 11, 255))
    # olhos (só de frente)
    if not away:
        d.rectangle([cx + 1, body_top - 7, cx + 3, body_top - 5], fill=(2, 5, 11, 255))
        d.rectangle([cx + 5, body_top - 6, cx + 6, body_top - 4], fill=(2, 5, 11, 255))
    else:
        d.rectangle([cx - 2, body_top - 8, cx + 2, body_top - 6], fill=(2, 5, 11, 255))  # nuca
    # ---- pernas
    d.line([(cx - 3, base - 4), (cx - 3 + leg, py)], fill=(2, 5, 11, 255), width=3)
    d.line([(cx + 3, base - 4), (cx + 3 - leg, py)], fill=(2, 5, 11, 255), width=3)
    # ---- arma / braço
    hx, hy = cx + 7 * face, body_top + 8
    ex = hx + math.cos(arm_angle) * 14 * face
    ey = hy + math.sin(arm_angle) * 14 * (1 if not away else -1)
    d.line([(hx, hy), (ex, ey)], fill=(230, 230, 235, 255), width=2)
    if anim == "attack" and i == 2:  # quadro de impacto
        d.ellipse([ex - 5, ey - 5, ex + 5, ey + 5], outline=(255, 255, 255, 255), width=2)
    if glow:
        d.ellipse([cx - glow, body_top - 18 - glow, cx + glow, body_top - 18 + glow], outline=(255, 208, 138, 255), width=2)
    # ---- queda (morte)
    if anim == "death":
        ang = (i / max(1, n - 1)) * 90
        layer = img.rotate(-ang if not away else ang, center=(px, py), resample=Image.NEAREST)
        img = Image.new("RGBA", (F, F), (0, 0, 0, 0))
        img.alpha_composite(layer, (0, int(i * 1.2)))
        d = ImageDraw.Draw(img)
    if tilt:
        img = img.rotate(-tilt * 57.3, center=(px, py), resample=Image.NEAREST)
        d = ImageDraw.Draw(img)
    if white:
        w = Image.new("RGBA", (F, F), (255, 255, 255, int(255 * white)))
        mask = img.split()[3]
        img = Image.composite(Image.alpha_composite(img, w), img, mask)
        d = ImageDraw.Draw(img)
    # ---- contador de quadro (pontinhos no canto) para conferir a ordem das animações
    for k in range(i + 1):
        d.point((2 + k * 3, 2), fill=(255, 154, 77, 255))
    return img


def build(name, color, anims):
    frames, tags = [], []
    images = []
    for direction in DIRS:
        for anim, n, ms in anims:
            start = len(images)
            for i in range(n):
                images.append((draw_frame(color, anim, i, n, direction), ms))
            tags.append({"name": f"{anim}_{direction}", "from": start, "to": start + n - 1, "direction": "forward"})
    cols = 10
    rows = math.ceil(len(images) / cols)
    sheet = Image.new("RGBA", (cols * F, rows * F), (0, 0, 0, 0))
    for idx, (im, ms) in enumerate(images):
        x, y = (idx % cols) * F, (idx // cols) * F
        sheet.alpha_composite(im, (x, y))
        frames.append({
            "filename": f"{name} {idx}.aseprite",
            "frame": {"x": x, "y": y, "w": F, "h": F},
            "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": F, "h": F},
            "sourceSize": {"w": F, "h": F},
            "duration": ms,
        })
    sheet.save(os.path.join(OUT, f"{name}.png"))
    meta = {
        "app": "frixep-debug-atlas", "version": "1.0", "image": f"{name}.png", "format": "RGBA8888",
        "size": {"w": sheet.width, "h": sheet.height}, "scale": "1", "frameTags": tags,
    }
    with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as fh:
        json.dump({"frames": frames, "meta": meta}, fh, ensure_ascii=False)
    print(f"{name}: {len(images)} quadros, {len(tags)} tags -> {sheet.width}x{sheet.height}")


if __name__ == "__main__":
    for nm, (col, an) in ENTITIES.items():
        build(nm, col, an)
    print("pronto em", os.path.normpath(OUT))
