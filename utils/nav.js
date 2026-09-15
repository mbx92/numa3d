import {
  Squares2X2Icon,
  CircleStackIcon,
  CpuChipIcon,
  ArchiveBoxIcon,
  CubeIcon,
  CubeTransparentIcon,
  WrenchScrewdriverIcon,
  BeakerIcon,
  PrinterIcon,
  PuzzlePieceIcon,
  BuildingStorefrontIcon,
  BanknotesIcon,
  ShoppingCartIcon,
  TruckIcon,
  ChartBarIcon,
  WalletIcon,
  Cog6ToothIcon
} from '@heroicons/vue/24/outline'
import { isBetaToolPath } from './toolNavigation.js'

/** @type {{ label: string | null, items: { to: string, label: string, icon: import('vue').Component, newTab?: boolean }[] }[]} */
export const navSections = [
  {
    label: null,
    items: [{ to: '/', label: 'Dashboard', icon: Squares2X2Icon }]
  },
  {
    label: 'Inventori',
    items: [
      { to: '/materials', label: 'Material', icon: CircleStackIcon },
      { to: '/machines', label: 'Mesin', icon: CpuChipIcon },
      { to: '/packaging', label: 'Packaging', icon: ArchiveBoxIcon }
    ]
  },
  {
    label: 'Produk',
    items: [
      { to: '/products', label: 'Produk & HPP', icon: CubeIcon },
      { to: '/gallery', label: 'Galeri 3D', icon: CubeTransparentIcon }
    ]
  },
  {
    label: 'Operasi',
    items: [
      { to: '/tools', label: 'Tools', icon: WrenchScrewdriverIcon, newTab: true },
      { to: '/tools/beta', label: 'Tools Beta', icon: BeakerIcon, newTab: true },
      { to: '/production', label: 'Produksi', icon: PrinterIcon },
      { to: '/custom-orders', label: 'Custom', icon: PuzzlePieceIcon }
    ]
  },
  {
    label: 'Penjualan',
    items: [
      { to: '/catalog', label: 'Katalog', icon: BuildingStorefrontIcon },
      { to: '/sales', label: 'Penjualan', icon: ShoppingCartIcon }
    ]
  },
  {
    label: 'Keuangan',
    items: [
      { to: '/purchases', label: 'Pembelian', icon: TruckIcon },
      { to: '/expenses', label: 'Pengeluaran', icon: BanknotesIcon },
      { to: '/capital', label: 'Modal', icon: WalletIcon },
      { to: '/reports', label: 'Laporan', icon: ChartBarIcon }
    ]
  },
  {
    label: 'Sistem',
    items: [{ to: '/settings', label: 'Pengaturan', icon: Cog6ToothIcon }]
  }
]

export function isNavActive(routePath, to) {
  if (to === '/tools/beta') return isBetaToolPath(routePath)
  if (to === '/tools' && isBetaToolPath(routePath)) return false
  if (to === '/') return routePath === '/'
  return routePath === to || routePath.startsWith(`${to}/`)
}
