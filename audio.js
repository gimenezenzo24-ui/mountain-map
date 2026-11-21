// audio.js - Sintetizador Web Audio API: Efectos Retro (Salto, Moneda, Muerte) y Melodía Chiptune Alegre
class SoundFX {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.chiptune = null;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
                this.chiptune = new ChiptuneMusicPlayer(this.ctx);
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.chiptune) {
            this.chiptune.setMuted(this.muted);
        }
        return this.muted;
    }

    toggleMusic() {
        this.init();
        if (this.chiptune) {
            return this.chiptune.toggle();
        }
        return false;
    }

    startMusic() {
        this.init();
        if (this.chiptune && !this.muted) {
            this.chiptune.start();
        }
    }

    stopMusic() {
        if (this.chiptune) {
            this.chiptune.stop();
        }
    }

    // SONIDO RETRO 8-BIT DE SALTO (Pitch-bend ascendente clásico)
    playJump() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Onda cuadrada retro con barrido de frecuencia rápido hacia arriba
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(620, now + 0.12);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.14);
    }

    // SONIDO RETRO 8-BIT DE MONEDA / GEMA RECOGIDA (Doble tono brillante B5 -> E6)
    playCoin() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        // Tono 1: B5 (987.77 Hz) durante 0.06s
        osc.frequency.setValueAtTime(987.77, now);
        // Tono 2: E6 (1318.51 Hz) brillante
        osc.frequency.setValueAtTime(1318.51, now + 0.065);

        gain.gain.setValueAtTime(0.14, now);
        gain.gain.setValueAtTime(0.14, now + 0.065);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.30);
    }

    playCollect() {
        this.playCoin();
    }

    // SONIDO RETRO 8-BIT DE MUERTE / CAÍDA (Barrido cromático descendente)
    playDeath() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [493.88, 440.00, 392.00, 349.23, 293.66, 220.00, 164.81];

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const t = now + idx * 0.065;

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, t);

            gain.gain.setValueAtTime(0.18, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(t);
            osc.stop(t + 0.08);
        });
    }

    // SONIDO MÁGICO DE GEMA SECRETA
    playSecretGem() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [587.33, 739.99, 880.00, 1174.66, 1479.98, 1760.00];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const t = now + idx * 0.045;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);

            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(t);
            osc.stop(t + 0.28);
        });
    }

    playCheckpoint() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [440, 659.25, 880];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const t = now + idx * 0.07;

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);

            gain.gain.setValueAtTime(0.18, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(t);
            osc.stop(t + 0.2);
        });
    }

    playMove() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(390, now + 0.08);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.09);
    }

    playSelect() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(660, now + 0.05);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);
    }

    playLocked() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.setValueAtTime(110, now + 0.1);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.22);
    }

    playEnter() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [330, 440, 550, 660, 880];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const time = now + idx * 0.06;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.15, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(time);
            osc.stop(time + 0.2);
        });
    }

    playWin() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const melody = [
            { f: 523.25, d: 0.12 }, // C5
            { f: 659.25, d: 0.12 }, // E5
            { f: 783.99, d: 0.12 }, // G5
            { f: 1046.50, d: 0.35 } // C6
        ];

        let cursor = now;
        melody.forEach(item => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(item.f, cursor);

            gain.gain.setValueAtTime(0.25, cursor);
            gain.gain.exponentialRampToValueAtTime(0.001, cursor + item.d);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(cursor);
            osc.stop(cursor + item.d);
            cursor += item.d * 0.9;
        });
    }
}

// =========================================================================
// REPRODUCTOR PROCEDURAL DE MELODÍA CHIPTUNE ALEGRE (Web Audio API)
// =========================================================================
class ChiptuneMusicPlayer {
    constructor(audioCtx) {
        this.ctx = audioCtx;
        this.isPlaying = false;
        this.isMuted = false;
        this.intervalId = null;
        this.step = 0;
        this.tempoBPM = 136; // Alegre y enérgico
        this.stepDuration = (60 / this.tempoBPM) / 2; // Semi-corcheas (8th notes)

        // Melodía principal alegre en C Mayor (Onda Cuadrada Retro)
        // 0 representa silencio / pausa
        this.melody = [
            523.25, 0, 659.25, 0, 783.99, 1046.50, 0, 783.99, // C5, E5, G5, C6, G5
            880.00, 0, 1046.50, 0, 987.77, 880.00, 783.99, 0, // A5, C6, B5, A5, G5
            659.25, 0, 783.99, 0, 880.00, 783.99, 659.25, 0,  // E5, G5, A5, G5, E5
            587.33, 659.25, 587.33, 0, 523.25, 0, 0, 0,       // D5, E5, D5, C5
            // Segunda frase con variación triunfal
            523.25, 0, 659.25, 0, 783.99, 0, 1046.50, 0,       // C5, E5, G5, C6
            1174.66, 1046.50, 987.77, 880.00, 987.77, 0, 1046.50, 0, // D6, C6, B5, A5, B5, C6
            1318.51, 0, 1174.66, 1046.50, 987.77, 0, 880.00, 0,     // E6, D6, C6, B5, A5
            783.99, 880.00, 987.77, 1046.50, 1046.50, 0, 0, 0        // G5, A5, B5, C6, C6
        ];

        // Línea de Bajo saltarina (Onda Triangular Retro)
        this.bassline = [
            130.81, 0, 196.00, 0, 130.81, 0, 196.00, 0, // C3, G3
            174.61, 0, 220.00, 0, 196.00, 0, 146.83, 0, // F3, A3, G3, D3
            130.81, 0, 196.00, 0, 174.61, 0, 220.00, 0, // C3, G3, F3, A3
            196.00, 0, 146.83, 0, 130.81, 0, 196.00, 0, // G3, D3, C3, G3
            130.81, 0, 196.00, 0, 130.81, 0, 196.00, 0, // C3, G3
            174.61, 0, 220.00, 0, 196.00, 0, 246.94, 0, // F3, A3, G3, B3
            220.00, 0, 174.61, 0, 196.00, 0, 146.83, 0, // A3, F3, G3, D3
            196.00, 0, 246.94, 0, 130.81, 0, 196.00, 0  // G3, B3, C3, G3
        ];
    }

    setMuted(muted) {
        this.isMuted = muted;
        if (muted && this.isPlaying) {
            this.stop();
        }
    }

    toggle() {
        if (this.isPlaying) {
            this.stop();
            return false;
        } else {
            this.start();
            return true;
        }
    }

    start() {
        if (this.isPlaying || this.isMuted) return;
        if (!this.ctx) return;

        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        this.isPlaying = true;
        this.step = 0;

        const intervalMs = this.stepDuration * 1000;
        this.intervalId = setInterval(() => {
            this.playNextStep();
        }, intervalMs);
    }

    stop() {
        this.isPlaying = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    playNextStep() {
        if (!this.isPlaying || this.isMuted || !this.ctx) return;

        const now = this.ctx.currentTime;
        const totalSteps = this.melody.length;
        const currentIdx = this.step % totalSteps;

        // 1. VOZ PRINCIPAL: Melodía Chiptune (Onda Cuadrada con envolvente corta)
        const noteFreq = this.melody[currentIdx];
        if (noteFreq > 0) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(noteFreq, now);

            // Volumen bajo y nítido para música de fondo agradable
            gain.gain.setValueAtTime(0.045, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + this.stepDuration * 0.9);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + this.stepDuration * 0.9);
        }

        // 2. VOZ GRAVE: Bajo Chiptune (Onda Triangular cálida)
        const bassFreq = this.bassline[currentIdx];
        if (bassFreq > 0) {
            const bassOsc = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();

            bassOsc.type = 'triangle';
            bassOsc.frequency.setValueAtTime(bassFreq, now);

            bassGain.gain.setValueAtTime(0.08, now);
            bassGain.gain.exponentialRampToValueAtTime(0.001, now + this.stepDuration * 0.85);

            bassOsc.connect(bassGain);
            bassGain.connect(this.ctx.destination);

            bassOsc.start(now);
            bassOsc.stop(now + this.stepDuration * 0.85);
        }

        // 3. PERCUSIÓN RETRO (Hi-Hat / Snare tick en cada pulso)
        if (currentIdx % 2 === 0) {
            const noiseOsc = this.ctx.createOscillator();
            const noiseGain = this.ctx.createGain();

            // Click percusivo de 8-bit
            noiseOsc.type = 'sawtooth';
            noiseOsc.frequency.setValueAtTime(currentIdx % 4 === 2 ? 380 : 800, now);
            noiseOsc.frequency.exponentialRampToValueAtTime(60, now + 0.03);

            noiseGain.gain.setValueAtTime(0.025, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

            noiseOsc.connect(noiseGain);
            noiseGain.connect(this.ctx.destination);

            noiseOsc.start(now);
            noiseOsc.stop(now + 0.035);
        }

        this.step++;
    }
}

window.soundFX = new SoundFX();
