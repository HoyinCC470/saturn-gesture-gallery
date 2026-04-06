import test from 'node:test'
import assert from 'node:assert/strict'

import { stopMediaStream, waitForVideoToBeReady } from '../src/camera-stream.js'

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

test('waitForVideoToBeReady resolves after the video can render frames', async () => {
    class FakeVideo extends EventTarget {
        constructor() {
            super()
            this.readyState = 0
            this.videoWidth = 0
            this.videoHeight = 0
        }
    }

    const videoEl = new FakeVideo()
    const readyPromise = waitForVideoToBeReady(videoEl, 100)

    setTimeout(() => {
        videoEl.readyState = 3
        videoEl.videoWidth = 320
        videoEl.videoHeight = 240
        videoEl.dispatchEvent(new Event('loadeddata'))
    }, 10)

    await assert.doesNotReject(readyPromise)
})
