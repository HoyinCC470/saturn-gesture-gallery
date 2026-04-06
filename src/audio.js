const scale = {
    bass: [65.41, 87.31, 98.00, 110.00, 130.81],
    mid: [196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 392.00],
    high: [523.25, 659.25, 783.99, 880.00, 987.77, 1046.50],
}

// Cached noise buffers to avoid GC churn on every sound effect
const noiseCache = { expand: null, contract: null }

export const AudioEngine = {
    ctx: null,
    masterGain: null,
    bgmGain: null,
    sfxGain: null,
    isStarted: false,
    isBgmEnabled: false,
    globalVolume: 0.15,

    init() {
        window.AudioContext = window.AudioContext || window.webkitAudioContext
        this.ctx = new AudioContext()
        this.masterGain = this.ctx.createGain()
        this.masterGain.gain.value = this.globalVolume

        const lofiFilter = this.ctx.createBiquadFilter()
        lofiFilter.type = 'lowpass'
        lofiFilter.frequency.value = 1200
        lofiFilter.Q.value = 0.5

        const compressor = this.ctx.createDynamicsCompressor()
        compressor.threshold.value = -24
        compressor.ratio.value = 12

        this.masterGain.connect(lofiFilter)
        lofiFilter.connect(compressor)
        compressor.connect(this.ctx.destination)

        this.bgmGain = this.ctx.createGain()
        this.bgmGain.gain.value = 0.0
        this.bgmGain.connect(this.masterGain)

        this.sfxGain = this.ctx.createGain()
        this.sfxGain.gain.value = 0.8
        this.sfxGain.connect(this.masterGain)

        this._createDelayEffect(this.bgmGain)
    },

    _createDelayEffect(inputNode) {
        const delay = this.ctx.createDelay()
        delay.delayTime.value = 0.4
        const feedback = this.ctx.createGain()
        feedback.gain.value = 0.3
        const delayFilter = this.ctx.createBiquadFilter()
        delayFilter.type = 'lowpass'
        delayFilter.frequency.value = 800
        inputNode.connect(delay)
        delay.connect(feedback)
        feedback.connect(delayFilter)
        delayFilter.connect(delay)
        delayFilter.connect(this.masterGain)
    },

    start() {
        if (this.isStarted) return
        if (!this.ctx) this.init()
        this.ctx.resume().then(() => {
            this.isStarted = true
            // Pre-generate noise buffers
            noiseCache.expand = this._createPinkNoiseBuffer(2.5)
            noiseCache.contract = this._createPinkNoiseBuffer(1.5)
            if (this.isBgmEnabled) this._schedulePiano()
            const hint = document.getElementById('audio-hint')
            if (hint) {
                hint.style.opacity = '0'
                setTimeout(() => { hint.style.display = 'none' }, 500)
            }
        })
    },

    setVolume(val) {
        this.globalVolume = val
        if (this.masterGain) this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1)
    },

    _playPianoNote(freq, duration, velocity = 1) {
        const t = this.ctx.currentTime
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.value = freq
        osc.detune.value = (Math.random() - 0.5) * 10
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(velocity * 0.5, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
        osc.connect(gain)
        gain.connect(this.bgmGain)
        osc.start(t)
        osc.stop(t + duration)
    },

    _schedulePiano() {
        if (!this.isStarted || !this.isBgmEnabled) return
        const nextTime = 2000 + Math.random() * 3000
        const r = Math.random()
        if (r < 0.3) {
            this._playPianoNote(scale.bass[Math.floor(Math.random() * scale.bass.length)], 4.0, 0.6)
        } else {
            this._playPianoNote(scale.mid[Math.floor(Math.random() * scale.mid.length)], 3.0, 0.4)
            if (Math.random() < 0.4) {
                setTimeout(() => this._playPianoNote(scale.high[Math.floor(Math.random() * scale.high.length)], 3.0, 0.3), 100 + Math.random() * 200)
            }
        }
        setTimeout(() => this._schedulePiano(), nextTime)
    },

    _createPinkNoiseBuffer(duration) {
        const bufferSize = this.ctx.sampleRate * duration
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
        const data = buffer.getChannelData(0)
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1
            b0 = 0.99886 * b0 + white * 0.0555179
            b1 = 0.99332 * b1 + white * 0.0750759
            b2 = 0.96900 * b2 + white * 0.1538520
            b3 = 0.86650 * b3 + white * 0.3104856
            b4 = 0.55000 * b4 + white * 0.5329522
            b5 = -0.7616 * b5 - white * 0.0168980
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
            b6 = white * 0.115926
        }
        return buffer
    },

    _playNoiseBuffer(buffer, filterSetup, gainSetup) {
        if (!this.isStarted || !buffer) return
        const t = this.ctx.currentTime
        const noise = this.ctx.createBufferSource()
        noise.buffer = buffer
        const filter = this.ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filterSetup(filter, t)
        const gain = this.ctx.createGain()
        gainSetup(gain, t)
        noise.connect(filter)
        filter.connect(gain)
        gain.connect(this.sfxGain)
        noise.start(t)
    },

    playExpandSound() {
        this._playNoiseBuffer(
            noiseCache.expand,
            (f, t) => {
                f.frequency.setValueAtTime(150, t)
                f.frequency.exponentialRampToValueAtTime(700, t + 1.2)
            },
            (g, t) => {
                g.gain.setValueAtTime(0, t)
                g.gain.linearRampToValueAtTime(0.4, t + 0.1)
                g.gain.exponentialRampToValueAtTime(0.01, t + 2.5)
            }
        )
    },

    playContractSound() {
        this._playNoiseBuffer(
            noiseCache.contract,
            (f, t) => {
                f.frequency.setValueAtTime(200, t)
                f.frequency.linearRampToValueAtTime(800, t + 0.2)
                f.frequency.linearRampToValueAtTime(100, t + 1.0)
            },
            (g, t) => {
                g.gain.setValueAtTime(0, t)
                g.gain.linearRampToValueAtTime(0.5, t + 0.2)
                g.gain.linearRampToValueAtTime(0, t + 1.0)
            }
        )
    },
}
