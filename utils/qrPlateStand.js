export function qrPlateAssemblyTransform(design) {
  if (!design.stand) return null
  const angle = (90 - design.stand.tiltDeg) * Math.PI / 180
  return { angle, lift: design.stand.slotFloorZ + design.opts.baseThicknessMm / 2 * Math.cos(angle) }
}

export function buildQrPlateStand(wasm, design, track) {
  const s = design.stand
  if (!s) return null
  const { Manifold, CrossSection } = wasm
  const r = Math.min(6, s.depthMm / 4)
  const foot = track(track(CrossSection.square([s.widthMm - 2*r, s.depthMm - 2*r], true)).offset(r, 'Round', 2, 64))
  let stand = track(Manifold.extrude(foot, s.thicknessMm))
  if (s.columnHeightMm) {
    const w = Math.min(s.cradleWidthMm - 2, 24), d = 12
    let column
    if (design.opts.standStyle === 'twist') {
      const lowerSection = track(CrossSection.square([w, d], true))
      const lower = track(Manifold.extrude(lowerSection, s.columnHeightMm / 2, 16, 45, [0.55, 0.55]))
      const upperSection = track(track(CrossSection.square([w * 0.55, d * 0.55], true)).rotate(45))
      const upper = track(track(Manifold.extrude(upperSection, s.columnHeightMm / 2, 16, -45, [1 / 0.55, 1 / 0.55])).translate([0, 0, s.columnHeightMm / 2]))
      column = track(lower.add(upper))
    } else column = track(track(Manifold.cube([w, d, s.columnHeightMm])).translate([-w / 2, -d / 2, 0]))
    stand = track(stand.add(track(column.translate([0, 0, s.thicknessMm]))))
  }
  const cradle = track(track(Manifold.cube([s.cradleWidthMm, s.cradleDepthMm, s.cradleHeightMm])).translate([-s.cradleWidthMm / 2, -s.cradleDepthMm / 2, s.slotFloorZ]))
  stand = track(stand.add(cradle))
  const { angle, lift } = qrPlateAssemblyTransform(design)
  const thickness = design.opts.baseThicknessMm + design.opts.standClearanceMm
  const cut = track(track(track(Manifold.cube([design.widthMm + 2, design.depthMm + 10, thickness]))
    .translate([-(design.widthMm + 2) / 2, 0, -thickness / 2]))
    .rotate([angle * 180 / Math.PI, 0, 0]))
  return track(stand.subtract(track(cut.translate([0, 0, lift]))))
}
