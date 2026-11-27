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
ROUPA = mat("roupa_baixo", (0.07, 0.08, 0.12), rug=0.9)   # cinza-azulado escuro: não se confunde com a sombra da pele em 128 px
ACO = mat("aco", (0.40, 0.41, 0.44), 0.55, 0.42)            # aço claro (referências)
ACO_CLARO = mat("aco_claro", (0.58, 0.59, 0.62), 0.6, 0.38)
ACO_ESCURO = mat("aco_escuro", (0.09, 0.09, 0.11), 0.5, 0.6)
TECIDO = mat("tecido", (0.34, 0.31, 0.27), rug=0.95)
TECIDO_ESC = mat("tecido_esc", (0.15, 0.13, 0.11), rug=0.95)
FENDA = mat("fenda", (0.0, 0.0, 0.0), rug=1.0)
COURO = mat("couro", (0.20, 0.12, 0.07))
LAMINA = mat("lamina", (0.70, 0.72, 0.76), 0.7, 0.28)
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
dl_r = bm.verts.layers.deform.active; gi_b = corpo.vertex_groups["body"].index
fora = [f for f in bm.faces if not (lo <= f.calc_center_median().z <= hi and abs(f.calc_center_median().x) < 0.19 and all(v[dl_r].get(gi_b, 0.0) > 0 for v in f.verts))]
bmesh.ops.delete(bm, geom=fora, context="FACES")
for v in bm.verts: v.co += v.normal * 0.006
bm.to_mesh(roupa.data); bm.free()
for m in list(roupa.modifiers):
    if m.type == "MASK": roupa.modifiers.remove(m)
roupa.data.materials.clear(); roupa.data.materials.append(ROUPA)
sol_mod = roupa.modifiers.new("espessura", "SOLIDIFY"); sol_mod.thickness = 0.004
for o in (corpo, roupa): mover_para(o, "corpo")
mover_para(cab, "cabelo")   # camada própria: o jogo esconde o cabelo quando há elmo
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
    girar("upperarm_l", Y, 40); girar("upperarm_r", Y, -33)   # 40° (antes 48°): o braço passa por fora da couraça, que é ~3 cm maior que o corpo
    girar("lowerarm_l", X, -3); girar("lowerarm_r", X, -3)
    mirar_pulso("r", DIR_LAMINA)
    mao_empunhadura("r", 1.0); mao_empunhadura("l", 0.45, polegar=False)

def cabeca_mundo(n): return rig.matrix_world @ P[n].head
def cauda_mundo(n): return rig.matrix_world @ P[n].tail
DEDOS = ("index", "middle", "ring", "pinky")
def eixos_mao(lado):
    """a = através do punho (mindinho -> indicador); f = sentido dos dedos; n = normal da palma (lado do polegar/palma)"""
    a = (cabeca_mundo(f"index_01_{lado}") - cabeca_mundo(f"pinky_01_{lado}")).normalized()
    f = (cauda_mundo(f"middle_01_{lado}") - cabeca_mundo(f"middle_01_{lado}")).normalized()
    f = (f - a * f.dot(a)).normalized()
    n = a.cross(f).normalized()
    pol = cabeca_mundo(f"thumb_02_{lado}") - cabeca_mundo(f"hand_{lado}")
    if pol.dot(n) < 0: n = -n
    return a, f, n
DIR_LAMINA = Vector((-0.08, -0.62, -0.78)).normalized()   # espada da mão direita: para a frente e para baixo
def mirar_pulso(lado, alvo, limite=65):
    """gira o pulso para o eixo do punho (a) apontar para 'alvo' (até 'limite' graus): a arma aponta sem sair da mão"""
    a, f, n = eixos_mao(lado)
    q = a.rotation_difference(alvo); ang = math.degrees(q.angle)
    if ang < 0.5: return
    girar(f"hand_{lado}", tuple(q.axis), min(ang, limite))
def mao_empunhadura(lado, fechamento=1.0, polegar=True):
    """pose padrão de quem segura um cabo de ~3,5 cm: dedos em volta do cabo, polegar fechando por cima do indicador"""
    a, f, n = eixos_mao(lado)
    # sentido do dobrar: o que leva a ponta do dedo médio para o lado da palma (n)
    ponta0 = cauda_mundo(f"middle_03_{lado}").dot(n)
    girar(f"middle_01_{lado}", tuple(a), 20); sg = 1 if cauda_mundo(f"middle_03_{lado}").dot(n) > ponta0 else -1
    girar(f"middle_01_{lado}", tuple(a), -20)
    for d in DEDOS:
        for seg, ang in (("01", 58), ("02", 80), ("03", 52)):
            girar(f"{d}_{seg}_{lado}", tuple(a), sg * ang * fechamento)
    if not polegar: return
    if lado in POLEGAR:  # já calculado no primeiro frame: reaplica a mesma pose do polegar (rápido e igual em todos)
        _, r1, r2, c = POLEGAR[lado]
        girar(f"thumb_01_{lado}", tuple(f), r1); girar(f"thumb_01_{lado}", tuple(n), r2)
        td = (cauda_mundo(f"thumb_02_{lado}") - cabeca_mundo(f"thumb_02_{lado}")).normalized(); eixo_c = td.cross(n).normalized()
        girar(f"thumb_02_{lado}", tuple(eixo_c), c * 0.5); girar(f"thumb_03_{lado}", tuple(eixo_c), c)
        return
    # polegar: busca a rotação que leva a ponta para cima da 2ª falange do indicador (sem "joinha")
    alvo = cabeca_mundo(f"index_02_{lado}") + n * 0.012 + f * 0.01
    melhor = (1e9, 0, 0, 0)
    base = {b: P[b].matrix.copy() for b in (f"thumb_01_{lado}", f"thumb_02_{lado}", f"thumb_03_{lado}")}
    def repor():
        for b, m in base.items(): P[b].matrix = m; bpy.context.view_layer.update()
    for r1 in range(-70, 71, 14):
        for r2 in range(-50, 51, 10):
            for c in (20, 45, 70):
                repor()
                girar(f"thumb_01_{lado}", tuple(f), r1); girar(f"thumb_01_{lado}", tuple(n), r2)
                td = (cauda_mundo(f"thumb_02_{lado}") - cabeca_mundo(f"thumb_02_{lado}")).normalized()
                eixo_c = td.cross(n).normalized()
                girar(f"thumb_02_{lado}", tuple(eixo_c), c * 0.5); girar(f"thumb_03_{lado}", tuple(eixo_c), c)
                dist = (cauda_mundo(f"thumb_03_{lado}") - alvo).length
                if dist < melhor[0]: melhor = (dist, r1, r2, c)
    repor()
    _, r1, r2, c = melhor
    girar(f"thumb_01_{lado}", tuple(f), r1); girar(f"thumb_01_{lado}", tuple(n), r2)
    td = (cauda_mundo(f"thumb_02_{lado}") - cabeca_mundo(f"thumb_02_{lado}")).normalized(); eixo_c = td.cross(n).normalized()
    girar(f"thumb_02_{lado}", tuple(eixo_c), c * 0.5); girar(f"thumb_03_{lado}", tuple(eixo_c), c)
    POLEGAR[lado] = melhor
POLEGAR = {}
def encaixe_mao(lado):
    """ponto de encaixe da arma: centro do punho fechado, eixo Z = através do punho (lado do polegar)"""
    a, f, n = eixos_mao(lado)
    f1 = sum((cabeca_mundo(f"{d}_01_{lado}") for d in DEDOS), Vector()) / 4
    f2 = sum((cauda_mundo(f"{d}_02_{lado}") for d in DEDOS), Vector()) / 4
    c = (f1 + f2) / 2
    m = Matrix((f, n, a)).transposed().to_4x4(); m.translation = c   # X = dedos, Y = palma, Z = cabo
    return m

def pose(fase=None, respira=0.0, sobe=0.0, peso=0.0):
    """fase (0..1) = ciclo da caminhada (0 = contato do pé direito à frente); sem fase = parado (respiração e peso)"""
    base_parada()
    if fase is None:   # PARADO: respira, transfere o peso de leve de um pé para o outro, braços soltos
        mover_pelvis(0, peso * 0.012, sobe)
        girar("pelvis", Y, peso * 1.5); girar("spine_02", Y, -peso * 1.8)
        girar("spine_02", X, -2 - respira * 80); girar("head", X, respira * 30)
        girar("upperarm_l", X, respira * 120); girar("upperarm_r", X, -respira * 60)
        return
    c, s2 = math.cos(2 * math.pi * fase), math.sin(2 * math.pi * fase)
    cD, cE = c, -c                                     # perna direita à frente em fase 0, esquerda em 0,5
    def joelho(f):   # flexão: um pouco no apoio (amortece) e bastante quando a perna passa à frente
        a = math.sin(2 * math.pi * f)
        return 5 + 12 * max(0.0, a) + 46 * max(0.0, -a) ** 1.3
    jD, jE = joelho(fase), joelho(fase + 0.5)
    mover_pelvis(0, 0, 0.012 * (1 - math.cos(4 * math.pi * fase)))      # sobe no meio do apoio, desce no contato
    girar("pelvis", Z, 6 * c)                           # quadril gira: o lado da perna da frente avança
    girar("pelvis", Y, 3 * s2)                          # e inclina de leve para o lado do apoio
    girar("spine_02", Z, -5 * c); girar("spine_03", Z, -4 * c)   # ombros giram contra o quadril
    girar("spine_02", X, -4)                            # leve inclinação à frente
    girar("head", Z, -3 * c)                            # a cabeça compensa e continua olhando à frente
    girar("thigh_r", X, -24 * cD); girar("thigh_l", X, -24 * cE)
    girar("calf_r", X, jD); girar("calf_l", X, jE)
    # pé: calcanhar no contato, ponta no impulso (rola do calcanhar para a ponta)
    girar("foot_r", X, 24 * cD * 0.5 - jD * 0.35 + 10 * max(0.0, math.sin(2 * math.pi * (fase - 0.35))) ** 2)
    girar("foot_l", X, 24 * cE * 0.5 - jE * 0.35 + 10 * max(0.0, math.sin(2 * math.pi * (fase + 0.15))) ** 2)
    # braços: oposição às pernas; cotovelo dobra mais quando o braço vai à frente
    girar("upperarm_l", X, -18 * cD); girar("lowerarm_l", X, -(4 + 10 * max(0.0, cD)))
    girar("upperarm_r", X, -(9 * cE)); girar("lowerarm_r", X, -(5 + 6 * max(0.0, cE)))

def mover_pelvis(dx, dy, dz):
    pm = P["pelvis"].matrix.copy(); pm.translation += Vector((dx, dy, dz)); P["pelvis"].matrix = pm; bpy.context.view_layer.update()

N_WALK, N_IDLE = 8, 6
WALK = [dict(fase=i / N_WALK) for i in range(N_WALK)]
IDLE = [dict(respira=0.008 * (1 - math.cos(2 * math.pi * i / N_IDLE)), sobe=-0.003 * (1 - math.cos(2 * math.pi * i / N_IDLE)), peso=math.sin(2 * math.pi * i / N_IDLE)) for i in range(N_IDLE)]
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

# ------------------------------------------------------------------ EQUIPAMENTOS COMUNS (referências do usuário, 27/11/2026)
# Cada peça numa coleção (= camada). O laranja das referências é o ACENTO (a parte que recebe a cor da raridade).
GRUPOS = {g.index: g.name for g in corpo.vertex_groups}
OSSOS_VALIDOS = {b.name for b in rig.data.bones}
def casca(nome, ossos, z_min, z_max, infla, material, espessura=0.012, facetado=0.0, colecao_nome="couraca"):
    """copia do próprio corpo as faces movidas por 'ossos' entre z_min e z_max (fração da altura), infla e dá espessura"""
    o = corpo.copy(); o.data = corpo.data.copy(); o.name = nome; cena.collection.objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    dl = bm.verts.layers.deform.active
    gi_body = corpo.vertex_groups["body"].index if "body" in corpo.vertex_groups else None
    def ok_v(v):
        z = (corpo.matrix_world @ v.co).z
        if not (z_min * ALTURA <= z <= z_max * ALTURA): return False
        if gi_body is not None and v[dl].get(gi_body, 0.0) <= 0.0: return False   # malha auxiliar do MakeHuman: fora
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
    if facetado:
        d = o.modifiers.new("placas", "DECIMATE"); d.ratio = facetado
        for p in o.data.polygons: p.use_smooth = False
    sl = o.modifiers.new("espessura", "SOLIDIFY"); sl.thickness = espessura; sl.offset = 1
    mover_para(o, colecao_nome); return o

def pontos(ossos, z_min=0.0, z_max=1.0):
    """vértices do corpo (no mundo, em repouso) movidos pelos ossos dados"""
    out = []
    for v in corpo.data.vertices:
        z = (corpo.matrix_world @ v.co).z
        if not (z_min * ALTURA <= z <= z_max * ALTURA): continue
        melhor, peso = None, 0.0
        for g in v.groups:
            n = GRUPOS.get(g.group, "")
            if n in OSSOS_VALIDOS and g.weight > peso: melhor, peso = n, g.weight
        if melhor in ossos: out.append(corpo.matrix_world @ v.co)
    return out

def peca_em(nome, prim, local, esc, material, ref, osso, colecao_nome, bevel=0.006, liso=False, **kw):
    """cria a peça no referencial 'ref' (matriz no mundo) e prende ao osso"""
    getattr(bpy.ops.mesh, prim)(location=(0, 0, 0), **kw)
    o = bpy.context.object; o.name = nome; o.scale = esc; bpy.ops.object.transform_apply(scale=True)
    o.location = local; bpy.ops.object.transform_apply(location=True)
    for p in o.data.polygons: p.use_smooth = liso
    if bevel: m = o.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = 2 if liso else 1
    o.data.materials.append(material)
    o.matrix_world = ref @ o.matrix_world
    mw = o.matrix_world.copy(); o.parent = rig; o.parent_type = "BONE"; o.parent_bone = osso
    bpy.context.view_layer.update(); o.matrix_world = mw
    mover_para(o, colecao_nome); return o

# ---- ARMADURA (slot do peito): cobre o corpo todo, menos a cabeça (elmo) e os pés (botas), como no Albion
TRONCO = {"spine_01", "spine_02", "spine_03", "pelvis", "clavicle_l", "clavicle_r"}
MAOS = {f"{d}_{k}_{l}" for d in ("index", "middle", "ring", "pinky", "thumb") for k in ("01", "02", "03") for l in ("l", "r")} | {"hand_l", "hand_r"}
casca("peitoral", TRONCO | {"neck_01"}, 0.50, 0.855, 0.028, ACO, facetado=0.7)
for lado, s_ in (("D", "r"), ("E", "l")):
    casca(f"ombreira_{lado}", {f"upperarm_{s_}", f"clavicle_{s_}"}, 0.74, 0.86, 0.045, ACO_CLARO, facetado=0.7)
    casca(f"braco_{lado}", {f"upperarm_{s_}", f"lowerarm_{s_}"}, 0.0, 0.80, 0.016, ACO, facetado=0.8)
casca("manoplas", MAOS, 0.0, 1.0, 0.005, ACO_ESCURO, espessura=0.006)
casca("faldas", {"pelvis", "thigh_l", "thigh_r", "spine_01"}, 0.42, 0.56, 0.03, ACO, facetado=0.7)
casca("pernas", {"thigh_l", "thigh_r", "calf_l", "calf_r"}, 0.065, 0.53, 0.014, ACO, facetado=0.8)
casca("cinto", TRONCO, 0.548, 0.588, 0.042, ACENTO, espessura=0.012)

# ---- BOTAS (slot dos pés): calçado de placa até o tornozelo, faixa laranja no cano
PES = {"foot_l", "foot_r", "ball_l", "ball_r", "calf_l", "calf_r"}
casca("sapatos", PES, 0.0, 0.10, 0.016, ACO_CLARO, facetado=0.85, espessura=0.01, colecao_nome="botas")
casca("botas_aro", {"calf_l", "calf_r", "foot_l", "foot_r"}, 0.082, 0.105, 0.024, ACENTO, espessura=0.008, colecao_nome="botas")

# ---- ELMO: elmo fechado com fenda do visor, nervura central e crista (acento) de frente para trás
cab_pts = pontos({"head"}, 0.885, 1.0) + [cab.matrix_world @ v.co for v in cab.data.vertices]
cx = sum(p.x for p in cab_pts) / len(cab_pts); cy = sum(p.y for p in cab_pts) / len(cab_pts)
zmin = 0.878 * ALTURA; zmax = max(p.z for p in cab_pts)
rx = max(abs(p.x - cx) for p in cab_pts); ry = max(abs(p.y - cy) for p in cab_pts)
R = max(rx, ry) * 1.05; H = (zmax - zmin) * 0.76   # rente à cabeça (antes 1.16: cabeção)
REF_CAB = Matrix.Translation(Vector((cx, cy, zmin)))
peca_em("elmo", "primitive_cylinder_add", (0, 0, H / 2), (1, 1.05, 1), ACO, REF_CAB, "head", "elmo", vertices=16, radius=R, depth=H)
peca_em("elmo_topo", "primitive_uv_sphere_add", (0, 0, H * 0.98), (1, 1.05, 0.80), ACO, REF_CAB, "head", "elmo", bevel=0, liso=True, segments=16, ring_count=8, radius=R)
z_olho = (0.935 * ALTURA) - zmin
peca_em("visor_fenda", "primitive_cube_add", (0, -R * 1.02, z_olho), (R * 1.15, 0.03, 0.022), FENDA, REF_CAB, "head", "elmo", bevel=0, size=1)
peca_em("visor_nervura", "primitive_cube_add", (0, -R * 1.04, H * 0.45), (0.018, 0.02, H * 0.95), ACO_CLARO, REF_CAB, "head", "elmo", size=1)
peca_em("elmo_aro", "primitive_cylinder_add", (0, 0, 0.012), (1, 1.05, 1), ACO_CLARO, REF_CAB, "head", "elmo", vertices=16, radius=R * 1.02, depth=0.024)
for k, (yy, zz, alto) in enumerate(((-0.7, 1.16, 0.045), (-0.35, 1.26, 0.065), (0.0, 1.29, 0.075), (0.35, 1.26, 0.07), (0.7, 1.14, 0.06))):
    peca_em(f"crista_{k}", "primitive_cube_add", (0, yy * R, H * zz - 0.012), (0.028, R * 0.42, alto), ACENTO, REF_CAB, "head", "elmo", size=1)

# ---- CAPA: tecido cinza-amarronzado atrás, forro escuro, faixas laranja nos ombros, fecho de metal
costas = pontos({"spine_02", "spine_03"}, 0.70, 0.80)          # só o tronco (sem braços)
y_costas = max(p.y for p in costas); larg = max(abs(p.x) for p in costas) * 0.95
z_ombro = 0.815 * ALTURA; z_barra = 0.30 * ALTURA
bpy.ops.mesh.primitive_grid_add(x_subdivisions=8, y_subdivisions=14, size=1)
capa = bpy.context.object; capa.name = "capa_m"
for v in capa.data.vertices:
    u, t = v.co.x + 0.5, v.co.y + 0.5                        # u: de um lado ao outro; t: 0 = barra, 1 = ombro
    largura = larg * (1 + (1 - t) * 0.45)                     # abre um pouco para baixo
    z = z_barra + t * (z_ombro - z_barra)
    th = (u - 0.5) * math.pi * 0.75                           # curva em volta das costas (as bordas vêm para a frente)
    x = math.sin(th) * largura
    y = y_costas + 0.035 - (1 - math.cos(th)) * largura * 0.55 + (1 - t) ** 1.4 * 0.17   # cai atrás, afastada das pernas
    dobra = 0.014 * math.sin(u * math.pi * 7) * (1 - t)       # dobras na barra
    v.co = Vector((x, y + dobra, z))
for p in capa.data.polygons: p.use_smooth = True
capa.data.materials.append(TECIDO); capa.data.materials.append(TECIDO_ESC)
sl = capa.modifiers.new("espessura", "SOLIDIFY"); sl.thickness = 0.014; sl.material_offset = 1
mw = capa.matrix_world.copy(); capa.parent = rig; capa.parent_type = "BONE"; capa.parent_bone = "spine_03"
bpy.context.view_layer.update(); capa.matrix_world = mw; mover_para(capa, "capa")
for lado, sx in (("D", -1), ("E", 1)):
    REF_OMBRO = Matrix.Translation(Vector((sx * larg * 0.62, y_costas - 0.02, z_ombro + 0.005)))
    peca_em(f"capa_faixa_{lado}", "primitive_cube_add", (0, 0, 0), (larg * 0.62, 0.16, 0.03), ACENTO, REF_OMBRO, "spine_03", "capa", size=1)
pescoco = pontos({"neck_01"}, 0.80, 0.86)
y_frente = min(p.y for p in pescoco) - 0.02
peca_em("capa_fecho", "primitive_cube_add", (0, 0, 0), (0.07, 0.025, 0.045), ACO_CLARO, Matrix.Translation(Vector((0, y_frente, 0.83 * ALTURA))), "spine_03", "capa", size=1)

# ---- ESPADA DE UMA MÃO: lâmina clara, guarda com acabamento laranja (acento), cabo de couro, pomo escuro
REF = encaixe_mao("r") @ Matrix.Rotation(math.pi, 4, "X")   # local -Z (ponta) = lado do polegar
COMP = 0.70
peca_em("cabo", "primitive_cylinder_add", (0, 0, 0.0), (1, 1, 1), COURO, REF, "hand_r", "espada", vertices=10, radius=0.022, depth=0.17)
peca_em("pomo", "primitive_uv_sphere_add", (0, 0, 0.10), (1, 1, 1), ACO_ESCURO, REF, "hand_r", "espada", bevel=0, segments=12, ring_count=8, radius=0.034)
peca_em("guarda", "primitive_cube_add", (0, 0, -0.10), (0.20, 0.045, 0.035), ACO_CLARO, REF, "hand_r", "espada", size=1)
peca_em("guarda_acab", "primitive_cube_add", (0, 0, -0.10), (0.215, 0.05, 0.016), ACENTO, REF, "hand_r", "espada", bevel=0, size=1)
peca_em("lamina", "primitive_cube_add", (0, 0, -0.12 - COMP / 2), (0.085, 0.024, COMP), LAMINA, REF, "hand_r", "espada", bevel=0.008, size=1)
peca_em("ponta", "primitive_cone_add", (0, 0, -0.12 - COMP - 0.05), (1, 0.28, 1), LAMINA, REF, "hand_r", "espada", vertices=4, radius1=0.06, radius2=0.0, depth=0.10, rotation=(math.pi, 0, math.radians(45)))

# ---- ESCUDO REDONDO no antebraço esquerdo: face de aço claro, umbo, aro, 4 placas laranja na borda; costas com alças de couro
ab0, ab1 = cabeca_mundo("lowerarm_l"), cabeca_mundo("hand_l")
fora_ = Vector((1, -0.55, 0)).normalized()                    # a face olha para fora e um pouco para a frente
centro_esc = ab0.lerp(ab1, 0.55) + fora_ * 0.075
zz_ = fora_; xx_ = Vector((0, 0, 1)).cross(zz_).normalized(); yy_ = zz_.cross(xx_)
REF_ESC = Matrix((xx_, yy_, zz_)).transposed().to_4x4(); REF_ESC.translation = centro_esc
RE = 0.27
peca_em("escudo_face", "primitive_cylinder_add", (0, 0, 0), (1, 1, 1), ACO, REF_ESC, "lowerarm_l", "escudo", vertices=28, radius=RE, depth=0.03)
peca_em("escudo_aro", "primitive_cylinder_add", (0, 0, 0.004), (1, 1, 1), ACO_CLARO, REF_ESC, "lowerarm_l", "escudo", vertices=28, radius=RE * 1.04, depth=0.026)
peca_em("escudo_umbo", "primitive_uv_sphere_add", (0, 0, 0.022), (1, 1, 0.55), ACO_CLARO, REF_ESC, "lowerarm_l", "escudo", bevel=0, liso=True, segments=16, ring_count=8, radius=0.07)
for k in range(4):
    a_ = k * math.pi / 2
    peca_em(f"escudo_placa_{k}", "primitive_cube_add", (math.cos(a_) * RE * 0.99, math.sin(a_) * RE * 0.99, 0.006), (0.05, 0.05, 0.036), ACENTO, REF_ESC @ Matrix.Rotation(a_, 4, "Z"), "lowerarm_l", "escudo", size=1)
for k, a_ in enumerate((0, math.pi / 2)):
    peca_em(f"escudo_alca_{k}", "primitive_cube_add", (0, 0, -0.024), (RE * 1.5, 0.045, 0.012), COURO, REF_ESC @ Matrix.Rotation(a_, 4, "Z"), "lowerarm_l", "escudo", size=1)

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
        elif camada == "cabelo": lc.exclude = nome not in ("corpo", "cabelo"); lc.holdout = nome == "corpo"
        else: lc.exclude = nome not in ("corpo", pc); lc.holdout = nome == "corpo"
    if acento:
        for o in COLECOES[pc].objects:
            if o.type == "MESH":
                for s in o.material_slots: s.material = BRANCO if ORIG[o.name][0] is ACENTO else HOLD

PECAS = ["botas", "couraca", "capa", "elmo", "espada", "escudo"]
CAMADAS = ["corpo", "cabelo"] + [c for p_ in PECAS for c in (p_, p_ + "_acento")]
if "--close" in argv:
    restaurar()
    for nome in COLECOES:
        if nome != "cena": lc = bpy.context.view_layer.layer_collection.children[nome]; lc.exclude = False; lc.holdout = False
    os.makedirs(SAIDA, exist_ok=True)
    print("polegar (dist, r1, r2, curl):", POLEGAR.get("r"))
    for nome_pose, pp in (("idle", IDLE[0]), ("walk1", WALK[0]), ("walk4", WALK[3])):  # walk4 = fase 3/8
        pose(**pp)
        for az in (-45, -90, 0, -135):
            for zoom, centro in ((0.55, cabeca_mundo("hand_r")), (1.1, cabeca_mundo("upperarm_r")), (2.5, ALVO)):
                a_ = math.radians(az); cam.data.ortho_scale = zoom
                cam.location = centro + Vector((math.sin(a_) * math.cos(ELEV) * 6, -math.cos(a_) * math.cos(ELEV) * 6, math.sin(ELEV) * 6))
                cam.rotation_euler = (centro - cam.location).to_track_quat("-Z", "Y").to_euler()
                sol.rotation_euler = Euler((math.radians(48), 0, a_ - math.radians(35)), "XYZ")
                r.filepath = os.path.join(SAIDA, f"close_{nome_pose}_az{az}_{'mao' if zoom < 1 else ('braco' if zoom < 2 else 'corpo')}.png"); bpy.ops.render.render(write_still=True)
    print("ok close"); sys.exit(0)
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
