#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Orbit (habit tracker) -- app icon / splash asset generator.

Rasterizes the brand mark described by _ref/orbit-icon.svg using only
Pillow (ImageDraw) + numpy gradients.  No SVG renderer, no extra installs.

Run:
  "C:\\Users\\Administrator\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe" \
      "C:\\Users\\Administrator\\Downloads\\ou\\orbit-app\\assets\\make-icons.py"

Design space is the SVG's own 512-unit canvas; every layer is rendered at
`SS`x supersampling and downscaled with LANCZOS for antialiasing.
"""

import math
import os

import numpy as np
from PIL import Image, ImageDraw

# --------------------------------------------------------------------------
# output location
# --------------------------------------------------------------------------
ASSETS = r"C:\Users\Administrator\Downloads\ou\orbit-app\assets"
if not os.path.isdir(os.path.dirname(ASSETS)):
    # ASSETS itself is created below; only guard against a wrong drive root
    pass
os.makedirs(ASSETS, exist_ok=True)

# --------------------------------------------------------------------------
# brand constants (taken 1:1 from _ref/orbit-icon.svg)
# --------------------------------------------------------------------------
CENTER = 256.0          # canvas centre in design units
REF = 512.0             # reference canvas side
RX = 116.0              # rounded-square corner radius

BG_TOP     = (0x42, 0x6b, 0x56)   # #426b56
BG_BOTTOM  = (0x17, 0x3b, 0x2e)   # #173b2e

TRACK_COLOR = (0x12, 0x2e, 0x23)  # #122e23
TRACK_ALPHA = 0.42
TRACK_R = 152.0
TRACK_W = 35.0

RING_R = 152.0
RING_W = 27.0
RING_TOP    = (0xd5, 0xdf, 0xad)  # #d5dfad
RING_BOTTOM = (0x91, 0xa8, 0x79)  # #91a879

CORE_CX, CORE_CY, CORE_R = 256.0, 256.0, 89.0
CORE_LIGHT = (0xff, 0xfd, 0xf2)   # #fffdf2
CORE_EDGE  = (0xe9, 0xe3, 0xca)   # #e9e3ca

SAT_CX, SAT_CY, SAT_R = 362.0, 143.0, 36.0
SAT_LIGHT = (0xff, 0xe5, 0xa1)    # #ffe5a1
SAT_EDGE  = (0xd5, 0x9b, 0x43)    # #d59b43

SHADOW_COLOR = (0x0d, 0x24, 0x1b)  # #0d241b
SHADOW_ALPHA = 0.35
SHADOW_DY    = 10.0                # design units
SHADOW_BLUR  = 10.0                # design units (gaussian sigma-ish)

# arc geometry: dasharray "855 100" on r=152 (circumference 955.04)
CIRC = 2.0 * math.pi * RING_R
DASH = 855.0
ARC_FRACTION = DASH / CIRC                      # 0.89524
GAP_START_DEG = -42.0                           # rotate(-42) about centre
PHI_END = -42.0 + ARC_FRACTION * 360.0          # 280.286...

# adaptive-icon foreground: the art canvas as a fraction of the output canvas,
# and the frame the visible mark is fitted into.  The mark is asymmetric (the
# satellite sits high on the right), so it is centred on its own measured
# bounds rather than on the art canvas; the frame keeps the layer well inside
# the canvas so no launcher mask can clip it.
FG_DESIGN_FRACTION = 0.65
FG_ART_FRACTION = 0.92

# alpha below this is the invisible tail of the blurred drop shadow; it is
# ignored when measuring the mark's extent so it does not inflate the layout
ALPHA_MIN = 6

SS = 2                 # supersampling factor for small/medium renders
SS_BIG = 2             # supersampling factor for the 2732 splash renders

SPLASH_BG_LIGHT = (0xf6, 0xf7, 0xf2)   # #f6f7f2
SPLASH_BG_DARK  = (0x0e, 0x1a, 0x15)   # #0e1a15

# dark-mode splash palette (ring/core/satellite lightened for contrast)
DARK_TRACK_COLOR = (0x24, 0x4a, 0x3b)
DARK_TRACK_ALPHA = 0.55
DARK_RING_TOP    = (0xff, 0xff, 0xf0)
DARK_RING_BOTTOM = (0xc8, 0xde, 0xb0)
DARK_CORE_LIGHT  = (0xff, 0xff, 0xf8)
DARK_CORE_EDGE   = (0xda, 0xd6, 0xbc)
DARK_SAT_LIGHT   = (0xff, 0xee, 0xbe)
DARK_SAT_EDGE    = (0xf0, 0xb8, 0x62)

ICON_SIZES = [1024, 512, 192, 180, 167, 152, 144, 120, 114, 96,
              87, 80, 76, 72, 60, 58, 57, 48, 40, 29]

WRITTEN = []   # (filename, width, height, bytes)


# --------------------------------------------------------------------------
# gradient helpers (numpy, pure numpy line/radial, bilinear + mask composite)
# --------------------------------------------------------------------------
def _diag_t(W, H):
    """Projection parameter for a linear gradient running corner to corner."""
    x = np.arange(W, dtype=np.float32)[None, :] - 0.5
    y = np.arange(H, dtype=np.float32)[:, None] - 0.5
    nx = x / (W - 1.0)
    ny = y / (H - 1.0)
    return np.clip((nx + ny) * 0.5, 0.0, 1.0)


def _radial_t(W, H, cx=0.5, cy=0.5, r=0.5):
    """Projection parameter for a radial gradient in normalized units.

    (r is in normalized units of the *longer* side; t is clamped to 1 so the
    edge colour extends beyond the gradient sphere, like SVG spreadMethod=pad.)
    """
    x = np.arange(W, dtype=np.float32)[None, :] - 0.5
    y = np.arange(H, dtype=np.float32)[:, None] - 0.5
    dx = (x / W - cx) * W
    dy = (y / H - cy) * H
    d = np.sqrt(dx * dx + dy * dy)
    rp = r * max(W, H)
    return np.clip(d / rp, 0.0, 1.0)


def _t_of(kind, W, H, **kw):
    """Gradient projection map for the requested gradient type."""
    if kind == "diag":
        return _diag_t(W, H)
    if kind == "radial":
        return _radial_t(W, H, kw.get("cx", 0.5), kw.get("cy", 0.5),
                         kw.get("r", 0.5))
    if kind == "flat":
        return np.zeros((H, W), dtype=np.float32)
    raise ValueError("unknown gradient kind: %r" % (kind,))


def composite(dst, c0, c1=None, kind="flat", mask=None, alpha=1.0):
    """Source-over composite of a gradient over `dst` (RGBA, at 4x scale).

    c0/c1   : RGB tuples for the gradient ends (c1 defaults to c0 = flat fill)
    kind    : "flat" | "diag" | "radial"  (extra kwargs -> cx, cy, r)
    mask    : 8-bit "L" coverage mask; None means full coverage
    alpha   : global opacity multiplier for the source (e.g. 0.42)
    Returns a new RGBA image; works for opaque and transparent destinations.
    """
    W, H = dst.size
    src = np.asarray(dst).astype(np.float32)
    if c1 is None:
        c1 = c0
    t = _t_of(kind, W, H)
    tt = t[:, :, None]
    col = (np.asarray(c0, np.float32)[None, None, :] * (1.0 - tt)
           + np.asarray(c1, np.float32)[None, None, :] * tt)

    if mask is None:
        a = np.full((H, W), float(alpha), dtype=np.float32)
    else:
        a = np.asarray(mask).astype(np.float32) / 255.0 * float(alpha)

    da = src[:, :, 3] / 255.0
    aa = a[:, :, None]
    out_a = da + a * (1.0 - da)
    safe = np.maximum(out_a, 1e-6)[:, :, None]
    out = np.zeros((H, W, 4), dtype=np.float32)
    out[:, :, :3] = (src[:, :, :3] * da[:, :, None] * (1.0 - aa)
                     + col * aa) / safe
    out[:, :, 3] = out_a * 255.0
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), "RGBA")


# --------------------------------------------------------------------------
# shape helpers
# --------------------------------------------------------------------------
def mask_full(s):
    return Image.new("L", (s, s), 255)


def mask_round_rect(s, radius_px):
    m = Image.new("L", (s, s), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, s - 1, s - 1],
                                        radius=radius_px, fill=255)
    return m


def mask_circle(s, cx, cy, r):
    m = Image.new("L", (s, s), 0)
    ImageDraw.Draw(m).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    return m


def mask_ring(s, cx, cy, r, w):
    m = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    d.ellipse([cx - (r - w), cy - (r - w), cx + (r - w), cy + (r - w)], fill=0)
    return m


def _gauss_blur_alpha(alpha, sigma):
    """Separable gaussian blur of a float32 HxW alpha array."""
    if sigma <= 0:
        return alpha
    rad = max(1, int(round(sigma * 3.0)))
    x = np.arange(-rad, rad + 1, dtype=np.float32)
    k = np.exp(-(x * x) / (2.0 * sigma * sigma))
    k /= k.sum()
    pad = np.pad(alpha, ((0, 0), (rad, rad)), mode="constant")
    tmp = np.zeros_like(alpha)
    for i, kv in enumerate(k):
        tmp += kv * pad[:, i:i + alpha.shape[1]]
    pad = np.pad(tmp, ((rad, rad), (0, 0)), mode="constant")
    out = np.zeros_like(alpha)
    for i, kv in enumerate(k):
        out += kv * pad[i:i + alpha.shape[0], :]
    return out


# --------------------------------------------------------------------------
# composite spheres (radial gradient + soft drop shadow)
# --------------------------------------------------------------------------
def sphere_layer(u, cx, cy, r, c_light, c_edge, focal=(0.32, 0.25, 0.80)):
    """RGBA layer containing one radial-gradient sphere plus its drop shadow.

    u is pixels per design unit, so the shadow offset/blur stay proportional to
    the mark (they are authored in design units, not canvas units).
    Returns (layer, bbox) where bbox is the integer canvas box the layer must
    be pasted at so the sphere lands centred on (cx, cy).
    """
    blur_px = SHADOW_BLUR * u
    dy = int(round(SHADOW_DY * u))
    pad = int(math.ceil(blur_px * 3.0 + dy)) + 4
    lo_x = int(math.floor(cx - r)) - pad
    lo_y = int(math.floor(cy - r)) - pad
    hi_x = int(math.ceil(cx + r)) + pad
    hi_y = int(math.ceil(cy + r)) + pad
    bw, bh = hi_x - lo_x, hi_y - lo_y

    # local sphere geometry inside the layer
    lx = (cx - r) - lo_x
    ly = (cy - r) - lo_y
    lr = r

    m = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(m).ellipse([lx, ly, lx + 2 * lr, ly + 2 * lr], fill=255)
    alpha = np.asarray(m).astype(np.float32) / 255.0

    # radial gradient: focal point + edge (SVG objectBoundingBox units)
    fx, fy, fr = focal
    t = _radial_t(bw, bh,
                  (lx + fx * 2 * lr) / bw,
                  (ly + fy * 2 * lr) / bh,
                  (fr * 2 * lr) / max(bw, bh))
    tt = t[:, :, None]
    col = (np.asarray(c_light, np.float32)[None, None, :] * (1.0 - tt)
           + np.asarray(c_edge, np.float32)[None, None, :] * tt)

    sh_alpha = _gauss_blur_alpha(alpha.copy(), blur_px)
    sh_alpha *= SHADOW_ALPHA
    shifted = np.zeros_like(sh_alpha)
    if dy > 0:
        shifted[dy:, :] = sh_alpha[:-dy, :]
    elif dy < 0:
        shifted[:dy, :] = sh_alpha[-dy:, :]
    else:
        shifted = sh_alpha

    # feDropShadow order: shadow underneath, then the solid sphere on top
    final_a = np.clip(shifted + alpha, 0.0, 1.0)
    aa = np.maximum(final_a, 1e-6)[:, :, None]
    arr = np.zeros((bh, bw, 4), dtype=np.float32)
    arr[:, :, :3] = (col * alpha[:, :, None]
                     + np.asarray(SHADOW_COLOR, np.float32)[None, None, :]
                     * shifted[:, :, None]) / aa
    arr[:, :, 3] = final_a * 255.0
    layer = Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), "RGBA")
    return layer, (lo_x, lo_y)


# --------------------------------------------------------------------------
# the mark
# --------------------------------------------------------------------------
def render_mark(size_px, *, design_w=None, rounded_corners, bg=True,
                ring_top=RING_TOP, ring_bottom=RING_BOTTOM,
                core_light=CORE_LIGHT, core_edge=CORE_EDGE,
                sat_light=SAT_LIGHT, sat_edge=SAT_EDGE,
                track_color=TRACK_COLOR, track_alpha=TRACK_ALPHA,
                ss=SS, inset=True, measure=False):
    """Render the mark on a `size_px` square canvas.

    design_w = width of the 512-unit design canvas *in output pixels*, centred
    on the output canvas.
      icons  : design_w == size_px -> the art canvas fills the square
      splash / adaptive foreground : design_w < size_px, so the mark sits in
      the middle with a transparent surround (and, if inset, is scaled down
      until its measured extent clears the outer 25% margin).

    Returns the image, or (image, (x0, y0, x1, y1)) when measure=True.
    """
    S = int(round(size_px * ss))
    if design_w is None:
        design_w = size_px
    u = (float(design_w) / float(REF)) * ss   # px per design unit at 4x scale
    # The mark's design-space centre (CENTER, CENTER) maps to the middle of the
    # output canvas, so every design coordinate is offset from CENTER first.
    # (Absolute design coords would only be correct when design_w == size_px.)
    cx = cy = S / 2.0

    def at(design, axis_centre):
        """Map one design coordinate onto the output canvas."""
        return axis_centre + (design - CENTER) * u

    # --- background -----------------------------------------------------
    base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if bg:
        m = mask_round_rect(S, RX * u) if rounded_corners else None
        base = composite(base, BG_TOP, BG_BOTTOM, "diag", mask=m)

    # --- track ring (dark, translucent in the SVG) ---------------------
    # On a transparent layer (adaptive foreground) a translucent track would
    # show the launcher's backdrop through it and read as washed-out grey, so
    # there we bake it to the equivalent opaque colour over the icon gradient.
    m = mask_ring(S, cx, cy, TRACK_R * u, TRACK_W * u)
    if not bg:
        track_color = tuple(
            int(round(track_color[i] * track_alpha
                      + BG_TOP[i] * (1.0 - track_alpha))) for i in range(3))
        track_alpha = 1.0
    base = composite(base, track_color, kind="flat", mask=m, alpha=track_alpha)

    # --- coloured arc: linear gradient + rounded caps -------------------
    # Built as ONE exact stroked outline: outer edge from the start angle to
    # the end angle, a semicircular cap, the inner edge back, the other cap.
    # Pillow's `arc` uses a spline approximation that sits slightly inside the
    # true circle, which leaves a step where the round caps meet the stroke.
    am = Image.new("L", (S, S), 0)
    rr = RING_R * u
    hw = RING_W * u / 2.0

    def pt(phi, rad):
        """Point at polar angle phi (radians, 0 = up, clockwise) and radius."""
        return (cx + rad * math.sin(phi), cy - rad * math.cos(phi))

    def uvec(phi):
        return (math.sin(phi), -math.cos(phi))

    p0 = math.radians(GAP_START_DEG)
    p1 = math.radians(PHI_END)
    steps = max(96, int(round(abs(PHI_END - GAP_START_DEG) * 4)))
    pts = [pt(p0 + (p1 - p0) * i / steps, rr + hw) for i in range(steps + 1)]

    def cap(phi, ccw):
        """Round-cap points centred on pt(phi, rr), ordered for the outline."""
        ccx, ccy = pt(phi, rr)
        ux, uy = uvec(phi)
        vx, vy = -uy, ux                      # u rotated +90 deg on screen
        out = []
        for i in range(1, steps + 1):
            th = math.pi * i / steps
            s = -math.sin(th) if ccw else math.sin(th)
            out.append((ccx + hw * (ux * math.cos(th) + vx * s),
                        ccy + hw * (uy * math.cos(th) + vy * s)))
        return out

    pts += cap(p1, ccw=False)                 # cap at the trailing end
    pts += [pt(p1 + (p0 - p1) * i / steps, rr - hw) for i in range(steps + 1)]
    pts += cap(p0, ccw=True)                  # cap back at the leading end
    ImageDraw.Draw(am).polygon(pts, fill=255)
    arc = composite(Image.new("RGBA", (S, S), (0, 0, 0, 0)),
                    ring_top, ring_bottom, "diag", mask=am)
    base = Image.alpha_composite(base, arc)

    # --- core sphere + satellite ---------------------------------------
    for (dx, dy, sr, cl, ce) in ((CORE_CX, CORE_CY, CORE_R * u,
                                  core_light, core_edge),
                                 (SAT_CX, SAT_CY, SAT_R * u,
                                  sat_light, sat_edge)):
        layer, box = sphere_layer(u, at(dx, cx), at(dy, cy), sr, cl, ce)
        base.alpha_composite(layer, box)

    if S != size_px:
        base = base.resize((int(size_px), int(size_px)), Image.LANCZOS)

    # --- adaptive-icon layer framing ------------------------------------
    # Fit the *visible* mark (ignoring the blurred shadow's invisible tail)
    # inside a centred frame and centre it on its own bounds, because the mark
    # is asymmetric around its design centre.  Nothing is ever clipped, and the
    # whole layer stays inside the canvas so no launcher mask cuts it.
    box = None
    if inset and design_w < size_px:
        a = np.asarray(base)[:, :, 3]
        nz = np.nonzero(a > ALPHA_MIN)
        if len(nz[0]):
            x0, y0, x1, y1 = nz[1].min(), nz[0].min(), nz[1].max(), nz[0].max()
            w, h = x1 - x0 + 1, y1 - y0 + 1
            limit = size_px * FG_ART_FRACTION
            scale = min(1.0, limit / float(max(w, h)))
            nw = max(1, int(round(w * scale)))
            nh = max(1, int(round(h * scale)))
            piece = base.crop((x0, y0, x1 + 1, y1 + 1))
            if scale < 1.0:
                piece = piece.resize((nw, nh), Image.LANCZOS)
            ox = (size_px - nw) // 2
            oy = (size_px - nh) // 2
            canvas = Image.new("RGBA", (size_px, size_px), (0, 0, 0, 0))
            canvas.alpha_composite(piece, (ox, oy))
            base = canvas
            box = (ox, oy, ox + nw - 1, oy + nh - 1)

    if measure:
        if box is None:
            a = np.asarray(base)[:, :, 3]
            nz = np.nonzero(a > ALPHA_MIN)
            box = ((nz[1].min(), nz[0].min(), nz[1].max(), nz[0].max())
                   if len(nz[0]) else (0, 0, 0, 0))
        return base, box
    return base


# --------------------------------------------------------------------------
# writers
# --------------------------------------------------------------------------
def save(img, name, expect=None):
    path = os.path.join(ASSETS, name)
    img.save(path, "PNG", optimize=True)
    n = os.path.getsize(path)
    WRITTEN.append((name, img.size[0], img.size[1], n))
    if expect and tuple(expect) != img.size:
        print("  !! SIZE MISMATCH %s: %s != %s" % (name, img.size, expect))
    return path


def geometry_report():
    """Print the geometry facts the artwork depends on, as a sanity check."""
    d = math.hypot(SAT_CX - CENTER, SAT_CY - CENTER)
    c = 2 * math.pi * RING_R
    print()
    print("geometry")
    print("  arc: r=%.0f  circumference=%.2f  dash=%.0f  -> arc=%.2f deg, "
          "gap=%.2f deg (centre-to-centre)"
          % (RING_R, c, DASH, ARC_FRACTION * 360.0, 360.0 - ARC_FRACTION * 360.0))
    print("  arc start (gap start) = %.1f deg from top, sweeping clockwise; "
          "gap centred at %.1f deg (upper-left)"
          % (GAP_START_DEG, (GAP_START_DEG + PHI_END) / 2.0))
    print("  round caps extend the stroke by %.1f deg at each end -> visible "
          "gap = %.1f deg" % (math.degrees(math.asin((RING_W / 2) / RING_R)),
                              360.0 - ARC_FRACTION * 360.0
                              - 2 * math.degrees(math.asin((RING_W / 2) / RING_R))))
    print("  satellite centre is %.1f units from the ring centre (ring r=%.0f)"
          % (d, RING_R))
    print("  -> satellite centre is %.1f units %s the ring centreline, i.e. ON "
          "the ring band (band spans %.1f..%.1f)"
          % (abs(d - RING_R), "outside" if d > RING_R else "inside",
             RING_R - RING_W / 2, RING_R + RING_W / 2))
    phi = math.degrees(math.atan2(SAT_CX - CENTER, CENTER - SAT_CY)) % 360.0
    # the arc runs from its start angle clockwise through PHI_END; express the
    # satellite and the gap as offsets from the start so the test is wrap-safe
    rel = (phi - GAP_START_DEG) % 360.0
    gap_centre = ((GAP_START_DEG + PHI_END) / 2.0 - GAP_START_DEG) % 360.0
    print("  -> satellite sits at %.1f deg clockwise from top; the arc spans "
          "%.1f deg from %.1f deg, so the satellite is %s"
          % (phi, PHI_END - GAP_START_DEG, GAP_START_DEG % 360.0,
             "ON the drawn arc (overlapping it, as in the SVG)"
             if 0.0 <= rel <= (PHI_END - GAP_START_DEG) else "inside the gap"))
    print("  -> the gap is centred at %.1f deg clockwise from top (upper-left); "
          "the satellite sits %.1f deg away from the gap centre"
          % (gap_centre + GAP_START_DEG, abs(rel - gap_centre)))


def main():
    print("assets ->", ASSETS)
    print("rendering master mark ...")
    master_rounded = render_mark(REF, rounded_corners=True, bg=True, ss=4)
    master_square = render_mark(REF, rounded_corners=False, bg=True, ss=4)
    # iOS icons and the Play listing icon are opaque: drop the alpha channel so
    # they are plain RGB PNGs
    master_square_rgb = master_square.convert("RGB")
    master_rounded_rgb = master_rounded.convert("RGB")

    print("writing icon sizes ...")
    for s in ICON_SIZES:
        if s < 16:
            print("  skip", s)
            continue
        save(master_square_rgb.resize((s, s), Image.LANCZOS),
             "icon-%d.png" % s, expect=(s, s))
        save(master_rounded_rgb.resize((s, s), Image.LANCZOS),
             "icon-%d-android.png" % s, expect=(s, s))

    # --- adaptive icon layers ------------------------------------------
    print("writing adaptive foreground/background ...")
    # adaptive-icon safe zone: the 512-unit art canvas maps to 65% of the 1024
    # canvas and render_mark() additionally shrinks the group if its measured
    # extent would reach into the outer 25% margin.
    fg, fbox = render_mark(1024, design_w=1024 * FG_DESIGN_FRACTION,
                           rounded_corners=False, bg=False, ss=2, measure=True)
    assert fg.mode == "RGBA"
    save(fg, "icon-foreground.png", expect=(1024, 1024))

    bgimg = composite(Image.new("RGBA", (2048, 2048), (0, 0, 0, 0)),
                      BG_TOP, BG_BOTTOM, "diag")
    save(bgimg.convert("RGB").resize((1024, 1024), Image.LANCZOS),
         "icon-background.png", expect=(1024, 1024))

    # --- adaptive preview ----------------------------------------------
    size = 432
    comp = bgimg.resize((size, size), Image.LANCZOS)
    fgs = fg.resize((size, size), Image.LANCZOS)
    comp = Image.alpha_composite(comp, fgs).convert("RGB")
    print("  foreground mark extent x[%d,%d] y[%d,%d] -> %.1f%% of canvas, "
          "fitted into the central %.0f%% frame"
          % (fbox[0], fbox[2], fbox[1], fbox[3],
             100.0 * max(fbox[2] - fbox[0] + 1, fbox[3] - fbox[1] + 1) / 1024.0,
             100.0 * FG_ART_FRACTION))
    inner = 1024 * 0.5 - 1024 * FG_ART_FRACTION / 2.0
    assert fbox[0] >= inner and fbox[1] >= inner, "foreground out of frame"
    assert fbox[2] <= 1024 - inner and fbox[3] <= 1024 - inner, \
        "foreground out of frame"
    save(comp, "adaptive-icon-432.png", expect=(size, size))

    # --- play store ----------------------------------------------------
    save(master_square_rgb.resize((512, 512), Image.LANCZOS),
         "play-store-icon-512.png", expect=(512, 512))

    # --- splash screens ------------------------------------------------
    # Render the mark once on a generous canvas, crop it to its measured
    # extent and downscale that box so the mark group is exactly
    # SPLASH_GROUP_FRACTION of the canvas width, then paste it centred.  This
    # is deterministic: no guessing at angles/radii, and centring is exact.
    print("writing splash screens ...")
    SPLASH_CANVAS = 2732
    SPLASH_GROUP_FRACTION = 0.345
    for name, bgc, ring in (
            ("splash-2732.png", SPLASH_BG_LIGHT,
             dict(ring_top=RING_TOP, ring_bottom=RING_BOTTOM,
                  core_light=CORE_LIGHT, core_edge=CORE_EDGE,
                  sat_light=SAT_LIGHT, sat_edge=SAT_EDGE,
                  track_color=TRACK_COLOR, track_alpha=TRACK_ALPHA)),
            ("splash-dark-2732.png", SPLASH_BG_DARK,
             dict(ring_top=DARK_RING_TOP, ring_bottom=DARK_RING_BOTTOM,
                  core_light=DARK_CORE_LIGHT, core_edge=DARK_CORE_EDGE,
                  sat_light=DARK_SAT_LIGHT, sat_edge=DARK_SAT_EDGE,
                  track_color=DARK_TRACK_COLOR, track_alpha=DARK_TRACK_ALPHA)),
    ):
        canvas = SPLASH_CANVAS
        work = 2048
        big = render_mark(work, design_w=work * 0.90, rounded_corners=False,
                          bg=False, ss=1, inset=False, **ring)
        a = np.asarray(big)[:, :, 3]
        nz = np.nonzero(a > 0)
        box = (nz[1].min(), nz[0].min(), nz[1].max() + 1, nz[0].max() + 1)
        mark = big.crop(box)

        # the visible group (alpha above the shadow-tail floor) defines the
        # measured size, but the whole crop is scaled so nothing is clipped
        vis = np.nonzero(a > ALPHA_MIN)
        vw = vis[1].max() - vis[1].min() + 1
        vh = vis[0].max() - vis[0].min() + 1
        vis_extent = max(vw, vh)
        scale = (canvas * SPLASH_GROUP_FRACTION) / float(vis_extent)
        mark = mark.resize((max(1, int(round(mark.size[0] * scale))),
                            max(1, int(round(mark.size[1] * scale)))),
                           Image.LANCZOS)

        bgim = Image.new("RGBA", (canvas, canvas), bgc + (255,))
        bgim.alpha_composite(mark, ((canvas - mark.size[0]) // 2,
                                    (canvas - mark.size[1]) // 2))
        flat = bgim.convert("RGB")
        arr = np.asarray(flat).astype(np.int16)
        d = np.abs(arr - np.array(bgc, np.int16)).sum(2)
        for thresh, tag in ((12, "visible"), (2, "incl. shadow tail")):
            nz2 = np.nonzero(d > thresh)
            gw = nz2[1].max() - nz2[1].min() + 1
            gh = nz2[0].max() - nz2[0].min() + 1
            print("  %s: mark group [%s] %dx%d px = %.1f%% of canvas width, "
                  "centre (%d,%d)"
                  % (name, tag, gw, gh, 100.0 * gw / canvas,
                     (nz2[1].min() + nz2[1].max()) // 2,
                     (nz2[0].min() + nz2[0].max()) // 2))
        save(flat, name, expect=(canvas, canvas))

    # --- contact sheet for visual inspection ---------------------------
    # panels: full icon | icon -android | adaptive foreground (light grey) |
    #         splash light | splash dark | adaptive-icon-432 | 1:1 corner zoom
    P = 330
    Z = 470
    total_w = 6 * P + 7 * 16 + Z
    sheet = Image.new("RGB", (total_w, P + 2 * 16), (24, 24, 28))

    def panel(img, idx, background=None):
        t = Image.new("RGB", (P, P), background or (24, 24, 28))
        small = img.resize((P, P), Image.LANCZOS)
        t.paste(small, (0, 0), small if small.mode == "RGBA" else None)
        sheet.paste(t, (16 + idx * (P + 16), 16))

    panel(master_square, 0)
    panel(master_rounded, 1)
    panel(fg, 2, (205, 205, 205))
    panel(Image.open(os.path.join(ASSETS, "splash-2732.png")), 3)
    panel(Image.open(os.path.join(ASSETS, "splash-dark-2732.png")), 4)
    panel(Image.open(os.path.join(ASSETS, "adaptive-icon-432.png")), 5)
    # 1:1 crop of the top-right quadrant of the rounded icon: shows the corner
    # radius, the satellite sitting on the ring band and the arc's round cap
    zoom = master_rounded.resize((1024, 1024), Image.LANCZOS) \
        .crop((256, 0, 726, 470))
    sheet.paste(zoom, (total_w - Z - 16, 16))
    sheet.save(os.path.join(ASSETS, "_preview-sheet.png"))
    print("  wrote _preview-sheet.png (dev-only visual check, not a shipped "
          "asset)")
    return master_square


def report():
    """List every file written and re-open each one to verify it on disk."""
    print()
    print("=" * 78)
    print("%-30s %-12s %10s  %-6s %-9s %s"
          % ("file", "dimensions", "bytes", "mode", "interlace", "check"))
    print("-" * 78)
    total = 0
    failures = []
    for name, w, h, n in sorted(WRITTEN):
        total += n
        path = os.path.join(ASSETS, name)
        with Image.open(path) as im:
            ok = (im.size == (w, h) and im.format == "PNG"
                  and im.info.get("interlace", 0) == 0)
            note = "OK"
            if not ok:
                note = "FAIL size=%s fmt=%s" % (im.size, im.format)
                failures.append(name)
            print("%-30s %-12s %10d  %-6s %-9s %s"
                  % (name, "%dx%d" % im.size, n, im.mode,
                     im.info.get("interlace", 0), note))
    print("-" * 78)
    print("%-30s %-12s %10d bytes (%.2f MB)  %d files"
          % ("TOTAL", "", total, total / 1048576.0, len(WRITTEN)))
    if failures:
        print("FAILED:", ", ".join(failures))
    else:
        print("ALL %d FILES VERIFIED: PNG, expected dimensions, non-interlaced"
              % len(WRITTEN))
    print("=" * 78)


# expected colour mode per output family
EXPECT_RGB = ("icon-", "play-store")
EXPECT_RGBA = ("icon-foreground",)


def audit_formats():
    """Confirm RGB where opaque and RGBA where transparency is required."""
    print()
    print("format audit")
    bad = []
    for name, w, h, n in sorted(WRITTEN):
        path = os.path.join(ASSETS, name)
        with Image.open(path) as im:
            if name == "icon-foreground.png":
                want = "RGBA"
            elif name.startswith("icon-") or name.startswith("play-store"):
                want = "RGB"
            else:
                want = "RGB"
            if im.mode != want:
                bad.append("%s is %s, expected %s" % (name, im.mode, want))
    # the adaptive preview is built from an RGBA background image
    print("  icon-foreground.png RGBA (transparent): %s"
          % ("OK" if not any("icon-foreground" in b for b in bad) else "FAIL"))
    print("  splash-2732.png / splash-dark-2732.png RGB (opaque): %s"
          % ("OK" if not any("splash" in b for b in bad) else "FAIL"))
    print("  icons + play-store-icon-512.png RGB (opaque): %s"
          % ("OK" if not any(b.startswith("icon-") for b in bad) else "FAIL"))
    if bad:
        print("  MISMATCHES:", "; ".join(bad))
    return bad


if __name__ == "__main__":
    geometry_report()
    main()
    report()
    audit_formats()
