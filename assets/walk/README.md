# Walk test assets

Source files for the walk test corner (Queen Street East at River Street, 1911).

- `textures/*_1k.jpg`: PBR materials from Poly Haven (polyhaven.com), all CC0. Ids: `red_brick_03`,
  `red_bricks_04`, `brown_mud_03`, `weathered_brown_planks`, `white_plaster_02`,
  `weathered_plank_siding`, `wood_planks_dirt`, `concrete_wall_007`, `roof_09`, `rusty_metal_02`.
- `textures/signs/*.png`: painted signs made by `tools/blender/make_signs.py`. The words are the
  plate's lettering; the paint and letterforms are imagined.
- The model is built by `tools/blender/corner_1911.py` (Blender 5.1, headless) from the plan's
  outlines and written to `unity/Assets/Buried/Walk/`.

Everything a visitor sees that is not an outline, a position, a storey count or a name from the
plan is set dressing, and the exhibit plaques say so.
