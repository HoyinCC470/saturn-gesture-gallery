export function resolvePreferredCameraId(savedCameraId, videoDevices) {
    if (!Array.isArray(videoDevices) || videoDevices.length === 0) return ''
    if (savedCameraId && videoDevices.some(device => device.deviceId === savedCameraId)) {
        return savedCameraId
    }
    return videoDevices[0].deviceId
}
