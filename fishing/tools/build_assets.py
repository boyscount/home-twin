# ปั้นโมเดลทั้งหมดของเกมตกปลา แล้ว export เป็น fishing/models/assets.glb
# รัน: "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python fishing/tools/build_assets.py
# ทุกชิ้นวางที่จุดกำเนิด (เกมโคลนตามชื่อ) · สีมาจากชื่อวัสดุ (Rock/Bark/Pine/Leaf/...) เกมเปลี่ยนเป็น toon shading เอง
# พิกัด Blender: Z ขึ้น, ตัวละครหันหน้าไป -Y (export แล้วกลายเป็น +Z ของ three.js)
import bpy, bmesh, math, random, pathlib
from mathutils import Vector, Matrix, noise

OUT = pathlib.Path(__file__).resolve().parent.parent / 'models' / 'assets.glb'
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

MATS = {}
COLORS = {
    'Rock': (0.46, 0.44, 0.40), 'Cliff': (0.52, 0.47, 0.41), 'Bark': (0.36, 0.24, 0.16),
    'Pine': (0.16, 0.40, 0.25), 'Leaf': (0.30, 0.55, 0.24), 'Leaf2': (0.40, 0.62, 0.26),
    'Skin': (0.93, 0.74, 0.58), 'Shirt': (0.20, 0.32, 0.55), 'Pants': (0.22, 0.20, 0.24),
    'Hat': (0.88, 0.74, 0.44), 'HatBand': (0.70, 0.30, 0.22), 'Rod': (0.80, 0.66, 0.38),
    'Fish': (1.0, 1.0, 1.0), 'FishFin': (0.85, 0.85, 0.85), 'Eye': (0.05, 0.05, 0.06),
    'Wood': (0.62, 0.45, 0.30), 'WoodDark': (0.42, 0.30, 0.21), 'Hair': (0.10, 0.08, 0.07),
    'BoatPaint': (0.15, 0.45, 0.55), 'BoatRed': (0.70, 0.20, 0.15), 'Ribbon': (0.95, 0.45, 0.65), 'Ribbon2': (0.98, 0.82, 0.25),
    'Metal': (0.30, 0.30, 0.32), 'Roof': (0.55, 0.28, 0.20), 'Window': (0.12, 0.10, 0.09),
    'Palm': (0.35, 0.60, 0.25), 'PalmTrunk': (0.55, 0.42, 0.30), 'Karst': (0.75, 0.72, 0.66),
}


def mat(name):
    if name not in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        c = COLORS[name]
        bsdf.inputs['Base Color'].default_value = (c[0], c[1], c[2], 1.0)
        bsdf.inputs['Roughness'].default_value = 0.9
        MATS[name] = m
    return MATS[name]


def make_obj(name, bm, mats, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mname in mats:
        me.materials.append(mat(mname))
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    if parent:
        ob.parent = parent
    return ob


def empty(name, loc=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    scene.collection.objects.link(ob)
    ob.location = loc
    if parent:
        ob.parent = parent
    return ob


def add_ico(bm, r=1.0, sub=2, loc=(0, 0, 0), scale=(1, 1, 1), mi=0, jitter=0.0, seed=0):
    res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    vs = res['verts']
    for v in vs:
        if jitter:
            n = noise.noise(v.co * 1.7 + Vector((seed, seed * 2, seed * 3)))
            v.co *= 1 + n * jitter
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(loc)
    faces = {f for v in vs for f in v.link_faces}
    for f in faces:
        f.material_index = mi
    return vs


def add_cone(bm, r1, r2, depth, loc=(0, 0, 0), seg=8, mi=0, rot=None):
    res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=depth)
    vs = res['verts']
    m = Matrix.Translation(Vector(loc)) @ (rot.to_4x4() if rot else Matrix.Identity(4)) @ Matrix.Translation((0, 0, depth / 2))
    bmesh.ops.transform(bm, matrix=m, verts=vs)
    for f in {f for v in vs for f in v.link_faces}:
        f.material_index = mi
    return vs


def add_box(bm, size, loc=(0, 0, 0), mi=0):
    res = bmesh.ops.create_cube(bm, size=1.0)
    vs = res['verts']
    for v in vs:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(loc)
    for f in {f for v in vs for f in v.link_faces}:
        f.material_index = mi
    return vs


# ---------------- หน้าผา: กำแพงหินโค้งเป็นชั้น ๆ ล้อมแอ่งน้ำด้านหลัง ----------------
# จุดศูนย์กลางโค้ง = จุดกำเนิด (เกมวางให้ตรงกลางแอ่งน้ำ) · หน้าผาหันเข้าหาจุดศูนย์กลาง · ช่องน้ำตกอยู่ที่ -Y (ด้านหลัง) → ในเกมคือ -Z
def build_cliff():
    bm = bmesh.new()
    R, H, DEPTH = 7.6, 8.0, 9.0
    A0, A1 = math.radians(-115), math.radians(115)   # มุมวัดจากแกน -Y (ช่องน้ำตกที่ 0)
    NA, NH = 56, 14

    def top_h(a):
        notch = 1.0 - 0.9 * math.exp(-(a / 0.12) ** 2)   # ร่องน้ำตกตรงกลาง
        side = 1.0 - 0.35 * max(0.0, (abs(a) - 1.2)) / 0.8   # ปลายสองข้างเตี้ยลง
        return H * side + (notch - 1.0) * 0.9 + noise.noise(Vector((a * 2.0, 0.3, 0.7))) * 0.6

    def radius(a, h):
        step = math.floor(h / 1.6) * 0.32                       # ชั้นหิน
        n = noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, h * 0.45)))
        return R + step + n * 0.75 + 0.25 * math.sin(a * 7.0)

    def pos(a, r, z):
        return Vector((math.sin(a) * r, -math.cos(a) * r, z))

    grid = []
    for i in range(NA + 1):
        a = A0 + (A1 - A0) * i / NA
        th = top_h(a)
        col = []
        for j in range(NH + 1):
            z = -1.5 + (th + 1.5) * j / NH
            col.append(bm.verts.new(pos(a, radius(a, z), z)))
        # ขอบบน → ยื่นไปด้านหลังเป็นที่ราบ
        col.append(bm.verts.new(pos(a, radius(a, th) + 0.6, th + 0.12)))
        col.append(bm.verts.new(pos(a, R + DEPTH, th + 0.25 + noise.noise(Vector((a * 3, 2, 1))) * 0.4)))
        col.append(bm.verts.new(pos(a, R + DEPTH, -1.5)))
        grid.append(col)
    rows = len(grid[0])
    for i in range(NA):
        for j in range(rows - 1):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    # ปิดปลายสองข้าง
    for col, flip in ((grid[0], True), (grid[-1], False)):
        vs = list(col)
        try:
            f = bm.faces.new(vs[::-1] if flip else vs)
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # หน้าตัดต้องหันเข้าหาจุดศูนย์กลาง: ตรวจหน้าแรก
    f0 = bm.faces[0] if hasattr(bm.faces, '__getitem__') else None
    bm.faces.ensure_lookup_table()
    f0 = bm.faces[NH // 2]
    c = f0.calc_center_median()
    if f0.normal.dot(-c.normalized()) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    make_obj('Cliff', bm, ['Cliff'])


# ---------------- หิน 4 แบบ ----------------
def build_rocks():
    shapes = [(1.0, 0.85, 0.6), (1.3, 0.9, 0.55), (0.8, 0.8, 0.9), (1.6, 1.1, 0.5)]
    for k, s in enumerate(shapes):
        bm = bmesh.new()
        add_ico(bm, 1.0, 2, loc=(0, 0, s[2] * 0.55), scale=s, jitter=0.35, seed=k * 5 + 1)
        # ตัดก้นให้แบนเล็กน้อย
        for v in bm.verts:
            if v.co.z < 0:
                v.co.z *= 0.3
        make_obj(f'Rock{k + 1}', bm, ['Rock'])


# ---------------- ต้นสน ----------------
def build_pine(name, tiers=4, h=6.0):
    bm = bmesh.new()
    add_cone(bm, 0.22, 0.14, h * 0.45, seg=7, mi=0)
    for t in range(tiers):
        f = t / tiers
        r = 1.7 * (1 - f * 0.7)
        z = h * 0.22 + f * h * 0.62
        vs = add_cone(bm, r, 0.05, h * 0.36, loc=(0, 0, z), seg=9, mi=1)
        for v in vs:
            v.co.x += noise.noise(v.co * 2.1) * 0.15
            v.co.y += noise.noise(v.co * 2.3 + Vector((3, 1, 2))) * 0.15
            if v.co.z < z + 0.05:          # ขอบล่างของแต่ละชั้นหยัก ๆ
                v.co.z += math.sin(math.atan2(v.co.y, v.co.x) * 4 + t) * 0.12
    make_obj(name, bm, ['Bark', 'Pine'])


# ---------------- ต้นไม้ใบกว้าง ----------------
def build_tree(name, h=5.0, seed=0):
    bm = bmesh.new()
    add_cone(bm, 0.35, 0.18, h * 0.6, seg=7, mi=0)
    add_cone(bm, 0.12, 0.05, 1.4, loc=(0, 0, h * 0.4), seg=5, mi=0, rot=Matrix.Rotation(math.radians(50), 3, 'Y'))
    add_cone(bm, 0.12, 0.05, 1.3, loc=(0, 0, h * 0.45), seg=5, mi=0, rot=Matrix.Rotation(math.radians(-45), 3, 'X'))
    rnd = random.Random(seed)
    blobs = [(0, 0, h * 0.82, 1.7)] + [(math.cos(a) * 1.25, math.sin(a) * 1.25, h * 0.68 + rnd.uniform(-0.2, 0.5), rnd.uniform(1.0, 1.3))
                                        for a in [rnd.uniform(0, 6.28) + i * 2.1 for i in range(3)]] + [(0.3, -0.4, h * 1.05, 1.1)]
    for i, (x, y, z, r) in enumerate(blobs):
        add_ico(bm, r, 1, loc=(x, y, z), scale=(1, 1, 0.82), mi=1, jitter=0.28, seed=seed * 10 + i)
    make_obj(name, bm, ['Bark', 'Leaf'])


# ---------------- พุ่มไม้ ----------------
def build_bush():
    bm = bmesh.new()
    for i, (x, y, r) in enumerate([(0, 0, 0.75), (0.6, 0.2, 0.55), (-0.55, 0.15, 0.6), (0.1, -0.5, 0.5)]):
        add_ico(bm, r, 1, loc=(x, y, r * 0.6), scale=(1, 1, 0.85), jitter=0.25, seed=40 + i)
    make_obj('Bush', bm, ['Leaf2'])


# ---------------- ท่าเรือไม้เล็ก ๆ ----------------
def build_dock():
    bm = bmesh.new()
    L, W = 4.4, 1.5
    n = 13
    for i in range(n):
        y = -i * (L / n) - 0.17
        add_box(bm, (W + random.uniform(-0.06, 0.1), L / n - 0.04, 0.07), loc=(random.uniform(-0.04, 0.04), y, 0), mi=0)
    for (x, y) in [(-W / 2 + 0.08, -0.3), (W / 2 - 0.08, -0.3), (-W / 2 + 0.08, -L + 0.2), (W / 2 - 0.08, -L + 0.2), (-W / 2 + 0.08, -L / 2), (W / 2 - 0.08, -L / 2)]:
        add_cone(bm, 0.09, 0.08, 1.6, loc=(x, y, -1.45), seg=6, mi=1)
    add_box(bm, (0.1, L - 0.2, 0.1), loc=(-W / 2 + 0.08, -L / 2, -0.09), mi=1)
    add_box(bm, (0.1, L - 0.2, 0.1), loc=(W / 2 - 0.08, -L / 2, -0.09), mi=1)
    make_obj('Dock', bm, ['Wood', 'WoodDark'])


# ---------------- ตัวละคร: ชาวประมงใส่หมวกงอบ ----------------
def build_fisher():
    root = empty('Fisher')
    # ลำตัว (เสื้อม่อฮ่อม)
    bm = bmesh.new()
    vs = add_box(bm, (0.42, 0.28, 0.5), loc=(0, 0, 0.82))
    for v in vs:
        if v.co.z > 0.9:
            v.co.x *= 0.92
    add_box(bm, (0.4, 0.27, 0.12), loc=(0, 0, 0.6), mi=1)   # เอว/กางเกง
    body = make_obj('Body', bm, ['Shirt', 'Pants'], parent=root)
    # หัว
    bm = bmesh.new()
    add_ico(bm, 0.21, 2, loc=(0, 0, 0), scale=(1, 0.95, 1.05))
    add_ico(bm, 0.205, 2, loc=(0, 0.035, 0.03), scale=(1.02, 0.95, 1.0), mi=1)   # ผม ด้านหลัง
    add_ico(bm, 0.025, 1, loc=(0.075, -0.19, 0.02), mi=2)
    add_ico(bm, 0.025, 1, loc=(-0.075, -0.19, 0.02), mi=2)
    head = make_obj('Head', bm, ['Skin', 'Hair', 'Eye'], loc=(0, 0, 1.3), parent=root)
    # หมวกงอบ
    bm = bmesh.new()
    add_cone(bm, 0.42, 0.03, 0.2, loc=(0, 0, 0), seg=16, mi=0)
    add_cone(bm, 0.2, 0.17, 0.05, loc=(0, 0, 0.05), seg=16, mi=1)
    add_cone(bm, 0.05, 0.0, 0.06, loc=(0, 0, 0.19), seg=8, mi=0)
    make_obj('Hat', bm, ['Hat', 'HatBand'], loc=(0, 0, 0.12), parent=head)
    # ขา (จุดหมุนที่สะโพก)
    for side, x in (('L', 0.1), ('R', -0.1)):
        bm = bmesh.new()
        add_box(bm, (0.15, 0.17, 0.5), loc=(0, 0, -0.25), mi=0)
        add_box(bm, (0.16, 0.24, 0.08), loc=(0, -0.03, -0.5), mi=1)
        make_obj('Leg' + side, bm, ['Pants', 'Hair'], loc=(x, 0, 0.56), parent=root)
    # แขน (จุดหมุนที่ไหล่)
    arms = {}
    for side, x in (('L', 0.27), ('R', -0.27)):
        bm = bmesh.new()
        add_box(bm, (0.12, 0.13, 0.36), loc=(0, 0, -0.17), mi=0)
        add_ico(bm, 0.07, 1, loc=(0, 0, -0.39), mi=1)
        arms[side] = make_obj('Arm' + side, bm, ['Shirt', 'Skin'], loc=(x, 0, 1.03), parent=root)
    # คันเบ็ดไม้ไผ่ ในมือขวา ชี้ไปข้างหน้าและขึ้น
    bm = bmesh.new()
    L = 2.3
    add_cone(bm, 0.025, 0.008, L, seg=6, mi=0)
    for k in range(1, 6):                      # ข้อไม้ไผ่
        add_cone(bm, 0.032 - k * 0.003, 0.03 - k * 0.003, 0.03, loc=(0, 0, k * L / 6), seg=6, mi=1)
    add_cone(bm, 0.05, 0.05, 0.06, loc=(0.0, 0.05, 0.3), seg=8, mi=1, rot=Matrix.Rotation(math.radians(90), 3, 'X'))  # รอก
    rod = make_obj('Rod', bm, ['Rod', 'WoodDark'], loc=(0, -0.02, -0.39), rot=(math.radians(55), 0, 0), parent=arms['R'])
    empty('RodTip', loc=(0, 0, L), parent=rod)


# ---------------- ปลา (ตัวเดียว เกมย้อมสี/ยืดตามชนิด) ----------------
def build_fish():
    bm = bmesh.new()
    vs = add_ico(bm, 1.0, 2, loc=(0, 0, 0), scale=(0.5, 0.11, 0.17))
    for v in vs:                 # หัวมน ท้ายเรียว
        if v.co.x < 0:
            t = -v.co.x / 0.5
            v.co.y *= 1 - t * 0.55
            v.co.z *= 1 - t * 0.45
    # หาง
    t0 = bm.verts.new((-0.42, 0, 0))
    t1 = bm.verts.new((-0.68, 0, 0.17))
    t2 = bm.verts.new((-0.62, 0, 0))
    t3 = bm.verts.new((-0.68, 0, -0.17))
    for tri in ((t0, t1, t2), (t0, t2, t3)):
        f = bm.faces.new(tri)
        f.material_index = 1
    # ครีบหลัง
    d0 = bm.verts.new((0.12, 0, 0.15)); d1 = bm.verts.new((-0.05, 0, 0.29)); d2 = bm.verts.new((-0.26, 0, 0.1))
    f = bm.faces.new((d0, d1, d2)); f.material_index = 1
    # ตา
    add_ico(bm, 0.03, 1, loc=(0.36, -0.07, 0.04), mi=2)
    add_ico(bm, 0.03, 1, loc=(0.36, 0.07, 0.04), mi=2)
    make_obj('Fish', bm, ['Fish', 'FishFin', 'Eye'])



# ---------------- เรือหางยาว (ยาวตามแกน X, หัวเรือที่ +X) ----------------
def build_boat():
    bm = bmesh.new()
    N = 22
    secs = []
    for i in range(N + 1):
        x = -3.8 + 7.8 * i / N
        f = (x + 0.3) / 3.5
        w = max(0.05, 0.72 * (1 - max(0.0, f) ** 3) * (1 - max(0.0, -f - 0.6) * 0.5))
        top = 0.38 + (max(0.0, x - 1.8) / 2.0) ** 2 * 0.95
        bot = -0.34 * (1 - max(0.0, x - 2.6) / 1.6)
        prof = [(-w, top), (-w * 0.93, 0.05), (-w * 0.55, bot * 0.85), (0, bot), (w * 0.55, bot * 0.85), (w * 0.93, 0.05), (w, top)]
        secs.append([bm.verts.new((x, y, z)) for y, z in prof])
    for i in range(N):
        a, b = secs[i], secs[i + 1]
        for j in range(len(a) - 1):
            f = bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
            f.material_index = 0 if j in (0, 5) else 1
    f = bm.faces.new(secs[0][::-1]); f.material_index = 1
    # ผนังด้านใน + พื้นเรือ (หันเข้าด้านใน)
    inner = []
    for i in range(N + 1):
        a = secs[i]
        x = a[0].co.x
        w = abs(a[0].co.y) * 0.9
        top = a[0].co.z - 0.02
        inner.append([bm.verts.new((x, -w, top)), bm.verts.new((x, -w, 0.06)), bm.verts.new((x, w, 0.06)), bm.verts.new((x, w, top))])
    for i in range(N):
        a, b = inner[i], inner[i + 1]
        for j in range(3):
            f = bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
            f.material_index = 2 if j == 1 else 3
    for x in (-1.6, 0.9):
        add_box(bm, (0.3, 1.2, 0.05), loc=(x, 0, 0.3), mi=3)
    add_box(bm, (0.5, 0.35, 0.35), loc=(-3.75, 0, 0.7), mi=4)
    add_cone(bm, 0.04, 0.04, 3.2, loc=(-3.9, 0, 0.6), seg=6, mi=4, rot=Matrix.Rotation(math.radians(-100), 3, 'Y'))
    for k, (mi, dz) in enumerate(((5, 0.0), (6, -0.08), (5, -0.16))):
        add_box(bm, (0.08, 0.16, 0.09), loc=(3.85 - k * 0.07, 0, 1.3 + dz), mi=mi)
    make_obj('Boat', bm, ['BoatPaint', 'BoatRed', 'Wood', 'WoodDark', 'Metal', 'Ribbon', 'Ribbon2'])


def slab(bm, corners, thick, mi):
    """แผ่นหนาจาก 4 มุม (เรียงทวนเข็ม มองจากด้านบน)"""
    a, b, c, d = [Vector(p) for p in corners]
    n = (b - a).cross(d - a).normalized() * thick
    top = [bm.verts.new(p) for p in (a, b, c, d)]
    bot = [bm.verts.new(p - n) for p in (a, b, c, d)]
    fs = [bm.faces.new(top), bm.faces.new(bot[::-1])]
    for i in range(4):
        j = (i + 1) % 4
        fs.append(bm.faces.new((top[j], top[i], bot[i], bot[j])))
    for f in fs:
        f.material_index = mi


# ---------------- บ้านไม้ใต้ถุนสูง (หน้าบ้านหัน -Y) ----------------
def build_house():
    bm = bmesh.new()
    for x in (-2.4, 0, 2.4):
        for y in (-3.0, -1.8, 0, 1.8):
            add_cone(bm, 0.12, 0.11, 2.0, loc=(x, y, 0), seg=6, mi=1)
    add_box(bm, (5.4, 4.2, 0.15), loc=(0, 0, 2.0), mi=0)
    add_box(bm, (5.4, 1.3, 0.12), loc=(0, -2.75, 1.98), mi=0)
    W, D, H = 5.0, 3.8, 2.1
    zc = 2.07 + H / 2
    add_box(bm, (W, 0.1, H), loc=(0, D / 2, zc), mi=0)
    add_box(bm, (0.1, D, H), loc=(-W / 2, 0, zc), mi=0)
    add_box(bm, (0.1, D, H), loc=(W / 2, 0, zc), mi=0)
    add_box(bm, (1.9, 0.1, H), loc=(-1.55, -D / 2, zc), mi=0)
    add_box(bm, (1.9, 0.1, H), loc=(1.55, -D / 2, zc), mi=0)
    add_box(bm, (1.2, 0.1, 0.5), loc=(0, -D / 2, 2.07 + H - 0.25), mi=0)
    for x in (-1.5, 1.5):
        add_box(bm, (0.8, 0.12, 0.7), loc=(x, -D / 2, 3.3), mi=3)
    add_box(bm, (0.12, 0.8, 0.7), loc=(W / 2, 0, 3.3), mi=3)
    add_box(bm, (0.12, 0.8, 0.7), loc=(-W / 2, 0, 3.3), mi=3)
    # ราวระเบียง
    add_box(bm, (5.4, 0.06, 0.06), loc=(0, -3.38, 2.65), mi=1)
    for x in (-2.6, -1.3, 0, 1.3):
        add_box(bm, (0.06, 0.06, 0.6), loc=(x, -3.38, 2.35), mi=1)
    # หลังคาจั่วทรงสูง
    ridge, eave, X = 6.0, 3.7, 3.2
    slab(bm, [(-X, -3.0, eave), (X, -3.0, eave), (X, 0, ridge), (-X, 0, ridge)], 0.1, 2)
    slab(bm, [(X, 3.0, eave), (-X, 3.0, eave), (-X, 0, ridge), (X, 0, ridge)], 0.1, 2)
    for x in (-2.55, 2.55):
        a = bm.verts.new((x, -2.2, 4.17)); b = bm.verts.new((x, 2.2, 4.17)); c = bm.verts.new((x, 0, ridge - 0.12))
        f = bm.faces.new((a, b, c) if x > 0 else (c, b, a)); f.material_index = 0
    # บันได
    for k in range(7):
        add_box(bm, (1.0, 0.3, 0.07), loc=(3.25, -2.9 + k * 0.0, 0.2 + k * 0.27), mi=1)
    make_obj('House', bm, ['Wood', 'WoodDark', 'Roof', 'Window'])


# ---------------- มะพร้าว ----------------
def build_palm():
    bm = bmesh.new()
    pts = [Vector((math.sin(t * 1.3) * 0.9 * t, 0, t * 6.5)) for t in [i / 8 for i in range(9)]]
    for i in range(8):
        a, b = pts[i], pts[i + 1]
        d = b - a
        r = 0.22 - i * 0.012
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
        add_cone(bm, r, r * 0.92, d.length * 1.05, loc=tuple(a), seg=7, mi=0, rot=rot)
    top = pts[-1]
    for k in range(8):
        ang = k * math.tau / 8 + 0.2
        dirv = Vector((math.cos(ang), math.sin(ang), 0))
        side = Vector((-dirv.y, dirv.x, 0))
        prev = None
        for j in range(6):
            t = j / 5
            c = top + dirv * (t * 2.6) + Vector((0, 0, 0.5 * math.sin(t * 2.2) - t * t * 1.3))
            w = 0.45 * math.sin(min(1.0, t * 1.2 + 0.05) * math.pi) + 0.03
            l = bm.verts.new(c - side * w); r = bm.verts.new(c + side * w)
            if prev:
                f = bm.faces.new((prev[0], prev[1], r, l)); f.material_index = 1
            prev = (l, r)
    for k in range(3):
        add_ico(bm, 0.16, 1, loc=(top.x + math.cos(k * 2.1) * 0.2, math.sin(k * 2.1) * 0.2, top.z - 0.15), mi=0)
    make_obj('Palm', bm, ['PalmTrunk', 'Palm'])


# ---------------- เขาหินปูนกลางทะเล ----------------
def build_karst():
    bm = bmesh.new()
    rings, segs, H = 14, 18, 18.0
    grid = []
    for j in range(rings + 1):
        z = H * j / rings - 2
        t = j / rings
        row = []
        for i in range(segs):
            a = math.tau * i / segs
            r = 3.6 * (1 - t * 0.35) + math.sin(t * 5) * 0.4 + noise.noise(Vector((math.cos(a) * 1.5, math.sin(a) * 1.5, z * 0.25))) * 1.1
            if t > 0.75:
                r += (t - 0.75) * 3.0
            row.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
        grid.append(row)
    for j in range(rings):
        for i in range(segs):
            a, b, c, d = grid[j][i], grid[j][(i + 1) % segs], grid[j + 1][(i + 1) % segs], grid[j + 1][i]
            f = bm.faces.new((a, b, c, d)); f.material_index = 0
    f = bm.faces.new(grid[-1]); f.material_index = 1
    for k in range(6):
        a = k * 1.05
        add_ico(bm, 1.6, 1, loc=(math.cos(a) * 1.8, math.sin(a) * 1.8, H - 2.6 + (k % 2) * 0.4), scale=(1, 1, 0.6), mi=1, jitter=0.3, seed=k + 70)
    for k in range(5):
        a = k * 1.3 + 0.4
        add_ico(bm, 0.9, 1, loc=(math.cos(a) * 3.4, math.sin(a) * 3.4, 4 + k * 2.2), scale=(1, 1, 0.6), mi=1, jitter=0.3, seed=k + 90)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    make_obj('Karst', bm, ['Karst', 'Leaf'])


build_cliff()
build_rocks()
build_pine('Pine1', 4, 6.5)
build_pine('Pine2', 5, 8.0)
build_tree('Tree1', 5.0, 1)
build_tree('Tree2', 4.2, 2)
build_bush()
build_dock()
build_fisher()
build_fish()
build_boat()
build_house()
build_palm()
build_karst()

OUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', export_apply=True, export_yup=True,
                          export_vertex_color='NONE', export_animations=False, export_cameras=False, export_lights=False)
print('EXPORTED', OUT, OUT.stat().st_size)
