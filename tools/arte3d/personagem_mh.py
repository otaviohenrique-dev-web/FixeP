"""FrixeP: personagem natural (MakeHuman/MPFB, CC0) para o paper-doll pré-renderizado.
Corpo contínuo que deforma com o esqueleto (game_engine), roupa de baixo, cabelo curto; Couraça e Espada como camadas.
Uso: blender -b -P personagem_mh.py -- --saida <pasta> [--anims idle,walk] [--dirs se,ne] [--salvar-blend]
Saída: <pasta>/<camada>/<anim>_<dir>_<NN>.png  (camadas: corpo | couraca | couraca_acento | espada | espada_acento)
"""
import bpy, sys, os, math, mathutils
from mathutils import Vector, Euler, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(n, p=None): return argv[argv.index(n) + 1] if n in argv else p
SAIDA = arg("--saida", os.path.join(os.path.dirname(os.path.abspath(__file__)), "render"))
ANIMS = arg("--anims", "idle,walk").split(",")
DIRS = arg("--dirs", "se,ne").split(",")

bpy.ops.wm.read_factory_settings(use_empty=True)
import addon_utils
addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services import LocationService
cena = bpy.context.scene

COLECOES = {}
def colecao(nome):
    if nome not in COLECOES:
        c = bpy.data.collections.new(nome); cena.collection.children.link(c); COLECOES[nome] = c
    return COLECOES[nome]
def mover_para(o, nome):
    for c in list(o.users_collection): c.objects.unlink(o)
    colecao(nome).objects.link(o)

# ------------------------------------------------------------------ corpo (robusto, como a referência do Albion)
macro = TargetService.get_default_macro_info_dict()
macro.update({"gender": 1.0, "age": 0.45, "muscle": 0.9, "weight": 0.62, "proportions": 0.85, "height": 0.72})
corpo = HumanService.create_human(macro_detail_dict=macro)
rig = HumanService.add_builtin_rig(corpo, "game_engine")
# cabelo curto do pacote CC0
dados = LocationService.get_user_data()
cab = HumanService.add_mhclo_asset(os.path.join(dados, "hair", "short02", "short02.mhclo"), corpo, asset_type="Hair", subdiv_levels=0, material_type="MAKESKIN")

def mat(nome, cor, metal=0.0, rug=0.75):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*cor, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rug
    return m
PELE = mat("pele", (0.60, 0.39, 0.29))
CABELO = mat("cabelo", (0.13, 0.08, 0.05), rug=0.9)
ROUPA = mat("roupa_baixo", (0.17, 0.15, 0.14), rug=0.9)
ACO = mat("aco", (0.16, 0.165, 0.18), 0.5, 0.5)
ACO_CLARO = mat("aco_claro", (0.34, 0.35, 0.38), 0.55, 0.45)
COURO = mat("couro", (0.20, 0.12, 0.07))
LAMINA = mat("lamina", (0.55, 0.57, 0.60), 0.7, 0.3)
ACENTO = mat("acento", (0.75, 0.75, 0.75), 0.4, 0.45)

corpo.data.materials.clear(); corpo.data.materials.append(PELE)
cab.data.materials.clear(); cab.data.materials.append(CABELO)
for p in corpo.data.polygons: p.use_smooth = True
ALTURA = max((corpo.matrix_world @ v.co).z for v in corpo.data.vertices)
print("altura do corpo:", round(ALTURA, 3))

# roupa de baixo: faixa do quadril do próprio corpo, um pouco inflada (deforma junto: mantém os grupos de vértices)
roupa = corpo.copy(); roupa.data = corpo.data.copy(); roupa.name = "roupa_baixo"
cena.collection.objects.link(roupa)
lo, hi = 0.455 * ALTURA, 0.565 * ALTURA
import bmesh
bm = bmesh.new(); bm.from_mesh(roupa.data)
fora = [f for f in bm.faces if not (lo <= f.calc_center_median().z <= hi and abs(f.calc_center_median().x) < 0.19)]
bmesh.ops.delete(bm, geom=fora, context="FACES")
for v in bm.verts: v.co += v.normal * 0.006
bm.to_mesh(roupa.data); bm.free()
for m in list(roupa.modifiers):
    if m.type == "MASK": roupa.modifiers.remove(m)
roupa.data.materials.clear(); roupa.data.materials.append(ROUPA)
sol_mod = roupa.modifiers.new("espessura", "SOLIDIFY"); sol_mod.thickness = 0.004
for o in (corpo, cab, roupa): mover_para(o, "corpo")
mover_para(rig, "corpo")
rig.hide_render = True

# ------------------------------------------------------------------ pose por rotações no MUNDO (independe do eixo de cada osso)
P = rig.pose.bones
def zerar():
    for b in P: b.rotation_mode = "QUATERNION"; b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0)
    bpy.context.view_layer.update()
def girar(osso, eixo, graus):
    """gira o osso em torno do eixo do MUNDO que passa pela cabeça dele"""
    pb = P[osso]; bpy.context.view_layer.update()
    m = pb.matrix.copy(); cabeca = m.to_translation()
    R = Matrix.Translation(cabeca) @ Matrix.Rotation(math.radians(graus), 4, Vector(eixo)) @ Matrix.Translation(-cabeca)
    pb.matrix = R @ m; bpy.context.view_layer.update()
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)

def base_parada():
    """braços para baixo (o modelo vem em pose A) e mãos relaxadas"""
    zerar()
    girar("upperarm_l", Y, 40); girar("upperarm_r", Y, -40)   # 40° (antes 48°): o braço passa por fora da couraça, que é ~3 cm maior que o corpo
    girar("lowerarm_l", X, -3); girar("lowerarm_r", X, -3)
    fechar_mao("r", 72); fechar_mao("l", 35)

SINAL_CURL = {}
def cabeca_mundo(n): return rig.matrix_world @ P[n].head
def cauda_mundo(n): return rig.matrix_world @ P[n].tail
def fechar_mao(lado, graus):
    """dobra cada falange em torno do eixo do punho (do mindinho ao indicador); o sentido é o que leva as pontas dos dedos para a palma"""
    eixo = (cabeca_mundo(f"index_01_{lado}") - cabeca_mundo(f"pinky_01_{lado}")).normalized()
    if lado not in SINAL_CURL:
        palma = cabeca_mundo(f"hand_{lado}")
        antes = (cauda_mundo(f"middle_03_{lado}") - palma).length
        girar(f"middle_01_{lado}", tuple(eixo), 40); depois = (cauda_mundo(f"middle_03_{lado}") - palma).length
        girar(f"middle_01_{lado}", tuple(eixo), -40)
        SINAL_CURL[lado] = 1 if depois < antes else -1
    sg = SINAL_CURL[lado]
    for dedo in ("index", "middle", "ring", "pinky"):
        for seg, frac in (("01", 0.9), ("02", 1.1), ("03", 0.8)):
            girar(f"{dedo}_{seg}_{lado}", tuple(eixo), sg * graus * frac)
    girar(f"thumb_02_{lado}", tuple(eixo), sg * graus * 0.45); girar(f"thumb_03_{lado}", tuple(eixo), sg * graus * 0.45)

def pose(perna_D=0, perna_E=0, joelho_D=0, joelho_E=0, braco=0, sobe=0.0, respira=0.0):
    """ângulos em graus: perna + = pé para a frente (-Y). braco + = braço da espada para a frente"""
    base_parada()
    P["pelvis"].location = (0, 0, 0); bpy.context.view_layer.update()
    pm = P["pelvis"].matrix.copy(); pm.translation += Vector((0, 0, sobe)); P["pelvis"].matrix = pm; bpy.context.view_layer.update()
    girar("spine_02", X, -3 - respira * 80)
    girar("thigh_r", X, -perna_D); girar("thigh_l", X, -perna_E)
    girar("calf_r", X, joelho_D); girar("calf_l", X, joelho_E)
    girar("foot_r", X, perna_D * 0.5 - joelho_D * 0.35); girar("foot_l", X, perna_E * 0.5 - joelho_E * 0.35)
    girar("upperarm_r", X, -(braco * 0.45 - 8)); girar("upperarm_l", X, braco)
    girar("lowerarm_r", X, -(6 + max(0, braco) * 0.4)); girar("lowerarm_l", X, -(3 + max(0, -braco) * 0.4))

WALK = [
    dict(perna_D=26, perna_E=-22, joelho_D=4, joelho_E=20, braco=-22, sobe=0.0),
    dict(perna_D=8, perna_E=4, joelho_D=6, joelho_E=46, braco=-8, sobe=0.03),
    dict(perna_D=-16, perna_E=18, joelho_D=10, joelho_E=8, braco=14, sobe=0.008),
    dict(perna_D=-22, perna_E=26, joelho_D=20, joelho_E=4, braco=22, sobe=0.0),
    dict(perna_D=4, perna_E=8, joelho_D=46, joelho_E=6, braco=8, sobe=0.03),
    dict(perna_D=18, perna_E=-16, joelho_D=8, joelho_E=10, braco=-14, sobe=0.008),
]
IDLE = [dict(respira=x, sobe=-x * 0.4) for x in (0.0, 0.008, 0.016, 0.008)]
POSES = {"walk": WALK, "idle": IDLE}

# ------------------------------------------------------------------ equipamento criado na pose parada e preso aos ossos
pose()
def mundo_osso(n): return rig.matrix_world @ P[n].matrix
def peca(nome, prim, loc, esc, material, osso, rot=(0, 0, 0), bevel=0.01, colecao_nome="couraca", **kw):
    getattr(bpy.ops.mesh, prim)(location=loc, rotation=rot, **kw)
    o = bpy.context.object; o.name = nome; o.scale = esc; bpy.ops.object.transform_apply(scale=True)
    for p in o.data.polygons: p.use_smooth = True
    if bevel: m = o.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = 2
    o.data.materials.append(material)
    mw = o.matrix_world.copy(); o.parent = rig; o.parent_type = "BONE"; o.parent_bone = osso
    bpy.context.view_layer.update(); o.matrix_world = mw
    mover_para(o, colecao_nome); return o

# COURAÇA como "casca" do próprio corpo: copia as faces do tronco (pelo osso que mais as move), infla e dá espessura.
# Ela veste o corpo gerado e dobra junto (mantém os grupos de vértices e o modificador de esqueleto).
GRUPOS = {g.index: g.name for g in corpo.vertex_groups}
def osso_dominante(v):
    melhor, peso = None, 0.0
    for g in v.groups:
        n = GRUPOS.get(g.group, "")
        if g.weight > peso and n in OSSOS_VALIDOS: melhor, peso = n, g.weight
    return melhor
OSSOS_VALIDOS = {b.name for b in rig.data.bones}
def casca(nome, ossos, z_min, z_max, infla, material, espessura=0.012, facetado=0.0, x_max=9.0):
    o = corpo.copy(); o.data = corpo.data.copy(); o.name = nome; cena.collection.objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    dl = bm.verts.layers.deform.active
    def ok_v(v):
        z = (corpo.matrix_world @ v.co).z
        if not (z_min * ALTURA <= z <= z_max * ALTURA) or abs(v.co.x) > x_max: return False
        melhor, peso = None, 0.0
        for gi, w in v[dl].items():
            n = GRUPOS.get(gi, "")
            if n in OSSOS_VALIDOS and w > peso: melhor, peso = n, w
        return melhor in ossos
    fora = [f for f in bm.faces if not all(ok_v(v) for v in f.verts)]
    bmesh.ops.delete(bm, geom=fora, context="FACES")
    for v in bm.verts: v.co += v.normal * infla
    bm.to_mesh(o.data); bm.free()
    for m in list(o.modifiers):
        if m.type == "MASK": o.modifiers.remove(m)
    o.data.materials.clear(); o.data.materials.append(material)
    if facetado:  # aspecto de placa: menos polígonos e sombreamento plano
        d = o.modifiers.new("placas", "DECIMATE"); d.ratio = facetado
        for p in o.data.polygons: p.use_smooth = False
    sl = o.modifiers.new("espessura", "SOLIDIFY"); sl.thickness = espessura; sl.offset = 1
    mover_para(o, "couraca"); return o
TRONCO = {"spine_01", "spine_02", "spine_03", "pelvis", "clavicle_l", "clavicle_r"}
casca("peitoral", TRONCO, 0.56, 0.82, 0.028, ACO, facetado=0.7)
casca("friso_cintura", TRONCO, 0.548, 0.592, 0.04, ACENTO, espessura=0.01)
casca("friso_gola", TRONCO | {"neck_01"}, 0.795, 0.83, 0.04, ACENTO, espessura=0.01)
for lado, s_ in (("D", "r"), ("E", "l")):
    casca(f"ombreira_{lado}", {f"upperarm_{s_}", f"clavicle_{s_}"}, 0.74, 0.86, 0.045, ACO_CLARO, facetado=0.7)
    casca(f"ombreira_aro_{lado}", {f"upperarm_{s_}"}, 0.728, 0.76, 0.054, ACENTO, espessura=0.01)
casca("faldas", {"pelvis", "thigh_l", "thigh_r", "spine_01"}, 0.44, 0.565, 0.035, ACO, facetado=0.7)
casca("faldas_aro", {"pelvis", "thigh_l", "thigh_r"}, 0.435, 0.462, 0.046, ACENTO, espessura=0.01)

# espada encaixada no punho fechado: o cabo atravessa o punho (do mindinho ao indicador), a lâmina sai pelo lado do mindinho.
# Montada num referencial da própria mão e presa ao osso hand_r: acompanha o pulso em qualquer pose.
idx, pnk = cabeca_mundo("index_02_r"), cabeca_mundo("pinky_02_r")
g = (idx - pnk).normalized()                                   # eixo do cabo (aponta para o lado do indicador/polegar)
dedos = (cauda_mundo("middle_01_r") - cabeca_mundo("middle_01_r")).normalized()
# a lâmina sai pelo lado do polegar, para a frente e para baixo (empunhadura de quem caminha com a espada solta ao lado)
lamina_dir = Vector((-0.10, -0.62, -0.78)).normalized()        # para a frente (-Y, sentido da caminhada), para baixo e levemente para fora (lado direito)
g = -lamina_dir                                                  # +Z local = pomo; -Z local = ponta
ladox = (dedos - g * dedos.dot(g)).normalized()                # largura da lâmina: no sentido dos dedos (a face aparece de lado)
ladoy = g.cross(ladox)
centro = (idx + pnk) / 2 + (cabeca_mundo("hand_r") - (idx + pnk) / 2) * 0.25
REF = Matrix((ladox, ladoy, g)).transposed().to_4x4(); REF.translation = centro
def peca_espada(nome, prim, local, esc, material, bevel=0.006, **kw):
    getattr(bpy.ops.mesh, prim)(location=(0, 0, 0), **kw)
    o = bpy.context.object; o.name = nome; o.scale = esc; bpy.ops.object.transform_apply(scale=True)
    o.location = local; bpy.ops.object.transform_apply(location=True)
    for p in o.data.polygons: p.use_smooth = False
    if bevel: m = o.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = 1
    o.data.materials.append(material)
    o.matrix_world = REF @ o.matrix_world
    mw = o.matrix_world.copy(); o.parent = rig; o.parent_type = "BONE"; o.parent_bone = "hand_r"
    bpy.context.view_layer.update(); o.matrix_world = mw
    mover_para(o, "espada"); return o
COMP = 0.70   # comprimento da lâmina (uma mão)
peca_espada("cabo", "primitive_cylinder_add", (0, 0, 0.0), (1, 1, 1), COURO, vertices=10, radius=0.022, depth=0.17)
peca_espada("pomo", "primitive_uv_sphere_add", (0, 0, 0.10), (1, 1, 1), ACENTO, segments=12, ring_count=8, radius=0.032)
peca_espada("guarda", "primitive_cube_add", (0, 0, -0.10), (0.20, 0.045, 0.035), ACENTO, size=1)
peca_espada("lamina", "primitive_cube_add", (0, 0, -0.12 - COMP / 2), (0.085, 0.024, COMP), LAMINA, bevel=0.008, size=1)
peca_espada("ponta", "primitive_cone_add", (0, 0, -0.12 - COMP - 0.05), (1, 0.28, 1), LAMINA, vertices=4, radius1=0.06, radius2=0.0, depth=0.10, rotation=(math.pi, 0, math.radians(45)))
peca_espada("sulco", "primitive_cube_add", (0, 0, -0.12 - COMP * 0.42), (0.024, 0.03, COMP * 0.7), ACENTO, bevel=0, size=1)

# ------------------------------------------------------------------ luz, câmera 45°, render
bpy.ops.object.light_add(type="SUN"); sol = bpy.context.object; sol.data.energy = 3.4
bpy.ops.object.light_add(type="SUN"); contra = bpy.context.object; contra.data.energy = 1.3
w = bpy.data.worlds.new("mundo"); cena.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.30, 0.30, 0.33, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.85
bpy.ops.object.camera_add(); cam = bpy.context.object; cena.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.4
for o in (sol, contra, cam): mover_para(o, "cena")
ALVO = Vector((0, 0, 0.5 * ALTURA + 0.05)); ELEV = math.radians(45)
AZIMUTE = {"se": -45, "ne": -135, "s": 0, "e": -90, "n": 180, "sw": 45, "w": 90, "nw": 135}  # personagem olha para -Y; SE = descendo para a direita da tela
def camera(d):
    a = math.radians(AZIMUTE[d])
    cam.location = ALVO + Vector((math.sin(a) * math.cos(ELEV) * 10, -math.cos(a) * math.cos(ELEV) * 10, math.sin(ELEV) * 10))
    cam.rotation_euler = (ALVO - cam.location).to_track_quat("-Z", "Y").to_euler()
    sol.rotation_euler = Euler((math.radians(48), 0, a - math.radians(35)), "XYZ")
    contra.rotation_euler = Euler((math.radians(-55), 0, a + math.radians(160)), "XYZ")
r = cena.render
motores = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
r.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in motores else "BLENDER_EEVEE_NEXT"
r.resolution_x = r.resolution_y = 512; r.film_transparent = True; r.filter_size = 0.6
cena.view_settings.view_transform = "Standard"

HOLD = bpy.data.materials.new("holdout"); HOLD.use_nodes = True; nt = HOLD.node_tree; nt.nodes.clear()
nt.links.new(nt.nodes.new("ShaderNodeHoldout").outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
BRANCO = bpy.data.materials.new("branco"); BRANCO.use_nodes = True; nt = BRANCO.node_tree; nt.nodes.clear()
em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (1, 1, 1, 1)
nt.links.new(em.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
ORIG = {o.name: [s.material for s in o.material_slots] for o in bpy.data.objects if o.type == "MESH"}
def restaurar():
    for o in bpy.data.objects:
        if o.name in ORIG:
            for s, m in zip(o.material_slots, ORIG[o.name]): s.material = m
def preparar(camada):
    restaurar()
    pc, acento = camada.replace("_acento", ""), camada.endswith("_acento")
    for nome in COLECOES:
        if nome == "cena": continue
        lc = bpy.context.view_layer.layer_collection.children[nome]
        if camada == "corpo": lc.exclude = nome != "corpo"; lc.holdout = False
        else: lc.exclude = nome not in ("corpo", pc); lc.holdout = nome == "corpo"
    if acento:
        for o in COLECOES[pc].objects:
            if o.type == "MESH":
                for s in o.material_slots: s.material = BRANCO if ORIG[o.name][0] is ACENTO else HOLD

CAMADAS = ["corpo", "couraca", "couraca_acento", "espada", "espada_acento"]
for d in DIRS:
    camera(d)
    for anim in ANIMS:
        for i, p in enumerate(POSES[anim]):
            pose(**p)
            for cm in CAMADAS:
                preparar(cm); os.makedirs(os.path.join(SAIDA, cm), exist_ok=True)
                r.filepath = os.path.join(SAIDA, cm, f"{anim}_{d}_{i + 1:02d}.png"); bpy.ops.render.render(write_still=True)
            print("frame", d, anim, i + 1, flush=True)
restaurar()
if "--salvar-blend" in argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), "personagem_mh.blend"))
print("ok")
