from pathlib import Path
import struct
import zlib
import shutil

SRC = Path(r"C:\Users\Eszter\small-mmorpg\client\assets\characters\c01\c01_move.png")
BAK = Path(r"C:\Users\Eszter\small-mmorpg\client\assets\characters\c01\c01_move_original.png")
OUT = Path(r"C:\Users\Eszter\small-mmorpg\client\assets\characters\c01\c01_move.png")
PREV = Path(r"C:\Users\Eszter\small-mmorpg\.tmp-side-frames")
PREV.mkdir(exist_ok=True)

CELL_W, CELL_H = 192, 160
FEET_Y = 150


def parse_png(raw: bytes):
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"
    i = 8
    idat = b""
    w = h = None
    while i < len(raw):
        ln = struct.unpack(">I", raw[i : i + 4])[0]
        typ = raw[i + 4 : i + 8]
        chunk = raw[i + 8 : i + 8 + ln]
        if typ == b"IHDR":
            w, h = struct.unpack(">II", chunk[:8])
        elif typ == b"IDAT":
            idat += chunk
        i += 12 + ln
        if typ == b"IEND":
            break
    raw_scan = zlib.decompress(idat)
    bpp = 4
    stride = w * bpp
    rows = []
    prev = bytearray(stride)
    p = 0
    for _y in range(h):
        f = raw_scan[p]
        p += 1
        row = bytearray(raw_scan[p : p + stride])
        p += stride
        if f == 1:
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + left) & 255
        elif f == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
        elif f == 4:
            for x in range(stride):
                a = row[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                pth = a + b - c
                pa, pb, pc = abs(pth - a), abs(pth - b), abs(pth - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                row[x] = (row[x] + pr) & 255
        elif f != 0:
            raise RuntimeError(f"bad filter {f}")
        rows.append(row)
        prev = row
    return w, h, rows


def write_png(path: Path, width: int, height: int, pixels):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b""
    for y in range(height):
        raw += b"\x00" + bytes(pixels[y])
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def cell_get(rows, row_i, col_i):
    out = []
    y0 = row_i * CELL_H
    x0 = col_i * CELL_W * 4
    for y in range(CELL_H):
        out.append(bytearray(rows[y0 + y][x0 : x0 + CELL_W * 4]))
    return out


def cell_put(rows, row_i, col_i, cell):
    y0 = row_i * CELL_H
    x0 = col_i * CELL_W * 4
    for y in range(CELL_H):
        rows[y0 + y][x0 : x0 + CELL_W * 4] = cell[y]


def px(cell, x, y):
    i = x * 4
    return cell[y][i : i + 4]


def set_px(cell, x, y, rgba):
    i = x * 4
    cell[y][i : i + 4] = rgba


def opaque(cell, x, y):
    return 0 <= x < CELL_W and 0 <= y < CELL_H and cell[y][x * 4 + 3] > 0


def shift_vertical(cell, dy: int):
    src = [bytearray(r) for r in cell]
    for y in range(CELL_H):
        for x in range(CELL_W):
            set_px(cell, x, y, bytes((0, 0, 0, 0)))
    for y in range(CELL_H):
        for x in range(CELL_W):
            a = src[y][x * 4 + 3]
            if a == 0:
                continue
            ny = y + dy
            if 0 <= ny < CELL_H:
                if ny > FEET_Y:
                    ny = FEET_Y
                set_px(cell, x, ny, src[y][x * 4 : x * 4 + 4])
    return cell


def foot_columns(cell, y0=118, y1=151):
    cols = []
    for x in range(CELL_W):
        for y in range(y0, y1):
            if opaque(cell, x, y):
                cols.append(x)
                break
    return cols


def clusters_from_cols(cols, gap=4):
    if not cols:
        return []
    out = []
    s = prev = cols[0]
    for x in cols[1:]:
        if x - prev > gap:
            out.append((s, prev))
            s = x
        prev = x
    out.append((s, prev))
    return out


def stick_column_to_baseline(cell, x, x0_limit=110):
    colpix = [(y, bytes(px(cell, x, y))) for y in range(x0_limit, CELL_H) if opaque(cell, x, y)]
    if not colpix:
        return
    bottom = colpix[-1][0]
    if bottom >= FEET_Y:
        return
    delta = FEET_Y - bottom
    if delta <= 0:
        return
    for y, _ in colpix:
        set_px(cell, x, y, bytes((0, 0, 0, 0)))
    for y, rgba in colpix:
        set_px(cell, x, min(CELL_H - 1, y + delta), rgba)


def lift_rear_foot(contact_cell, lift_px=8, body_up=2):
    cell = [bytearray(r) for r in contact_cell]
    shift_vertical(cell, -body_up)

    cols = foot_columns(cell)
    clumps = clusters_from_cols(cols)
    if not cols:
        return cell

    if len(clumps) == 1:
        mid = cols[len(cols) // 2]
        rear = (cols[0], mid - 1)
        front = (mid, cols[-1])
    else:
        rear = clumps[0]
        front = clumps[-1]

    rear_x0 = max(0, rear[0] - 1)
    rear_x1 = min(CELL_W - 1, rear[1] + 1)

    moved = []
    for y in range(105, CELL_H):
        for x in range(rear_x0, rear_x1 + 1):
            if not opaque(cell, x, y):
                continue
            r, g, b, a = px(cell, x, y)
            is_short = r < 90 and g < 70 and b < 60
            if y < 120 and is_short:
                continue
            moved.append((x, y, bytes(px(cell, x, y))))

    if not moved:
        return cell

    for x, y, _ in moved:
        set_px(cell, x, y, bytes((0, 0, 0, 0)))

    for x, y, rgba in moved:
        nx = min(CELL_W - 1, x + 2)
        ny = max(0, y - lift_px)
        if ny > FEET_Y - 4:
            ny = FEET_Y - 4
        if (not opaque(cell, nx, ny)) or cell[ny][nx * 4 + 3] < rgba[3]:
            set_px(cell, nx, ny, rgba)

    front_x0, front_x1 = front
    for x in range(front_x0, front_x1 + 1):
        stick_column_to_baseline(cell, x)
    return cell


def lower_contact(cell, dy=1):
    cell = [bytearray(r) for r in cell]
    shift_vertical(cell, dy)
    cols = foot_columns(cell)
    for x in cols:
        stick_column_to_baseline(cell, x)
    return cell


def main():
    if not BAK.exists():
        shutil.copy2(SRC, BAK)
        print("backed up to", BAK)
    else:
        print("using existing backup", BAK)

    w, h, rows = parse_png(BAK.read_bytes())
    assert (w, h) == (768, 480), (w, h)

    contact0 = lower_contact(cell_get(rows, 1, 0), 1)
    contact2 = lower_contact(cell_get(rows, 1, 2), 1)
    up1 = lift_rear_foot(contact0, lift_px=8, body_up=2)
    up3 = lift_rear_foot(contact2, lift_px=8, body_up=2)

    cell_put(rows, 1, 0, contact0)
    cell_put(rows, 1, 1, up1)
    cell_put(rows, 1, 2, contact2)
    cell_put(rows, 1, 3, up3)
    write_png(OUT, w, h, rows)
    print("wrote", OUT)

    strip = [bytearray(CELL_W * 4 * 4) for _ in range(CELL_H)]
    frames = [contact0, up1, contact2, up3]
    for col, cell in enumerate(frames):
        for y in range(CELL_H):
            strip[y][col * CELL_W * 4 : (col + 1) * CELL_W * 4] = cell[y]
        write_png(PREV / f"side_rev_{col}.png", CELL_W, CELL_H, cell)
    write_png(PREV / "side_revised_strip.png", CELL_W * 4, CELL_H, strip)

    try:
        from PIL import Image

        for i in range(4):
            im = Image.open(PREV / f"side_rev_{i}.png").convert("RGBA")
            bg = Image.new("RGBA", im.size, (36, 36, 42, 255))
            bg.alpha_composite(im)
            bg.convert("RGB").save(PREV / f"side_rev_{i}.jpg", quality=95)
        strip_im = Image.open(PREV / "side_revised_strip.png").convert("RGBA")
        bg = Image.new("RGBA", strip_im.size, (36, 36, 42, 255))
        bg.alpha_composite(strip_im)
        bg.convert("RGB").save(PREV / "side_revised_strip.jpg", quality=95)
    except Exception as exc:
        print("preview jpg skipped:", exc)

    for i, cell in enumerate(frames):
        cols = foot_columns(cell)
        clumps = clusters_from_cols(cols)
        top = next((y for y in range(CELL_H) if any(opaque(cell, x, y) for x in range(CELL_W))), None)
        print(f"rev{i}: top={top} clumps={clumps}")


if __name__ == "__main__":
    main()
