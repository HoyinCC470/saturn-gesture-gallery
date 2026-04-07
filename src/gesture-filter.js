function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

const FINGER_PAIRS = [
    [8, 5],
    [12, 9],
    [16, 13],
    [20, 17],
]

function getBoundingBox(landmarks) {
    const xs = landmarks.map(point => point.x)
    const ys = landmarks.map(point => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    return {
        width: maxX - minX,
        height: maxY - minY,
        area: (maxX - minX) * (maxY - minY),
    }
}

export function isLikelyHandLandmarks(landmarks, handednessScore = 1) {
    if (!Array.isArray(landmarks) || landmarks.length !== 21) return false
    if (handednessScore < 0.65) return false

    const metrics = getHandPoseMetrics(landmarks)
    if (metrics.box.width < 0.12 || metrics.box.height < 0.12 || metrics.box.area < 0.025) return false
    if (metrics.palmScale < 0.08) return false
    if (!metrics.hasThumbLength) return false

    return metrics.extendedFingerCount >= 2 || metrics.curledFingerCount >= 3
}

export function getHandPoseMetrics(landmarks) {
    const box = getBoundingBox(landmarks)
    const wrist = landmarks[0]
    const palmWidth = distance(landmarks[5], landmarks[17])
    const palmHeight = distance(wrist, landmarks[9])
    const palmScale = Math.max(palmWidth, palmHeight)

    const extendedFingerCount = FINGER_PAIRS.reduce((count, [tipIndex, baseIndex]) => {
        const tipDistance = distance(wrist, landmarks[tipIndex])
        const baseDistance = distance(wrist, landmarks[baseIndex])
        return count + (tipDistance > baseDistance + palmScale * 0.18 ? 1 : 0)
    }, 0)

    const curledFingerCount = FINGER_PAIRS.reduce((count, [tipIndex, baseIndex]) => {
        const tipToBaseDistance = distance(landmarks[tipIndex], landmarks[baseIndex])
        return count + (tipToBaseDistance < palmScale * 0.95 ? 1 : 0)
    }, 0)

    const thumbDistance = distance(landmarks[4], landmarks[2])
    const hasThumbLength = thumbDistance > palmScale * 0.28

    return {
        box,
        palmScale,
        extendedFingerCount,
        curledFingerCount,
        thumbDistance,
        hasThumbLength,
    }
}

export function isClosedHandPose(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length !== 21) return false
    const metrics = getHandPoseMetrics(landmarks)
    return metrics.hasThumbLength && metrics.curledFingerCount >= 3
}
