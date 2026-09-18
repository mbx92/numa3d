<script setup>
import { ArrowDownTrayIcon } from '@heroicons/vue/24/outline'
defineProps({ busy: Boolean, mesh: Boolean })
defineEmits(['download'])
</script>

<template>
  <div class="space-y-2">
    <button type="button" class="btn-primary w-full text-sm" :disabled="busy" @click="$emit('download')">
      <ArrowDownTrayIcon class="w-4 h-4" />
      {{ busy ? 'Menyiapkan plate…' : 'Plate 260 × 260 · Semua bagian' }}
    </button>
    <InfoTooltip label="Informasi PrintPlateExport">
      Buka 3MF sebagai proyek di OrcaSlicer. Bagian tertata di tengah plate, jarak 6 mm, margin 5 mm.
      Gunakan profil printer 260 × 260 × 260 mm dan filament yang sesuai.
    </InfoTooltip>
    <InfoTooltip v-if="mesh" label="Informasi PrintPlateExport">Mesh mempertahankan arah model impor; bentuk dengan overhang mungkin memerlukan support.</InfoTooltip>
  </div>
</template>
