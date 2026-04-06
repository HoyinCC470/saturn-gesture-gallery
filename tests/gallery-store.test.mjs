import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeGalleryAssets } from '../src/gallery-store.js'

test('mergeGalleryAssets appends newly uploaded images instead of replacing the existing cache', () => {
    const existingTextures = ['img-1', 'img-2', 'img-3']
    const existingAspects = [1.2, 1.3, 1.4]
    const nextTextures = ['img-4', 'img-5']
    const nextAspects = [1.5, 1.6]

    const merged = mergeGalleryAssets(existingTextures, existingAspects, nextTextures, nextAspects)

    assert.deepEqual(merged.textures, ['img-1', 'img-2', 'img-3', 'img-4', 'img-5'])
    assert.deepEqual(merged.aspects, [1.2, 1.3, 1.4, 1.5, 1.6])
})
