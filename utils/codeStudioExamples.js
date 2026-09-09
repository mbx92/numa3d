export const CODE_STUDIO_CUSTOM = {
  id: '',
  name: 'Kode sendiri',
  color: '#f97316',
  code: `// Tulis kode sendiri. Semua ukuran dalam mm. Bentuk berpusat di origin.
const width = param("width", 40, { min: 10, max: 150 });
const depth = param("depth", 20, { min: 10, max: 100 });
const height = param("height", 8, { min: 2, max: 40 });
return box(width, depth, height);`
}

export const CODE_STUDIO_EXAMPLES = [
  {
    id: 'plate', name: 'Pelat berlubang',
    code: `// Semua ukuran dalam mm. Bentuk berpusat di origin.
const width = param("width", 60, { min: 20, max: 180 });
const depth = param("depth", 30, { min: 15, max: 100 });
const thickness = param("thickness", 8, { min: 2, max: 20 });
const radius = param("holeRadius", 3, { min: 1, max: 6, step: 0.5 });
const body = box(width, depth, thickness);
const hole = cylinder({ radius: radius, height: thickness + 2 });
return subtract(body, hole);`
  },
  {
    id: 'tray', name: 'Wadah terbuka',
    code: `const width = param("width", 70, { min: 30, max: 150 });
const depth = param("depth", 50, { min: 30, max: 150 });
const height = param("height", 25, { min: 10, max: 60 });
const wall = param("wall", 2, { min: 1, max: 4, step: 0.5 });
const outer = box(width, depth, height);
const cavity = translate(box(width - 2 * wall, depth - 2 * wall, height), [0, 0, wall]);
return subtract(outer, cavity);`
  },
  {
    id: 'pattern', name: 'Pola lubang',
    code: `const count = param("count", 5, { min: 2, max: 10 });
const pitch = param("pitch", 12, { min: 10, max: 18 });
const thickness = param("thickness", 5, { min: 2, max: 10 });
const body = box((count - 1) * pitch + 16, 24, thickness);
const hole = cylinder({ radius: 3, height: thickness + 2 });
const holes = translate(repeat(hole, count, [pitch, 0, 0]), [-(count - 1) * pitch / 2, 0, 0]);
    return subtract(body, holes);`
  },
  {
    id: 'croissant', name: 'Croissant', color: '#d4923a',
    code: `// Badan sabit dengan lima gulungan melintang dan ujung meruncing.
const size = param("size", 30, { min: 18, max: 48 });
const puff = param("puff", 12, { min: 10, max: 16 });
const flatten = param("flatten", 0.65, { min: 0.5, max: 0.8, step: 0.01 });
const curl = param("curl", 32, { min: 12, max: 55 });

const thickness = size * puff / 30;
const span = 150 + curl;
const dough = rotate(torus({ major: size, minor: thickness,
  arc: span, taper: 0.94, flatten: flatten, segments: 96
}), [0, 0, (180 - span) / 2]);

const middle = rotate(torus({ major: size, minor: thickness * 1.06,
  arc: 44, taper: 0.12, flatten: flatten, segments: 96
}), [0, 0, 68]);
const shoulder = torus({ major: size, minor: thickness * 0.76,
  arc: 32, taper: 0.14, flatten: flatten, segments: 96 });
const tipRoll = torus({ major: size, minor: thickness * 0.43,
  arc: 26, taper: 0.24, flatten: flatten, segments: 96 });

return rotate(union(dough, middle,
  rotate(shoulder, [0, 0, 35]), rotate(shoulder, [0, 0, 113]),
  rotate(tipRoll, [0, 0, 13]), rotate(tipRoll, [0, 0, 141])
), [0, 0, 180]);`
  },
  {
    id: 'rounded-enclosure', name: 'Enclosure elektronik', color: '#36a99a',
    code: `const width = param("width", 60, { min: 40, max: 120 });
const wall = param("wall", 2, { min: 1.2, max: 3, step: 0.2 });
const outer = roundedBox(width, 40, 22, 4);
const cavity = translate(roundedBox(width - 2 * wall, 40 - 2 * wall, 22, 4 - wall), [0, 0, wall]);
const port = translate(roundedBox(12, 10, 6, 1), [0, -20, 0]);
return subtract(outer, cavity, port);`
  },
  {
    id: 'ergonomic-handle', name: 'Handle ergonomis', color: '#4695c5',
    code: `const length = param("length", 65, { min: 45, max: 100 });
const grip = hull(translate(sphere(10), [0, 0, -length / 2]), sphere(12), translate(sphere(8), [0, 0, length / 2]));
const bore = cylinder({ radius: 3, height: length + 30 });
return subtract(grip, bore);`
  },
  {
    id: 'smooth-cactus', name: 'Kaktus organik', color: '#4c9d59',
    code: `const height = param("height", 60, { min: 50, max: 80 });
const trunk = capsule({ radius: 8, height: height });
const elbow = translate(rotate(capsule({ radius: 5, height: 28 }), [0, 90, 0]), [12, 0, 2]);
const branch = translate(capsule({ radius: 5, height: 24 }), [21, 0, 11]);
const arm = smoothUnion(elbow, branch, 5);
const body = smoothUnion(trunk, arm, 5);
const foot = translate(cylinder({ radius: 13, height: 5 }), [0, 0, -height / 2 + 2]);
return union(body, foot);`
  },
  {
    id: 'mx-housing', name: 'Housing switch MX', color: '#a1a1aa',
    code: `// Nominal 14 mm MX plate opening, not a calibrated switch mechanism.
const clearance = param("clearance", 0.2, { min: 0.1, max: 0.5, step: 0.05 });
const opening = 14 + clearance;
const body = roundedBox(22, 22, 10, 1.5);
const skirt = translate(box(18, 18, 10), [0, 0, -1.5]);
const socket = box(opening, opening, 14);
const relief = translate(box(4, 18, 6), [0, 0, -3]);
return subtract(body, skirt, socket, relief);`
  },
  {
    id: 'camera-bracket', name: 'Bracket kamera', color: '#54636b',
    code: `const bore = param("bore", 3.3, { min: 2.5, max: 4, step: 0.1 });
const base = roundedBox(50, 34, 6, 2);
const upright = translate(roundedBox(50, 6, 32, 2), [0, 14, 13]);
const gusset = hull(translate(box(4, 24, 4), [20, 0, 1]), translate(box(4, 4, 22), [20, 12, 10]));
const mounts = translate(repeat(cylinder({ radius: bore, height: 10 }), 2, [30, 0, 0]), [-15, -5, 0]);
const camera = translate(rotate(cylinder({ radius: bore, height: 12 }), [90, 0, 0]), [0, 14, 19]);
return subtract(union(base, upright, gusset), mounts, camera);`
  },
  {
    id: 'ventilated-enclosure', name: 'Enclosure berventilasi', color: '#b47786',
    code: `const wall = param("wall", 2, { min: 1.5, max: 3, step: 0.25 });
const body = roundedBox(72, 48, 28, 4);
const cavity = translate(roundedBox(72 - 2 * wall, 48 - 2 * wall, 28, 4 - wall), [0, 0, wall]);
const slot = roundedBox(3, 54, 12, 1);
const vents = translate(repeat(slot, 8, [7, 0, 0]), [-24.5, 0, 1]);
return subtract(body, cavity, vents);`
  },
  {
    id: 'rounded-planter', name: 'Pot dengan rongga', color: '#cd7180',
    code: `const width = param("width", 60, { min: 40, max: 90 });
const wall = param("wall", 2.5, { min: 2, max: 4, step: 0.5 });
const outer = roundedBox(width, width, 50, 8);
const inner = translate(roundedBox(width - 2 * wall, width - 2 * wall, 50, 8 - wall), [0, 0, wall + 1]);
const drain = cylinder({ radius: 3, height: 60 });
return subtract(outer, inner, drain);`
  },
  {
    id: 'hex-plate', name: 'Pelat heksagon', color: '#5b8def',
    code: `const size = param("size", 40, { min: 24, max: 80 });
const thickness = param("thickness", 4, { min: 2, max: 10 });
const hole = param("hole", 6, { min: 2, max: 8 });
const plate = extrude(polygon({ sides: 6, radius: size / 2 }), thickness);
const bore = cylinder({ radius: hole, height: thickness + 2 });
return subtract(plate, bore);`
  },
  {
    id: 'turned-bowl', name: 'Mangkuk putar', color: '#c9844a',
    code: `const radius = param("radius", 22, { min: 14, max: 36 });
const height = param("height", 16, { min: 12, max: 28 });
const wall = param("wall", 2, { min: 1.5, max: 3.5, step: 0.5 });
const rim = translate2d(rect2d(wall, height), [radius - wall / 2, height / 2]);
const floor = translate2d(rect2d(radius, wall), [radius / 2, wall / 2]);
return revolve(union2d(rim, floor), { segments: 64 });`
  },
  {
    id: 'star-coaster', name: 'Tatakan bintang', color: '#e2a03a',
    code: `const size = param("size", 50, { min: 32, max: 80 });
const thickness = param("thickness", 3, { min: 2, max: 8 });
const points = param("points", 5, { min: 5, max: 8 });
const inner = param("inner", 0.42, { min: 0.35, max: 0.55, step: 0.01 });
const outline = polygon({ sides: points, radius: size / 2, inner: inner });
return extrude(outline, thickness);`
  }
]
