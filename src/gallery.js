// ── Photo Gallery System ────────────────────────────────────────────────────
// Photo wall: ring of thumbnail planes in world space (visible when exploded)
// Featured photo: parented to camera so it stays centred regardless of orbit
//
// State machine (driven from main.js):
//   IDLE → show() → GALLERY → hide() → IDLE
//   In GALLERY: swipeNext() / swipePrev() animate the featured photo

import * as THREE from 'three'
import { scene, camera } from './scene.js'

// ── Tuneable params (GUI can write these directly) ──
export const galleryParams = {
    featuredScale: 1.0,      // multiplier for featured photo size
    wallRadius: 110,          // world-space radius of thumbnail ring
    wallThumbSize: 24,        // thumbnail width (height auto from aspect)
    wallOpacity: 0.65,
    transitionSpeed: 0.12,   // lerp speed per frame for slide animation
    swipeSensitivity: 0.14,  // matched to gesture.js threshold
}

// ── State ──
let textures = []            // THREE.Texture[], one per uploaded image
let aspects  = []            // aspect ratios per image
let currentIndex = 0

let wallGroup    = null      // thumbnail ring (world space)
let featuredGroup = null     // container parented to camera

// Per-featured slot: current + next/prev (for slide transitions)
let featuredMesh = null
let slideMesh    = null      // the incoming photo during a swipe transition
let slideTargetX = 0         // target local-x for featuredMesh during transition
let slideFromX   = 0         // starting local-x for slideMesh
let isSliding    = false
let slideDir     = 0         // +1 = next (left), -1 = prev (right)

let visible = false

// ── Camera-space depth for featured photo ──
const FEATURED_Z  = -140    // units in front of camera
const FEATURED_BASE_H = 55  // base height in camera-local units

// ── Load images ────────────────────────────────────────────────────────────
export function loadImages(files) {
    // Dispose old textures
    textures.forEach(t => t.dispose())
    textures = []
    aspects  = []
    currentIndex = 0

    const loader = new THREE.TextureLoader()
    let loaded = 0

    return new Promise(resolve => {
        if (!files.length) { resolve(0); return }

        Array.from(files).forEach((file, i) => {
            const url = URL.createObjectURL(file)
            loader.load(url, tex => {
                tex.colorSpace = THREE.SRGBColorSpace
                // Insert in original order
                textures[i] = tex
                aspects[i]  = tex.image.width / tex.image.height
                loaded++
                if (loaded === files.length) {
                    // compact (remove holes if any failed)
                    textures = textures.filter(Boolean)
                    aspects  = aspects.filter(Boolean)
                    resolve(textures.length)
                }
            }, undefined, () => {
                loaded++
                if (loaded === files.length) resolve(textures.length)
            })
        })
    })
}

export function getImageCount() { return textures.length }

// ── Show / Hide ─────────────────────────────────────────────────────────────
export function showGallery() {
    if (!textures.length) return
    visible = true
    buildWall()
    buildFeatured(currentIndex)
}

export function hideGallery() {
    visible = false
    disposeWall()
    disposeFeatured()
}

export function isGalleryVisible() { return visible }

// ── Navigation ──────────────────────────────────────────────────────────────
export function swipeNext() {
    if (!visible || isSliding || textures.length < 2) return
    const nextIdx = (currentIndex + 1) % textures.length
    startSlide(nextIdx, -1)   // featured flies left, new comes from right
}

export function swipePrev() {
    if (!visible || isSliding || textures.length < 2) return
    const prevIdx = (currentIndex - 1 + textures.length) % textures.length
    startSlide(prevIdx, +1)   // featured flies right, new comes from left
}

function startSlide(nextIdx, dir) {
    isSliding  = true
    slideDir   = dir

    // outgoing mesh stays as featuredMesh, incoming is built as slideMesh
    const slideW = featuredWidth(nextIdx) * galleryParams.featuredScale
    const slideH = FEATURED_BASE_H * galleryParams.featuredScale

    slideMesh = makePlane(textures[nextIdx], slideW, slideH)
    slideMesh.position.set(-dir * 280, 0, FEATURED_Z)  // starts off-screen
    camera.add(slideMesh)

    slideTargetX = 0
    slideFromX   = -dir * 280

    currentIndex = nextIdx
}

function featuredWidth(idx) {
    return FEATURED_BASE_H * (aspects[idx] || 1.5)
}

// ── Animation tick (call from main.js render loop) ──────────────────────────
export function tickGallery() {
    if (!visible) return

    // Gently float the featured photo
    if (featuredMesh) {
        const t = performance.now() * 0.0008
        featuredMesh.position.y = Math.sin(t) * 1.8
        featuredMesh.rotation.z = Math.sin(t * 0.7) * 0.008
    }

    // Slide transition
    if (isSliding && slideMesh) {
        const speed = galleryParams.transitionSpeed
        const targetOutX = slideDir * 280   // outgoing flies out

        // Move outgoing featured out
        featuredMesh.position.x = THREE.MathUtils.lerp(featuredMesh.position.x, targetOutX, speed)
        // Move incoming slide in
        slideMesh.position.x    = THREE.MathUtils.lerp(slideMesh.position.x, 0, speed)

        if (Math.abs(slideMesh.position.x) < 1.0) {
            // Snap and promote slide → featured
            slideMesh.position.x = 0
            camera.remove(featuredMesh)
            featuredMesh.geometry.dispose()
            featuredMesh.material.dispose()
            featuredMesh = slideMesh
            slideMesh = null
            isSliding = false
        }
    }

    // Slowly spin photo wall
    if (wallGroup) wallGroup.rotation.y += 0.001
}

// ── Build helpers ────────────────────────────────────────────────────────────
function buildWall() {
    disposeWall()
    wallGroup = new THREE.Group()
    scene.add(wallGroup)

    const n = textures.length
    const r = galleryParams.wallRadius
    const tw = galleryParams.wallThumbSize

    for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2
        const x = Math.cos(angle) * r
        const z = Math.sin(angle) * r
        const y = (Math.sin(i * 2.4) * 0.5) * 40  // scatter heights gently

        const th = tw / (aspects[i] || 1.5)
        const mesh = makePlane(textures[i], tw, th, galleryParams.wallOpacity)
        mesh.position.set(x, y, z)
        mesh.lookAt(0, y, 0)
        wallGroup.add(mesh)
    }
}

function buildFeatured(idx) {
    disposeFeatured()
    // Parent to camera for stable screen-space centering
    if (!camera.children.includes(featuredGroup)) scene.add(camera)

    const w = featuredWidth(idx) * galleryParams.featuredScale
    const h = FEATURED_BASE_H   * galleryParams.featuredScale

    featuredMesh = makePlane(textures[idx], w, h)
    featuredMesh.position.set(0, 0, FEATURED_Z)
    camera.add(featuredMesh)
}

function makePlane(tex, w, h, opacity = 1) {
    const geo = new THREE.PlaneGeometry(w, h)
    const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
    })
    return new THREE.Mesh(geo, mat)
}

function disposeWall() {
    if (!wallGroup) return
    wallGroup.children.forEach(m => { m.geometry.dispose(); m.material.dispose() })
    scene.remove(wallGroup)
    wallGroup = null
}

function disposeFeatured() {
    if (featuredMesh) {
        camera.remove(featuredMesh)
        featuredMesh.geometry.dispose()
        featuredMesh.material.dispose()
        featuredMesh = null
    }
    if (slideMesh) {
        camera.remove(slideMesh)
        slideMesh.geometry.dispose()
        slideMesh.material.dispose()
        slideMesh = null
    }
    isSliding = false
}

// ── Update gallery appearance when GUI params change ─────────────────────────
export function rebuildGalleryIfVisible() {
    if (!visible) return
    disposeWall()
    disposeFeatured()
    buildWall()
    buildFeatured(currentIndex)
}
