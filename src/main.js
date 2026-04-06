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
import {
    loadImages, getImageCount,
    showWall, hideWall,
    showFeatured, hideFeatured, hideAll,
    swipeNext, swipePrev,
    tickGallery,
} from './gallery.js'

// ── UI refs ──
const messageBox      = document.getElementById('message-box')
const cameraSelectEl  = document.getElementById('camera-select')
const uploadInput     = document.getElementById('image-upload')
const uploadCount     = document.getElementById('upload-count')

// ── Gesture state machine ─────────────────────────────────────────────────────
// States: IDLE | EXPLODING | GALLERY | FROZEN | CONTRACTING
let appState = 'IDLE'

function onGestureOpen() {
    if (appState === 'FROZEN') {
        // Re-open from freeze → back to GALLERY
        appState = 'GALLERY'
        return
    }
    if (appState !== 'IDLE') return
    appState = 'EXPLODING'
    setExploded(true)
    AudioEngine.playExpandSound()

    if (getImageCount() > 0) {
        // Show thumbnail wall briefly, then switch to featured photo
        showWall()
        setTimeout(() => {
            if (appState !== 'EXPLODING') return
            appState = 'GALLERY'
            hideWall()
            showFeatured()
        }, 700)
    } else {
        appState = 'GALLERY'
        showPhrase()
    }
}

function onGestureClose() {
    if (appState !== 'GALLERY' && appState !== 'EXPLODING' && appState !== 'FROZEN') return
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

// Freeze hint: tiny label on the message box
function showFreezeHint(on) {
    if (on) {
        messageBox.innerText = '已冻结 · 张开手掌继续'
        messageBox.classList.add('visible')
    } else {
        messageBox.classList.remove('visible')
    }
}

// ── Image upload ──────────────────────────────────────────────────────────────
uploadInput.addEventListener('change', async e => {
    const files = e.target.files
    if (!files.length) return
    const n = await loadImages(files)
    uploadCount.textContent = n > 0 ? `已加载 ${n} 张图片` : '加载失败'
    uploadInput.value = ''
})

// ── Init scene ──
createStarField()
buildParticles(sharedTexture)
scene.add(camera)

// ── GUI ──
initGui(cameraSelectEl)

// ── Gesture callbacks ──
onGesture(isOpen => {
    if (isOpen) onGestureOpen()
    else        onGestureClose()
})

onSwipeGesture(direction => {
    if (appState !== 'GALLERY') return
    if (direction === 'left')  swipeNext()
    else                       swipePrev()
})

// ── Gesture engine ──
initGesture()

// ── Space bar: toggle freeze (照片悬停) ──
window.addEventListener('keydown', e => {
    if (e.code !== 'Space') return
    e.preventDefault()
    if (appState === 'GALLERY') {
        appState = 'FROZEN'
        showFreezeHint(true)
    } else if (appState === 'FROZEN') {
        appState = 'GALLERY'
        showFreezeHint(false)
    }
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
