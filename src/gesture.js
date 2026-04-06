// MediaPipe Hands runs on its own 30fps loop, decoupled from the 60fps render loop.
// This prevents hand-detection work from stealing render frame budget.

import { getVideoElement, setStatusTracking, setStatusNoHand } from './camera-device.js'

let handsInstance = null
let onGestureChange = null   // callback(isExploded: boolean)
let lastGestureState = null

// Swipe detection state
const SWIPE_HISTORY_FRAMES = 12
const SWIPE_THRESHOLD = 0.14
const SWIPE_COOLDOWN_MS = 500
let palmXHistory = []
let lastSwipeTime = 0
let onSwipe = null  // callback(direction: 'left' | 'right')

export function onGesture(cb) {
    onGestureChange = cb
}

export function onSwipeGesture(cb) {
    onSwipe = cb
}

export function initGesture() {
    // MediaPipe is loaded via CDN script tags in index.html
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

    // Run detection at ~30fps independently of the render loop
    const video = getVideoElement()
    const FPS = 30
    const INTERVAL = 1000 / FPS

    let lastSend = 0
    function tick(now) {
        if (now - lastSend >= INTERVAL) {
            if (video.readyState >= 2) {
                handsInstance.send({ image: video }).catch(() => {})
            }
            lastSend = now
        }
        requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
}

function handleResults(results) {
    if (!results.multiHandLandmarks?.length) {
        setStatusNoHand()
        palmXHistory = []
        return
    }

    setStatusTracking()
    const lm = results.multiHandLandmarks[0]

    // ── Pinch/spread detection (thumb tip vs index tip) ──
    const dist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
    let newState = lastGestureState

    if (dist < 0.06)       newState = false   // pinch → contract
    else if (dist > 0.11)  newState = true    // spread → explode

    if (newState !== lastGestureState) {
        lastGestureState = newState
        onGestureChange?.(newState)
    }

    // ── Swipe detection (palm center = landmark 9) ──
    const palmX = lm[9].x
    palmXHistory.push(palmX)
    if (palmXHistory.length > SWIPE_HISTORY_FRAMES) palmXHistory.shift()

    const now = performance.now()
    if (palmXHistory.length === SWIPE_HISTORY_FRAMES && now - lastSwipeTime > SWIPE_COOLDOWN_MS) {
        const delta = palmXHistory[palmXHistory.length - 1] - palmXHistory[0]
        if (Math.abs(delta) > SWIPE_THRESHOLD) {
            lastSwipeTime = now
            palmXHistory = []
            // MediaPipe x increases left→right; positive delta = rightward hand movement = "next"
            onSwipe?.(delta > 0 ? 'right' : 'left')
        }
    }
}
