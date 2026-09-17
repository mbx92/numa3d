import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeMinioObjects } from '../server/utils/minioUsage.js'

test('summarizeMinioObjects counts actual bucket volume per top-level folder', () => {
  const result = summarizeMinioObjects([
    { name: 'products/1/model.3mf', size: 1200 },
    { name: 'products/1/images/cover.webp', size: 300 },
    { name: 'fonts/Roboto.ttf', size: 500 },
    { name: 'manifest.json', size: 100 },
    { name: 'empty-folder/', size: 0 }
  ])

  assert.deepEqual(result, {
    fileCount: 4,
    totalBytes: 2100,
    folders: [
      { name: '(root)', prefix: '', fileCount: 1, totalBytes: 100 },
      { name: 'fonts', prefix: 'fonts/', fileCount: 1, totalBytes: 500 },
      { name: 'products', prefix: 'products/', fileCount: 2, totalBytes: 1500 }
    ]
  })
})

test('summarizeMinioObjects normalizes missing and invalid sizes', () => {
  const result = summarizeMinioObjects([
    { name: 'library/a.stl' },
    { name: 'library/b.stl', size: -20 },
    { name: '', size: 10 }
  ])

  assert.equal(result.fileCount, 2)
  assert.equal(result.totalBytes, 0)
  assert.deepEqual(result.folders, [
    { name: 'library', prefix: 'library/', fileCount: 2, totalBytes: 0 }
  ])
})
