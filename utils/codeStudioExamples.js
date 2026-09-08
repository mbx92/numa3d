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
  }
]
