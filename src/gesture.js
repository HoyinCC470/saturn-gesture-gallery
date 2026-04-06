// MediaPipe Hands at ~30fps, decoupled from render loop.
// CRITICAL: hands.send() must be awaited to avoid queue overflow.

import { getVideoElement, setStatusTracking, setStatusNoHand } from './camera-device.js'
import { galleryParams } from './gallery.js'

let handsInstance = null
let onGestureChange = null   // cb(isOpen: boolean)
let onFreezeChange  = null   // cb(isFrozen: boolean)
let lastGestureState = null
let isSending = false

// Swipe detection
const SWIPE_HISTORY_FRAMES = 8    // fewer frames → responds faster with less travel
const SWIPE_COOLDOWN_MS    = 1200 // longer cooldown → hand can return without re-triggering
let palmXHistory  = []
let lastSwipeTime = 0
let swipeLockUntil = 0  // timestamp: block pinch/exit detection right after a swipe
let onSwipe = null

// PiP state
const pipCanvas = document.getElementById('pip-canvas')
const pipCtx    = pipCanvas ? pipCanvas.getContext('2d') : null
let pipEnabled = true
let pipWidth   = 240
let pipHeight  = 180

// ── Exports ─────────────��────────────────────��───────────────────────────────
export function setPipEnabled(val) {
    pipEnabled = val
    if (pipCanvas) pipCanvas.classList.toggle('pip-visible', val)
}
export function setPipSize(w, h) {
    pipWidth = w; pipHeight = h
    if (pipCanvas) {
        pipCanvas.style.width  = w + 'px'
        pipCanvas.style.height = h + 'px'
        pipCanvas.width  = w
        pipCanvas.height = h
    }
}
export function onGesture(cb)      { onGestureChange = cb }
export function onFreeze(cb)       { onFreezeChange  = cb }
export function onSwipeGesture(cb) { onSwipe = cb }

// ── Init ─────────────────────────��────────────────────────────���──────────────
export function initGesture() {
    if (!window.Hands) {
        console.error('[gesture] window.Hands not available — retrying in 500ms')
        setTimeout(initGesture, 500)
        return
    }

    if (pipCanvas) { pipCanvas.width = pipWidth; pipCanvas.height = pipHeight }
    initPipDrag()

    // modelComplexity 0 = lightweight model, loads ~3× faster than 1
    handsInstance = new window.Hands({
        locateFile: file => `/mediapipe/hands/${file}`,
    })
    handsInstance.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,          // was 1 — lighter model, faster initial load
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
    })
    handsInstance.onResults(handleResults)

    // Pre-warm: send a blank frame immediately so WASM compiles before user interaction
    _prewarm()

    startLoop()
}

async function _prewarm() {
    try {
        const blank = document.createElement('canvas')
        blank.width = 320; blank.height = 240
        await handsInstance.send({ image: blank })
        console.log('[gesture] MediaPipe model pre-warmed')
    } catch {}
}

function startLoop() {
    const video = getVideoElement()
    async function loop() {
        if (!isSending && video.readyState >= 2) {
            isSending = true
            try { await handsInstance.send({ image: video }) }
            catch (err) { console.warn('[gesture] send error:', err) }
            isSending = false
        }
        setTimeout(() => requestAnimationFrame(loop), 16)
    }
    requestAnimationFrame(loop)
}

// ── Gesture classifiers ─────────────────────────────────────────────────��─────
function classifyGesture(lm) {
    const dist48 = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)

    // Fist: thumb+index somewhat close AND middle/ring/pinky fingertips near palm center
    const cx = lm[9].x, cy = lm[9].y
    const avgOtherTipDist = [12, 16, 20]
        .reduce((s, i) => s + Math.hypot(lm[i].x - cx, lm[i].y - cy), 0) / 3
    const isFist = dist48 < 0.10 && avgOtherTipDist < 0.13

    if (isFist)             return 'fist'
    if (dist48 < 0.06)      return 'pinch'
    if (dist48 > 0.11)      return 'open'
    return 'neutral'
}

// ── Result handler ───────────────────────────────��───────────────────────────��
let lastFrozen = false

function handleResults(results) {
    drawPip(results)

    if (!results.multiHandLandmarks?.length) {
        setStatusNoHand()
        palmXHistory = []
        return
    }

    setStatusTracking()
    const lm  = results.multiHandLandmarks[0]
    const now = performance.now()
    const gesture = classifyGesture(lm)

    // ── Open / pinch state ──
    // Block pinch briefly after a swipe so hand-return doesn't exit gallery
    const pinchAllowed = now > swipeLockUntil
    let newState = lastGestureState
    if (gesture === 'open')                    newState = true
    else if (gesture === 'pinch' && pinchAllowed) newState = false

    if (newState !== lastGestureState) {
        lastGestureState = newState
        onGestureChange?.(newState)
    }

    // ── Fist / freeze ──
    const frozen = gesture === 'fist'
    if (frozen !== lastFrozen) {
        lastFrozen = frozen
        onFreezeChange?.(frozen)
    }

    // ── Swipe (palm centre = landmark 9) ──
    const palmX = lm[9].x
    palmXHistory.push(palmX)
    if (palmXHistory.length > SWIPE_HISTORY_FRAMES) palmXHistory.shift()

    if (palmXHistory.length === SWIPE_HISTORY_FRAMES && now - lastSwipeTime > SWIPE_COOLDOWN_MS) {
        const delta = palmXHistory[palmXHistory.length - 1] - palmXHistory[0]
        const threshold = galleryParams?.swipeSensitivity ?? 0.10
        if (Math.abs(delta) > threshold) {
            lastSwipeTime   = now
            swipeLockUntil  = now + 1200  // lock exit detection for 1.2s after swipe
            palmXHistory    = []
            onSwipe?.(delta > 0 ? 'right' : 'left')
        }
    }
}

// ── PiP drawing ───────────────────────────���──────────────────────────���────────
function drawPip(results) {
    if (!pipCtx || !pipEnabled) return
    const video = getVideoElement()
    pipCtx.clearRect(0, 0, pipWidth, pipHeight)
    pipCtx.save()
    pipCtx.scale(-1, 1)
    pipCtx.drawImage(video, -pipWidth, 0, pipWidth, pipHeight)
    pipCtx.restore()

    if (!results.multiHandLandmarks?.length) return
    const lm = results.multiHandLandmarks[0]
    const toX = x => (1 - x) * pipWidth
    const toY = y => y * pipHeight
    const CONNECTIONS = window.HAND_CONNECTIONS || [
        [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
        [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
        [13,17],[17,18],[18,19],[19,20],[0,17],
    ]
    pipCtx.strokeStyle = 'rgba(0,255,80,0.85)'; pipCtx.lineWidth = 1.5
    pipCtx.beginPath()
    for (const [a, b] of CONNECTIONS) {
        pipCtx.moveTo(toX(lm[a].x), toY(lm[a].y))
        pipCtx.lineTo(toX(lm[b].x), toY(lm[b].y))
    }
    pipCtx.stroke()
    pipCtx.fillStyle = 'rgba(0,220,255,0.9)'
    for (const pt of lm) {
        pipCtx.beginPath(); pipCtx.arc(toX(pt.x), toY(pt.y), 2.5, 0, Math.PI*2); pipCtx.fill()
    }
}

// ── PiP drag ────────────────��─────────────────────────────���───────────────────
function initPipDrag() {
    if (!pipCanvas) return
    let dragging = false, startX, startY, origRight, origBottom
    pipCanvas.addEventListener('mousedown', e => {
        dragging = true; startX = e.clientX; startY = e.clientY
        const r = pipCanvas.getBoundingClientRect()
        origRight = window.innerWidth - r.right; origBottom = window.innerHeight - r.bottom
        e.preventDefault()
    })
    window.addEventListener('mousemove', e => {
        if (!dragging) return
        pipCanvas.style.right  = (origRight  - (e.clientX - startX)) + 'px'
        pipCanvas.style.bottom = (origBottom + (e.clientY - startY)) + 'px'
    })
    window.addEventListener('mouseup', () => { dragging = false })
}
