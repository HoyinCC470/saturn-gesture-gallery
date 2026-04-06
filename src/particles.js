import * as THREE from 'three'
import { scene } from './scene.js'
import { PARAMS, CONFIG } from './config.js'

// ──────────────────────────────────────────────
// GPU-morph particle system via custom ShaderMaterial.
// Instead of lerping 16k particles on the CPU every frame,
// we pass both target positions as attributes and let the
// vertex shader do mix() on the GPU. The CPU only needs to
// smoothly advance a single `uMorphProgress` uniform.
// ──────────────────────────────────────────────

const VERTEX_SHADER = /* glsl */`
    attribute vec3 saturnPosition;
    attribute vec3 explodePosition;
    attribute vec3 particleColor;

    uniform float uMorphProgress;   // 0 = saturn, 1 = exploded
    uniform float uSize;
    uniform float uOpacity;

    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        vColor = particleColor;

        vec3 pos = mix(saturnPosition, explodePosition, uMorphProgress);
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

        // size attenuation
        gl_PointSize = uSize * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;

        vAlpha = uOpacity;
    }
`

const FRAGMENT_SHADER = /* glsl */`
    uniform sampler2D uMap;

    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        vec4 texColor = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor, texColor.a * vAlpha);
        if (gl_FragColor.a < 0.01) discard;
    }
`

let particleMesh = null
let shaderMaterial = null

// Exposed so the animate loop can drive morphing
export const morphState = {
    progress: 0,       // current uniform value (0–1)
    target: 0,         // 0 or 1, set by gesture
    speed: 0.04,       // lerp step per frame (~60fps → ~25 frames to transition)
}

export function buildParticles(texture) {
    if (particleMesh) {
        scene.remove(particleMesh)
        particleMesh.geometry.dispose()
        shaderMaterial.dispose()
        particleMesh = null
        shaderMaterial = null
    }

    const count = PARAMS.particleCount
    const saturnPos = new Float32Array(count * 3)
    const explodePos = new Float32Array(count * 3)
    const colors    = new Float32Array(count * 3)

    const rPlanet      = CONFIG.sphereRadius
    const rInnerStart  = rPlanet + CONFIG.ringStartOffset
    const rInnerEnd    = rInnerStart + PARAMS.innerRingWidth
    const rOuterStart  = rInnerEnd + PARAMS.ringGap
    const rOuterEnd    = rOuterStart + PARAMS.outerRingWidth
    const sc = CONFIG.colors.sphere
    const rc = CONFIG.colors.ring

    for (let i = 0; i < count; i++) {
        const idx = i * 3

        // ── Saturn target ──
        if (i < count * 0.3) {
            // sphere surface (Fibonacci spiral)
            const phi   = Math.acos(-1 + (2 * i) / (count * 0.3))
            const theta = Math.sqrt(count * 0.3 * Math.PI) * phi
            const noise = (Math.random() - 0.5) * 0.2
            saturnPos[idx]     = rPlanet * Math.sin(phi) * Math.cos(theta)
            saturnPos[idx + 1] = rPlanet * Math.cos(phi)
            saturnPos[idx + 2] = rPlanet * Math.sin(phi) * Math.sin(theta)
            colors[idx]     = sc.r + noise
            colors[idx + 1] = sc.g + noise
            colors[idx + 2] = sc.b + noise
        } else {
            // rings
            const angle = Math.random() * Math.PI * 2
            let radius
            let isInner
            if (Math.random() > 0.5) {
                isInner = true
                radius = rInnerStart + Math.pow(Math.random(), 0.8) * (rInnerEnd - rInnerStart)
            } else {
                isInner = false
                radius = rOuterStart + Math.random() * (rOuterEnd - rOuterStart)
            }
            const ySpread = (Math.random() - 0.5) + (Math.random() - 0.5)
            saturnPos[idx]     = radius * Math.cos(angle)
            saturnPos[idx + 1] = ySpread * PARAMS.ringThickness
            saturnPos[idx + 2] = radius * Math.sin(angle)

            let brightness = 0.5 + Math.random() * 0.5
            if (isInner) brightness *= Math.sin((radius - rInnerStart) / PARAMS.innerRingWidth * Math.PI)
            else         brightness *= Math.sin((radius - rOuterStart) / PARAMS.outerRingWidth * Math.PI) * 0.8
            colors[idx]     = rc.r * brightness
            colors[idx + 1] = rc.g * brightness
            colors[idx + 2] = rc.b * brightness
        }

        // ── Explode target (uniform sphere, cube-root for even density) ──
        const exR    = 300 * Math.cbrt(Math.random())
        const exT    = Math.random() * Math.PI * 2
        const exP    = Math.acos(2 * Math.random() - 1)
        explodePos[idx]     = exR * Math.sin(exP) * Math.cos(exT)
        explodePos[idx + 1] = exR * Math.sin(exP) * Math.sin(exT)
        explodePos[idx + 2] = exR * Math.cos(exP)
    }

    const geo = new THREE.BufferGeometry()
    // Use saturnPosition as the base `position` attribute so Three.js frustum
    // culling works on the saturn shape by default.
    geo.setAttribute('position',       new THREE.BufferAttribute(saturnPos.slice(), 3))
    geo.setAttribute('saturnPosition', new THREE.BufferAttribute(saturnPos, 3))
    geo.setAttribute('explodePosition',new THREE.BufferAttribute(explodePos, 3))
    geo.setAttribute('particleColor',  new THREE.BufferAttribute(colors, 3))

    shaderMaterial = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
            uMorphProgress: { value: morphState.progress },
            uSize:          { value: PARAMS.particleSize },
            uOpacity:       { value: PARAMS.glowStrength },
            uMap:           { value: texture },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: false,
    })

    particleMesh = new THREE.Points(geo, shaderMaterial)
    particleMesh.rotation.z = PARAMS.axialTilt * (Math.PI / 180)
    particleMesh.rotation.x = 0.3
    scene.add(particleMesh)

    // Reset morph to current state
    morphState.progress = morphState.target
    shaderMaterial.uniforms.uMorphProgress.value = morphState.progress

    return particleMesh
}

/** Called every animation frame to advance the GPU morph uniform. */
export function tickMorph() {
    if (!shaderMaterial) return
    const diff = morphState.target - morphState.progress
    if (Math.abs(diff) > 0.001) {
        morphState.progress += diff * morphState.speed
        shaderMaterial.uniforms.uMorphProgress.value = morphState.progress
    }
}

export function setExploded(exploded) {
    morphState.target = exploded ? 1 : 0
}

export function getParticleMesh() {
    return particleMesh
}

export function setParticleSize(v) {
    if (shaderMaterial) shaderMaterial.uniforms.uSize.value = v
}

export function setGlowStrength(v) {
    if (shaderMaterial) shaderMaterial.uniforms.uOpacity.value = v
}
