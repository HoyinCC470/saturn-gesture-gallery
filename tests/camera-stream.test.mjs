import test from 'node:test'
import assert from 'node:assert/strict'

import { stopMediaStream } from '../src/camera-stream.js'

test('stopMediaStream stops every track on the stream', () => {
    let stopped = 0
    const stream = {
        getTracks() {
            return [
                { stop() { stopped += 1 } },
                { stop() { stopped += 1 } },
            ]
        },
    }

    stopMediaStream(stream)

    assert.equal(stopped, 2)
})
