import { CODE_LIMITS } from './codeStudioLanguage.js'
import { CODE_STUDIO_EXAMPLES } from './codeStudioExamples.js'

// Provider-neutral contract. Code Studio currently has no hosted LLM endpoint.
export const CODE_STUDIO_AI_INSTRUCTIONS = `Generate only Numa3D DSL source, without markdown fences or explanatory prose.
This is a data language, NOT executable JavaScript. Use const declarations followed by exactly one return solid.
Allowed: finite numeric literals, strings for param names, literal option objects, [x,y,z], parentheses, comments, + - * /.
Never emit imports, properties (including Math), indexing, loops, functions, conditions, assignments, arrays of solids, eval, network, DOM, or external libraries.
Units are mm, Z is up, primitives are centered at the origin. rotate uses degrees about global X then Y then Z. The completed solid is translated onto Z=0 only after all modeling.
Functions:
box(width, depth, height)
roundedBox(width, depth, height, radius): real rounded geometry, 0 <= radius <= half the smallest dimension. Prefer for consumer products, cases, buttons, brackets.
sphere(radius)
cylinder({radius, height, segments}): closed Z-axis cylinder, segments integer 8..96, default 48.
capsule({radius, height}): rounded Z-axis solid, height is TOTAL height including caps, height >= 2*radius.
torus({major, minor, arc, segments, taper, flatten, ridges, ridgeDepth}): XY ring/arc, major > minor. Defaults arc=360, segments=48, taper=0, flatten=1, ridges=0, ridgeDepth=0.18. arc=1..360, taper=0..1, flatten=0.2..1, integer ridges=0..16, ridgeDepth=0..0.45. Prefer for rings and arcs.
2D profiles cannot be returned. They become solids only via extrude or revolve. circle2d({radius, segments}), rect2d(width, depth) centered on XY, polygon({sides, radius, inner}): integer sides 3..24, inner 0.05..1 default 1 (regular n-gon; <1 makes a star). offset(profile, delta) Round join, delta -500..500. translate2d(profile,[x,y]), rotate2d(profile,degrees), scale2d(profile,s or [sx,sy]). union2d/subtract2d/intersect2d: 2..16 profiles.
extrude(profile, height) or extrude(profile,{height, twist, divisions}): centered Z prism. twist -360..360 requires integer divisions 4..64. revolve(profile) or revolve(profile,{arc, segments}): spin XY profile about Y, result axis is Z. Profile should lie on X>=0. segments 8..96 default 48, arc 1..360 default 360. Prefer polygon+extrude for plates and revolve for bowls/lathe parts. Do not invent vertex lists; there is no user Math or loops.
union(a,b,...), subtract(a,b,...), intersect(a,b,...), hull(a,b,...): 2..16 solids. hull is the CONVEX envelope, filling concavities and connecting separated inputs; prefer for grips and transitions. It is not a concave or smooth union.
smoothUnion(a,b,radius): exactly TWO solids and blend radius 0.1..100 mm. Prefer for organic joins. Inputs may contain box, roundedBox, sphere, cylinder, capsule, translate, rotate, UNIFORM scale, union, repeat, nested smoothUnion ONLY. No hull, torus, subtract, intersect, extrude, revolve or nonuniform scale inside smoothUnion. Those operations may be applied AFTER a smoothUnion. Uses finite analytic-field sampling, not exact fillets or mesh smoothing. Cylinder segments do not affect the analytic field. Separated forms are not guaranteed to connect; overlap branches. Start with blend radius 3..6 mm and features >= 2 mm; keep input bounds compact. For a resolution error, enlarge the smallest feature/blend radius or simplify the input; do not hide errors by dropping features.
translate(solid,[x,y,z]), rotate(solid,[x,y,z]), scale(solid,[x,y,z]): scale components 0.01..100.
repeat(solid,count,[dx,dy,dz]): integer count 1..32, union copies including the original. Prefer for regular patterns.
param("name",initial,{min,max,step}): unique name, max 16 parameters. Defaults min=1,max=200,step=1. Give conservative ranges so all dimensions remain valid at the extremes. No arbitrary JavaScript is supported.
Dimensions 0.01..1000, sphere/cylinder/capsule radius <=500; all intermediate bounds <=1000 mm and coordinates within +/-10000 mm. Prefer models within a 250 mm print area. Limits: ${CODE_LIMITS.nodes} nodes, cost ${CODE_LIMITS.cost}, ${CODE_LIMITS.triangles} triangles/mesh, ${CODE_LIMITS.source} source characters, 30 seconds per worker.
Use subtract for cavities and holes. Extend through-cutters beyond both faces. For an open container translate a full-height cavity upward by wall thickness, preserving its floor. Subtract cavities AFTER hull/smoothUnion. Give joints positive overlap rather than mere tangency. Avoid isolated decorative fragments, zero-thickness walls, tiny features, and unverified fit claims. Mechanical dimensions require calibration in a slicer and a test print. Return one final solid.
`

export function buildCodeStudioAiPrompt() {
  return CODE_STUDIO_AI_INSTRUCTIONS + '\nValid compact examples:\n' + CODE_STUDIO_EXAMPLES
    .filter((e) => ['rounded-enclosure', 'ergonomic-handle', 'smooth-cactus', 'mx-housing', 'camera-bracket', 'ventilated-enclosure', 'rounded-planter', 'hex-plate', 'turned-bowl', 'star-coaster'].includes(e.id))
    .map((e) => `\n${e.name}:\n${e.code}`).join('\n')
}
