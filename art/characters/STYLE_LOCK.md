# Character Art Style Lock

**Status:** LOCKED — apply to every future character, equipment, and overlay prompt.  
**Tone:** Cozy medieval-fantasy pixel art — Stardew Valley warmth + Battle Brothers grit.  
**Not a copy:** Original silhouettes and palette; inspired by the *feel* of those games only.

## One-sentence style

Readable top-down villagers who could farm by day and fight a bandit by dusk: soft cozy colors, firm dark outlines, a little dirt under the nails.

## Visual pillars

1. **Cozy readability** — clear silhouettes, slightly large heads and hands, warm natural skin.
2. **Medieval grit** — muted earthy cloth, selective dark outlines (never pure black), no glossy anime polish.
3. **Grounded fantasy** — practical starter clothes; no glowing edges, bloom, or vector sheen.
4. **Equipment-first consistency** — identical pose template across all twelve presets so one armor/weapon sheet fits all.

## Technical lock (non-negotiable)

| Rule | Value |
| --- | --- |
| Frame size | 64 × 64 px |
| Horizontal center | X = 32 |
| Feet baseline | Y = 55 |
| Visible height | ~46–50 px |
| Background | Fully transparent |
| Perspective | Three-quarter top-down |
| Lighting | Upper-left |
| Directions authored | Down, Side-right, Up (mirror for left) |
| Pixel rules | Native pixels, no AA, no blur, no smooth gradients, no semi-transparent edge pixels |
| Outline | Dark colored selective outlines (e.g. deep brown/umber), not `#000000` |
| Tones | ~3–4 discrete tones per material |
| Hair | Compact, helmet-compatible; no waist-length or huge silhouettes |
| Base costume | Shirt + shorts + bare feet only; no armor/weapons/accessories |

## Palette guidance

- **Skin:** warm natural ranges (olive, fair, tan, deep brown); highlight from upper-left.
- **Cloth:** muted medieval (beige, sage, ochre, plum, forest, rust, gray-blue) — desaturated, not neon.
- **Hair:** natural browns/blacks/blonds/auburn/silver; keep volume inside/near head.
- **Outline:** deep umber / cool dark brown / soft charcoal — pick one family and keep it.

## What “grit” means here

- Slightly heavier outline on outer silhouette.
- Cloth midtones lean dusty, not pastel-candy.
- Faces stay friendly but not plastic-smooth; small freckles/stubble/weather allowed when briefed.
- No blood, wounds, gore, or combat VFX on base sheets.

## Production sequence (mandatory)

1. Approve C01 sheets: `idle`, `move`, `attack_unarmed`, `attack_melee`.
2. Finish C01: `attack_bow`, `cast`, `hurt`, `death`.
3. Temporary equipment alignment test (chest, boots, sword) on C01 only.
4. Appearance-edit C02–C12 from C01 references — poses never reinterpreted.
5. Later: shared equipment overlays (one sheet per item for all twelve).

## Negative lock

No separate body/hair/shirt layers for export · no left-facing frames · no armor/weapons on base · no floor/shadow/UI/text/grid · no AA/blur/gradients/motion blur · no anatomy or pose drift between characters.

## File contract

Working files: `cXX_<anim>.png` (8 sheets × 12 characters = 96 PNGs).  
Optional later pack: `cXX_character_atlas.png` (12 atlases).
