export function stopMediaStream(stream) {
    stream?.getTracks?.().forEach(track => track.stop())
}
