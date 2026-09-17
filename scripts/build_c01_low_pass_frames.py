"""Side pass frames = narrowed contact stance, both feet on the ground (no high kick)."""
from pathlib import Path
import shutil
import numpy as np
from PIL import Image

SHEET = Path(r"C:\Users\Eszter\small-mmorpg\client\assets\characters\c01\c01_move.png")
BAK = Path(r"C:\Users\Eszter\small-mmorpg\client\assets\characters\c01\c01_move_original.png")
PREV = Path(r"C:\Users\Eszter\small-mmorpg\.tmp-side-frames")
W, H = 192, 160
ROW = 1
LEG_TOP = 96
CENTER_X = 96
# Pull feet together under the body; keep them planted (no vertical lift).
NARROW = 0.62


def restore() -> Image.Image:
    shutil.copy2(BAK, SHEET)
    return Image.open(SHEET).convert("RGBA")


def collected_pass(contact: np.ndarray) -> np.ndarray:
    """Horizontal-only remap of legs toward center — plant → gather → plant."""
    out = contact.copy()
    legs = (contact[:, :, 3] > 180) & (np.arange(H)[:, None] >= LEG_TOP)
    out[legs] = (0, 0, 0, 0)
    acc = np.zeros_like(contact)
    ys, xs = np.where(legs)
    for y, x in zip(ys.tolist(), xs.tolist()):
        nx = int(round(CENTER_X + (x - CENTER_X) * (1.0 - NARROW)))
        if 0 <= nx < W and contact[y, x, 3] >= acc[y, nx, 3]:
            acc[y, nx] = contact[y, x]
    mask = acc[:, :, 3] > 0
    out[mask] = acc[mask]
    # Close 1px gaps from remapping.
    for y in range(LEG_TOP, H):
        for x in range(1, W - 1):
            if out[y, x, 3] == 0 and out[y, x - 1, 3] > 180 and out[y, x + 1, 3] > 180:
                out[y, x] = out[y, x - 1]
        for x in range(W - 2, 0, -1):
            if out[y, x, 3] == 0 and out[y, x - 1, 3] > 180 and out[y, x + 1, 3] > 180:
                out[y, x] = out[y, x + 1]
    return out


def main() -> None:
    sheet = restore()
    c0 = np.array(sheet.crop((0, ROW * H, W, (ROW + 1) * H)))
    c2 = np.array(sheet.crop((2 * W, ROW * H, 3 * W, (ROW + 1) * H)))
    # Opposite contacts give opposite arm/weight cues while feet gather under the body.
    sheet.paste(Image.fromarray(collected_pass(c0), "RGBA"), (1 * W, ROW * H))
    sheet.paste(Image.fromarray(collected_pass(c2), "RGBA"), (3 * W, ROW * H))
    sheet.save(SHEET)
    print("updated", SHEET)

    PREV.mkdir(exist_ok=True)
    frames = []
    for col in range(4):
        c = sheet.crop((col * W, ROW * H, (col + 1) * W, (ROW + 1) * H))
        bg = Image.new("RGBA", (W, H), (36, 36, 42, 255))
        bg.alpha_composite(c)
        bg.convert("RGB").save(PREV / f"collect_{col}.jpg", quality=95)
        arr = np.array(c)
        a = arr[:, :, 3] > 180
        fy, fx = np.where(a & (np.arange(H)[:, None] > 135))
        print(
            col,
            "opaque",
            int(a.sum()),
            "foot_span",
            int(fx.max() - fx.min()) if len(fx) else None,
            "holes",
            sum(
                1
                for y in range(LEG_TOP, H)
                for x in range(1, W - 1)
                if arr[y, x, 3] == 0 and arr[y, x - 1, 3] > 180 and arr[y, x + 1, 3] > 180
            ),
        )
        frames.append(bg.resize((384, 320), Image.Resampling.NEAREST).convert("P", palette=Image.ADAPTIVE))
    frames[0].save(
        PREV / "side_walk_preview.gif",
        save_all=True,
        append_images=frames[1:],
        duration=[150, 150, 150, 150],
        loop=0,
        disposal=2,
    )
    print("preview", PREV / "side_walk_preview.gif")


if __name__ == "__main__":
    main()
