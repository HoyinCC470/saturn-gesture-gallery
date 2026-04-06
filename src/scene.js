import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PARAMS } from './config.js'

export const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x000000, 0.0015)

export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000)
camera.position.set(0, PARAMS.camHeight, PARAMS.camDistance)
camera.lookAt(0, 0, 0)

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
document.getElementById('canvas-container').appendChild(renderer.domElement)

export const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.enablePan = true
controls.minDistance = 50
controls.maxDistance = 800
controls.autoRotate = PARAMS.camAutoOrbit
controls.autoRotateSpeed = 0.5

export function createSharedTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 32, 32)
    return new THREE.CanvasTexture(canvas)
}

export const sharedTexture = createSharedTexture()

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})
