/** Standalone source; the QR matrix and glyph contours are shared with the mesh. */
export function qrPlateScad(design) {
  const { opts, runs, size, caption } = design
  const fmt = (value) => JSON.stringify(value, (_, item) => typeof item === 'number' ? Number(item.toFixed(8)) : item)
  let offset = 0
  const paths = caption.rings.map((ring) => ring.map(() => offset++))
  const icon = design.icon || { solid: [], holes: [], extra: [], bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 } }
  return `// Numa3D QR Plate. Standalone OpenSCAD, dimensions in millimetres.
// QR content, icon and caption outlines are embedded. Change them in Numa3D.
// Print the plate flat and the stand separately, then insert the plate into the slot.
/* [Plate] */
qr_size = ${opts.qrSizeMm}; // [25:1:180]
margin = ${opts.marginMm}; // [2:0.5:12]
corner_radius = ${opts.cornerRadiusMm}; // [0:0.5:12]
base_thickness = ${opts.baseThicknessMm}; // [1.2:0.2:8]
detail_height = ${opts.detailHeightMm}; // [0.2:0.2:2]
surface = ${fmt(opts.surfaceMode)}; // [raised,inlay]
caption_height = ${opts.captionHeightMm}; // [3:0.5:14]
icon_size = ${opts.iconSizeMm}; // [8:1:26]
mounting = ${fmt(opts.mounting)}; // [none,keyring,wall]
hole_diameter = ${opts.holeDiameterMm}; // [3:0.5:8]
/* [Stand] */
stand_style = ${fmt(opts.standStyle)}; // [none,slot,post,twist]
stand_width = ${opts.standWidthMm}; // [0:1:220]
stand_depth = ${opts.standDepthMm}; // [28:1:90]
foot_thickness = ${opts.standThicknessMm}; // [3:0.5:12]
post_height = ${opts.standHeightMm}; // [12:1:70]
stand_tilt = ${opts.standTiltDeg}; // [0:1:20]
slot_clearance = ${opts.standClearanceMm}; // [0.15:0.05:1]
/* [Output] */
layout = "print"; // [print,assembly]
part = "all"; // [all,frame,panel,qr,icon,stand]
/* [Hidden] */
$fn = 64;
qr_modules = ${size};
qr_runs = ${fmt(runs)};
caption_points = ${fmt(caption.rings.flat())};
caption_paths = ${fmt(paths)};
caption_aspect = ${fmt(caption.aspect)};
icon_solids = ${fmt(icon.solid)};
icon_holes = ${fmt(icon.holes)};
icon_extras = ${fmt(icon.extra)};
icon_bounds = ${fmt([icon.bounds.minX, icon.bounds.maxX, icon.bounds.minY, icon.bounds.maxY])};
frame_color = ${fmt(opts.colors.frame)};
base_color = ${fmt(opts.colors.base)};
detail_color = ${fmt(opts.colors.detail)};
icon_color = ${fmt(opts.colors.icon)};
module_size = qr_size / (qr_modules + 8);
has_stand = stand_style != "none" && mounting == "none";
insertion_band = has_stand ? 12 : 0;
icon_band = len(icon_solids) > 0 ? icon_size + 8 : 0;
text_band = len(caption_points) > 0 ? caption_height + 5 : 0;
caption_band = text_band + icon_band + insertion_band;
mount_band = mounting == "none" ? 0 : hole_diameter + 6;
width = qr_size + 2 * margin;
depth = qr_size + 2 * margin + caption_band + mount_band;
qr_y = (caption_band - mount_band) / 2;
icon_y = -depth/2 + margin + insertion_band + text_band + icon_band/2;
caption_y = -depth/2 + margin + insertion_band + text_band/2;
radius = min(corner_radius, margin, width/2, depth/2);
detail_z = surface == "inlay" ? base_thickness-detail_height : base_thickness;
panel_depth = min(base_thickness-0.8, max(1, detail_height+0.2));
caption_scale = len(caption_points) > 0 ? min(caption_height, qr_size/caption_aspect) : 0;
icon_scale = min(icon_size, qr_size) / max(icon_bounds[1]-icon_bounds[0], icon_bounds[3]-icon_bounds[2]);
foot_width = stand_width > 0 ? stand_width : max(width+8, 50);
tilt = stand_style == "slot" ? stand_tilt : 0;
angle = 90-tilt;
column_height = stand_style == "slot" ? 0 : post_height;
cradle_width = min(width*0.6, 42);
cradle_depth = base_thickness+slot_clearance+8+10*tan(tilt);
slot_floor = foot_thickness+column_height;
lift = slot_floor+base_thickness/2*cos(angle);
assert(module_size >= 0.6, "Increase QR size: modules must be at least 0.6 mm.");
assert(base_thickness >= 1.2 && detail_height >= 0.2, "Invalid layer thickness.");
assert(surface != "inlay" || base_thickness-detail_height >= 0.8, "Inlay must leave a 0.8 mm floor.");
assert(len(caption_points) == 0 || caption_scale >= 2, "Caption is too small.");
assert(!has_stand || foot_width >= min(width*0.7, 60), "Stand is too narrow.");
assert(slot_clearance >= 0.15 && slot_clearance <= 1, "Slot clearance must be 0.15 to 1 mm.");
module rounded_rect(w, d, r) {
  if (r > 0) offset(r=r) square([w-2*r, d-2*r], center=true);
  else square([w,d], center=true);
}
module plate_profile() {
  difference() {
    rounded_rect(width,depth,radius);
    if (mounting == "keyring") translate([0,depth/2-mount_band/2]) circle(d=hole_diameter);
    if (mounting == "wall") for (x = [-width/2+margin+hole_diameter/2, width/2-margin-hole_diameter/2])
      translate([x,depth/2-mount_band/2]) circle(d=hole_diameter);
  }
}
module qr_artwork() {
  // Work on the integer grid; 0.01 mm corner relief avoids diagonal edge contacts.
  c = 0.01/module_size;
  translate([-qr_size/2,qr_y+qr_size/2]) scale([module_size,module_size]) union()
    for (run = qr_runs) translate([run[0]+4,-run[1]-5]) let(w=run[2])
      polygon([[c,0],[w-c,0],[w,c],[w,1-c],[w-c,1],[c,1],[0,1-c],[0,c]]);
}
module icon_profile() {
  union() {
    difference() {
      union() for (ring = icon_solids) polygon(ring);
      union() for (ring = icon_holes) polygon(ring);
    }
    for (ring = icon_extras) polygon(ring);
  }
}
module decoration_artwork() {
  union() {
    if (len(caption_points) > 0) translate([0,caption_y]) scale([caption_scale,caption_scale])
      polygon(points=caption_points, paths=caption_paths);
    if (len(icon_solids) > 0) translate([0,icon_y]) scale([icon_scale,icon_scale])
      translate([-(icon_bounds[0]+icon_bounds[1])/2, -(icon_bounds[2]+icon_bounds[3])/2]) icon_profile();
  }
}
module qr(overlap=0) {
  translate([0,0,detail_z-overlap]) linear_extrude(height=detail_height+overlap) qr_artwork();
}
module decoration(overlap=0) { translate([0,0,detail_z-overlap]) linear_extrude(height=detail_height+overlap) decoration_artwork(); }
module panel_blank(overlap=0) {
  translate([0,qr_y,base_thickness-panel_depth-overlap]) linear_extrude(height=panel_depth+overlap) square([qr_size,qr_size], center=true);
}
module panel(overlap=0) { difference() { panel_blank(overlap); if (surface == "inlay") qr(); } }
module frame() {
  difference() {
    linear_extrude(height=base_thickness) plate_profile();
    panel_blank();
    if (surface == "inlay") decoration();
  }
}
module plate() {
  color(frame_color) frame();
  // A 1-micron internal overlap prevents floating-point seams in legacy CGAL.
  // Individual part exports below keep the exact non-overlapping boundaries.
  color(base_color) panel(0.001);
  color(detail_color) qr(0.001);
  color(icon_color) decoration(0.001);
}
module twisted_column(w,d,h) {
  n = 34;
  corners = [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
  pts = [for (i=[0:n]) for (p=corners) let(t=i/n, k=1-0.9*min(t,1-t), a=90*min(t,1-t))
    [k*(p[0]*cos(a)-p[1]*sin(a)), k*(p[0]*sin(a)+p[1]*cos(a)), h*t]];
  faces = concat([[3,2,1,0]], [for (i=[0:n-1]) for (j=[0:3]) each
    [[i*4+j, i*4+(j+1)%4, (i+1)*4+(j+1)%4], [i*4+j, (i+1)*4+(j+1)%4, (i+1)*4+j]]],
    [[n*4,n*4+1,n*4+2,n*4+3]]);
  // OpenSCAD polyhedron uses clockwise face winding when viewed from outside.
  polyhedron(pts, [for (f=faces) [for (j=[len(f)-1:-1:0]) f[j]]], convexity=10);
}
module stand() {
  if (has_stand) difference() {
    union() {
      linear_extrude(height=foot_thickness) rounded_rect(foot_width,stand_depth,min(6,stand_depth/4));
      if (column_height > 0) translate([0,0,foot_thickness]) {
        w = min(cradle_width-2,24);
        if (stand_style == "twist") twisted_column(w,12,column_height);
        else translate([-w/2,-6,0]) cube([w,12,column_height]);
      }
      translate([-cradle_width/2,-cradle_depth/2,slot_floor]) cube([cradle_width,cradle_depth,10]);
    }
    translate([0,0,lift]) rotate([angle,0,0]) translate([-(width+2)/2,0,-(base_thickness+slot_clearance)/2])
      cube([width+2,depth+10,base_thickness+slot_clearance]);
  }
}
module placed_plate() {
  if (has_stand && layout == "assembly") translate([0,0,lift]) rotate([angle,0,0]) translate([0,depth/2,-base_thickness/2]) plate();
  else plate();
}
if (part == "all") {
  placed_plate();
  color(frame_color) translate([has_stand && layout == "print" ? width/2+8+foot_width/2 : 0,0,0]) stand();
}
// Individual parts retain their original coordinates for multipart slicing.
if (part == "frame") frame();
if (part == "panel") panel();
if (part == "qr") qr();
if (part == "icon") decoration();
if (part == "stand") stand();
`
}
