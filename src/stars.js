import * as THREE from 'three'
import { scene, sharedTexture } from './scene.js'
import { PARAMS } from './config.js'

let starSystem = null

export function createStarField() {
    if (starSystem) {
        scene.remove(starSystem)
        starSystem.geometry.dispose()
        starSystem.material.dispose()
        starSystem = null
    }

    const starGeo = new THREE.BufferGeometry()
    const starPos = []
    const starColors = []

    for (let i = 0; i < PARAMS.starCount; i++) {
        const r = 500 + Math.random() * 700
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        starPos.push(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
        )
        const b = 0.3 + Math.random() * 0.7
        starColors.push(b, b, b)
    }

    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3))

    starSystem = new THREE.Points(starGeo, new THREE.PointsMaterial({
        size: 1.5,
        vertexColors: true,
        map: sharedTexture,
        transparent: true,
        opacity: PARAMS.starOpacity,
        blending: THREE.AdditiveBlending,
        fog: false,
    }))

    scene.add(starSystem)
    return starSystem
}

export function getStarSystem() {
    return starSystem
}
