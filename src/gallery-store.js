const DB_NAME = 'saturn_gallery_assets_v1'
const DB_VERSION = 1
const STORE_NAME = 'assets'

function cloneRecord(record) {
    return { ...record }
}

function cloneRecords(records) {
    return records.map(cloneRecord)
}

function isBrowserIndexedDbAvailable() {
    return typeof indexedDB !== 'undefined'
}

function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
    })
}

function transactionToPromise(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'))
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
    })
}

function compareGalleryAssets(a, b) {
    const orderA = Number.isFinite(a.sortOrder) ? a.sortOrder : Number.POSITIVE_INFINITY
    const orderB = Number.isFinite(b.sortOrder) ? b.sortOrder : Number.POSITIVE_INFINITY
    if (orderA !== orderB) return orderA - orderB

    const createdA = Number.isFinite(a.createdAt) ? a.createdAt : 0
    const createdB = Number.isFinite(b.createdAt) ? b.createdAt : 0
    if (createdA !== createdB) return createdA - createdB

    return String(a.id).localeCompare(String(b.id))
}

export function normalizeGalleryAssetRecords(records) {
    return cloneRecords(records).sort(compareGalleryAssets).map((record, index) => ({
        ...record,
        sortOrder: index,
    }))
}

export function applyGalleryAssetOrder(records, orderedIds) {
    const byId = new Map(records.map(record => [record.id, cloneRecord(record)]))
    const seen = new Set()
    const reordered = []

    for (const id of orderedIds || []) {
        if (!byId.has(id) || seen.has(id)) continue
        reordered.push(byId.get(id))
        seen.add(id)
    }

    for (const record of records) {
        if (seen.has(record.id)) continue
        reordered.push(cloneRecord(record))
    }

    return reordered.map((record, index) => ({
        ...record,
        sortOrder: index,
    }))
}

export function removeGalleryAssetRecord(records, id) {
    return normalizeGalleryAssetRecords(records.filter(record => record.id !== id))
}

export function mergeGalleryAssets(existingTextures, existingAspects, nextTextures, nextAspects) {
    return {
        textures: [...existingTextures, ...nextTextures],
        aspects: [...existingAspects, ...nextAspects],
    }
}

export function createMemoryGalleryStore(initialRecords = []) {
    let records = normalizeGalleryAssetRecords(initialRecords)

    return {
        async list() {
            return cloneRecords(records)
        },

        async append(nextRecords) {
            const incoming = Array.from(nextRecords || []).map((record, index) => ({
                id: record.id || createId(),
                name: record.name || `图片 ${records.length + index + 1}`,
                type: record.type || 'image/*',
                size: Number.isFinite(record.size) ? record.size : 0,
                createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
                sortOrder: Number.isFinite(record.sortOrder) ? record.sortOrder : records.length + index,
                width: Number.isFinite(record.width) ? record.width : undefined,
                height: Number.isFinite(record.height) ? record.height : undefined,
                aspect: Number.isFinite(record.aspect) ? record.aspect : undefined,
                blob: record.blob,
            }))

            records = normalizeGalleryAssetRecords([...records, ...incoming])
            return cloneRecords(records)
        },

        async remove(id) {
            records = removeGalleryAssetRecord(records, id)
            return cloneRecords(records)
        },

        async reorder(orderedIds) {
            records = applyGalleryAssetOrder(records, orderedIds)
            return cloneRecords(records)
        },

        async clear() {
            records = []
            return []
        },
    }
}

async function measureImageBlob(blob) {
    if (!blob) throw new Error('Missing image blob')

    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob)
        try {
            return {
                width: bitmap.width,
                height: bitmap.height,
                aspect: bitmap.width / bitmap.height,
            }
        } finally {
            bitmap.close?.()
        }
    }

    return await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob)
        const image = new Image()

        const cleanup = () => {
            URL.revokeObjectURL(url)
            image.onload = null
            image.onerror = null
        }

        image.onload = () => {
            cleanup()
            if (!image.naturalWidth || !image.naturalHeight) {
                reject(new Error('Invalid image dimensions'))
                return
            }
            resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
                aspect: image.naturalWidth / image.naturalHeight,
            })
        }

        image.onerror = () => {
            cleanup()
            reject(new Error('Failed to load image blob'))
        }

        image.src = url
    })
}

async function openGalleryDatabase() {
    if (!isBrowserIndexedDbAvailable()) {
        throw new Error('IndexedDB is not available in this environment')
    }

    return await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
                store.createIndex('sortOrder', 'sortOrder', { unique: false })
                store.createIndex('createdAt', 'createdAt', { unique: false })
            }
        }

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error || new Error('Failed to open gallery database'))
    })
}

async function readGalleryAssetRecords(db) {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const records = await requestToPromise(store.getAll())
    await transactionToPromise(tx)
    return normalizeGalleryAssetRecords(records)
}

export async function readStoredGalleryAssets() {
    const db = await openGalleryDatabase()
    try {
        return await readGalleryAssetRecords(db)
    } finally {
        db.close()
    }
}

export async function appendStoredGalleryAssets(files) {
    const fileList = Array.from(files || [])
    if (!fileList.length) return await readStoredGalleryAssets()

    const db = await openGalleryDatabase()
    try {
        const existing = await readGalleryAssetRecords(db)
        const nextOrder = existing.length ? Math.max(...existing.map(record => record.sortOrder ?? 0)) + 1 : 0
        const prepared = await Promise.all(fileList.map(async (file, index) => {
            const blob = file.slice(0, file.size, file.type)
            const { width, height, aspect } = await measureImageBlob(blob)
            return {
                id: createId(),
                name: file.name || `图片 ${existing.length + index + 1}`,
                type: file.type || blob.type || 'image/*',
                size: file.size ?? blob.size ?? 0,
                createdAt: Date.now() + index,
                sortOrder: nextOrder + index,
                width,
                height,
                aspect,
                blob,
            }
        }))

        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        for (const record of prepared) {
            store.put(record)
        }
        await transactionToPromise(tx)
        return await readGalleryAssetRecords(db)
    } finally {
        db.close()
    }
}

export async function removeStoredGalleryAsset(id) {
    const db = await openGalleryDatabase()
    try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(id)
        await transactionToPromise(tx)
        return await readGalleryAssetRecords(db)
    } finally {
        db.close()
    }
}

export async function reorderStoredGalleryAssets(orderedIds) {
    const db = await openGalleryDatabase()
    try {
        const existing = await readGalleryAssetRecords(db)
        const reordered = applyGalleryAssetOrder(existing, orderedIds)

        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        for (const record of reordered) {
            store.put(record)
        }
        await transactionToPromise(tx)
        return await readGalleryAssetRecords(db)
    } finally {
        db.close()
    }
}

export async function clearStoredGalleryAssets() {
    const db = await openGalleryDatabase()
    try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).clear()
        await transactionToPromise(tx)
        return []
    } finally {
        db.close()
    }
}

export {
    readStoredGalleryAssets as listPersistedGalleryItems,
    appendStoredGalleryAssets as addPersistedGalleryFiles,
    removeStoredGalleryAsset as deletePersistedGalleryItem,
    reorderStoredGalleryAssets as reorderPersistedGalleryItems,
    clearStoredGalleryAssets as clearPersistedGalleryItems,
}
