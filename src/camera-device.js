import { PARAMS, scheduleSave } from './config.js'

const videoEl   = document.getElementById('video-input')
const selectEl  = document.getElementById('camera-select')
const toggleBtn = document.getElementById('camera-toggle')
const statusDot = document.getElementById('status-dot')
const statusTxt = document.getElementById('status-text')

let currentStream    = null
let isCapturePaused  = false
let onFrameCallback  = null   // set by gesture.js

export function onVideoFrame(cb) {
    onFrameCallback = cb
}

export function getVideoElement() {
    return videoEl
}

function updateUI() {
    toggleBtn.textContent = isCapturePaused ? '恢复捕捉' : '暂停捕捉'
    if (isCapturePaused) {
        statusTxt.innerText = '捕捉已暂停'
        statusDot.style.backgroundColor = '#ffcc00'
    } else {
        setStatusReady()
    }
}

export function setStatusReady() {
    statusDot.style.backgroundColor = '#ff3333'
    statusTxt.innerText = '手势待命'
}

export function setStatusTracking() {
    statusDot.style.backgroundColor = '#33ff33'
    statusTxt.innerText = '手势追踪中...'
}

export function setStatusNoHand() {
    statusDot.style.backgroundColor = '#ffcc00'
    statusTxt.innerText = '未检测到手部'
}

export function setStatusGesturePaused() {
    statusDot.style.backgroundColor = '#66ccff'
    statusTxt.innerText = '手势输入已暂停'
}

async function startCamera(deviceId) {
    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop())
        currentStream = null
    }

    // 320×240 processes ~4× faster than 640×480 — MediaPipe accuracy is unchanged
    // since it internally resizes to its own input tensor size
    const constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width:  { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 30 },
        },
    }

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints)
        videoEl.srcObject = currentStream
        await videoEl.play()
        isCapturePaused = false
        updateUI()
        scheduleSave(PARAMS, selectEl)
        // Show PiP now that we have a stream
        const pip = document.getElementById('pip-canvas')
        if (pip) pip.classList.add('pip-visible')
    } catch (err) {
        console.error('摄像头启动失败:', err)
        statusDot.style.backgroundColor = '#ff3333'
        statusTxt.innerText = err.name === 'NotAllowedError' ? '请在浏览器中允许摄像头' : '摄像头启动失败'
    }
}

export async function initCameras() {
    if (!window.isSecureContext) {
        statusTxt.innerText = '需 https/localhost 才能启用摄像头'
        return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        statusTxt.innerText = '浏览器不支持摄像头'
        return
    }

    try { await navigator.mediaDevices.getUserMedia({ video: true }) } catch {}

    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter(d => d.kind === 'videoinput')

    selectEl.innerHTML = ''
    videoDevices.forEach(device => {
        const opt = document.createElement('option')
        opt.value = device.deviceId
        opt.text  = device.label || `摄像头 ${selectEl.length + 1}`
        selectEl.appendChild(opt)
    })

    if (PARAMS.selectedCamera && Array.from(selectEl.options).some(o => o.value === PARAMS.selectedCamera)) {
        selectEl.value = PARAMS.selectedCamera
    }

    await startCamera(selectEl.value)
}

selectEl.onchange = () => {
    startCamera(selectEl.value)
    scheduleSave(PARAMS, selectEl)
}

toggleBtn.addEventListener('click', () => {
    if (!currentStream) return
    isCapturePaused = !isCapturePaused
    if (isCapturePaused) {
        videoEl.pause()
    } else {
        videoEl.play()
    }
    updateUI()
})

updateUI()
