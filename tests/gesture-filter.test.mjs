import test from 'node:test'
import assert from 'node:assert/strict'

import { isLikelyHandLandmarks } from '../src/gesture-filter.js'

test('isLikelyHandLandmarks accepts a plausible hand skeleton', () => {
    const hand = [
        { x: 0.48, y: 0.82 },
        { x: 0.44, y: 0.75 },
        { x: 0.41, y: 0.67 },
        { x: 0.39, y: 0.60 },
        { x: 0.37, y: 0.53 },
        { x: 0.47, y: 0.67 },
        { x: 0.45, y: 0.55 },
        { x: 0.44, y: 0.43 },
        { x: 0.43, y: 0.31 },
        { x: 0.52, y: 0.65 },
        { x: 0.52, y: 0.51 },
        { x: 0.52, y: 0.37 },
        { x: 0.52, y: 0.24 },
        { x: 0.58, y: 0.67 },
        { x: 0.60, y: 0.55 },
        { x: 0.61, y: 0.44 },
        { x: 0.62, y: 0.34 },
        { x: 0.64, y: 0.70 },
        { x: 0.67, y: 0.61 },
        { x: 0.69, y: 0.52 },
        { x: 0.71, y: 0.44 },
    ]

    assert.equal(isLikelyHandLandmarks(hand, 0.92), true)
})

test('isLikelyHandLandmarks rejects a tiny face-like false positive cluster', () => {
    const faceLikeCluster = [
        { x: 0.46, y: 0.47 },
        { x: 0.45, y: 0.45 },
        { x: 0.44, y: 0.44 },
        { x: 0.43, y: 0.43 },
        { x: 0.42, y: 0.42 },
        { x: 0.47, y: 0.46 },
        { x: 0.47, y: 0.45 },
        { x: 0.47, y: 0.44 },
        { x: 0.47, y: 0.43 },
        { x: 0.49, y: 0.46 },
        { x: 0.49, y: 0.45 },
        { x: 0.49, y: 0.44 },
        { x: 0.49, y: 0.43 },
        { x: 0.51, y: 0.46 },
        { x: 0.51, y: 0.45 },
        { x: 0.51, y: 0.44 },
        { x: 0.51, y: 0.43 },
        { x: 0.53, y: 0.47 },
        { x: 0.53, y: 0.46 },
        { x: 0.53, y: 0.45 },
        { x: 0.53, y: 0.44 },
    ]

    assert.equal(isLikelyHandLandmarks(faceLikeCluster, 0.98), false)
})
