// Material: stok, biayanya sudah di HPP unit terjual.
// Mesin: aset; biaya masuk HPP lewat depresiasi per jam, bukan harga beli penuh.
export function isOperatingExpenseCategory(category) {
  return category !== 'material' && category !== 'machine'
}
