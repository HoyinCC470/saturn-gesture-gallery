// ── Photo Gallery System ──────────────────────────────────────────────────────
//
// Visual layers:
//   Photo WALL  — thumbnail ring in world space; remains visible when entering the gallery
//   Featured    — full photo parented to camera; reached by swiping from the wall
//
// Caller (main.js) drives the lifecycle:
//   EXPLODING  → showWall()             ring of thumbnails visible, no featured
//   GALLERY    → focusFromWall(dir)     pull one thumbnail into featured mode
//   GALLERY    → swipeNext/Prev()       slide transition between featured photos
//   CONTRACTING→ hideAll()              everything disappears

import * as THREE from 'three'
import { scene, camera } from './scene.js'
import {
    appendStoredGalleryAssets,
    clearStoredGalleryAssets,
    readStoredGalleryAssets,
    removeStoredGalleryAsset,
    reorderStoredGalleryAssets,
} from './gallery-store.js'

// ── Tuneable params (GUI writes directly) ──
export const galleryParams = {
    featuredScale:    1.0,
    wallRadius:       110,
    wallThumbSize:    24,
    wallOpacity:      0.65,
    transitionSpeed:  0.12,
    swipeSensitivity: 0.10,   // default reduced from 0.14 → less hand travel needed
    swipeCooldownMs:  1200,   // GUI-editable; used by gesture.js as reference
}

// ── State ──
let textures = []
let aspects  = []
let assetItems = []
let currentIndex = 0

let wallGroup    = null
let wallMeshes   = []
let wallVisible  = false
let featuredMesh = null
let slideMesh    = null
let isSliding    = false
let slideDir     = 0
let featuredVisible = false
let focusMesh = null
let isFocusingFromWall = false
const focusTargetPos = new THREE.Vector3()
const focusTargetQuat = new THREE.Quaternion()
const focusTargetScale = new THREE.Vector3(1, 1, 1)

const FEATURED_Z      = -140
const FEATURED_BASE_H = 55

function _disposeTextureSet() {
    textures.forEach(texture => texture?.dispose?.())
    assetItems.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    })
    textures = []
    aspects = []
    assetItems = []
}

function _clampCurrentIndex() {
    if (!textures.length) {
        currentIndex = 0
        return
    }
    currentIndex = Math.min(currentIndex, textures.length - 1)
}

function _resetVisibleGalleryAfterAssetChange() {
    const hadWall = wallVisible
    const hadFeatured = featuredVisible
    hideAll()
    _clampCurrentIndex()

    if (!textures.length) return
    if (hadFeatured) showFeatured()
    else if (hadWall) showWall()
}

async function _loadTextureFromItem(item) {
    const loader = new THREE.TextureLoader()
    const previewUrl = URL.createObjectURL(item.blob)

    return new Promise(resolve => {
        loader.load(previewUrl, texture => {
            texture.colorSpace = THREE.SRGBColorSpace
            resolve({
                ...item,
                previewUrl,
                texture,
                aspect: texture.image.width / texture.image.height,
            })
        }, undefined, () => {
            URL.revokeObjectURL(previewUrl)
            resolve(null)
        })
    })
}

async function _applyPersistedItems(items) {
    const loadedItems = (await Promise.all(items.map(_loadTextureFromItem))).filter(Boolean)
    _disposeTextureSet()
    assetItems = loadedItems
    textures = loadedItems.map(item => item.texture)
    aspects = loadedItems.map(item => item.aspect)
    _resetVisibleGalleryAfterAssetChange()
    return textures.length
}

// ── Load images ──────────────────────────────────────────────────────────────
export async function initializeGallery() {
    const items = await readStoredGalleryAssets()
    return _applyPersistedItems(items)
}

export async function loadImages(files) {
    if (!files.length) return 0
    const items = await appendStoredGalleryAssets(files)
    return _applyPersistedItems(items)
}

export function getGalleryItems() {
    return assetItems.map(({ id, name, previewUrl }) => ({ id, name, previewUrl }))
}

export async function removeImage(itemId) {
    const items = await removeStoredGalleryAsset(itemId)
    return _applyPersistedItems(items)
}

export async function moveImage(itemId, direction) {
    const fromIndex = assetItems.findIndex(item => item.id === itemId)
    if (fromIndex === -1) return textures.length
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= assetItems.length) return textures.length

    const nextIds = [...assetItems.map(item => item.id)]
    const [movedId] = nextIds.splice(fromIndex, 1)
    nextIds.splice(toIndex, 0, movedId)
    const items = await reorderStoredGalleryAssets(nextIds)
    currentIndex = toIndex
    return _applyPersistedItems(items)
}

export async function clearImages() {
    const items = await clearStoredGalleryAssets()
    return _applyPersistedItems(items)
}

export function getImageCount() { return textures.length }

// ── Wall (shown during EXPLODING state) ──────────────────────────────────────
export function showWall() {
    if (!textures.length) return
    _buildWall()
    wallVisible = true
}

export function hideWall() {
    _disposeWall()
    wallVisible = false
}

// ── Featured (shown after focusing from the wall) ────────────────────────────
export function showFeatured() {
    if (!textures.length) return
    _buildFeatured(currentIndex)
    featuredVisible = true
}

export function hideFeatured() {
    _disposeFeatured()
    featuredVisible = false
}

export function hideAll() {
    hideWall()
    hideFeatured()
}

export function isWallVisible()     { return wallVisible }
export function isFeaturedVisible() { return featuredVisible }
export function isFocusing()        { return isFocusingFromWall }

// ── Navigation ───────────────────────────────────────────────────────────────
export function swipeNext() {
    if (!featuredVisible || isSliding || textures.length < 2) return
    _startSlide((currentIndex + 1) % textures.length, -1)
}

export function swipePrev() {
    if (!featuredVisible || isSliding || textures.length < 2) return
    _startSlide((currentIndex - 1 + textures.length) % textures.length, +1)
}

export function focusFromWall(direction = 'left') {
    if (!wallVisible || featuredVisible || isFocusingFromWall || !textures.length) return

    currentIndex = direction === 'right'
        ? (currentIndex - 1 + textures.length) % textures.length
        : (currentIndex + 1) % textures.length

    const sourceMesh = wallMeshes[currentIndex]
    if (!sourceMesh) return

    const { width, height } = _featuredDimensions(currentIndex)
    const thumbRatio = galleryParams.wallThumbSize / width

    focusMesh = _makePlane(textures[currentIndex], width, height, galleryParams.wallOpacity)
    sourceMesh.updateWorldMatrix(true, false)
    sourceMesh.getWorldPosition(focusMesh.position)
    sourceMesh.getWorldQuaternion(focusMesh.quaternion)
    focusMesh.scale.setScalar(Math.max(thumbRatio, 0.01))
    scene.add(focusMesh)
    isFocusingFromWall = true
}

function _startSlide(nextIdx, dir) {
    isSliding = true; slideDir = dir
    const { width: w, height: h } = _featuredDimensions(nextIdx)
    slideMesh = _makePlane(textures[nextIdx], w, h)
    slideMesh.position.set(-dir * 280, 0, FEATURED_Z)
    camera.add(slideMesh)
    currentIndex = nextIdx
}

function _featuredWidth(idx) {
    return FEATURED_BASE_H * (aspects[idx] || 1.5)
}

// ── Animation tick ────────────────────────────────────────────────────────────
export function tickGallery() {
    if (isFocusingFromWall && focusMesh) {
        camera.localToWorld(focusTargetPos.set(0, 0, FEATURED_Z))
        camera.getWorldQuaternion(focusTargetQuat)

        focusMesh.position.lerp(focusTargetPos, 0.12)
        focusMesh.quaternion.slerp(focusTargetQuat, 0.12)
        focusMesh.scale.lerp(focusTargetScale, 0.12)
        focusMesh.material.opacity = THREE.MathUtils.lerp(focusMesh.material.opacity, 1, 0.12)

        if (wallGroup) {
            for (const mesh of wallMeshes) {
                if (mesh === wallMeshes[currentIndex]) continue
                mesh.material.opacity = THREE.MathUtils.lerp(mesh.material.opacity, 0.08, 0.12)
            }
        }

        if (focusMesh.position.distanceTo(focusTargetPos) < 0.8 && Math.abs(focusMesh.scale.x - 1) < 0.02) {
            scene.remove(focusMesh)
            focusMesh.geometry.dispose()
            focusMesh.material.dispose()
            focusMesh = null
            isFocusingFromWall = false
            _disposeWall()
            _buildFeatured(currentIndex)
            featuredVisible = true
        }
    }

    // Float animation for featured
    if (featuredMesh) {
        const t = performance.now() * 0.0008
        featuredMesh.position.y = Math.sin(t) * 1.8
        featuredMesh.rotation.z = Math.sin(t * 0.7) * 0.008
    }

    // Slide transition
    if (isSliding && slideMesh && featuredMesh) {
        const speed = galleryParams.transitionSpeed
        const targetOutX = slideDir * 280
        featuredMesh.position.x = THREE.MathUtils.lerp(featuredMesh.position.x, targetOutX, speed)
        slideMesh.position.x    = THREE.MathUtils.lerp(slideMesh.position.x, 0, speed)

        if (Math.abs(slideMesh.position.x) < 1.0) {
            slideMesh.position.x = 0
            camera.remove(featuredMesh)
            featuredMesh.geometry.dispose(); featuredMesh.material.dispose()
            featuredMesh = slideMesh
            slideMesh = null; isSliding = false
        }
    }

    // Slowly spin photo wall
    if (wallGroup) wallGroup.rotation.y += 0.001
}

// ── Build helpers ─────────────────────────────────────────────────────────────
function _buildWall() {
    _disposeWall()
    wallGroup = new THREE.Group()
    wallMeshes = []
    scene.add(wallGroup)
    const n = textures.length
    const r = galleryParams.wallRadius
    const tw = galleryParams.wallThumbSize
    for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2
        const x = Math.cos(angle) * r, z = Math.sin(angle) * r
        const y = Math.sin(i * 2.4) * 20
        const th = tw / (aspects[i] || 1.5)
        const mesh = _makePlane(textures[i], tw, th, galleryParams.wallOpacity)
        mesh.position.set(x, y, z); mesh.lookAt(0, y, 0)
        wallGroup.add(mesh)
        wallMeshes.push(mesh)
    }
}

function _buildFeatured(idx) {
    _disposeFeatured()
    scene.add(camera)   // ensure camera is in scene graph
    const { width: w, height: h } = _featuredDimensions(idx)
    featuredMesh = _makePlane(textures[idx], w, h)
    featuredMesh.position.set(0, 0, FEATURED_Z)
    camera.add(featuredMesh)
}

function _featuredDimensions(idx) {
    return {
        width: _featuredWidth(idx) * galleryParams.featuredScale,
        height: FEATURED_BASE_H * galleryParams.featuredScale,
    }
}

function _makePlane(tex, w, h, opacity = 1) {
    return new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity,
            side: THREE.DoubleSide, depthWrite: false,
        })
    )
}

function _disposeWall() {
    if (!wallGroup) return
    wallGroup.children.forEach(m => { m.geometry.dispose(); m.material.dispose() })
    scene.remove(wallGroup); wallGroup = null
    wallMeshes = []
}

function _disposeFeatured() {
    if (featuredMesh) { camera.remove(featuredMesh); featuredMesh.geometry.dispose(); featuredMesh.material.dispose(); featuredMesh = null }
    if (slideMesh)    { camera.remove(slideMesh);    slideMesh.geometry.dispose();    slideMesh.material.dispose();    slideMesh = null }
    if (focusMesh)    { scene.remove(focusMesh);     focusMesh.geometry.dispose();    focusMesh.material.dispose();    focusMesh = null }
    isSliding = false
    isFocusingFromWall = false
}

// ── Rebuild on GUI change ─────────────────────────────────────────────────────
export function rebuildWallIfVisible() {
    if (wallVisible) { _disposeWall(); _buildWall() }
}

export function rebuildFeaturedIfVisible() {
    if (featuredVisible) { _disposeFeatured(); _buildFeatured(currentIndex) }
}
