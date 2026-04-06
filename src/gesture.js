// MediaPipe Hands runs on its own loop at ~30fps, decoupled from the 60fps render loop.
// CRITICAL: hands.send() must be awaited — firing without await floods the internal
// queue and causes onResults to stop firing entirely.

import { getVideoElement, setStatusTracking, setStatusNoHand } from './camera-device.js'
import { galleryParams } from './gallery.js'

let handsInstance = null
let onGestureChange = null
let lastGestureState = null
let isSending = false   // guard: only one frame in flight at a time

// Swipe detection
const SWIPE_HISTORY_FRAMES = 12
const SWIPE_COOLDOWN_MS = 500
let palmXHistory = []
let lastSwipeTime = 0
let onSwipe = null

export function onGesture(cb)      { onGestureChange = cb }
export function onSwipeGesture(cb) { onSwipe = cb }

export function initGesture() {
    if (!window.Hands) {
        console.error('[gesture] window.Hands not found — MediaPipe CDN scripts not loaded yet')
        // Retry after a short delay to let CDN scripts initialise
        setTimeout(initGesture, 500)
        return
    }

    handsInstance = new window.Hands({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    })

    handsInstance.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
    })

    handsInstance.onResults(handleResults)

    startLoop()
}

function startLoop() {
    const video = getVideoElement()

    async function loop() {
        // Only send a new frame when the previous one has completed
        if (!isSending && video.readyState >= 2) {
            isSending = true
            try {
                await handsInstance.send({ image: video })
            } catch (err) {
                console.warn('[gesture] hands.send error:', err)
            }
            isSending = false
        }

        // Schedule next tick — ~30fps via setTimeout so we don't hammer at 60fps
        setTimeout(() => requestAnimationFrame(loop), 16)
    }

    requestAnimationFrame(loop)
}

function handleResults(results) {
    if (!results.multiHandLandmarks?.length) {
        setStatusNoHand()
        palmXHistory = []
        return
    }

    setStatusTracking()
    const lm = results.multiHandLandmarks[0]

    // ── Pinch / spread (thumb tip [4] vs index tip [8]) ──
    const dist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
    let newState = lastGestureState

    if (dist < 0.06)       newState = false   // pinch → contract
    else if (dist > 0.11)  newState = true    // spread → explode

    if (newState !== lastGestureState) {
        lastGestureState = newState
        onGestureChange?.(newState)
    }

    // ── Swipe (palm centre = landmark 9) ──
    const palmX = lm[9].x
    palmXHistory.push(palmX)
    if (palmXHistory.length > SWIPE_HISTORY_FRAMES) palmXHistory.shift()

    const now = performance.now()
    if (palmXHistory.length === SWIPE_HISTORY_FRAMES && now - lastSwipeTime > SWIPE_COOLDOWN_MS) {
        const delta = palmXHistory[palmXHistory.length - 1] - palmXHistory[0]
        // Use live sensitivity from GUI params
        const threshold = galleryParams?.swipeSensitivity ?? 0.14
        if (Math.abs(delta) > threshold) {
            lastSwipeTime = now
            palmXHistory = []
            // MediaPipe x increases left→right; positive delta = hand moved right
            onSwipe?.(delta > 0 ? 'right' : 'left')
        }
    }
}
