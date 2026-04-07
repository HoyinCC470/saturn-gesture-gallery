import test from 'node:test'
import assert from 'node:assert/strict'

import {
    applyGalleryAssetOrder,
    createMemoryGalleryStore,
    mergeGalleryAssets,
    normalizeGalleryAssetRecords,
    removeGalleryAssetRecord,
} from '../src/gallery-store.js'

test('mergeGalleryAssets appends newly uploaded images instead of replacing the existing cache', () => {
    const existingTextures = ['img-1', 'img-2', 'img-3']
    const existingAspects = [1.2, 1.3, 1.4]
    const nextTextures = ['img-4', 'img-5']
    const nextAspects = [1.5, 1.6]

    const merged = mergeGalleryAssets(existingTextures, existingAspects, nextTextures, nextAspects)

    assert.deepEqual(merged.textures, ['img-1', 'img-2', 'img-3', 'img-4', 'img-5'])
    assert.deepEqual(merged.aspects, [1.2, 1.3, 1.4, 1.5, 1.6])
})

test('normalizeGalleryAssetRecords sorts by sortOrder and reindexes missing values', () => {
    const records = normalizeGalleryAssetRecords([
        { id: 'b', sortOrder: 4 },
        { id: 'a' },
        { id: 'c', sortOrder: 1 },
    ])

    assert.deepEqual(records.map(r => r.id), ['c', 'b', 'a'])
    assert.deepEqual(records.map(r => r.sortOrder), [0, 1, 2])
})

test('applyGalleryAssetOrder moves selected ids to the front and preserves the rest', () => {
    const records = [
        { id: 'a', sortOrder: 0 },
        { id: 'b', sortOrder: 1 },
        { id: 'c', sortOrder: 2 },
    ]

    const reordered = applyGalleryAssetOrder(records, ['c', 'a'])
    assert.deepEqual(reordered.map(r => r.id), ['c', 'a', 'b'])
    assert.deepEqual(reordered.map(r => r.sortOrder), [0, 1, 2])
})

test('removeGalleryAssetRecord removes a single record and preserves order', () => {
    const records = [
        { id: 'a', sortOrder: 0 },
        { id: 'b', sortOrder: 1 },
        { id: 'c', sortOrder: 2 },
    ]

    const removed = removeGalleryAssetRecord(records, 'b')
    assert.deepEqual(removed.map(r => r.id), ['a', 'c'])
})

test('createMemoryGalleryStore supports append, reorder, remove, and clear', async () => {
    const store = createMemoryGalleryStore([
        { id: 'a', name: 'A', sortOrder: 0 },
    ])

    await store.append([
        { id: 'b', name: 'B', sortOrder: 1 },
        { id: 'c', name: 'C', sortOrder: 2 },
    ])

    assert.deepEqual((await store.list()).map(r => r.id), ['a', 'b', 'c'])

    await store.reorder(['c', 'a'])
    assert.deepEqual((await store.list()).map(r => r.id), ['c', 'a', 'b'])

    await store.remove('a')
    assert.deepEqual((await store.list()).map(r => r.id), ['c', 'b'])

    await store.clear()
    assert.deepEqual(await store.list(), [])
})
