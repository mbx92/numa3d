# QR Plate: SVG holes and slicer project settings

## Fix

The QR header placement converted all SVG contours to positive winding before
constructing a NonZero cross section. This filled holes in ornaments and letters.
SCAD independently unioned each contour as a solid polygon, filling them again.
The header now retains outer/hole winding, resolves overlaps through one cross
section, and exports its contours as a compound SCAD polygon with paths.

SVG closed strokes also shared a Vector2 for the first/last point. Inverse
transforming those points in place applied the transform twice to that vertex.
Cloning points fixes reflected/transformed closed strokes for every generator.

New QR Plate logos start with zero added thickness. The existing thickness
control expands the artwork by half its value on each side. A 0.4 mm round
opening flags logos with more than 5% area loss as potentially difficult to
slice. This heuristic includes sharp corners and does not measure exact minimum
wall width or simulate extrusion. It never modifies the artwork.

## 3MF

QR Plate now exports the optional `pla-detail-0.4` process/material overrides:
0.12 mm layers, Arachne, 0.42 mm nominal lines, 25% minimum feature size,
85% minimum wall width, two walls, and slower outer/top surfaces. PLA starts
at 215 C then 205 C, with a 60 C textured bed, using the installed Orca Kobra X
PLA preset as the temperature reference. Material settings cover every color
slot. Other generators retain their existing export defaults.

The export references the installed Kobra X machine preset. It does not embed a
complete replacement machine profile or machine/tool-change G-code. Open it as
a project and verify the selected printer, filament, and toolpaths in Orca.
Anycubic Slicer Next project compatibility has not been verified.

## Validation — 12 September 2026

- `npm test`: 131 tests passed. Regression cases cover nested holes/islands,
  overlapping colors, reflected thin strokes, raised/inlay modes at 28 mm,
  SCAD polygon area, QR scanning, and process/material settings for color slots.
- `npm run build` and `git diff --check` passed.
- The supplied Kubu Dangi SVG retains its 71 contours, including 39 holes before
  optional thickening. Actual top-face mesh area was compared with exported
  3MF volume divided by artwork height: 106.30119 mm2 at 28 mm without thickening;
  174.00146 mm2 with 0.2 mm added width (agreement within 0.00004 mm2).
- Top-face projections from the actual mesh were visually inspected for both
  cases. Temporary comparison artifacts are under `/tmp/numa-qr-review`.
  The sample plaques use the default example.com QR, not a production payload.
- OrcaSlicer 2.4.2 CLI `--help` works, but the import/info command crashes with
  exit 139, including outside the sandbox with an isolated data directory.
  Interactive browser/slicer import, OpenSCAD rendering, and physical printing
  have not been verified. SCAD regression checks evaluate the exported paths
  with even/odd fill in Manifold. No deployment was performed.
