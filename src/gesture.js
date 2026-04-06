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

// PiP state
const pipCanvas = document.getElementById('pip-canvas')
const pipCtx = pipCanvas ? pipCanvas.getContext('2d') : null
let pipEnabled = true
let pipWidth = 240
let pipHeight = 180

export function setPipEnabled(val) {
    pipEnabled = val
    if (pipCanvas) pipCanvas.classList.toggle('pip-visible', val)
}

export function setPipSize(w, h) {
    pipWidth = w
    pipHeight = h
    if (pipCanvas) {
        pipCanvas.style.width  = w + 'px'
        pipCanvas.style.height = h + 'px'
        pipCanvas.width  = w
        pipCanvas.height = h
    }
}

export function onGesture(cb)      { onGestureChange = cb }
export function onSwipeGesture(cb) { onSwipe = cb }

export function initGesture() {
    if (!window.Hands) {
        console.error('[gesture] window.Hands not found — MediaPipe CDN scripts not loaded yet')
        setTimeout(initGesture, 500)
        return
    }

    // Size pip canvas
    if (pipCanvas) {
        pipCanvas.width  = pipWidth
        pipCanvas.height = pipHeight
    }
    initPipDrag()

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
        if (!isSending && video.readyState >= 2) {
            isSending = true
            try {
                await handsInstance.send({ image: video })
            } catch (err) {
                console.warn('[gesture] hands.send error:', err)
            }
            isSending = false
        }
        setTimeout(() => requestAnimationFrame(loop), 16)
    }

    requestAnimationFrame(loop)
}

function drawPip(results) {
    if (!pipCtx || !pipEnabled) return

    const video = getVideoElement()
    pipCtx.clearRect(0, 0, pipWidth, pipHeight)

    // Draw mirrored camera frame
    pipCtx.save()
    pipCtx.scale(-1, 1)
    pipCtx.drawImage(video, -pipWidth, 0, pipWidth, pipHeight)
    pipCtx.restore()

    if (!results.multiHandLandmarks?.length) return

    const lm = results.multiHandLandmarks[0]
    const toX = x => (1 - x) * pipWidth
    const toY = y => y * pipHeight

    const CONNECTIONS = window.HAND_CONNECTIONS || [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [5,9],[9,10],[10,11],[11,12],
        [9,13],[13,14],[14,15],[15,16],
        [13,17],[17,18],[18,19],[19,20],
        [0,17],
    ]

    pipCtx.strokeStyle = 'rgba(0, 255, 80, 0.85)'
    pipCtx.lineWidth = 1.5
    pipCtx.beginPath()
    for (const [a, b] of CONNECTIONS) {
        pipCtx.moveTo(toX(lm[a].x), toY(lm[a].y))
        pipCtx.lineTo(toX(lm[b].x), toY(lm[b].y))
    }
    pipCtx.stroke()

    pipCtx.fillStyle = 'rgba(0, 220, 255, 0.9)'
    for (const pt of lm) {
        pipCtx.beginPath()
        pipCtx.arc(toX(pt.x), toY(pt.y), 2.5, 0, Math.PI * 2)
        pipCtx.fill()
    }
}

function handleResults(results) {
    drawPip(results)

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

    if (dist < 0.06)       newState = false
    else if (dist > 0.11)  newState = true

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
        const threshold = galleryParams?.swipeSensitivity ?? 0.14
        if (Math.abs(delta) > threshold) {
            lastSwipeTime = now
            palmXHistory = []
            onSwipe?.(delta > 0 ? 'right' : 'left')
        }
    }
}

function initPipDrag() {
    if (!pipCanvas) return
    let dragging = false
    let startX, startY, origRight, origBottom

    pipCanvas.addEventListener('mousedown', e => {
        dragging = true
        startX = e.clientX
        startY = e.clientY
        const rect = pipCanvas.getBoundingClientRect()
        origRight  = window.innerWidth  - rect.right
        origBottom = window.innerHeight - rect.bottom
        e.preventDefault()
    })

    window.addEventListener('mousemove', e => {
        if (!dragging) return
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        pipCanvas.style.right  = (origRight  - dx) + 'px'
        pipCanvas.style.bottom = (origBottom + dy) + 'px'
    })

    window.addEventListener('mouseup', () => { dragging = false })
}
