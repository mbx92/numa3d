// Orca project overrides for small PLA artwork on the installed Kobra X preset.
// These are process/material settings, not a replacement machine profile.
// Temperature baseline: Orca's Anycubic PLA @Anycubic Kobra X 0.4 nozzle.
import { KOBRA_X_HQ_016_PROCESS } from './kobraXHq016Process.js'

export const TOOL_PRINT_PROFILES = Object.freeze({
  'qr-plate': Object.freeze({
    id: 'qr-plate-pla-0.4', label: 'QR Plate Detail',
    note: 'Utamakan ketajaman pola QR dan tulisan. Uji pemindaian QR setelah cetak.',
    settings: Object.freeze({ layer_height: '0.12', wall_loops: '2', sparse_infill_density: '15%', outer_wall_speed: '40', top_surface_speed: '30' })
  }),
  keychain: Object.freeze({
    id: 'keychain-pla-0.4', label: 'Keychain Detail',
    note: 'Dinding lebih tebal untuk gantungan, dengan kecepatan permukaan lebih rendah. Uji kecocokan teks dengan rongga base.',
    settings: Object.freeze({ layer_height: '0.12', wall_loops: '3', sparse_infill_density: '20%', outer_wall_speed: '35', top_surface_speed: '25' })
  }),
  clicker: Object.freeze({
    id: 'clicker-pla-0.4', label: 'Clicker Presisi',
    note: 'Utamakan dinding socket dan sambungan. Uji pemasangan switch, lid, serta gerak engsel jika digunakan.',
    settings: Object.freeze({ layer_height: '0.16', wall_loops: '3', sparse_infill_density: '20%', outer_wall_speed: '35', top_surface_speed: '30' })
  })
})

const DEFAULT_FLUSH = 70

export function flushVolumesMatrix(filamentCount, volume = DEFAULT_FLUSH) {
  if (!Number.isInteger(filamentCount) || filamentCount < 1) throw new Error('Jumlah slot filament tidak valid')
  const matrix = []
  for (let from = 0; from < filamentCount; from++) {
    for (let to = 0; to < filamentCount; to++) matrix.push(from === to ? '0' : String(volume))
  }
  return matrix
}

export function slicerProjectSettings(preset, filamentCount) {
  if (preset == null) return {}
  const profile = Object.values(TOOL_PRINT_PROFILES).find((entry) => entry.id === preset)
  if (!profile && preset !== 'pla-detail-0.4') throw new Error('Profil proses 3MF tidak dikenal')
  if (!Number.isInteger(filamentCount) || filamentCount < 1) throw new Error('Jumlah slot filament tidak valid')
  const slots = (value) => Array(filamentCount).fill(value)
  const multiColor = filamentCount > 1
  return {
    ...KOBRA_X_HQ_016_PROCESS,
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
    enable_prime_tower: multiColor ? '1' : '0',
    flush_volumes_matrix: flushVolumesMatrix(filamentCount),
    flush_multiplier: '1',
    filament_settings_id: slots('Anycubic PLA @Anycubic Kobra X 0.4 nozzle'),
    filament_type: slots('PLA'),
    filament_diameter: slots('1.75'),
    nozzle_temperature: slots('205'),
    nozzle_temperature_initial_layer: slots('215'),
    textured_plate_temp: slots('60'),
    textured_plate_temp_initial_layer: slots('60'),
    ...(profile ? {
      ...profile.settings,
      print_settings_id: `Numa3D ${profile.label} ${profile.settings.layer_height} @Anycubic Kobra X`
    } : {})
  }
}
