"""Builds the walk test corner (Queen Street East at River Street, as the 1911 plan draws it) and
exports it for Unity.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        -P tools/blender/corner_1911.py -- [--preview DIR] [--no-export]

What comes from the plan (data/tiles/fip_v3_1911_229.json, data/evidence/fip_v3_1911_229.geojson):
every outline, every position, the storeys where the plan letters them, the street lines, the hydrant.
What is imagined: wall materials, windows, doors, signs' paint, lamps, poles, heights per storey.

Coordinates: project-local metres. Blender x = easting - E0, y = northing - N0, z = up. The manifest
written beside the model repeats the anchor points in (east, up, north) so the loader can check them.
"""
from __future__ import annotations

import json
import math
import os
import random
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
TEX = os.path.join(ROOT, "assets", "walk", "textures")
OUT_DIR = os.path.join(ROOT, "unity", "Assets", "Buried", "Walk")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = ARGS[ARGS.index("--preview") + 1] if "--preview" in ARGS else None
EXPORT = "--no-export" not in ARGS

random.seed(1911)

# --------------------------------------------------------------------------------------------------
# Georeferencing: plate tile pixels to project-local metres
# --------------------------------------------------------------------------------------------------
_project = json.load(open(os.path.join(ROOT, "data", "project.json")))
E0, N0 = _project["origin"]["easting"], _project["origin"]["northing"]
_side = json.load(open(os.path.join(ROOT, "data", "tiles", "fip_v3_1911_229.json")))
_W, _H = _side["width_px"], _side["height_px"]
_TL, _TR, _BL = (Vector(_side["corners"][k]) for k in ("top_left", "top_right", "bottom_left"))


def P(px: float, py: float) -> Vector:
    """A tile pixel as a local (east, north) point."""
    w = _TL + (_TR - _TL) * (px / _W) + (_BL - _TL) * (py / _H)
    return Vector((w.x - E0, w.y - N0))


def world_ring(coords) -> list[Vector]:
    return [Vector((c[0] - E0, c[1] - N0)) for c in coords[:-1]]


def ccw(ring: list[Vector]) -> list[Vector]:
    area = sum(ring[i].x * ring[(i + 1) % len(ring)].y - ring[(i + 1) % len(ring)].x * ring[i].y for i in range(len(ring)))
    return ring if area > 0 else list(reversed(ring))


_evidence = json.load(open(os.path.join(ROOT, "data", "evidence", "fip_v3_1911_229.geojson")))
EVIDENCE = {f["id"]: f for f in _evidence["features"]}


def feature_ring(fid: str) -> list[Vector]:
    return ccw(world_ring(EVIDENCE[fid]["geometry"]["coordinates"][0]))


# --------------------------------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------------------------------
def _img(path: str, colorspace: str):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def pbr(name: str, tex_id: str, tint=None) -> bpy.types.Material:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    col = nt.nodes.new("ShaderNodeTexImage")
    col.image = _img(os.path.join(TEX, f"{tex_id}_col_1k.jpg"), "sRGB")
    if tint is None:
        nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        fac = next(i for i in mix.inputs if i.identifier == "Factor_Float")
        a_in = next(i for i in mix.inputs if i.identifier == "A_Color")
        b_in = next(i for i in mix.inputs if i.identifier == "B_Color")
        res = next(o for o in mix.outputs if o.identifier == "Result_Color")
        fac.default_value = 1.0
        b_in.default_value = (*tint, 1.0)
        nt.links.new(col.outputs["Color"], a_in)
        nt.links.new(res, bsdf.inputs["Base Color"])
    rough = nt.nodes.new("ShaderNodeTexImage")
    rough.image = _img(os.path.join(TEX, f"{tex_id}_rough_1k.jpg"), "Non-Color")
    nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    nor = nt.nodes.new("ShaderNodeTexImage")
    nor.image = _img(os.path.join(TEX, f"{tex_id}_nor_1k.jpg"), "Non-Color")
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nor.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def flat(name: str, color, rough=0.7, metal=0.0, emit=None, emit_strength=1.0, alpha=1.0) -> bpy.types.Material:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    return m


def decal(name: str, png: str) -> bpy.types.Material:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = _img(os.path.join(TEX, "signs", png), "sRGB")
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.85
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "BLENDED"
    return m


def window_mat(name: str, png: str, emit_strength: float) -> bpy.types.Material:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = _img(os.path.join(TEX, "windows", png), "sRGB")
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.12 if emit_strength == 0 else 0.4
    if emit_strength > 0:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return m


MAT: dict[str, bpy.types.Material] = {}
SIZE = {  # real-world size of one texture tile, metres
    "brick_a": 1.0, "brick_b": 2.5, "road": 1.3, "yard": 1.3, "planks": 1.8, "roughcast": 1.0,
    "clapboard": 1.57, "shed": 2.0, "stone": 2.16, "roof": 4.0, "iron": 1.0, "setts": 2.0, "walk": 2.16,
}


def make_materials() -> None:
    MAT["brick_a"] = pbr("brick_a", "red_brick_03")
    MAT["brick_b"] = pbr("brick_b", "red_bricks_04")
    MAT["road"] = pbr("road", "brown_mud_03", (0.62, 0.60, 0.58))
    MAT["yard"] = pbr("yard", "brown_mud_03", (0.45, 0.42, 0.38))
    MAT["planks"] = pbr("planks", "weathered_brown_planks")
    MAT["roughcast"] = pbr("roughcast", "white_plaster_02")
    MAT["clapboard"] = pbr("clapboard", "weathered_plank_siding")
    MAT["shed"] = pbr("shed", "wood_planks_dirt")
    MAT["stone"] = pbr("stone", "concrete_wall_007")
    MAT["roof"] = pbr("roof", "roof_09")
    MAT["iron"] = pbr("iron", "rusty_metal_02")
    MAT["setts"] = pbr("setts", "cobblestone_floor_08", (0.42, 0.42, 0.44))
    MAT["walk"] = pbr("walk", "concrete_wall_007", (0.55, 0.55, 0.55))
    MAT["frame"] = flat("frame", (0.035, 0.07, 0.05), rough=0.6)            # dark green window paint
    MAT["frame_light"] = flat("frame_light", (0.42, 0.38, 0.30), rough=0.6)  # cream paint
    MAT["door"] = flat("door", (0.06, 0.035, 0.022), rough=0.5)
    MAT["glass_dark"] = flat("glass_dark", (0.012, 0.016, 0.02), rough=0.08, metal=0.0)
    MAT["glass_lit"] = flat("glass_lit", (0.25, 0.16, 0.07), rough=0.3, emit=(1.0, 0.62, 0.25), emit_strength=2.2)
    MAT["lamp_glass"] = flat("lamp_glass", (0.9, 0.7, 0.4), rough=0.3, emit=(1.0, 0.68, 0.30), emit_strength=9.0)
    MAT["post"] = flat("post", (0.02, 0.025, 0.022), rough=0.45, metal=0.6)
    MAT["pole"] = flat("pole", (0.05, 0.038, 0.028), rough=0.9)
    MAT["rail"] = flat("rail", (0.10, 0.10, 0.11), rough=0.25, metal=1.0)
    MAT["brass"] = flat("brass", (0.55, 0.38, 0.12), rough=0.35, metal=1.0, emit=(0.86, 0.64, 0.29), emit_strength=0.25)
    MAT["hydrant"] = flat("hydrant", (0.28, 0.035, 0.025), rough=0.5, metal=0.2)
    MAT["flame"] = flat("flame", (1.0, 0.7, 0.3), rough=0.5, emit=(1.0, 0.62, 0.22), emit_strength=14.0)
    MAT["lantern_glass"] = flat("lantern_glass", (0.9, 0.8, 0.6), rough=0.1, emit=(1.0, 0.66, 0.28), emit_strength=1.6, alpha=0.35)
    for k in ("a", "b", "c"):
        MAT[f"win_lit_{k}"] = window_mat(f"win_lit_{k}", f"win_lit_{k}.png", 1.6)
    MAT["win_lit_factory"] = window_mat("win_lit_factory", "win_lit_factory.png", 1.4)
    MAT["win_dark_a"] = window_mat("win_dark_a", "win_dark_a.png", 0.0)
    MAT["win_dark_b"] = window_mat("win_dark_b", "win_dark_b.png", 0.0)
    MAT["puddle"] = flat("puddle", (0.010, 0.013, 0.016), rough=0.03)
    MAT["wire"] = flat("wire", (0.012, 0.012, 0.012), rough=0.6)
    MAT["sign_bank"] = decal("sign_bank", "sign_bank.png")
    MAT["sign_carhartt"] = decal("sign_carhartt", "sign_carhartt.png")
    MAT["sign_carhartt_roof"] = decal("sign_carhartt_roof", "sign_carhartt_roof.png")
    MAT["sign_perrin"] = decal("sign_perrin", "sign_perrin.png")
    MAT["sign_queen"] = decal("sign_queen", "sign_street_queen.png")
    MAT["sign_river"] = decal("sign_river", "sign_street_river.png")


# --------------------------------------------------------------------------------------------------
# Mesh builder
# --------------------------------------------------------------------------------------------------
class MB:
    def __init__(self, name: str):
        self.name = name
        self.verts: list[tuple[float, float, float]] = []
        self.faces: list[tuple[int, ...]] = []
        self.uvs: list[list[tuple[float, float]]] = []
        self.mat_index: list[int] = []
        self.mats: list[str] = []

    def face(self, pts, mat: str, uvs=None) -> None:
        if mat not in self.mats:
            self.mats.append(mat)
        base = len(self.verts)
        self.verts.extend((p[0], p[1], p[2]) for p in pts)
        self.faces.append(tuple(range(base, base + len(pts))))
        self.uvs.append(list(uvs) if uvs is not None else [(0.0, 0.0)] * len(pts))
        self.mat_index.append(self.mats.index(mat))

    def flat_face(self, ring2d, z: float, mat: str, up=True) -> None:
        """A horizontal polygon with world-projected UVs."""
        s = SIZE.get(mat, 1.0)
        pts = [(p.x, p.y, z) for p in ring2d]
        uvs = [(p.x / s, p.y / s) for p in ring2d]
        if not up:
            pts.reverse(); uvs.reverse()
        self.face(pts, mat, uvs)

    def box(self, a, b, mat: str) -> None:
        (x0, y0, z0), (x1, y1, z1) = a, b
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        for q in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.face([v[i] for i in q], mat, [(0, 0), (1, 0), (1, 1), (0, 1)])

    def build(self, collection=None) -> bpy.types.Object:
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts, [], self.faces)
        uv = mesh.uv_layers.new(name="UVMap")
        k = 0
        for f, fuv in zip(self.faces, self.uvs):
            for i in range(len(f)):
                uv.data[k].uv = fuv[i]
                k += 1
        for name in self.mats:
            mesh.materials.append(MAT[name])
        for poly, mi in zip(mesh.polygons, self.mat_index):
            poly.material_index = mi
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def v3(p2: Vector, z: float) -> tuple[float, float, float]:
    return (p2.x, p2.y, z)


# --------------------------------------------------------------------------------------------------
# Walls, openings, buildings
# --------------------------------------------------------------------------------------------------
def wall(mb: MB, a: Vector, b: Vector, z0: float, z1: float, mat: str, openings=(), u_offset=0.0) -> None:
    """A wall from a to b whose outward side is to the right of a->b, with rectangular openings
    given as dicts with u0, u1 (metres along the wall), z0, z1 and kind."""
    L = (b - a).length
    if L < 1e-4:
        return
    d = (b - a) / L
    n = Vector((d.y, -d.x))
    s = SIZE.get(mat, 1.0)
    us = sorted({0.0, L, *(o["u0"] for o in openings), *(o["u1"] for o in openings)})
    zs = sorted({z0, z1, *(o["z0"] for o in openings), *(o["z1"] for o in openings)})
    us = [u for u in us if -1e-6 <= u <= L + 1e-6]
    zs = [z for z in zs if z0 - 1e-6 <= z <= z1 + 1e-6]
    for i in range(len(us) - 1):
        for j in range(len(zs) - 1):
            ua, ub, za, zb = us[i], us[i + 1], zs[j], zs[j + 1]
            if ub - ua < 1e-5 or zb - za < 1e-5:
                continue
            um, zm = (ua + ub) / 2, (za + zb) / 2
            if any(o["u0"] < um < o["u1"] and o["z0"] < zm < o["z1"] for o in openings):
                continue
            pa, pb = a + d * ua, a + d * ub
            mb.face([v3(pa, za), v3(pb, za), v3(pb, zb), v3(pa, zb)], mat,
                    [((ua + u_offset) / s, za / s), ((ub + u_offset) / s, za / s), ((ub + u_offset) / s, zb / s), ((ua + u_offset) / s, zb / s)])
    for o in openings:
        opening(mb, a, d, n, o, mat)


def quad_on(mb: MB, a: Vector, d: Vector, n: Vector, u0, u1, z0, z1, depth: float, mat: str, uv=((0, 0), (1, 0), (1, 1), (0, 1))) -> None:
    """A wall-parallel quad, `depth` metres out from the wall plane (negative is into the wall)."""
    pa, pb = a + d * u0 + n * depth, a + d * u1 + n * depth
    mb.face([v3(pa, z0), v3(pb, z0), v3(pb, z1), v3(pa, z1)], mat, uv)


def pick_glass(o: dict) -> str:
    if o.get("lit"):
        return o.get("lit_mat") or random.choice(("win_lit_a", "win_lit_b", "win_lit_c"))
    return random.choice(("win_dark_a", "win_dark_b"))


def arch_head(mb: MB, a: Vector, d: Vector, n: Vector, u0, u1, z1, rise, wall_mat: str, band_mat: str) -> None:
    """Fills the top corners of a rectangular opening so its head reads as a segmental arch, and
    lays a band of voussoirs over it."""
    s = SIZE.get(wall_mat, 1.0)
    steps = 8
    arc = []
    for k in range(steps + 1):
        t = k / steps
        arc.append((u0 + (u1 - u0) * t, z1 - rise * (2 * t - 1) ** 2))
    half = steps // 2
    for side in (0, 1):
        pts = arc[: half + 1] if side == 0 else arc[half:]
        corner = (u0, z1) if side == 0 else (u1, z1)
        poly = ([corner] + pts) if side == 0 else (pts + [corner])
        pts3 = [v3(a + d * u + n * 0.004, z) for u, z in poly]
        uvs = [(u / s, z / s) for u, z in poly]
        # Keep the outward winding (counter-clockwise seen from outside: u right, z up).
        area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
        if area < 0:
            pts3.reverse(); uvs.reverse()
        mb.face(pts3, wall_mat, uvs)
    thick = 0.25
    for k in range(steps):
        (ua, za), (ub, zb) = arc[k], arc[k + 1]
        pa, pb = a + d * (ua - 0.0) + n * 0.014, a + d * ub + n * 0.014
        mb.face([v3(pa, za), v3(pb, zb), v3(pb, zb + thick), v3(pa, za + thick)], band_mat,
                [(k / steps, 0), ((k + 1) / steps, 0), ((k + 1) / steps, 0.12), (k / steps, 0.12)])


def opening(mb: MB, a: Vector, d: Vector, n: Vector, o: dict, wall_mat: str) -> None:
    u0, u1, z0, z1 = o["u0"], o["u1"], o["z0"], o["z1"]
    kind = o.get("kind", "window")
    depth = 0.22 if kind != "shop" else 0.30
    reveal = o.get("reveal", "stone" if o.get("trim", True) else wall_mat)
    p00, p10 = a + d * u0, a + d * u1
    q00, q10 = p00 - n * depth, p10 - n * depth
    # Reveals: left, right, top, bottom.
    mb.face([v3(p00, z0), v3(q00, z0), v3(q00, z1), v3(p00, z1)], reveal, [(0, 0), (0.2, 0), (0.2, 1), (0, 1)])
    mb.face([v3(q10, z0), v3(p10, z0), v3(p10, z1), v3(q10, z1)], reveal, [(0, 0), (0.2, 0), (0.2, 1), (0, 1)])
    mb.face([v3(q00, z1), v3(q10, z1), v3(p10, z1), v3(p00, z1)], reveal, [(0, 0), (1, 0), (1, 0.2), (0, 0.2)])
    mb.face([v3(p00, z0), v3(p10, z0), v3(q10, z0), v3(q00, z0)], reveal, [(0, 0), (1, 0), (1, 0.2), (0, 0.2)])
    frame = o.get("frame", "frame")
    if kind == "door":
        transom = min(0.55, (z1 - z0) * 0.2)
        quad_on(mb, a, d, n, u0, u1, z0, z1 - transom, -depth, "door")
        quad_on(mb, a, d, n, u0, u1, z1 - transom, z1, -depth, "glass_lit" if o.get("lit") else "win_dark_a")
        quad_on(mb, a, d, n, u0, u1, z1 - transom - 0.04, z1 - transom + 0.04, -depth + 0.02, frame)
        if u1 - u0 > 1.3:  # double door: a centre stile
            um = (u0 + u1) / 2
            quad_on(mb, a, d, n, um - 0.03, um + 0.03, z0, z1 - transom, -depth + 0.02, frame)
        # A stone stoop: a landing at the door and as many steps as the floor height needs.
        risers = max(1, math.ceil((z0 - 0.15) / 0.19))
        rise = (z0 - 0.15) / risers
        for k in range(risers):
            top_z = z0 - k * rise
            out1 = 0.55 + k * 0.30
            oriented_box(mb, a, d, n, u0 - 0.2 - (0.0 if k else 0.0), u1 + 0.2, 0.06, out1, 0.15, top_z, "stone")
    else:
        glass = pick_glass(o)
        if kind == "shop":
            bulk = 0.55
            quad_on(mb, a, d, n, u0, u1, z0, z0 + bulk, -depth, "door")
            quad_on(mb, a, d, n, u0, u1, z0 + bulk, z1, -depth, glass)
            zg0 = z0 + bulk
        else:
            quad_on(mb, a, d, n, u0, u1, z0, z1, -depth, glass)
            zg0 = z0
        f = -depth + 0.025
        bar = 0.06
        quad_on(mb, a, d, n, u0, u0 + bar, zg0, z1, f, frame)
        quad_on(mb, a, d, n, u1 - bar, u1, zg0, z1, f, frame)
        quad_on(mb, a, d, n, u0, u1, z1 - bar, z1, f, frame)
        quad_on(mb, a, d, n, u0, u1, zg0, zg0 + bar, f, frame)
        nx, ny = o.get("panes", (1, 2))
        for k in range(1, nx):
            u = u0 + (u1 - u0) * k / nx
            quad_on(mb, a, d, n, u - 0.02, u + 0.02, zg0, z1, f, frame)
        for k in range(1, ny):
            z = zg0 + (z1 - zg0) * k / ny
            quad_on(mb, a, d, n, u0, u1, z - 0.025, z + 0.025, f, frame)
        if o.get("sill", True):
            sa, sb = a + d * (u0 - 0.08), a + d * (u1 + 0.08)
            ta, tb = sa + n * 0.09, sb + n * 0.09
            mb.face([v3(ta, z0 - 0.11), v3(tb, z0 - 0.11), v3(tb, z0), v3(ta, z0)], "stone", [(0, 0), (1, 0), (1, 0.06), (0, 0.06)])
            mb.face([v3(ta, z0), v3(tb, z0), v3(sb, z0), v3(sa, z0)], "stone", [(0, 0), (1, 0), (1, 0.06), (0, 0.06)])
    if o.get("arch"):
        arch_head(mb, a, d, n, u0, u1, z1, o["arch"], wall_mat, "stone")
    elif o.get("lintel", True):
        quad_on(mb, a, d, n, u0 - 0.12, u1 + 0.12, z1, z1 + 0.26, 0.012, "stone", [(0, 0), (1.5, 0), (1.5, 0.15), (0, 0.15)])


def oriented_box(mb: MB, a: Vector, d: Vector, n: Vector, u0, u1, out0, out1, z0, z1, mat: str) -> None:
    """A box standing against a wall: top, front and both ends (the back is against the wall)."""
    p = [a + d * u0 + n * out0, a + d * u1 + n * out0, a + d * u1 + n * out1, a + d * u0 + n * out1]
    w, dp, h = (u1 - u0) / 2.0, (out1 - out0) / 2.0, (z1 - z0) / 2.0
    mb.face([v3(p[3], z1), v3(p[2], z1), v3(p[1], z1), v3(p[0], z1)], mat, [(0, 0), (w, 0), (w, dp), (0, dp)])
    mb.face([v3(p[3], z0), v3(p[2], z0), v3(p[2], z1), v3(p[3], z1)], mat, [(0, 0), (w, 0), (w, h), (0, h)])
    mb.face([v3(p[0], z0), v3(p[3], z0), v3(p[3], z1), v3(p[0], z1)], mat, [(0, 0), (dp, 0), (dp, h), (0, h)])
    mb.face([v3(p[2], z0), v3(p[1], z0), v3(p[1], z1), v3(p[2], z1)], mat, [(0, 0), (dp, 0), (dp, h), (0, h)])


def band(mb: MB, a: Vector, b: Vector, z0: float, z1: float, out: float, mat: str) -> None:
    """A projecting course along a wall: front, top and underside."""
    L = (b - a).length
    d = (b - a) / L
    n = Vector((d.y, -d.x))
    a2, b2 = a - d * 0.0, b + d * 0.0
    fa, fb = a2 + n * out, b2 + n * out
    r = L / SIZE.get(mat, 1.0)
    mb.face([v3(fa, z0), v3(fb, z0), v3(fb, z1), v3(fa, z1)], mat, [(0, 0), (r, 0), (r, 0.12), (0, 0.12)])
    mb.face([v3(fa, z1), v3(fb, z1), v3(b2, z1), v3(a2, z1)], mat, [(0, 0), (r, 0), (r, 0.1), (0, 0.1)])
    mb.face([v3(a2, z0), v3(b2, z0), v3(fb, z0), v3(fa, z0)], mat, [(0, 0), (r, 0), (r, 0.1), (0, 0.1)])


def bays(L: float, pitch: float, margin: float) -> list[float]:
    n = max(1, int((L - 2 * margin + 1e-6) // pitch))
    start = (L - n * pitch) / 2
    return [start + pitch * (k + 0.5) for k in range(n)]


STYLES = {
    # floors: (floor level, sill above floor, window height); ww window width; pitch bay spacing
    "bank": dict(wall="brick_b", base=0.7, floors=[(0.7, 0.95, 2.4), (4.7, 0.9, 1.9)], top=9.3, roof=8.5, ww=1.3,
                 pitch=3.3, margin=1.0, panes=(1, 2), frame="frame", cornice=True, course=True, lit=0.55,
                 arch=0.18, pilasters=True, chimneys=2, frieze=True),
    "factory": dict(wall="brick_b", base=1.0, floors=[(1.0, 1.0, 2.3), (5.0, 0.95, 2.1)], top=9.2, roof=8.5, ww=1.75,
                    pitch=3.15, margin=1.2, panes=(3, 4), frame="frame", cornice=True, course=True, lit=0.4,
                    basement=True, arch=0.28, pilasters=True, lit_mat="win_lit_factory", stack=True),
    "shop_brick": dict(wall="brick_a", base=0.4, floors=[(0.4, 1.0, 2.0), (4.4, 0.9, 1.9)], top=8.2, roof=7.6, ww=2.1,
                       pitch=3.5, margin=1.3, panes=(3, 3), frame="frame", cornice=False, course=True, lit=0.3,
                       arch=0.3, pilasters=True, lit_mat="win_lit_factory", stack=True),
    "row_brick": dict(wall="brick_a", base=0.3, floors=[(0.3, 0.9, 1.7), (3.5, 0.85, 1.6)], top=7.0, roof=6.5, ww=1.05,
                      pitch=2.45, margin=0.9, panes=(1, 2), frame="frame_light", cornice=True, course=False, lit=0.35,
                      arch=0.14, chimneys=3),
    "row_roughcast": dict(wall="roughcast", base=0.3, floors=[(0.3, 0.9, 1.6), (3.3, 0.85, 1.5)], top=5.9, roof=5.9,
                          ww=0.95, pitch=2.5, margin=0.8, panes=(1, 2), frame="frame", cornice=False, course=False,
                          lit=0.35, trim=False, gable=True, chimneys=2),
    "house_clapboard": dict(wall="clapboard", base=0.3, floors=[(0.3, 0.9, 1.5), (3.1, 0.8, 1.4)], top=5.5, roof=5.5,
                            ww=0.9, pitch=2.4, margin=0.7, panes=(1, 2), frame="frame_light", cornice=False,
                            course=False, lit=0.3, trim=False, gable=True, chimneys=1),
    "shed": dict(wall="shed", base=0.0, floors=[], top=3.0, roof=2.9, ww=0, pitch=99, margin=0, panes=(1, 1),
                 frame="frame", cornice=False, course=False, lit=0.0),
}


def building(name: str, ring: list[Vector], style_name: str, street_edges=None, doors=None, plain_edges=(),
             ground="window") -> bpy.types.Object:
    """A flat-roofed building from a footprint. `street_edges`: indices that get the cornice and
    courses (default all). `doors`: {edge index: u position or None for centre}. `plain_edges`: no
    openings (party walls). `ground`: 'window' or 'shop' for the ground floor of street edges."""
    st = STYLES[style_name]
    ring = ccw(ring)
    n = len(ring)
    street = set(range(n)) if street_edges is None else set(street_edges)
    doors = doors or {}
    mb = MB(name)
    wm = st["wall"]
    top = st["top"]
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        L = (b - a).length
        ops = []
        if i not in plain_edges and st["floors"] and L > 2.0:
            centres = bays(L, st["pitch"], st["margin"])
            door_u = None
            if i in doors:
                door_u = doors[i] if doors[i] is not None else L / 2
                door_u = min(centres, key=lambda c: abs(c - door_u)) if centres else L / 2
            for s, (zf, sill, wh) in enumerate(st["floors"]):
                for c in centres:
                    lit = random.random() < st["lit"]
                    if s == 0 and door_u is not None and abs(c - door_u) < 1e-6:
                        dw = 1.5 if style_name in ("bank", "factory", "shop_brick") else 0.95
                        ops.append(dict(u0=c - dw / 2, u1=c + dw / 2, z0=zf, z1=zf + 2.75 if dw > 1 else zf + 2.3, kind="door",
                                        lit=True, frame=st["frame"], trim=st.get("trim", True)))
                        continue
                    if s == 0 and ground == "shop" and i in street:
                        ops.append(dict(u0=c - st["pitch"] * 0.40, u1=c + st["pitch"] * 0.40, z0=zf + 0.05, z1=zf + sill + wh + 0.3,
                                        kind="shop", lit=lit, frame=st["frame"], panes=(2, 1), sill=False))
                        continue
                    ww = st["ww"]
                    ops.append(dict(u0=c - ww / 2, u1=c + ww / 2, z0=zf + sill, z1=zf + sill + wh, kind="window", lit=lit,
                                    panes=st["panes"], frame=st["frame"], trim=st.get("trim", True),
                                    lintel=st.get("trim", True), arch=st.get("arch"), lit_mat=st.get("lit_mat")))
                if s == 0 and st.get("basement") and i in street:
                    for c in centres:
                        ops.append(dict(u0=c - st["ww"] / 2, u1=c + st["ww"] / 2, z0=0.28, z1=0.78, kind="window", lit=False,
                                        panes=(3, 1), frame=st["frame"], sill=False, lintel=False))
        wall(mb, a, b, 0.0, top, wm, ops)
        # Inside face of the parapet, so it is not see-through from above or from the far side.
        wall(mb, b, a, st["roof"], top, wm)
        if i in street:
            if st["base"] > 0.3:
                band(mb, a, b, 0.0, st["base"] - 0.02, 0.05, "stone")
            if st["course"] and len(st["floors"]) > 1:
                zc = st["floors"][1][0] - 0.55
                band(mb, a, b, zc, zc + 0.22, 0.06, "stone")
            if st.get("frieze"):
                band(mb, a, b, top - 1.45, top - 0.75, 0.115, "stone")
            if st["cornice"]:
                band(mb, a, b, top - 0.75, top - 0.45, 0.22, "stone")
                band(mb, a, b, top - 0.45, top - 0.30, 0.36, "stone")
            band(mb, a, b, top - 0.06, top + 0.06, 0.05, "stone")
        if st.get("pilasters") and i in street and i not in plain_edges and L > 4.0:
            centres = bays(L, st["pitch"], st["margin"])
            start = centres[0] - st["pitch"] / 2
            d_ = (b - a).normalized()
            n_ = Vector((d_.y, -d_.x))
            for k in range(len(centres) + 1):
                u = max(0.28, min(L - 0.28, start + st["pitch"] * k))
                pilaster(mb, a + d_ * u, d_, n_, 0.0, top - 0.75, wm)
    if st.get("gable") and n == 4:
        gable_roof(mb, ring, st["roof"], wm)
    else:
        mb.flat_face(ring, st["roof"], "roof")
    for k in range(st.get("chimneys", 0)):
        t = (k + 0.5) / st["chimneys"]
        longest = max(range(n), key=lambda i: (ring[(i + 1) % n] - ring[i]).length)
        a, b = ring[longest], ring[(longest + 1) % n]
        d_ = (b - a).normalized()
        inward = Vector((-d_.y, d_.x))
        c = a + (b - a) * t + inward * 1.2
        zc = st["roof"] + (1.6 if st.get("gable") else 0.0)
        mb.box((c.x - 0.32, c.y - 0.42, st["roof"] - 0.2), (c.x + 0.32, c.y + 0.42, zc + 1.5), "brick_a")
        mb.box((c.x - 0.38, c.y - 0.48, zc + 1.5), (c.x + 0.38, c.y + 0.48, zc + 1.62), "stone")
    if st.get("stack"):
        c = sum(ring, Vector((0.0, 0.0))) / n
        far = max(ring, key=lambda q: (q - Vector((10.0, 115.0))).length)
        c = c + (far - c) * 0.72
        cylinder(mb, c, st["roof"] - 0.2, st["roof"] + 6.5, 0.62, 0.46, "brick_a", 10)
    return mb.build()


def pilaster(mb: MB, at: Vector, d: Vector, n: Vector, z0: float, z1: float, mat: str, width=0.46, out=0.10) -> None:
    s = SIZE.get(mat, 1.0)
    l, r = at - d * (width / 2), at + d * (width / 2)
    fl, fr = l + n * out, r + n * out
    mb.face([v3(fl, z0), v3(fr, z0), v3(fr, z1), v3(fl, z1)], mat, [(0, z0 / s), (width / s, z0 / s), (width / s, z1 / s), (0, z1 / s)])
    mb.face([v3(l, z0), v3(fl, z0), v3(fl, z1), v3(l, z1)], mat, [(0, z0 / s), (out / s, z0 / s), (out / s, z1 / s), (0, z1 / s)])
    mb.face([v3(fr, z0), v3(r, z0), v3(r, z1), v3(fr, z1)], mat, [(0, z0 / s), (out / s, z0 / s), (out / s, z1 / s), (0, z1 / s)])
    mb.face([v3(fl, z1), v3(fr, z1), v3(r, z1), v3(l, z1)], "stone", [(0, 0), (0.3, 0), (0.3, 0.1), (0, 0.1)])


def gable_roof(mb: MB, ring: list[Vector], eave_z: float, wall_mat: str, pitch_deg=36.0, overhang=0.35) -> None:
    """A pitched roof on a four-sided footprint, ridge along the longer axis."""
    e = [(ring[(i + 1) % 4] - ring[i]).length for i in range(4)]
    i0 = 0 if e[0] + e[2] >= e[1] + e[3] else 1          # long edges are i0 and i0 + 2
    a, b, c, d = ring[i0], ring[(i0 + 1) % 4], ring[(i0 + 2) % 4], ring[(i0 + 3) % 4]
    span = ((d - a).length + (c - b).length) / 2
    rise = math.tan(math.radians(pitch_deg)) * span / 2
    r0, r1 = (a + d) / 2, (b + c) / 2                      # ridge ends
    along = (b - a).normalized()
    out_ab = Vector((along.y, -along.x))
    s = SIZE["roof"]
    ridge_z = eave_z + rise
    for (p, q, sign) in ((a, b, 1.0), (c, d, 1.0)):
        dirn = (q - p).normalized()
        nrm = Vector((dirn.y, -dirn.x))
        pe, qe = p + nrm * overhang - dirn * overhang, q + nrm * overhang + dirn * overhang
        rp = (r0 if (p - a).length < 1e-6 else r1) - dirn * overhang
        rq = (r1 if (p - a).length < 1e-6 else r0) + dirn * overhang
        drop = math.tan(math.radians(pitch_deg)) * overhang
        L = (qe - pe).length
        slope = math.hypot(span / 2 + overhang, rise + drop)
        mb.face([v3(pe, eave_z - drop), v3(qe, eave_z - drop), v3(rq, ridge_z), v3(rp, ridge_z)], "roof",
                [(0, 0), (L / s, 0), (L / s, slope / s), (0, slope / s)])
    sw = SIZE.get(wall_mat, 1.0)
    for (p, q, r) in ((b, c, r1), (d, a, r0)):                # gable ends
        mb.face([v3(p, eave_z), v3(q, eave_z), v3(r, ridge_z)], wall_mat,
                [(0, eave_z / sw), ((q - p).length / sw, eave_z / sw), ((q - p).length / 2 / sw, ridge_z / sw)])


def sign_on(name: str, ring: list[Vector], edge: int, mat: str, width: float, height: float, z_centre: float,
            u_centre: float | None = None, out=0.13) -> bpy.types.Object:
    ring = ccw(ring)
    a, b = ring[edge], ring[(edge + 1) % len(ring)]
    L = (b - a).length
    d = (b - a) / L
    n = Vector((d.y, -d.x))
    uc = L / 2 if u_centre is None else u_centre
    width = min(width, L - 0.6)
    mb = MB(name)
    quad_on(mb, a, d, n, uc - width / 2, uc + width / 2, z_centre - height / 2, z_centre + height / 2, out, mat)
    return mb.build()


# --------------------------------------------------------------------------------------------------
# Ground and street furniture
# --------------------------------------------------------------------------------------------------
def slab(name: str, ring: list[Vector], z0: float, z1: float, top_mat: str, side_mat: str) -> bpy.types.Object:
    ring = ccw(ring)
    mb = MB(name)
    mb.flat_face(ring, z1, top_mat)
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        wall(mb, a, b, z0, z1, side_mat)
    return mb.build()


def cylinder(mb: MB, centre: Vector, z0: float, z1: float, r0: float, r1: float, mat: str, sides=10, cap=True) -> None:
    ring0 = [(centre.x + r0 * math.cos(2 * math.pi * k / sides), centre.y + r0 * math.sin(2 * math.pi * k / sides), z0) for k in range(sides)]
    ring1 = [(centre.x + r1 * math.cos(2 * math.pi * k / sides), centre.y + r1 * math.sin(2 * math.pi * k / sides), z1) for k in range(sides)]
    for k in range(sides):
        j = (k + 1) % sides
        mb.face([ring0[k], ring0[j], ring1[j], ring1[k]], mat, [(k / sides, 0), ((k + 1) / sides, 0), ((k + 1) / sides, 1), (k / sides, 1)])
    if cap:
        mb.face(ring1, mat, [(0.5 + 0.5 * math.cos(2 * math.pi * k / sides), 0.5 + 0.5 * math.sin(2 * math.pi * k / sides)) for k in range(sides)])


def lamp(name: str, at: Vector, toward: Vector) -> tuple[bpy.types.Object, Vector]:
    """A cast-iron post with a four-sided lantern head. Returns the object and the light position."""
    mb = MB(name)
    cylinder(mb, at, 0.15, 0.55, 0.16, 0.13, "post", 8)
    cylinder(mb, at, 0.55, 3.45, 0.075, 0.055, "post", 8)
    cylinder(mb, at, 3.45, 3.55, 0.20, 0.20, "post", 8)
    h0, h1 = 3.55, 4.05
    r0, r1 = 0.15, 0.24
    corners0 = [(at.x + r0 * sx, at.y + r0 * sy, h0) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    corners1 = [(at.x + r1 * sx, at.y + r1 * sy, h1) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for k in range(4):
        j = (k + 1) % 4
        mb.face([corners0[k], corners0[j], corners1[j], corners1[k]], "lamp_glass", [(0, 0), (1, 0), (1, 1), (0, 1)])
    apex = (at.x, at.y, h1 + 0.28)
    for k in range(4):
        j = (k + 1) % 4
        mb.face([corners1[k], corners1[j], apex], "post", [(0, 0), (1, 0), (0.5, 1)])
    cylinder(mb, at, h1 + 0.26, h1 + 0.40, 0.03, 0.02, "post", 6)
    return mb.build(), Vector((at.x, at.y, 3.8))


def pole(name: str, at: Vector, along: Vector) -> bpy.types.Object:
    mb = MB(name)
    cylinder(mb, at, 0.0, 9.2, 0.15, 0.10, "pole", 8)
    d = along.normalized()
    for z, half in ((8.6, 1.1), (7.9, 0.9)):
        a, b = at - d * half, at + d * half
        n = Vector((d.y, -d.x)) * 0.05
        ring = [a + n, b + n, b - n, a - n]
        mb.flat_face(ring, z + 0.09, "pole")
        for i in range(4):
            wall(mb, ring[i], ring[(i + 1) % 4], z - 0.03, z + 0.09, "pole")
    return mb.build()


def hydrant(name: str, at: Vector) -> bpy.types.Object:
    mb = MB(name)
    cylinder(mb, at, 0.0, 0.12, 0.16, 0.16, "hydrant", 10)
    cylinder(mb, at, 0.12, 0.72, 0.105, 0.095, "hydrant", 10)
    cylinder(mb, at, 0.72, 0.80, 0.13, 0.13, "hydrant", 10)
    cylinder(mb, at, 0.80, 0.93, 0.10, 0.03, "hydrant", 10)
    for dx, dy in ((1, 0), (-1, 0)):
        c = Vector((at.x + dx * 0.14, at.y + dy * 0.14))
        mb.box((c.x - 0.05, c.y - 0.05, 0.45), (c.x + 0.05, c.y + 0.05, 0.57), "hydrant")
    return mb.build()


def plaque(name: str, at: Vector, facing: Vector) -> bpy.types.Object:
    """A brass exhibit label on a post, tilted toward `facing` (a 2D direction to the reader)."""
    mb = MB(name)
    cylinder(mb, at, 0.15, 1.0, 0.03, 0.025, "post", 8)
    f = facing.normalized()
    side = Vector((-f.y, f.x))
    hw, depth, tilt = 0.26, 0.34, 0.20
    near = at + f * (depth / 2)
    far = at - f * (depth / 2)
    pts = [v3(near - side * hw, 0.98), v3(near + side * hw, 0.98), v3(far + side * hw, 0.98 + tilt), v3(far - side * hw, 0.98 + tilt)]
    mb.face(pts, "brass", [(0, 0), (1, 0), (1, 1), (0, 1)])
    under = [(p[0], p[1], p[2] - 0.025) for p in reversed(pts)]
    mb.face(under, "post", [(0, 0), (1, 0), (1, 1), (0, 1)])
    return mb.build()


def hand_lantern(name: str) -> bpy.types.Object:
    """A railroad-style oil lantern, modelled hanging below the origin (the top of its bail)."""
    mb = MB(name)
    o = Vector((0.0, 0.0))
    cylinder(mb, o, -0.40, -0.36, 0.075, 0.075, "post", 12)
    cylinder(mb, o, -0.36, -0.33, 0.075, 0.055, "post", 12)
    cylinder(mb, o, -0.33, -0.19, 0.050, 0.058, "lantern_glass", 12, cap=False)
    cylinder(mb, o, -0.31, -0.25, 0.012, 0.004, "flame", 6)
    cylinder(mb, o, -0.19, -0.16, 0.060, 0.045, "post", 12)
    cylinder(mb, o, -0.16, -0.11, 0.030, 0.022, "post", 10)
    for k in range(4):  # guard wires
        ang = math.pi / 4 + k * math.pi / 2
        c = Vector((0.062 * math.cos(ang), 0.062 * math.sin(ang)))
        cylinder(mb, c, -0.34, -0.17, 0.003, 0.003, "post", 4, cap=False)
    # The bail: two uprights and a top bar.
    for sx in (-1, 1):
        c = Vector((sx * 0.075, 0.0))
        cylinder(mb, c, -0.34, -0.02, 0.004, 0.004, "post", 4, cap=False)
    mb.box((-0.075, -0.004, -0.02), (0.075, 0.004, -0.012), "post")
    return mb.build()


def empty(name: str, at, yaw_deg: float | None = None) -> bpy.types.Object:
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.3
    e.location = at
    if yaw_deg is not None:
        e.rotation_euler = (0.0, 0.0, math.radians(yaw_deg))
    bpy.context.scene.collection.objects.link(e)
    return e


# --------------------------------------------------------------------------------------------------
# The corner
# --------------------------------------------------------------------------------------------------
def build_scene() -> dict:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    make_materials()
    manifest: dict = {"plaques": [], "lamps": [], "refs": [], "hydrants": []}

    # Ground. Tile pixels: Queen's south lot line is y = 358, its north side y = 122 (66 ft).
    road = MB("ground_road")
    road.flat_face(ccw([P(-700, -700), P(4400, -700), P(4400, 4800), P(-700, 4800)]), 0.0, "road")
    road.build()
    slab("ground_yard", [P(1250, 358), P(2440, 358), P(2455, 372), P(2455, 955), P(1840, 1215), P(1250, 1300)], 0.0, 0.12, "yard", "stone")
    slab("ground_walk_queen_south", [P(1250, 322), P(2455, 322), P(2455, 358), P(1250, 358)], 0.0, 0.15, "walk", "stone")
    slab("ground_walk_river_west", [P(2455, 322), P(2491, 322), P(2491, 988), P(2455, 955)], 0.0, 0.151, "walk", "stone")
    kd = (P(2455, 955) - P(1840, 1215)).normalized()
    kn = Vector((kd.y, -kd.x)) * (36 * 0.0838)
    slab("ground_walk_king_north", [P(1840, 1215), P(1840, 1215) + kn, P(2455, 955) + kn, P(2455, 955)], 0.0, 0.149, "walk", "stone")
    slab("ground_walk_queen_north", [P(1250, 122), P(2440, 122), P(2440, 158), P(1250, 158)], 0.0, 0.15, "planks", "shed")

    rails = MB("rail_queen")
    for cy in (211, 229, 251, 269):
        a, b = P(-300, cy), P(4000, cy)
        d = (b - a).normalized()
        n = Vector((d.y, -d.x)) * 0.03
        ring = ccw([a + n, b + n, b - n, a - n])
        rails.flat_face(ring, 0.035, "rail")
        for i in range(4):
            wall(rails, ring[i], ring[(i + 1) % 4], 0.0, 0.035, "rail")
    rails.build()

    # Setts between the rails, and standing water on the road (Unity gives it the shine).
    setts = MB("ground_track_bed")
    setts.flat_face(ccw([P(-300, 200), P(4000, 200), P(4000, 280), P(-300, 280)]), 0.012, "setts")
    setts.build()
    puddles = MB("puddles")
    rng = random.Random(7)
    placed = 0
    while placed < 34:
        px, py = rng.uniform(1350, 2950), rng.uniform(135, 1250)
        on_queen = 135 < py < 318 and px < 3000
        on_junction = 2500 < px < 2950 and 135 < py < 950
        if not (on_queen or on_junction):
            continue
        c = P(px, py)
        rx, ry, rot = rng.uniform(0.5, 2.3), rng.uniform(0.35, 1.2), rng.uniform(0, math.pi)
        ring = []
        for k in range(12):
            ang = 2 * math.pi * k / 12
            r = 1.0 + 0.22 * math.sin(ang * 3 + rng.uniform(0, 6))
            x, y = rx * r * math.cos(ang), ry * r * math.sin(ang)
            ring.append(Vector((c.x + x * math.cos(rot) - y * math.sin(rot), c.y + x * math.sin(rot) + y * math.cos(rot))))
        puddles.flat_face(ccw(ring), 0.016, "puddle")
        placed += 1
    puddles.build()

    fence = MB("fence_queen_north")
    wall(fence, P(2440, 122), P(1330, 122), 0.15, 2.6, "shed")
    wall(fence, P(2440, 40), P(2440, 122), 0.0, 2.6, "shed")
    fence.build()

    # Buildings. Outlines from the evidence file where a record exists, else read from the plan here.
    bank = feature_ring("bld_fip_v3_1911_229_0001")
    factory = feature_ring("bld_fip_v3_1911_229_0101")
    machine = feature_ring("bld_fip_v3_1911_229_0102")

    def edge_facing(ring, target: Vector) -> int:
        """The edge whose outward side most directly faces a point placed in front of it."""
        best, best_s = 0, -1e9
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            d = (b - a).normalized()
            nrm = Vector((d.y, -d.x))
            mid = (a + b) / 2
            s = nrm.dot((target - mid).normalized())
            if s > best_s:
                best, best_s = i, s
        return best

    queen_mid = P(2300, 240)
    river_mid = P(2600, 600)
    king_mid = P(2100, 1250)

    b_north, b_east = edge_facing(bank, P(2385, 250)), edge_facing(bank, P(2600, 440))
    lengths = [(bank[(i + 1) % len(bank)] - bank[i]).length for i in range(len(bank))]
    b_chamfer = min((i for i in range(len(bank))), key=lambda i: lengths[i])
    building("bld_bank", bank, "bank", street_edges={b_north, b_east, b_chamfer}, doors={b_chamfer: None})
    sign_on("sign_bank_north", bank, b_north, "sign_bank", 7.6, 0.56, 8.2, out=0.125)
    sign_on("sign_bank_east", bank, b_east, "sign_bank", 7.6, 0.56, 8.2, out=0.125)

    f_north = edge_facing(factory, P(2095, 318))
    f_east = edge_facing(factory, P(2370, 450))
    building("bld_factory", factory, "factory", street_edges=set(range(4)), doors={f_north: None})
    sign_on("sign_factory_north", factory, f_north, "sign_carhartt", 11.5, 1.25, 4.9)
    # The October 1911 photograph shows a sign on the roof, facing the bridge.
    fa, fb = ccw(factory)[f_east], ccw(factory)[(f_east + 1) % 4]
    fd = (fb - fa).normalized()
    fn = Vector((fd.y, -fd.x))
    roof_sign = MB("sign_factory_roof")
    L_e = (fb - fa).length
    u0s, u1s, z0s, z1s = L_e * 0.12, L_e * 0.88, 9.9, 12.3
    for sgn, out in ((1, -0.9), (-1, -0.95)):
        pa, pb = fa + fd * u0s + fn * out, fa + fd * u1s + fn * out
        if sgn < 0:
            pa, pb = pb, pa
        roof_sign.face([v3(pa, z0s), v3(pb, z0s), v3(pb, z1s), v3(pa, z1s)], "sign_carhartt_roof" if sgn > 0 else "post",
                       [(0, 0), (1, 0), (1, 1), (0, 1)])
    for k in range(6):
        c = fa + fd * (u0s + (u1s - u0s) * k / 5) + fn * (-0.93)
        cylinder(roof_sign, c, 8.5, 12.3, 0.05, 0.05, "post", 4, cap=False)
        cylinder(roof_sign, c + fn * (-1.4), 8.5, 8.6, 0.05, 0.05, "post", 4, cap=False)
    roof_sign.build()

    m_south = edge_facing(machine, P(2075, 1235))
    building("bld_machine_shop", machine, "shop_brick", street_edges={m_south}, doors={m_south: None})
    sign_on("sign_machine_south", machine, m_south, "sign_perrin", 12.5, 1.1, 4.0)

    building("bld_533_queen", feature_ring("bld_fip_v3_1911_229_0013"), "row_roughcast", doors={edge_facing(feature_ring("bld_fip_v3_1911_229_0013"), queen_mid): None})
    row_b = ccw([P(1480, 360), P(1900, 360), P(1900, 480), P(1480, 480)])
    building("bld_queen_row_dwellings", row_b, "row_roughcast", street_edges={edge_facing(row_b, P(1700, 240))},
             doors={edge_facing(row_b, P(1700, 240)): None})
    row_a = ccw([P(1250, 360), P(1480, 360), P(1480, 490), P(1250, 490)])
    building("bld_queen_row_shops", row_a, "row_brick", street_edges={edge_facing(row_a, P(1360, 240))}, ground="shop")
    king538 = ccw([P(2150, 960), P(2260, 915), P(2295, 1035), P(2195, 1075)])
    building("bld_538_king", king538, "row_brick", street_edges={edge_facing(king538, king_mid)}, doors={edge_facing(king538, king_mid): None})
    for fid in ("0028", "0017", "0063", "0082"):
        building(f"bld_shed_{fid}", feature_ring(f"bld_fip_v3_1911_229_{fid}"), "shed")

    # The rest of the block, from the evidence file, as plainer buildings that fade into the fog.
    explicit = [bank, factory, machine, row_a, row_b, king538] + [feature_ring(f"bld_fip_v3_1911_229_{f}") for f in ("0013", "0028", "0017", "0063", "0082")]

    def inside(pt: Vector, ring) -> bool:
        c = False
        for i in range(len(ring)):
            a_, b_ = ring[i], ring[(i + 1) % len(ring)]
            if (a_.y > pt.y) != (b_.y > pt.y) and pt.x < (b_.x - a_.x) * (pt.y - a_.y) / (b_.y - a_.y) + a_.x:
                c = not c
        return c

    count = 0
    for fid, f in EVIDENCE.items():
        pr = f["properties"]
        if pr["kind"] != "building" or pr["status"] != "published" or f["geometry"]["type"] != "Polygon":
            continue
        ring = ccw(world_ring(f["geometry"]["coordinates"][0]))
        cen = sum(ring, Vector((0.0, 0.0))) / len(ring)
        if any(inside(cen, r) for r in explicit) or len(ring) < 3:
            continue
        area = abs(sum(ring[i].x * ring[(i + 1) % len(ring)].y - ring[(i + 1) % len(ring)].x * ring[i].y for i in range(len(ring)))) / 2
        storeys = pr["attributes"].get("storeys")
        if storeys and storeys >= 2 and area > 150:
            style = "shop_brick" if area > 300 else "row_brick"
        elif area < 40:
            style = "shed"
        else:
            style = random.choice(("row_roughcast", "house_clapboard", "house_clapboard"))
        if len(ring) > 12:   # ragged rule-drawn outlines: use the bounding quad along the first edge
            xs, ys = [q.x for q in ring], [q.y for q in ring]
            ring = [Vector((min(xs), min(ys))), Vector((max(xs), min(ys))), Vector((max(xs), max(ys))), Vector((min(xs), max(ys)))]
        building(f"bld_back_{fid[-4:]}", ring, style)
        count += 1
    print("backdrop buildings:", count)

    # Street furniture.
    lamp_spots = [(1560, 330), (1960, 330), (2330, 330), (2476, 338), (2476, 660)]
    kmid = (P(1840, 1215) + P(2455, 955)) / 2 + kn * 0.6
    for k, spot in enumerate(lamp_spots + [None]):
        at = P(*spot) if spot else kmid
        _, light = lamp(f"prop_lamp_{k + 1}", at, queen_mid)
        empty(f"marker_lamp_{k + 1}", light)
        manifest["lamps"].append({"name": f"marker_lamp_{k + 1}", "pos": [round(light.x, 3), round(light.z, 3), round(light.y, 3)]})
    along = (P(2440, 150) - P(1300, 150))
    for k, x in enumerate((1400, 1750, 2100, 2420)):
        pole(f"prop_pole_{k + 1}", P(x, 150), along)
    for k, spot in enumerate(((2600, 80), (1583, 1372))):
        hydrant(f"prop_hydrant_{k + 1}", P(*spot))
        h = P(*spot)
        manifest["hydrants"].append({"name": f"prop_hydrant_{k + 1}", "pos": [round(h.x, 3), 0.0, round(h.y, 3)], "from": "the plan's hydrant symbol"})

    # Overhead wires: pole to pole along the north side, and the two trolley wires over the tracks.
    wires = MB("wires")

    def wire(p0, p1, sag: float, segs=8, w=0.012) -> None:
        pts = []
        for k in range(segs + 1):
            t = k / segs
            pts.append(Vector((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t - sag * 4 * t * (1 - t))))
        for k in range(segs):
            a3, b3 = pts[k], pts[k + 1]
            for off in (Vector((0, 0, w)), Vector((w, w, 0))):
                wires.face([tuple(a3 - off), tuple(b3 - off), tuple(b3 + off), tuple(a3 + off)], "wire", [(0, 0), (1, 0), (1, 1), (0, 1)])
                wires.face([tuple(a3 + off), tuple(b3 + off), tuple(b3 - off), tuple(a3 - off)], "wire", [(0, 0), (1, 0), (1, 1), (0, 1)])

    pole_px = (1400, 1750, 2100, 2420)
    dirn = along.normalized()
    for k in range(len(pole_px) - 1):
        a2, b2 = P(pole_px[k], 150), P(pole_px[k + 1], 150)
        for z, half in ((8.69, 1.0), (8.69, 0.45), (7.99, 0.8)):
            for sgn in (-1, 1):
                off = Vector((dirn.y, -dirn.x)) * 0.0 + dirn * 0.0
                side = Vector((-dirn.y, dirn.x)) * 0.0
                o = dirn * 0.0
                la = a2 + Vector((dirn.x, dirn.y)) * (sgn * half)
                lb = b2 + Vector((dirn.x, dirn.y)) * (sgn * half)
                wire((la.x, la.y, z), (lb.x, lb.y, z), 0.55)
    for cy in (220, 260):
        a2, b2 = P(600, cy), P(3600, cy)
        wire((a2.x, a2.y, 5.6), (b2.x, b2.y, 5.6), 0.0, segs=2, w=0.01)
    for x in pole_px:  # span wires from each pole across the street
        a2, b2 = P(x, 150), P(x, 322)
        wire((a2.x, a2.y, 6.9), (b2.x, b2.y, 6.4), 0.5, segs=6, w=0.008)
    wires.build()

    # Street-name boards on the corner lamp post.
    corner = P(2476, 338)
    for nm, mat, d in (("sign_street_queen", "sign_queen", (P(2455, 322) - P(1250, 322)).normalized()),
                       ("sign_street_river", "sign_river", (P(2491, 988) - P(2491, 322)).normalized())):
        mb = MB(nm)
        for sgn in (1, -1):
            n2 = Vector((d.y, -d.x)) * 0.012 * sgn
            a, b = corner - d * 0.42 + n2, corner + d * 0.42 + n2
            if sgn < 0:
                a, b = b, a
            z0 = 2.95 if nm.endswith("queen") else 2.72
            mb.face([v3(a, z0), v3(b, z0), v3(b, z0 + 0.2), v3(a, z0 + 0.2)], mat, [(0, 0), (1, 0), (1, 1), (0, 1)])
        mb.build()

    # Exhibit plaques: one per find at this corner, on the sidewalk, facing the street.
    def plaque_for(slug: str, at: Vector, reader_from: Vector, feature: str) -> None:
        f = (reader_from - at).normalized()
        plaque(f"plaque_{slug}", at, f)
        yaw = math.degrees(math.atan2(f.y, f.x))
        empty(f"marker_plaque_{slug}", (at.x, at.y, 1.05), yaw)
        manifest["plaques"].append({"slug": slug, "feature_id": feature, "pos": [round(at.x, 3), 1.05, round(at.y, 3)],
                                    "facing": [round(f.x, 4), 0.0, round(f.y, 4)]})

    plaque_for("bank", P(2462, 340), P(2470, 250), "bld_fip_v3_1911_229_0001")
    plaque_for("overall-factory", P(2190, 338), P(2190, 250), "bld_fip_v3_1911_229_0101")
    king_plaque = (machine[m_south] + machine[(m_south + 1) % len(machine)]) / 2 + kn * 0.75
    plaque_for("machine-shop", king_plaque, king_plaque + kn, "bld_fip_v3_1911_229_0102")

    # Where the visitor starts, and the hand lantern.
    spawn = P(2080, 236)
    look = P(2440, 330)
    yaw = math.degrees(math.atan2((look - spawn).y, (look - spawn).x))
    empty("marker_spawn", (spawn.x, spawn.y, 0.0), yaw)
    manifest["spawn"] = {"pos": [round(spawn.x, 3), 0.0, round(spawn.y, 3)],
                         "look_at": [round(look.x, 3), 1.6, round(look.y, 3)]}
    hand_lantern("hand_lantern")

    # Reference points for the loader's alignment check, and the walkable area.
    for nm, pt in (("marker_ref_bank_ne", bank[b_chamfer]), ("marker_ref_factory_n", factory[f_north]), ("marker_ref_origin", Vector((0.0, 0.0)))):
        empty(nm, (pt.x, pt.y, 0.0))
        manifest["refs"].append({"name": nm, "pos": [round(pt.x, 3), 0.0, round(pt.y, 3)]})
    bounds_px = [(1300, 130), (2440, 130), (2440, 40), (2700, 40), (2700, 130), (2980, 130), (2980, 985), (2290, 1285),
                 (1750, 1300), (1750, 520), (1300, 520)]
    manifest["walk_bounds"] = [[round(P(x, y).x, 3), round(P(x, y).y, 3)] for x, y in bounds_px]
    manifest["axes"] = "pos is [east, up, north] in project-local metres (easting - E0, height, northing - N0); walk_bounds is [east, north]"
    manifest["origin"] = {"easting": E0, "northing": N0}
    manifest["source"] = "fip_v3_1911_229"
    manifest["imagined"] = ["wall materials", "windows and doors", "sign paint and letterforms", "lamps and poles",
                            "storey heights in metres", "the fence on the north side of Queen Street"]
    manifest["from_photographs"] = [
        {"what": "a Carhartt sign on the factory roof, facing the bridge", "source": "City of Toronto Archives, Fonds 1231, Item 1625 (26 Oct 1911)"},
        {"what": "the bank's lettered frieze under its cornice", "source": "City of Toronto Archives, Fonds 1231, Item 509 (19 May 1915)"},
        {"what": "setts between the rails, dirt roadway either side, concrete sidewalks", "source": "City of Toronto Archives, Fonds 1231, Items 512 and 1625 (Oct 1911)"},
    ]
    manifest["date_note"] = "The plan is the 1911 edition revised to 1914. The City's heritage survey dates the bank to 1912, so this is the block about 1914."
    manifest["textures"] = "Poly Haven (polyhaven.com), CC0"
    return manifest


# --------------------------------------------------------------------------------------------------
# Preview (not exported) and export
# --------------------------------------------------------------------------------------------------
def render_previews(manifest: dict, out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else ("BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else engines[0])
    scene.render.resolution_x, scene.render.resolution_y = 1280, 800
    scene.render.resolution_percentage = 75
    scene.render.image_settings.file_format = "JPEG"
    world = bpy.data.worlds.new("preview_world")
    world.use_nodes = True
    scene.world = world
    bg = world.node_tree.nodes["Background"]
    extra = []

    def add_light(kind, loc, energy, color, name, radius=0.1):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if hasattr(ld, "shadow_soft_size"):
            ld.shadow_soft_size = radius
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        scene.collection.objects.link(ob)
        extra.append(ob)
        return ob

    cam_data = bpy.data.cameras.new("preview_cam")
    cam = bpy.data.objects.new("preview_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    extra.append(cam)

    def aim(eye, target, lens=24):
        cam.location = eye
        direction = Vector(target) - Vector(eye)
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        cam_data.lens = lens

    sp = manifest["spawn"]["pos"]
    la = manifest["spawn"]["look_at"]
    eye = (sp[0], sp[2], 1.65)
    target = (la[0], la[2], 3.2)

    # Day pass: flat light, to judge the modelling.
    bg.inputs["Color"].default_value = (0.55, 0.62, 0.72, 1.0)
    bg.inputs["Strength"].default_value = 0.9
    sun = add_light("SUN", (0, 0, 30), 3.0, (1.0, 0.96, 0.9), "preview_sun")
    sun.rotation_euler = (math.radians(50), 0, math.radians(200))
    for nm, e, tgt, lens in (("day_street", eye, target, 22),
                             ("day_corner", (la[0] + 22, la[2] + 16, 1.65), (la[0] - 6, la[2] - 8, 4.0), 22),
                             ("day_above", (sp[0] + 10, sp[2] + 75, 60), (la[0] - 12, la[2] - 25, 0), 30)):
        aim(e, tgt, lens)
        scene.render.filepath = os.path.join(out_dir, f"{nm}.jpg")
        bpy.ops.render.render(write_still=True)

    # Night pass: roughly what Unity will light.
    bpy.data.objects.remove(sun, do_unlink=True)
    extra.remove(sun)
    bg.inputs["Color"].default_value = (0.012, 0.022, 0.03, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    moon = add_light("SUN", (0, 0, 30), 0.25, (0.55, 0.7, 1.0), "preview_moon")
    moon.rotation_euler = (math.radians(55), 0, math.radians(150))
    for lm in manifest["lamps"]:
        add_light("POINT", (lm["pos"][0], lm["pos"][2], lm["pos"][1]), 2600, (1.0, 0.66, 0.32), "preview_" + lm["name"], 0.15)
    add_light("POINT", (eye[0] + 0.5, eye[1] - 0.2, 1.1), 500, (1.0, 0.62, 0.28), "preview_lantern", 0.05)
    scene.view_settings.exposure = 1.2
    for nm, e, tgt, lens in (("night_street", eye, target, 22),
                             ("night_corner", (la[0] + 22, la[2] + 16, 1.65), (la[0] - 6, la[2] - 8, 4.0), 22),
                             ("night_factory", (factory_eye := (sp[0] + 6, sp[2] - 2, 1.65)), (sp[0] + 10, sp[2] - 14, 4.0), 20)):
        aim(e, tgt, lens)
        scene.render.filepath = os.path.join(out_dir, f"{nm}.jpg")
        bpy.ops.render.render(write_still=True)
    for ob in extra:
        bpy.data.objects.remove(ob, do_unlink=True)


def export(manifest: dict) -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for o in bpy.data.objects:
        o.select_set(True)
    path = os.path.join(OUT_DIR, "corner_1911.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False, export_apply=True,
                              export_yup=True, export_image_format="AUTO", export_extras=False,
                              export_cameras=False, export_lights=False)
    with open(os.path.join(OUT_DIR, "corner_1911.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
    print(f"EXPORTED {path} ({os.path.getsize(path) / 1e6:.1f} MB), {tris} triangles, "
          f"{sum(1 for o in bpy.data.objects if o.type == 'MESH')} meshes")


if __name__ == "__main__":
    m = build_scene()
    if EXPORT:
        export(m)
    if PREVIEW:
        render_previews(m, PREVIEW)
