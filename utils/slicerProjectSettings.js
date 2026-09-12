// Orca project overrides for small PLA artwork on the installed Kobra X preset.
// These are process/material settings, not a replacement machine profile.
// Temperature baseline: Orca's Anycubic PLA @Anycubic Kobra X 0.4 nozzle.
export function slicerProjectSettings(preset, filamentCount) {
  if (!preset) return {}
  if (preset !== 'pla-detail-0.4') throw new Error('Profil proses 3MF tidak dikenal')
  const slots = (value) => Array(filamentCount).fill(value)
  return {
    print_settings_id: 'Numa3D PLA Detail 0.12 @Anycubic Kobra X',
    layer_height: '0.12',
    initial_layer_print_height: '0.2',
    wall_generator: 'arachne',
    wall_loops: '2',
    line_width: '0.42',
    outer_wall_line_width: '0.42',
    min_feature_size: '25%',
    min_bead_width: '85%',
    initial_layer_min_bead_width: '100%',
    outer_wall_speed: '40',
    top_surface_speed: '30',
    initial_layer_speed: '25',
    top_shell_layers: '5',
    bottom_shell_layers: '5',
    sparse_infill_density: '15%',
    ironing_type: 'no ironing',
    filament_settings_id: slots('Anycubic PLA @Anycubic Kobra X 0.4 nozzle'),
    filament_type: slots('PLA'),
    filament_diameter: slots('1.75'),
    nozzle_temperature: slots('205'),
    nozzle_temperature_initial_layer: slots('215'),
    textured_plate_temp: slots('60'),
    textured_plate_temp_initial_layer: slots('60')
  }
}
