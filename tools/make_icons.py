"""
Genereert de PWA-iconen. Geen beeldbibliotheek nodig: de vormen worden als
signed distance fields uitgerekend en met zlib als PNG weggeschreven.

Randen worden glad door de dekking uit de afstand tot de rand af te leiden
(1 sample per pixel), wat scherper is dan supersamplen en veel sneller.

Gebruik:  python tools/make_icons.py
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"


# ------------------------------- PNG ---------------------------------------

def write_png(path: Path, w: int, h: int, pixels: bytearray) -> None:
    """pixels = RGBA, rij voor rij."""
    raw = bytearray()
    for y in range(h):
        raw.append(0)                       # filter 0 = None
        raw += pixels[y * w * 4:(y + 1) * w * 4]

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


# ------------------------------ Vormen -------------------------------------

def rounded_rect_sd(px, py, cx, cy, hw, hh, r):
    """Afstand tot een afgeronde rechthoek; negatief = binnen."""
    dx = abs(px - cx) - (hw - r)
    dy = abs(py - cy) - (hh - r)
    ox, oy = max(dx, 0.0), max(dy, 0.0)
    return (ox * ox + oy * oy) ** 0.5 + min(max(dx, dy), 0.0) - r


def mix(a, b, t):
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def cover(sd, px):
    """Dekking 0..1 uit de afstand, ongeveer één pixel breed overgangsgebied."""
    v = 0.5 - sd / px
    return 0.0 if v < 0 else 1.0 if v > 1 else v


# Kleuren van het thema
VIOLET = (139, 92, 246)
INDIGO = (99, 102, 241)
CYAN = (34, 211, 238)


def render(size: int, maskable: bool = False, opaque: bool = False) -> bytearray:
    px = 1.0 / size                      # pixelbreedte in genormaliseerde eenheden
    buf = bytearray(size * size * 4)

    # Bij maskable moet alles binnen de veilige cirkel blijven → kleiner logo,
    # en de achtergrond loopt door tot de rand.
    corner = 0.0 if (maskable or opaque) else 0.235
    scale = 0.74 if maskable else 1.0

    # Halterafmetingen, genormaliseerd rond het midden.
    s = scale
    handle = (0.5, 0.5, 0.185 * s, 0.036 * s, 0.030 * s)
    inner = [(0.5 + dx * s, 0.5, 0.042 * s, 0.150 * s, 0.034 * s) for dx in (-0.175, 0.175)]
    outer = [(0.5 + dx * s, 0.5, 0.034 * s, 0.092 * s, 0.028 * s) for dx in (-0.253, 0.253)]

    for y in range(size):
        v = (y + 0.5) / size
        for x in range(size):
            u = (x + 0.5) / size

            # --- achtergrond: diagonaal verloop -------------------------------
            t = (u + v) / 2
            col = mix(VIOLET, INDIGO, t * 2) if t < 0.5 else mix(INDIGO, CYAN, (t - 0.5) * 2)

            # Glans linksboven geeft het glazige van het thema.
            gd = ((u - 0.26) ** 2 + (v - 0.20) ** 2) ** 0.5
            gloss = max(0.0, 1.0 - gd / 0.62) ** 2.4
            col = mix(col, (255, 255, 255), gloss * 0.34)

            # Verdonkering rechtsonder voor diepte.
            sd_ = ((u - 0.88) ** 2 + (v - 0.92) ** 2) ** 0.5
            col = mix(col, (24, 16, 60), max(0.0, 1.0 - sd_ / 0.75) ** 3 * 0.30)

            # --- silhouet van de tegel ---------------------------------------
            if corner > 0:
                a = cover(rounded_rect_sd(u, v, 0.5, 0.5, 0.5, 0.5, corner), px)
            else:
                a = 1.0

            # --- halter -------------------------------------------------------
            d = rounded_rect_sd(u, v, *handle)
            for p in inner + outer:
                d = min(d, rounded_rect_sd(u, v, *p))
            bell = cover(d, px)

            if bell > 0:
                # Lichte schaduw onder het logo tilt het van de achtergrond af.
                col = mix(col, (255, 255, 255), bell)

            i = (y * size + x) * 4
            r, g, b = (int(c + 0.5) for c in col)
            buf[i] = min(255, max(0, r))
            buf[i + 1] = min(255, max(0, g))
            buf[i + 2] = min(255, max(0, b))
            buf[i + 3] = 255 if opaque else int(a * 255 + 0.5)

    return buf


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, False, False),
        ("icon-512.png", 512, False, False),
        ("maskable-512.png", 512, True, True),
        ("apple-touch-icon.png", 180, False, True),
    ]
    for name, size, maskable, opaque in jobs:
        path = OUT / name
        write_png(path, size, size, render(size, maskable, opaque))
        print(f"  {name:<22} {size}×{size}  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    print("Iconen genereren…")
    main()
