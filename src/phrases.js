const RAW_PHRASES = [
    '抬头看，群星也在注视你。',
    '迷茫，是恒星诞生前的星云。',
    '宇宙很大，容得下你所有的不安。',
    '别急，光走到这里也需要时间。',
    '你眼中的黑暗，是另一场黎明的画布。',
    '在这里，渺小不是一种过错。',
    '安静下来，听听引力的声音。',
    '走错路也没关系，那是新的轨道。',
    '你身上的每个原子，都来自一颗爆炸的恒星。',
    '并没有迷失，你只是在探索边界。',
    '星光不问赶路人，但它会照亮脚下的路。',
    '深渊之上，必有星空。',
    '你的心跳，是宇宙在这个角落的回响。',
    '不用刻意发光，你本就耀眼。',
]

let pool = [...RAW_PHRASES]

export function getRandomPhrase() {
    if (pool.length === 0) pool = [...RAW_PHRASES]
    const index = Math.floor(Math.random() * pool.length)
    const phrase = pool[index]
    pool.splice(index, 1)
    return phrase
}
