import * as THREE from 'three'
import { PARAMS } from './config.js'
import { AudioEngine } from './audio.js'
import { scene, camera, renderer, controls, sharedTexture } from './scene.js'
import { createStarField, getStarSystem } from './stars.js'
import { buildParticles, getParticleMesh, tickMorph, setExploded } from './particles.js'
import { initGui } from './gui.js'
import { initGesture, onGesture, onSwipeGesture } from './gesture.js'
import { initCameras } from './camera-device.js'
import { getRandomPhrase } from './phrases.js'

// ── UI refs ──
const messageBox    = document.getElementById('message-box')
const cameraSelectEl = document.getElementById('camera-select')

function showPhrase() {
    messageBox.innerText = getRandomPhrase()
    messageBox.classList.add('visible')
}
function hidePhrase() {
    messageBox.classList.remove('visible')
}

// ── Init scene objects ──
createStarField()
buildParticles(sharedTexture)

// ── GUI ──
initGui(cameraSelectEl)

// ── Gesture callbacks ──
onGesture(isExploded => {
    setExploded(isExploded)
    if (isExploded) {
        showPhrase()
        AudioEngine.playExpandSound()
    } else {
        hidePhrase()
        AudioEngine.playContractSound()
    }
})

onSwipeGesture(direction => {
    // Reserved for Phase 2b gallery — no-op for now
    console.log('Swipe:', direction)
})

// ── Gesture engine ──
initGesture()

// ── Space bar: toggle auto-rotate ──
window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
        e.preventDefault()
        PARAMS.autoRotate = !PARAMS.autoRotate
    }
})

// ── Fullscreen button ──
const fullscreenBtn = document.getElementById('fullscreen-btn')
fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen()
        fullscreenBtn.innerText = '退出全屏'
    } else {
        document.exitFullscreen?.()
        fullscreenBtn.innerText = '全屏沉浸'
    }
})

// ── First-interaction: start audio + cameras ──
let interactionStarted = false
function kickstart() {
    if (interactionStarted) return
    interactionStarted = true
    AudioEngine.start()
    initCameras()
}

document.getElementById('audio-hint').addEventListener('click', kickstart)
fullscreenBtn.addEventListener('click', kickstart)

// ── Animation loop ──
function animate() {
    requestAnimationFrame(animate)

    controls.update()

    const mesh = getParticleMesh()
    if (mesh) {
        if (PARAMS.autoRotate) {
            mesh.rotation.y += PARAMS.rotationSpeed * PARAMS.rotationDir
        }

        // Smooth tilt back to resting angle when not exploded
        const targetX = 0.3
        mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, targetX, 0.03)
        mesh.rotation.z = PARAMS.axialTilt * (Math.PI / 180)
    }

    // GPU morph: advance uMorphProgress uniform
    tickMorph()

    // Slowly rotate starfield
    const stars = getStarSystem()
    if (stars) stars.rotation.y += 0.0003

    renderer.render(scene, camera)
}

animate()
