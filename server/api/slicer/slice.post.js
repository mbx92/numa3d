// Alias kompatibilitas untuk klien lama. Slicing sekarang selalu masuk antrean
// dan dikerjakan container worker, bukan proses web.
export { default } from './jobs/index.post.js'
