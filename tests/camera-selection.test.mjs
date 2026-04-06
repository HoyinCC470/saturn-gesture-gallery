import test from 'node:test'
import assert from 'node:assert/strict'

import { resolvePreferredCameraId } from '../src/camera-selection.js'

test('resolvePreferredCameraId keeps the saved camera when it still exists', () => {
    const devices = [
        { deviceId: 'front' },
        { deviceId: 'rear' },
    ]

    assert.equal(resolvePreferredCameraId('rear', devices), 'rear')
})

test('resolvePreferredCameraId falls back to the first available camera when the saved one is stale', () => {
    const devices = [
        { deviceId: 'front' },
        { deviceId: 'rear' },
    ]

    assert.equal(resolvePreferredCameraId('ghost-device', devices), 'front')
})
