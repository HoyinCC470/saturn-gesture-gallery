import GUI from 'lil-gui'
import { PARAMS, scheduleSave } from './config.js'
import { buildParticles, setParticleSize, setGlowStrength } from './particles.js'
import { createStarField, getStarSystem } from './stars.js'
import { camera, controls, sharedTexture } from './scene.js'
import { AudioEngine } from './audio.js'
import { galleryParams, rebuildWallIfVisible, rebuildFeaturedIfVisible } from './gallery.js'
import { setPipEnabled, setPipSize } from './gesture.js'

export function initGui(cameraSelectEl) {
    const gui = new GUI({ title: '控制面板' })
    const folders = []

    const API = {
        saveSettings() {
            PARAMS.camDistance = camera.position.length()
            PARAMS.camHeight   = camera.position.y
            PARAMS.selectedCamera = cameraSelectEl?.value ?? ''
            localStorage.setItem('saturn_config_v1', JSON.stringify(PARAMS))
            const toast = document.getElementById('save-toast')
            if (toast) { toast.style.opacity = '1'; setTimeout(() => { toast.style.opacity = '0' }, 1500) }
        },
        resetSettings() {
            if (confirm('确定要恢复默认设置并刷新页面吗？')) {
                localStorage.removeItem('saturn_config_v1')
                location.reload()
            }
        },
    }

    const save = () => scheduleSave(PARAMS, cameraSelectEl)

    // Visual
    const folderVisual = gui.addFolder('外观')
    folders.push(folderVisual)
    folderVisual.add(PARAMS, 'particleSize', 0.1, 5.0).name('粒子大小').onChange(v => { setParticleSize(v); save() })
    folderVisual.add(PARAMS, 'glowStrength', 0.1, 1.0).name('辉光强度').onChange(v => { setGlowStrength(v); save() })

    // Rings
    const folderRings = gui.addFolder('光环设置')
    folders.push(folderRings)
    const rebuildOnChange = () => { buildParticles(sharedTexture); save() }
    folderRings.add(PARAMS, 'innerRingWidth', 5.0, 50.0).name('内环宽度').onFinishChange(rebuildOnChange)
    folderRings.add(PARAMS, 'outerRingWidth', 5.0, 80.0).name('外环宽度').onFinishChange(rebuildOnChange)
    folderRings.add(PARAMS, 'ringGap',        0.0, 20.0).name('环缝间距').onFinishChange(rebuildOnChange)
    folderRings.add(PARAMS, 'ringThickness',  0.1, 10.0).name('光环厚度').onFinishChange(rebuildOnChange)

    // Motion
    const folderMotion = gui.addFolder('运动控制')
    folders.push(folderMotion)
    folderMotion.add(PARAMS, 'autoRotate').name('粒子自转').onChange(save)
    folderMotion.add(PARAMS, 'rotationSpeed', 0.00, 0.05).name('自转速度').onChange(save)
    folderMotion.add(PARAMS, 'rotationDir', { '逆时针': 1, '顺时针': -1 }).name('旋转方向').onChange(save)
    folderMotion.add(PARAMS, 'axialTilt', 0, 90).name('轴倾角').onChange(save)

    // Camera
    const folderCam = gui.addFolder('镜头控制')
    folders.push(folderCam)
    folderCam.add(PARAMS, 'camDistance', 50, 500).name('距离 (Zoom)').onChange(v => {
        const dir = camera.position.clone().normalize()
        camera.position.copy(dir.multiplyScalar(v))
        save()
    }).listen()
    folderCam.add(PARAMS, 'camHeight', -200, 200).name('高度 (Elev)').onChange(v => {
        camera.position.y = v
        camera.lookAt(0, 0, 0)
        save()
    }).listen()
    folderCam.add(PARAMS, 'camAutoOrbit').name('自动环绕').onChange(v => { controls.autoRotate = v; save() })

    // Perf
    const folderPerf = gui.addFolder('系统参数')
    folders.push(folderPerf)
    folderPerf.add(PARAMS, 'particleCount', 5000, 40000).step(1000).name('粒子总数').onFinishChange(() => { buildParticles(sharedTexture); save() })
    folderPerf.add(PARAMS, 'starCount', 1000, 15000).step(1000).name('背景繁星').onFinishChange(() => { createStarField(); save() })
    folderPerf.add(PARAMS, 'starOpacity', 0.0, 3.0).name('星空亮度').onChange(v => {
        const s = getStarSystem()
        if (s) s.material.opacity = v
        save()
    })

    // Audio
    const folderAudio = gui.addFolder('音频设置')
    folders.push(folderAudio)
    folderAudio.add(PARAMS, 'masterVolume', 0.0, 1.0).name('主音量').onChange(v => {
        AudioEngine.setVolume(v)
        save()
    })

    // Gallery
    const folderGallery = gui.addFolder('照片画廊')
    folders.push(folderGallery)
    folderGallery.add(galleryParams, 'featuredScale', 0.3, 2.0, 0.05).name('特写尺寸').onChange(() => rebuildFeaturedIfVisible())
    folderGallery.add(galleryParams, 'wallRadius', 60, 200, 5).name('照片墙半径').onChange(() => rebuildWallIfVisible())
    folderGallery.add(galleryParams, 'wallThumbSize', 10, 60, 2).name('缩略图大小').onChange(() => rebuildWallIfVisible())
    folderGallery.add(galleryParams, 'wallOpacity', 0.1, 1.0, 0.05).name('墙透明度').onChange(() => rebuildWallIfVisible())
    folderGallery.add(galleryParams, 'transitionSpeed', 0.03, 0.3, 0.01).name('切换速度')
    folderGallery.add(galleryParams, 'swipeSensitivity', 0.05, 0.3, 0.01).name('滑动灵敏度 ↔')
    folderGallery.add(galleryParams, 'swipeCooldownMs', 500, 2500, 100).name('切换间隔 (ms)')

    // PiP
    const pipParams = { enabled: true, size: 240 }
    const folderPip = gui.addFolder('摄像头预览')
    folders.push(folderPip)
    folderPip.add(pipParams, 'enabled').name('显示预览').onChange(v => setPipEnabled(v))
    folderPip.add(pipParams, 'size', 120, 480, 20).name('预览尺寸').onChange(v => {
        setPipSize(v, Math.round(v * 0.75))
    })

    // Storage
    const folderStorage = gui.addFolder('配置存储')
    folders.push(folderStorage)
    folderStorage.add(API, 'saveSettings').name('💾 保存当前配置')
    folderStorage.add(API, 'resetSettings').name('↺ 重置默认')

    folders.forEach(folder => folder.close())

    return gui
}
