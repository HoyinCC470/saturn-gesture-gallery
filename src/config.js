import * as THREE from 'three'

export const DEFAULT_PARAMS = {
    particleCount: 16000,
    particleSize: 1.8,
    ringThickness: 1.2,
    innerRingWidth: 25.0,
    outerRingWidth: 40.0,
    ringGap: 5.0,
    glowStrength: 0.7,
    starCount: 6000,
    starOpacity: 0.5,
    rotationSpeed: 0.002,
    rotationDir: 1,
    autoRotate: true,
    axialTilt: 26.7,
    masterVolume: 0.15,
    camDistance: 220,
    camHeight: 50,
    camAutoOrbit: false,
    selectedCamera: '',
}

export const CONFIG = {
    sphereRadius: 42,
    ringStartOffset: 10,
    colors: {
        sphere: new THREE.Color(0xd2b48c),
        ring: new THREE.Color(0xa8a9ad),
    },
}

function clampParams(p) {
    p.particleCount = Math.min(Math.max(p.particleCount, 5000), 20000)
    p.starCount = Math.min(Math.max(p.starCount, 1000), 10000)
    p.glowStrength = Math.min(Math.max(p.glowStrength, 0.1), 1.2)
    return p
}

function loadParams() {
    const saved = localStorage.getItem('saturn_config_v1')
    if (saved) {
        try {
            return clampParams({ ...DEFAULT_PARAMS, ...JSON.parse(saved) })
        } catch (e) {
            console.error('配置加载失败', e)
        }
    }
    return { ...DEFAULT_PARAMS }
}

export const PARAMS = loadParams()

let saveTimer = null

export function scheduleSave(params, cameraSelectEl) {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
        params.selectedCamera = cameraSelectEl?.value ?? params.selectedCamera
        localStorage.setItem('saturn_config_v1', JSON.stringify(params))
        const toast = document.getElementById('save-toast')
        if (toast) {
            toast.style.opacity = '1'
            setTimeout(() => { toast.style.opacity = '0' }, 1500)
        }
    }, 500)
}
