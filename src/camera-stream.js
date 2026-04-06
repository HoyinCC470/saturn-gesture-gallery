export function stopMediaStream(stream) {
    stream?.getTracks?.().forEach(track => track.stop())
}

export async function waitForVideoToBeReady(videoEl, timeoutMs = 4000) {
    if (!videoEl) return

    if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        return
    }

    await new Promise((resolve, reject) => {
        let timeoutId = null

        const cleanup = () => {
            videoEl.removeEventListener('loadedmetadata', handleReady)
            videoEl.removeEventListener('loadeddata', handleReady)
            videoEl.removeEventListener('canplay', handleReady)
            videoEl.removeEventListener('playing', handleReady)
            if (timeoutId) clearTimeout(timeoutId)
        }

        const handleReady = () => {
            if (videoEl.readyState < 2 || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return
            cleanup()
            resolve()
        }

        timeoutId = setTimeout(() => {
            cleanup()
            reject(new Error('Video stream did not become ready in time'))
        }, timeoutMs)

        videoEl.addEventListener('loadedmetadata', handleReady)
        videoEl.addEventListener('loadeddata', handleReady)
        videoEl.addEventListener('canplay', handleReady)
        videoEl.addEventListener('playing', handleReady)
        handleReady()
    })
}
