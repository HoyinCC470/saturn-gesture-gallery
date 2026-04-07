export function initImageManager({
    triggerButton,
    uploadInput,
    countEl,
    getItems,
    onAddFiles,
    onRemoveItem,
    onMoveItem,
    onClearAll,
}) {
    const overlay = document.getElementById('image-manager-overlay')
    const closeButtons = overlay.querySelectorAll('[data-role="close-manager"]')
    const addButton = overlay.querySelector('[data-role="upload-btn"]')
    const clearButton = overlay.querySelector('[data-role="clear-btn"]')
    const countBadge = overlay.querySelector('[data-role="draft-count"]')
    const dirtyState = overlay.querySelector('[data-role="dirty-state"]')
    const emptyState = overlay.querySelector('[data-role="empty-state"]')
    const listEl = overlay.querySelector('[data-role="draft-list"]')

    let isOpen = false
    let draggedIndex = null

    function setCount(count) {
        countEl.textContent = count > 0 ? `已保存 ${count} 张图片` : '暂无已保存图片'
        countBadge.textContent = `${count} 张`
    }

    function openManager() {
        isOpen = true
        overlay.classList.add('open')
        triggerButton.setAttribute('aria-expanded', 'true')
        render()
    }

    function closeManager() {
        isOpen = false
        overlay.classList.remove('open')
        triggerButton.setAttribute('aria-expanded', 'false')
    }

    async function syncAndRender(action) {
        dirtyState.textContent = '处理中...'
        await action()
        render()
    }

    function render() {
        const items = getItems()
        setCount(items.length)
        dirtyState.textContent = '实时保存'
        listEl.innerHTML = ''
        emptyState.hidden = items.length > 0

        items.forEach((item, index) => {
            const card = document.createElement('article')
            card.className = 'image-card'
            card.draggable = true

            const preview = document.createElement('div')
            preview.className = 'image-card__preview'
            const image = document.createElement('img')
            image.src = item.previewUrl
            image.alt = item.name || `图片 ${index + 1}`
            preview.appendChild(image)

            const body = document.createElement('div')
            body.className = 'image-card__body'

            const title = document.createElement('div')
            title.className = 'image-card__title'
            title.textContent = item.name || `图片 ${index + 1}`

            const meta = document.createElement('div')
            meta.className = 'image-card__meta'
            meta.textContent = `顺序 ${index + 1}/${items.length}`

            body.append(title, meta)

            const actions = document.createElement('div')
            actions.className = 'image-card__actions'

            const upButton = document.createElement('button')
            upButton.type = 'button'
            upButton.textContent = '上移'
            upButton.disabled = index === 0
            upButton.addEventListener('click', () => {
                void syncAndRender(() => onMoveItem(item.id, 'up'))
            })

            const downButton = document.createElement('button')
            downButton.type = 'button'
            downButton.textContent = '下移'
            downButton.disabled = index === items.length - 1
            downButton.addEventListener('click', () => {
                void syncAndRender(() => onMoveItem(item.id, 'down'))
            })

            const deleteButton = document.createElement('button')
            deleteButton.type = 'button'
            deleteButton.className = 'danger'
            deleteButton.textContent = '删除'
            deleteButton.addEventListener('click', () => {
                void syncAndRender(() => onRemoveItem(item.id))
            })

            actions.append(upButton, downButton, deleteButton)

            const dragHint = document.createElement('span')
            dragHint.className = 'image-card__drag-hint'
            dragHint.textContent = '可拖拽排序'

            card.append(preview, body, actions, dragHint)

            card.addEventListener('dragstart', () => {
                draggedIndex = index
            })
            card.addEventListener('dragover', event => {
                event.preventDefault()
                card.classList.add('drag-over')
            })
            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over')
            })
            card.addEventListener('drop', event => {
                event.preventDefault()
                card.classList.remove('drag-over')
                if (draggedIndex === null || draggedIndex === index) return

                const draggedItem = items[draggedIndex]
                const targetIndex = index
                const direction = draggedIndex < targetIndex ? 'down' : 'up'
                const steps = Math.abs(targetIndex - draggedIndex)

                void syncAndRender(async () => {
                    for (let step = 0; step < steps; step += 1) {
                        await onMoveItem(draggedItem.id, direction)
                    }
                })
            })
            card.addEventListener('dragend', () => {
                draggedIndex = null
                card.classList.remove('drag-over')
            })

            listEl.appendChild(card)
        })
    }

    triggerButton.addEventListener('click', openManager)
    addButton.addEventListener('click', () => uploadInput.click())
    clearButton.addEventListener('click', () => {
        if (!getItems().length) return
        if (!window.confirm('确定要清空所有图片吗？')) return
        void syncAndRender(onClearAll)
    })

    closeButtons.forEach(button => {
        button.addEventListener('click', closeManager)
    })

    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeManager()
    })

    uploadInput.addEventListener('change', event => {
        const files = event.target.files
        if (!files?.length) return
        void syncAndRender(() => onAddFiles(files))
        event.target.value = ''
    })

    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && isOpen) closeManager()
    })

    render()

    return { render, open: openManager, close: closeManager }
}
