export function mergeGalleryAssets(existingTextures, existingAspects, nextTextures, nextAspects) {
    return {
        textures: [...existingTextures, ...nextTextures],
        aspects: [...existingAspects, ...nextAspects],
    }
}
