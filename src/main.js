import * as THREE from 'three'
import { PARAMS } from './config.js'
import { AudioEngine } from './audio.js'
import { scene, camera, renderer, controls, sharedTexture } from './scene.js'
import { createStarField, getStarSystem } from './stars.js'
import { buildParticles, getParticleMesh, tickMorph, setExploded } from './particles.js'
import { initGui } from './gui.js'
import { initGesture, isGesturePaused, onGesture, onSwipeGesture, setGesturePaused } from './gesture.js'
import { initCameras } from './camera-device.js'
import { initImageManager } from './image-manager.js'
import { getRandomPhrase } from './phrases.js'
import {
    clearImages,
    getGalleryItems,
    getImageCount,
    initializeGallery,
    loadImages,
    moveImage,
    removeImage,
    showWall, hideAll,
    focusFromWall, isFeaturedVisible, isWallVisible, swipeNext, swipePrev,
    tickGallery,
} from './gallery.js'

// ── UI refs ──
const messageBox      = document.getElementById('message-box')
const cameraSelectEl  = document.getElementById('camera-select')
const uploadInput     = document.getElementById('image-upload')
const uploadButton    = document.getElementById('upload-btn')
const uploadCount     = document.getElementById('upload-count')

// ── Gesture state machine ─────────────────────────────────────────────────────
// States: IDLE | EXPLODING | GALLERY | CONTRACTING
let appState = 'IDLE'

function onGestureOpen() {
    if (appState !== 'IDLE') return
    appState = 'EXPLODING'
    setExploded(true)
    AudioEngine.playExpandSound()

    if (getImageCount() > 0) {
        // Enter on the thumbnail wall; first swipe pulls a photo into focus.
        showWall()
        setTimeout(() => {
            if (appState !== 'EXPLODING') return
            appState = 'GALLERY'
        }, 700)
    } else {
        appState = 'GALLERY'
        showPhrase()
    }
}

function onGestureClose() {
    if (appState !== 'GALLERY' && appState !== 'EXPLODING') return
    appState = 'CONTRACTING'
    setExploded(false)
    AudioEngine.playContractSound()

    if (getImageCount() > 0) {
        hideAll()
    } else {
        hidePhrase()
    }

    setTimeout(() => { if (appState === 'CONTRACTING') appState = 'IDLE' }, 800)
}


function showPhrase() {
    messageBox.innerText = getRandomPhrase()
    messageBox.classList.add('visible')
}
function hidePhrase() {
    messageBox.classList.remove('visible')
}

// ── Init scene ──
createStarField()
buildParticles(sharedTexture)
scene.add(camera)

// ── GUI ──
initGui(cameraSelectEl)
const imageManager = initImageManager({
    triggerButton: uploadButton,
    uploadInput,
    countEl: uploadCount,
    getItems: getGalleryItems,
    onAddFiles: loadImages,
    onRemoveItem: removeImage,
    onMoveItem: moveImage,
    onClearAll: clearImages,
})
void initializeGallery().then(() => {
    imageManager.render()
})

// ── Gesture callbacks ──
onGesture(isOpen => {
    if (isOpen) onGestureOpen()
    else        onGestureClose()
})

onSwipeGesture(direction => {
    if (appState !== 'GALLERY') return
    if (isWallVisible() && !isFeaturedVisible()) {
        focusFromWall(direction)
        return
    }
    if (direction === 'left') swipeNext()
    else                      swipePrev()
})

// ── Gesture engine ──
initGesture()

// ── Space bar: toggle gesture input pause ──
window.addEventListener('keydown', e => {
    if (e.code !== 'Space') return
    if (e.repeat) return
    e.preventDefault()
    setGesturePaused(!isGesturePaused())
})

// ── Fullscreen ──
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

// ── First-interaction ──
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
        if (PARAMS.autoRotate) mesh.rotation.y += PARAMS.rotationSpeed * PARAMS.rotationDir
        mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0.3, 0.03)
        mesh.rotation.z = PARAMS.axialTilt * (Math.PI / 180)
    }
    tickMorph()
    tickGallery()
    const stars = getStarSystem()
    if (stars) stars.rotation.y += 0.0003
    renderer.render(scene, camera)
}

animate()
