// game.js - Motor principal del mapa de montaña y nivel de plataformas 4x
(function () {
    'use strict';

    // Dimensiones virtuales del viewport y del mundo horizontal
    const V_WIDTH = 960;
    const V_HEIGHT = 640;
    const WORLD_WIDTH = 3840; // 4 veces el ancho de pantalla (4 * 960)

    // Estado global del juego
    const gameState = {
        mode: 'MAP', // 'MAP' | 'LEVEL'
        currentLevelId: 1,
        moving: false,
        moveProgress: 0,
        moveStartPos: null,
        moveEndPos: null,
        moveCP: null,
        moveTargetLevelId: null,
        moveFacing: 1,
        unlockedLevels: new Set([1]),
        completedLevels: new Set(),
        stars: {},
        deathCount: 0,
        hoveredLevelId: null,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        // Partículas del mapa
        snowParticles: [],
        leafParticles: [],
        cloudParticles: [],
        // Estado del nivel 4x (Side-scroller)
        levelGame: null,
        messageToast: null,
        messageTimer: 0,
        // Animaciones de desbloqueo y victoria en el mapa
        pendingUnlock: null,
        mapUnlockAnim: null
    };

    // Referencias al DOM
    let canvas, ctx;
    let uiLevelCard, uiLevelTitle, uiLevelSubtitle, uiLevelDesc, uiLevelGoal, uiEnterBtn;
    let uiStarsCount, uiProgressCount, uiDeathCount, uiMusicBtn, uiMuteBtn, uiResetBtn;

    // Constantes de almacenamiento y seguridad anti-manipulación
    const STORAGE_KEY = 'mountain_map_progress_v3';
    const INTEGRITY_SALT = 'AGY_MTN_SEC_k9X!#7mQz_2026';

    // Algoritmo de firma digital de integridad (Dual FNV-1a / Murmur3-Mixer de alta dispersión)
    function computeIntegritySignature(payloadStr) {
        let h1 = 0x811c9dc5;
        let h2 = 0x5a1f89bc;
        const combined = `${INTEGRITY_SALT}::${payloadStr}::${INTEGRITY_SALT}`;
        for (let i = 0; i < combined.length; i++) {
            const code = combined.charCodeAt(i);
            h1 ^= code;
            h1 = Math.imul(h1, 0x01000193);
            h2 = Math.imul(h2 ^ code, 0x5bd1e995);
            h2 ^= (h2 >>> 15);
        }
        h1 ^= (h1 >>> 13);
        h1 = Math.imul(h1, 0x85ebca6b);
        h1 ^= (h1 >>> 16);
        h2 ^= (h2 >>> 13);
        h2 = Math.imul(h2, 0xc2b2ae35);
        h2 ^= (h2 >>> 16);
        return `${(h1 >>> 0).toString(16).padStart(8, '0')}-${(h2 >>> 0).toString(16).padStart(8, '0')}`;
    }

    // Validador estricto de estructura, firma e invariantes de negocio del juego
    function validateSaveIntegrity(envelope) {
        if (!envelope || typeof envelope !== 'object') {
            return { valid: false, reason: 'El registro de guardado no es un objeto válido' };
        }
        if (envelope.version !== 3) {
            return { valid: false, reason: `Versión incompatible (${envelope.version})` };
        }
        if (typeof envelope.payload !== 'string' || typeof envelope.sig !== 'string') {
            return { valid: false, reason: 'Estructura de sobre (payload o firma) corrupta o ausente' };
        }

        // Verificación de firma criptográfica
        const expectedSig = computeIntegritySignature(envelope.payload);
        if (envelope.sig !== expectedSig) {
            return { valid: false, reason: 'Firma criptográfica inválida (se detectó alteración manual del contenido en LocalStorage)' };
        }

        let data;
        try {
            data = JSON.parse(envelope.payload);
        } catch (e) {
            return { valid: false, reason: 'El payload firmado no contiene JSON válido' };
        }

        if (!data || typeof data !== 'object') {
            return { valid: false, reason: 'El contenido descifrado no es un objeto' };
        }

        // Invariante 1: unlocked debe ser un array con números enteros 1..7 y SIEMPRE contener el Nivel 1
        if (!Array.isArray(data.unlocked) || data.unlocked.length === 0) {
            return { valid: false, reason: 'La lista de niveles desbloqueados no es válida' };
        }
        for (const id of data.unlocked) {
            if (!Number.isInteger(id) || id < 1 || id > 7) {
                return { valid: false, reason: `ID de nivel desbloqueado fuera de rango permitido: ${id}` };
            }
        }
        if (!data.unlocked.includes(1)) {
            return { valid: false, reason: 'Invariante violado: El Campamento Base (Nivel 1) debe estar siempre desbloqueado' };
        }

        // Invariante 2: completed debe ser un array con números enteros 1..7 y ser un subconjunto de unlocked
        if (!Array.isArray(data.completed)) {
            return { valid: false, reason: 'La lista de niveles completados no es válida' };
        }
        for (const id of data.completed) {
            if (!Number.isInteger(id) || id < 1 || id > 7) {
                return { valid: false, reason: `ID de nivel completado fuera de rango: ${id}` };
            }
            if (!data.unlocked.includes(id)) {
                return { valid: false, reason: `Invariante violado: El nivel ${id} figura completado sin haber sido desbloqueado` };
            }
        }

        // Invariante 3: Topología del grafo de la montaña
        // Cualquier nivel L > 1 en unlocked DEBE tener al menos un vecino conectado que figure en completed
        const completedSet = new Set(data.completed);
        for (const id of data.unlocked) {
            if (id === 1) continue;
            const lvlDef = window.LEVELS_DATA?.find(lvl => lvl.id === id);
            if (lvlDef) {
                const hasCompletedNeighbor = lvlDef.neighbors.some(nId => completedSet.has(nId));
                if (!hasCompletedNeighbor) {
                    return { valid: false, reason: `Invariante de grafo violado: El nivel ${id} no tiene un vecino completado conectado` };
                }
            }
        }

        // Invariante 4: deathCount debe ser un número entero >= 0 y <= 500000
        if (typeof data.deathCount !== 'number' || !Number.isInteger(data.deathCount) || data.deathCount < 0 || data.deathCount > 500000) {
            return { valid: false, reason: 'Contador de muertes manipulado, negativo o fuera de rango' };
        }

        // Invariante 5: stars debe ser un objeto con estrellas 1..3 asignadas exclusivamente a niveles completados
        if (!data.stars || typeof data.stars !== 'object' || Array.isArray(data.stars)) {
            return { valid: false, reason: 'Estructura de estrellas inválida' };
        }
        for (const [lvlKey, starCount] of Object.entries(data.stars)) {
            const lvlId = Number(lvlKey);
            if (!Number.isInteger(lvlId) || lvlId < 1 || lvlId > 7) {
                return { valid: false, reason: `Clave de nivel de estrella no válida: ${lvlKey}` };
            }
            if (!completedSet.has(lvlId)) {
                return { valid: false, reason: `Invariante violado: Estrellas asignadas al nivel ${lvlId} sin haberlo completado` };
            }
            if (!Number.isInteger(starCount) || starCount < 1 || starCount > 3) {
                return { valid: false, reason: `Valor de estrellas no válido (${starCount}) para el nivel ${lvlId}` };
            }
        }

        // Invariante 6: currentLevelId debe ser un ID válido presente en unlocked
        if (typeof data.currentLevelId !== 'number' || !data.unlocked.includes(data.currentLevelId)) {
            return { valid: false, reason: 'Nivel actual del avatar inválido o no desbloqueado' };
        }

        return { valid: true, data };
    }

    function handleTamperDetected(reason) {
        console.error(`[SEGURIDAD LOCALSTORAGE] ⚠️ ¡Alteración o corrupción detectada! Razón: ${reason}`);
        gameState.unlockedLevels = new Set([1]);
        gameState.completedLevels = new Set();
        gameState.stars = {};
        gameState.deathCount = 0;
        gameState.currentLevelId = 1;
        saveProgress();
        updateHUD();
        updateLevelCard();

        if (window.soundFX) window.soundFX.playLocked();
        showToast('⚠️ ¡Alerta! Datos alterados en LocalStorage. Progreso restaurado a estado seguro.', 240);
    }

    // Cargar progreso de localStorage validando integridad
    function loadSaveData() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                let envelope;
                try {
                    envelope = JSON.parse(saved);
                } catch (err) {
                    handleTamperDetected('JSON corrupto en almacenamiento local');
                    return false;
                }

                const result = validateSaveIntegrity(envelope);
                if (result.valid) {
                    const data = result.data;
                    gameState.unlockedLevels = new Set(data.unlocked);
                    gameState.completedLevels = new Set(data.completed);
                    gameState.stars = data.stars;
                    gameState.deathCount = data.deathCount;
                    gameState.currentLevelId = data.currentLevelId;
                    return true;
                } else {
                    handleTamperDetected(result.reason);
                    return false;
                }
            } else {
                // Migración transparente desde v2 si existe y es válida
                const legacy = localStorage.getItem('mountain_map_progress_v2');
                if (legacy) {
                    try {
                        const legData = JSON.parse(legacy);
                        if (Array.isArray(legData.unlocked) && legData.unlocked.includes(1)) {
                            gameState.unlockedLevels = new Set(legData.unlocked);
                            if (Array.isArray(legData.completed)) gameState.completedLevels = new Set(legData.completed);
                            if (legData.stars && typeof legData.stars === 'object') gameState.stars = legData.stars;
                            if (typeof legData.deathCount === 'number' && legData.deathCount >= 0) gameState.deathCount = legData.deathCount;
                            if (legData.currentLevelId && gameState.unlockedLevels.has(legData.currentLevelId)) {
                                gameState.currentLevelId = legData.currentLevelId;
                            }
                        }
                    } catch (e) {}
                    localStorage.removeItem('mountain_map_progress_v2');
                }
                saveProgress();
            }
        } catch (e) {
            console.warn("No se pudo cargar el progreso local:", e);
            handleTamperDetected('Error en lectura de LocalStorage');
            return false;
        }
        gameState.unlockedLevels.add(1);
        return true;
    }

    function saveProgress() {
        try {
            const payloadObj = {
                unlocked: Array.from(gameState.unlockedLevels).sort((a, b) => a - b),
                completed: Array.from(gameState.completedLevels).sort((a, b) => a - b),
                stars: { ...gameState.stars },
                deathCount: Math.max(0, Math.floor(gameState.deathCount || 0)),
                currentLevelId: gameState.currentLevelId
            };
            const payloadStr = JSON.stringify(payloadObj);
            const sig = computeIntegritySignature(payloadStr);
            const envelope = {
                version: 3,
                timestamp: Date.now(),
                payload: payloadStr,
                sig: sig
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
        } catch (e) {
            console.warn("No se pudo guardar el progreso:", e);
        }
        updateHUD();
    }

    // Utilidad de diagnóstico expuesta globalmente para verificar la protección contra manipulaciones
    window.testTamperProtection = function () {
        console.log("%c[SEGURIDAD] Iniciando simulación de alteración no autorizada de LocalStorage...", "color: #f59e0b; font-weight: bold;");
        const hacked = {
            version: 3,
            timestamp: Date.now(),
            payload: JSON.stringify({
                unlocked: [1, 2, 3, 4, 5, 6, 7],
                completed: [1, 7],
                stars: { "7": 999 },
                deathCount: -50,
                currentLevelId: 7
            }),
            sig: "firma_falsa_manipulada_999xyz"
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(hacked));
        const success = loadSaveData();
        return {
            alteracionDetectada: !success,
            mensaje: "La firma falsa e invariantes manipulados fueron rechazados de inmediato. El progreso fue restaurado a un estado seguro."
        };
    };

    // Inicializar partículas atmosféricas del mapa
    function initMapParticles() {
        gameState.snowParticles = [];
        for (let i = 0; i < 45; i++) {
            gameState.snowParticles.push({
                x: Math.random() * V_WIDTH,
                y: Math.random() * 260,
                radius: Math.random() * 2.2 + 0.8,
                speedX: Math.random() * 0.8 - 0.4,
                speedY: Math.random() * 1.2 + 0.6,
                alpha: Math.random() * 0.7 + 0.3
            });
        }

        gameState.leafParticles = [];
        for (let i = 0; i < 20; i++) {
            gameState.leafParticles.push({
                x: Math.random() * V_WIDTH,
                y: 380 + Math.random() * 240,
                size: Math.random() * 3 + 2,
                speedX: Math.random() * 1.2 + 0.4,
                speedY: Math.random() * 0.6 - 0.2,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.05,
                color: Math.random() > 0.5 ? '#86efac' : '#fde047'
            });
        }

        gameState.cloudParticles = [
            { x: 80, y: 70, scale: 0.9, speed: 0.12 },
            { x: 380, y: 130, scale: 1.2, speed: 0.08 },
            { x: 740, y: 90, scale: 0.8, speed: 0.15 },
            { x: -120, y: 110, scale: 1.1, speed: 0.1 }
        ];
    }

    function getLevel(id) {
        return window.LEVELS_DATA.find(lvl => lvl.id === id);
    }

    function getPathBetween(id1, id2) {
        return window.PATHS_DATA.find(p =>
            (p.from === id1 && p.to === id2) || (p.from === id2 && p.to === id1)
        );
    }

    function showToast(text, duration = 120) {
        gameState.messageToast = text;
        gameState.messageTimer = duration;
    }

    function resizeCanvas() {
        const container = document.getElementById('canvas-container');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        let width = rect.width;
        let height = (width * V_HEIGHT) / V_WIDTH;

        if (height > rect.height) {
            height = rect.height;
            width = (height * V_WIDTH) / V_HEIGHT;
        }

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        gameState.scale = width / V_WIDTH;
    }

    function init() {
        canvas = document.getElementById('mountain-canvas');
        ctx = canvas.getContext('2d');

        uiLevelCard = document.getElementById('level-card');
        uiLevelTitle = document.getElementById('card-title');
        uiLevelSubtitle = document.getElementById('card-subtitle');
        uiLevelDesc = document.getElementById('card-desc');
        uiLevelGoal = document.getElementById('card-goal');
        uiEnterBtn = document.getElementById('enter-level-btn');

        uiStarsCount = document.getElementById('stars-count');
        uiProgressCount = document.getElementById('progress-count');
        uiDeathCount = document.getElementById('death-count');
        uiMusicBtn = document.getElementById('music-btn');
        uiMuteBtn = document.getElementById('mute-btn');
        uiResetBtn = document.getElementById('reset-btn');

        loadSaveData();
        initMapParticles();
        resizeCanvas();

        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('touchstart', handleCanvasTouch, { passive: false });

        if (uiEnterBtn) {
            uiEnterBtn.addEventListener('click', () => {
                tryEnterLevel(gameState.currentLevelId);
            });
        }

        if (uiMusicBtn) {
            uiMusicBtn.addEventListener('click', () => {
                const isPlaying = window.soundFX.toggleMusic();
                uiMusicBtn.textContent = isPlaying ? '🎵 Música: ON' : '🎵 Música: OFF';
                uiMusicBtn.classList.toggle('active', isPlaying);
            });
        }

        if (uiMuteBtn) {
            uiMuteBtn.addEventListener('click', () => {
                const muted = window.soundFX.toggleMute();
                uiMuteBtn.textContent = muted ? '🔇 Silenciado' : '🔊 Sonido';
                uiMuteBtn.classList.toggle('muted', muted);
                if (uiMusicBtn && window.soundFX.chiptune) {
                    const isPlaying = window.soundFX.chiptune.isPlaying;
                    uiMusicBtn.textContent = isPlaying ? '🎵 Música: ON' : '🎵 Música: OFF';
                    uiMusicBtn.classList.toggle('active', isPlaying);
                }
            });
        }

        if (uiResetBtn) {
            uiResetBtn.addEventListener('click', () => {
                if (confirm('¿Deseas reiniciar todo tu progreso en la montaña?')) {
                    gameState.unlockedLevels = new Set([1]);
                    gameState.completedLevels = new Set();
                    gameState.stars = {};
                    gameState.deathCount = 0;
                    gameState.currentLevelId = 1;
                    gameState.mode = 'MAP';
                    saveProgress();
                    updateLevelCard();
                    showToast('Progreso reiniciado. ¡Comienza en el Campamento Base!');
                }
            });
        }

        updateHUD();
        updateLevelCard();
        setupFullscreen();
        setupVirtualTouchControls();
        requestAnimationFrame(gameLoop);
    }

    // ========================================================
    // MODO PANTALLA COMPLETA TOTAL EN MÓVILES
    // ========================================================
    function setupFullscreen() {
        const fsBtn = document.getElementById('fullscreen-btn');
        const floatFsBtn = document.getElementById('float-fullscreen-btn');

        function toggleFullscreen() {
            window.soundFX.init();
            const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            if (!isFs) {
                const root = document.documentElement;
                if (root.requestFullscreen) {
                    root.requestFullscreen().catch(() => {});
                } else if (root.webkitRequestFullscreen) {
                    root.webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        }

        function updateFullscreenState() {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
            document.body.classList.toggle('fullscreen-mode', isFs);
            if (fsBtn) {
                fsBtn.textContent = isFs ? '❌ Salir Pantalla Completa' : '⛶ Pantalla Completa';
            }
            if (floatFsBtn) {
                floatFsBtn.textContent = isFs ? '✕' : '⛶';
            }
            setTimeout(resizeCanvas, 80);
            setTimeout(resizeCanvas, 260);
        }

        if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);
        if (floatFsBtn) floatFsBtn.addEventListener('click', toggleFullscreen);

        document.addEventListener('fullscreenchange', updateFullscreenState);
        document.addEventListener('webkitfullscreenchange', updateFullscreenState);
        window.addEventListener('orientationchange', () => {
            setTimeout(resizeCanvas, 120);
        });
    }

    // ========================================================
    // CONTROLES TÁCTILES VIRTUALES SUPERPUESTOS (CERO LAG)
    // ========================================================
    function setupVirtualTouchControls() {
        const dpad = document.getElementById('virtual-dpad');
        const jumpBtn = document.getElementById('virtual-jump-btn');
        const enterBtn = document.getElementById('virtual-enter-btn');

        let activeDpadKey = null;

        function setDpadKey(key) {
            if (activeDpadKey === key) return;
            if (activeDpadKey) {
                keysPressed[activeDpadKey] = false;
                const prev = dpad ? dpad.querySelector(`[data-key="${activeDpadKey}"]`) : null;
                if (prev) prev.classList.remove('active');
            }
            activeDpadKey = key;
            if (activeDpadKey) {
                keysPressed[activeDpadKey] = true;
                const next = dpad ? dpad.querySelector(`[data-key="${activeDpadKey}"]`) : null;
                if (next) next.classList.add('active');
                if (gameState.mode === 'MAP') {
                    handleDirectionalMove(activeDpadKey);
                }
                if (navigator.vibrate) {
                    navigator.vibrate(10);
                }
            }
        }

        function getDpadKeyFromPoint(clientX, clientY) {
            const el = document.elementFromPoint(clientX, clientY);
            if (el && el.classList.contains('dpad-key')) {
                return el.getAttribute('data-key');
            }
            return null;
        }

        if (dpad) {
            dpad.addEventListener('touchstart', (e) => {
                e.preventDefault();
                window.soundFX.init();
                const touch = e.changedTouches[0];
                const key = getDpadKeyFromPoint(touch.clientX, touch.clientY);
                if (key) setDpadKey(key);
            }, { passive: false });

            dpad.addEventListener('touchmove', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                if (touch) {
                    const key = getDpadKeyFromPoint(touch.clientX, touch.clientY);
                    setDpadKey(key);
                }
            }, { passive: false });

            const stopDpad = (e) => {
                e.preventDefault();
                setDpadKey(null);
            };
            dpad.addEventListener('touchend', stopDpad, { passive: false });
            dpad.addEventListener('touchcancel', stopDpad, { passive: false });
        }

        // BOTÓN DE SALTO (CERO LAG)
        if (jumpBtn) {
            jumpBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                window.soundFX.init();
                jumpBtn.classList.add('active');
                keysPressed['Space'] = true;
                if (navigator.vibrate) navigator.vibrate(14);

                if (gameState.mode === 'MAP') {
                    tryEnterLevel(gameState.currentLevelId);
                } else if (gameState.mode === 'LEVEL' && gameState.levelGame?.state === 'WON') {
                    exitToMap();
                }
            }, { passive: false });

            const endJump = (e) => {
                e.preventDefault();
                jumpBtn.classList.remove('active');
                keysPressed['Space'] = false;
            };
            jumpBtn.addEventListener('touchend', endJump, { passive: false });
            jumpBtn.addEventListener('touchcancel', endJump, { passive: false });
        }

        // BOTÓN ACCIÓN / ENTRAR (CERO LAG)
        if (enterBtn) {
            enterBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                window.soundFX.init();
                enterBtn.classList.add('active');
                keysPressed['Enter'] = true;
                if (navigator.vibrate) navigator.vibrate(12);

                if (gameState.mode === 'MAP') {
                    tryEnterLevel(gameState.currentLevelId);
                } else if (gameState.mode === 'LEVEL' && gameState.levelGame?.state === 'WON') {
                    exitToMap();
                }
            }, { passive: false });

            const endEnter = (e) => {
                e.preventDefault();
                enterBtn.classList.remove('active');
                keysPressed['Enter'] = false;
            };
            enterBtn.addEventListener('touchend', endEnter, { passive: false });
            enterBtn.addEventListener('touchcancel', endEnter, { passive: false });
        }

        window.addEventListener('touchstart', () => {
            window.soundFX.init();
        }, { once: true, passive: true });
    }

    function updateHUD() {
        const totalStars = Object.values(gameState.stars).reduce((a, b) => a + b, 0);
        if (uiStarsCount) uiStarsCount.textContent = totalStars;
        if (uiProgressCount) {
            uiProgressCount.textContent = `${gameState.completedLevels.size} / 7`;
        }
        if (uiDeathCount) {
            uiDeathCount.textContent = gameState.deathCount;
        }
        if (uiMusicBtn && window.soundFX.chiptune) {
            const isPlaying = window.soundFX.chiptune.isPlaying;
            uiMusicBtn.textContent = isPlaying ? '🎵 Música: ON' : '🎵 Música: OFF';
            uiMusicBtn.classList.toggle('active', isPlaying);
        }
    }

    function updateLevelCard() {
        const lvl = getLevel(gameState.currentLevelId);
        if (!lvl) return;

        const isUnlocked = gameState.unlockedLevels.has(lvl.id);
        const isCompleted = gameState.completedLevels.has(lvl.id);

        if (uiLevelTitle) {
            const badge = isCompleted ? ' ⭐' : '';
            uiLevelTitle.innerHTML = `Nivel ${lvl.id}: ${lvl.title} <span class="badge-status">${badge}</span>`;
        }
        if (uiLevelSubtitle) uiLevelSubtitle.textContent = lvl.subtitle;
        if (uiLevelDesc) uiLevelDesc.textContent = lvl.description;
        if (uiLevelGoal) {
            uiLevelGoal.innerHTML = `<strong>Objetivo:</strong> Avanza 4x hacia la META 🏁 y descubre las 5 gemas secretas en las rutas alternas.`;
        }

        if (uiEnterBtn) {
            if (isUnlocked) {
                uiEnterBtn.classList.remove('locked');
                uiEnterBtn.innerHTML = `<span>Presiona</span> <kbd>ESPACIO</kbd> <span>para entrar</span>`;
                uiEnterBtn.disabled = false;
            } else {
                uiEnterBtn.classList.add('locked');
                uiEnterBtn.innerHTML = `🔒 <span>Nivel Bloqueado</span>`;
                uiEnterBtn.disabled = true;
            }
        }
    }

    // ==========================================
    // MOVIMIENTO EN EL MAPA OVERWORLD
    // ==========================================
    function moveToLevel(targetId) {
        if (gameState.moving || gameState.mode !== 'MAP') return;

        const currentLvl = getLevel(gameState.currentLevelId);
        if (!currentLvl.neighbors.includes(targetId)) return;

        const targetLvl = getLevel(targetId);
        if (!targetLvl) return;

        if (!gameState.unlockedLevels.has(targetId)) {
            window.soundFX.playLocked();
            showToast(`¡El Nivel ${targetId} está bloqueado! Completa el Nivel ${targetId - 1} primero.`, 120);
            return;
        }

        const pathInfo = getPathBetween(gameState.currentLevelId, targetId);
        if (!pathInfo) return;

        gameState.moving = true;
        gameState.moveProgress = 0;
        gameState.moveStartPos = { x: currentLvl.x, y: currentLvl.y };
        gameState.moveEndPos = { x: targetLvl.x, y: targetLvl.y };
        gameState.moveCP = { x: pathInfo.cpx, y: pathInfo.cpy };
        gameState.moveTargetLevelId = targetId;
        gameState.moveFacing = targetLvl.x >= currentLvl.x ? 1 : -1;

        window.soundFX.playMove();
    }

    function tryEnterLevel(levelId) {
        if (gameState.moving) return;

        if (!gameState.unlockedLevels.has(levelId)) {
            window.soundFX.playLocked();
            showToast('¡Este nivel aún está bloqueado!', 90);
            return;
        }

        const lvl = getLevel(levelId);
        if (!lvl) return;

        window.soundFX.playEnter();
        startPlatformerLevel(lvl);
    }

    // =========================================================================
    // NIVEL 4X: PLATAFORMAS DE TIERRA, CÁMARA HORIZONTAL, RUTAS ALTERNAS & GEMAS
    // =========================================================================

    function startPlatformerLevel(lvl) {
        gameState.mode = 'LEVEL';

        // Iniciar música chiptune alegre
        window.soundFX.startMusic();
        updateHUD();

        // 1. Definición geométrica de plataformas de tierra elevadas
        const platforms = [
            // Suelo inicial (Zona 1: Valle de Salida)
            { x: 0, y: 520, w: 500, h: 120, type: 'dirt' },
            { x: 500, y: 460, w: 140, h: 45, type: 'dirt' },

            // --- BIFURCACIÓN 1 (x: 650 - 1500) ---
            // RUTA PRINCIPAL (Terreno bajo)
            { x: 670, y: 520, w: 340, h: 120, type: 'dirt' },
            { x: 1060, y: 500, w: 320, h: 140, type: 'dirt' },

            // RUTA ALTERNA ALTA 1: "Paredes del Viento" (Requiere saltos ágiles)
            { x: 700, y: 390, w: 150, h: 40, type: 'dirt' },
            { x: 890, y: 290, w: 160, h: 40, type: 'dirt' }, // Lleva a Gema 1
            { x: 1110, y: 210, w: 150, h: 40, type: 'moving', originX: 1110, rangeX: 90, speed: 1.2 }, // Móvil horizontal
            { x: 1320, y: 150, w: 140, h: 40, type: 'dirt' }, // Cornisa alta oculta con Gema 2
            { x: 1460, y: 270, w: 120, h: 40, type: 'dirt' }, // Descenso

            // CHECKPOINT 1 (x: 1420 - 1620)
            { x: 1420, y: 500, w: 260, h: 140, type: 'dirt', isCheckpoint: true, cpId: 1 },

            // --- BIFURCACIÓN 2 (x: 1700 - 2550) ---
            // RUTA PRINCIPAL (Senda media con saltos estándar)
            { x: 1720, y: 470, w: 220, h: 50, type: 'dirt' },
            { x: 2000, y: 450, w: 240, h: 50, type: 'dirt' },
            { x: 2300, y: 480, w: 220, h: 160, type: 'dirt' },

            // RUTA ALTERNA BAJA 2: "Las Rocas Suspendidas del Abismo"
            { x: 1750, y: 570, w: 110, h: 35, type: 'dirt' }, // Isla flotante baja con raíces
            { x: 1910, y: 580, w: 110, h: 35, type: 'dirt' }, // Lleva a Gema 3
            { x: 2070, y: 560, w: 90, h: 35, type: 'bouncy' }, // Seta/resorte que impulsa alto
            { x: 2180, y: 360, w: 130, h: 40, type: 'dirt' }, // Plataforma elevada secreta con Gema 4

            // CHECKPOINT 2 (x: 2560 - 2760)
            { x: 2560, y: 500, w: 240, h: 140, type: 'dirt', isCheckpoint: true, cpId: 2 },

            // --- BIFURCACIÓN 3 (x: 2800 - 3650) ---
            // RUTA PRINCIPAL (Camino escarpado hacia la meta)
            { x: 2840, y: 510, w: 260, h: 130, type: 'dirt' },
            { x: 3160, y: 490, w: 250, h: 150, type: 'dirt' },
            { x: 3450, y: 500, w: 200, h: 140, type: 'dirt' },

            // RUTA ALTERNA ALTA 3: "El Puente Celestial de la Cumbre"
            { x: 2860, y: 380, w: 130, h: 40, type: 'dirt' },
            { x: 3040, y: 270, w: 130, h: 40, type: 'dirt' },
            { x: 3240, y: 180, w: 140, h: 40, type: 'moving', originX: 3240, rangeX: 80, speed: 1.5 },
            { x: 3440, y: 120, w: 160, h: 40, type: 'dirt' }, // Altar supremo en el cielo con Gema 5
            { x: 3590, y: 250, w: 100, h: 40, type: 'dirt' }, // Descenso directo a la meta

            // PLATAFORMA FINAL DE LA META (x: 3680 - 3840)
            { x: 3680, y: 490, w: 260, h: 150, type: 'dirt' }
        ];

        // 2. Definición de las 5 Gemas Flotantes Escondidas en Rutas Alternas
        const secretGems = [
            {
                id: 1,
                name: "Esmeralda de los Riscos",
                x: 960,
                y: 220,
                color: "#10b981",
                icon: "💎",
                collected: false,
                pulse: 0
            },
            {
                id: 2,
                name: "Zafiro de las Alturas",
                x: 1380,
                y: 80,
                color: "#06b6d4",
                icon: "💎",
                collected: false,
                pulse: 0.5
            },
            {
                id: 3,
                name: "Amatista del Abismo",
                x: 1960,
                y: 515,
                color: "#a855f7",
                icon: "💎",
                collected: false,
                pulse: 1.0
            },
            {
                id: 4,
                name: "Rubí Crepuscular",
                x: 2240,
                y: 290,
                color: "#ef4444",
                icon: "💎",
                collected: false,
                pulse: 1.5
            },
            {
                id: 5,
                name: "Diamante del Titán",
                x: 3520,
                y: 55,
                color: "#facc15",
                icon: "👑",
                collected: false,
                pulse: 2.0
            }
        ];

        // 3. Suministros coleccionables en la ruta estándar (🎒, 🏮, etc.)
        const regularItems = [];
        const itemPositions = [300, 780, 1180, 1800, 2120, 2680, 3000, 3280];
        itemPositions.forEach((ix, idx) => {
            regularItems.push({
                id: idx,
                x: ix,
                y: 440,
                icon: lvl.game.itemIcon || "🎒",
                collected: false
            });
        });

        // 4. Peligros y obstáculos dinámicos en el mundo
        const hazards = [
            { x: 800, y: 490, vx: -1.6, minX: 700, maxX: 980, type: 'rock', radius: 14 },
            { x: 1200, y: 470, vx: 1.8, minX: 1100, maxX: 1340, type: 'rock', radius: 14 },
            { x: 1850, y: 440, vx: -2.0, minX: 1750, maxX: 1920, type: 'wind', radius: 16 },
            { x: 2150, y: 420, vx: 2.2, minX: 2050, maxX: 2220, type: 'wind', radius: 16 },
            { x: 2950, y: 480, vx: -1.8, minX: 2880, maxX: 3080, type: 'ice', radius: 15 },
            { x: 3300, y: 460, vx: 2.0, minX: 3200, maxX: 3390, type: 'ice', radius: 15 }
        ];

        // 5. Estado completo del jugador (el niño), cámara horizontal y meta
        gameState.levelGame = {
            level: lvl,
            player: {
                x: 80,
                y: 460,
                vx: 0,
                vy: 0,
                width: 26,
                height: 40,
                isGrounded: false,
                facing: 1,
                invulnerableTimer: 0,
                respawnX: 80,
                respawnY: 460,
                hearts: 3
            },
            // Cámara horizontal suave
            cameraX: 0,
            targetCameraX: 0,
            // Meta al final del mundo (x: 3740)
            goalX: 3740,
            platforms: platforms,
            secretGems: secretGems,
            regularItems: regularItems,
            hazards: hazards,
            particles: [],
            checkpointsReached: new Set([0]),
            state: 'PLAYING', // 'PLAYING' | 'WON' | 'LOST'
            wonTimer: 0,
            screenShake: 0
        };
    }

    // Actualización de física y lógica del nivel 4x
    function updatePlatformerLevel() {
        const lg = gameState.levelGame;
        if (!lg) return;

        if (lg.state === 'WON') {
            lg.wonTimer++;
            // Confeti continuo de victoria
            if (Math.random() < 0.4) {
                lg.particles.push({
                    x: lg.cameraX + Math.random() * V_WIDTH,
                    y: -10,
                    vx: Math.random() * 2 - 1,
                    vy: Math.random() * 3 + 2,
                    color: ['#facc15', '#38bdf8', '#4ade80', '#ec4899', '#a855f7', '#fb923c'][Math.floor(Math.random() * 6)],
                    size: Math.random() * 7 + 4,
                    life: 180
                });
            }
            return;
        }

        if (lg.screenShake > 0) lg.screenShake--;

        const p = lg.player;

        // Actualizar plataformas móviles
        lg.platforms.forEach(plat => {
            if (plat.type === 'moving') {
                plat.x = plat.originX + Math.sin(Date.now() * 0.002 * plat.speed) * plat.rangeX;
            }
        });

        // Controles horizontales del niño
        let moveX = 0;
        if (keysPressed['ArrowLeft'] || keysPressed['KeyA']) {
            moveX -= 1;
            p.facing = -1;
        }
        if (keysPressed['ArrowRight'] || keysPressed['KeyD']) {
            moveX += 1;
            p.facing = 1;
        }

        const accel = 0.9;
        const maxSpeed = 5.6;
        const friction = 0.82;

        p.vx += moveX * accel;
        p.vx *= friction;
        if (Math.abs(p.vx) > maxSpeed) p.vx = Math.sign(p.vx) * maxSpeed;

        // Salto con barra Espaciadora, Flecha Arriba o W
        if ((keysPressed['Space'] || keysPressed['ArrowUp'] || keysPressed['KeyW']) && p.isGrounded) {
            p.vy = -12.8;
            p.isGrounded = false;
            window.soundFX.playJump();

            // Partículas de polvo al despegar
            for (let i = 0; i < 5; i++) {
                lg.particles.push({
                    x: p.x + (Math.random() * 14 - 7),
                    y: p.y,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -Math.random() * 2,
                    color: '#a16207',
                    size: Math.random() * 3 + 2,
                    life: 20
                });
            }
        }

        // Gravedad
        p.vy += 0.58;
        if (p.vy > 13) p.vy = 13;

        // Movimiento tentativo
        const prevY = p.y;
        p.x += p.vx;
        p.y += p.vy;

        // Límites del mundo
        if (p.x < 30) {
            p.x = 30;
            p.vx = 0;
        }
        if (p.x > WORLD_WIDTH - 30) {
            p.x = WORLD_WIDTH - 30;
            p.vx = 0;
        }

        // Detección de colisión con plataformas (aterrizar sobre la superficie de tierra)
        p.isGrounded = false;
        lg.platforms.forEach(plat => {
            const footX = p.x;
            const footY = p.y;
            const platRight = plat.x + plat.w;
            const platTop = plat.y;
            const platBottom = plat.y + plat.h;

            if (footX >= plat.x - 10 && footX <= platRight + 10) {
                // Aterrizar desde arriba
                if (prevY <= platTop + 2 && footY >= platTop && p.vy >= 0) {
                    p.y = platTop;
                    p.vy = 0;
                    p.isGrounded = true;

                    // Si es una plataforma resorte / seta elástica
                    if (plat.type === 'bouncy') {
                        p.vy = -16.5;
                        p.isGrounded = false;
                        window.soundFX.playJump();
                        showToast('¡Super impulso elástico!', 50);
                    }

                    // Registrar Checkpoint
                    if (plat.isCheckpoint && !lg.checkpointsReached.has(plat.cpId)) {
                        lg.checkpointsReached.add(plat.cpId);
                        p.respawnX = plat.x + plat.w / 2;
                        p.respawnY = plat.y;
                        window.soundFX.playCheckpoint();
                        showToast('🚩 ¡Punto de control alcanzado!', 90);
                    }
                }
            }
        });

        // Si cae al abismo / precipicio
        if (p.y > V_HEIGHT + 40) {
            p.hearts--;
            gameState.deathCount++;
            window.soundFX.playDeath();
            saveProgress();
            updateHUD();
            lg.screenShake = 16;

            if (p.hearts <= 0) {
                p.hearts = 3;
                showToast(`💀 ¡Has caído! Muertes: ${gameState.deathCount}. Reapareciendo.`, 110);
                p.x = 80;
                p.y = 460;
                p.vx = 0;
                p.vy = 0;
            } else {
                showToast(`💀 ¡Caída al abismo! Muertes: ${gameState.deathCount}. Vidas: ${p.hearts}`, 100);
                p.x = p.respawnX;
                p.y = p.respawnY - 10;
                p.vx = 0;
                p.vy = 0;
            }
        }

        if (p.invulnerableTimer > 0) p.invulnerableTimer--;

        // 6. Recolección de Gemas Secretas en Rutas Alternas
        lg.secretGems.forEach(gem => {
            if (!gem.collected) {
                const dist = Math.hypot(p.x - gem.x, (p.y - 20) - gem.y);
                if (dist < 32) {
                    gem.collected = true;
                    window.soundFX.playSecretGem();
                    showToast(`✨ ¡Encontraste una Gema Secreta: ${gem.name}!`, 130);

                    // Explosión de destellos prismáticos
                    for (let i = 0; i < 22; i++) {
                        lg.particles.push({
                            x: gem.x,
                            y: gem.y,
                            vx: (Math.random() - 0.5) * 7,
                            vy: (Math.random() - 0.5) * 7,
                            color: gem.color,
                            size: Math.random() * 5 + 3,
                            life: 45
                        });
                    }
                }
            }
        });

        // 7. Recolección de Suministros Estándar (Sonido retro de moneda)
        lg.regularItems.forEach(item => {
            if (!item.collected) {
                const dist = Math.hypot(p.x - item.x, (p.y - 20) - item.y);
                if (dist < 26) {
                    item.collected = true;
                    window.soundFX.playCoin(); // Efecto retro de moneda clásica

                    for (let i = 0; i < 8; i++) {
                        lg.particles.push({
                            x: item.x,
                            y: item.y,
                            vx: (Math.random() - 0.5) * 4,
                            vy: (Math.random() - 0.5) * 4,
                            color: '#facc15',
                            size: Math.random() * 3 + 2,
                            life: 25
                        });
                    }
                }
            }
        });

        // 8. Actualizar Peligros (rocas, ráfagas, hielo)
        lg.hazards.forEach(h => {
            h.x += h.vx;
            if (h.x <= h.minX || h.x >= h.maxX) {
                h.vx *= -1;
            }

            // Colisión con el niño
            if (p.invulnerableTimer <= 0) {
                const dist = Math.hypot(p.x - h.x, (p.y - 20) - h.y);
                if (dist < h.radius + 14) {
                    p.invulnerableTimer = 60;
                    p.vy = -7;
                    p.vx = -p.facing * 5;
                    p.hearts--;
                    lg.screenShake = 12;

                    if (p.hearts <= 0) {
                        p.hearts = 3;
                        gameState.deathCount++;
                        window.soundFX.playDeath();
                        saveProgress();
                        updateHUD();
                        showToast(`💀 ¡Sin energía! Muertes: ${gameState.deathCount}. Reapareciendo.`, 110);
                        p.x = p.respawnX;
                        p.y = p.respawnY - 10;
                    } else {
                        window.soundFX.playLocked();
                        showToast(`¡Golpe recibido! Vidas: ${p.hearts}`, 70);
                    }
                }
            }
        });

        // 9. CÁMARA HORIZONTAL QUE SIGUE AL NIÑO
        // Posicionar al niño ligeramente adelantado respecto al centro
        const targetX = p.x - V_WIDTH * 0.38;
        const maxCamX = WORLD_WIDTH - V_WIDTH;
        lg.targetCameraX = Math.max(0, Math.min(targetX, maxCamX));
        lg.cameraX += (lg.targetCameraX - lg.cameraX) * 0.12; // Suavizado / Lerp

        // 10. ¡LLEGADA A LA META! (x >= goalX)
        if (p.x >= lg.goalX && lg.state !== 'WON') {
            lg.state = 'WON';
            lg.wonTimer = 0;
            p.vx = 0;
            p.vy = 0;
            p.isJumping = false;
            window.soundFX.stopMusic();
            window.soundFX.playWin();

            // Guardar nivel completado
            gameState.completedLevels.add(lg.level.id);
            const gemsCount = lg.secretGems.filter(g => g.collected).length;
            const starsEarned = gemsCount >= 5 ? 3 : (gemsCount >= 3 ? 2 : 1);
            gameState.stars[lg.level.id] = Math.max(gameState.stars[lg.level.id] || 0, starsEarned);

            // Determinar nuevos niveles desbloqueados
            const newlyUnlocked = [];
            lg.level.neighbors.forEach(nId => {
                if (!gameState.unlockedLevels.has(nId)) {
                    gameState.unlockedLevels.add(nId);
                    newlyUnlocked.push(nId);
                }
            });

            gameState.pendingUnlock = {
                sourceLevelId: lg.level.id,
                newLevels: newlyUnlocked
            };

            saveProgress();

            // Partículas de confeti festivo
            for (let i = 0; i < 45; i++) {
                lg.particles.push({
                    x: p.x + (Math.random() - 0.5) * 80,
                    y: p.y - 30 + (Math.random() - 0.5) * 50,
                    vx: (Math.random() - 0.5) * 7,
                    vy: -Math.random() * 7 - 2,
                    color: ['#facc15', '#4ade80', '#38bdf8', '#f43f5e', '#a855f7', '#fb923c'][Math.floor(Math.random() * 6)],
                    radius: Math.random() * 4 + 2,
                    life: 90 + Math.floor(Math.random() * 50)
                });
            }
        }

        // Partículas del nivel
        for (let i = lg.particles.length - 1; i >= 0; i--) {
            const pt = lg.particles[i];
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.life--;
            if (pt.life <= 0) lg.particles.splice(i, 1);
        }
    }

    // ==========================================
    // RENDERIZADO DEL NIVEL 4X EN CANVAS
    // ==========================================
    function drawPlatformerScreen(time) {
        const lg = gameState.levelGame;
        if (!lg) return;

        const camX = lg.cameraX;

        // Sacudida de pantalla si hubo impacto
        let shakeX = 0, shakeY = 0;
        if (lg.screenShake > 0) {
            shakeX = (Math.random() - 0.5) * lg.screenShake * 0.8;
            shakeY = (Math.random() - 0.5) * lg.screenShake * 0.8;
        }

        ctx.save();
        ctx.translate(shakeX, shakeY);

        // 1. FONDO PARALLAX MULTICAPA
        drawParallaxBackground(camX, time);

        // 2. ELEMENTOS DEL MUNDO CON CÁMARA HORIZONTAL
        ctx.save();
        ctx.translate(-camX, 0);

        // Renderizar senderos de fondo decorativos en el mundo
        drawWorldDecorations(camX);

        // Renderizar todas las plataformas de tierra elevadas
        lg.platforms.forEach(plat => {
            drawDirtPlatform(plat);
        });

        // Renderizar Puntos de Control (Faroles brillantes)
        lg.platforms.forEach(plat => {
            if (plat.isCheckpoint) {
                drawCheckpointLantern(plat.x + plat.w / 2, plat.y, lg.checkpointsReached.has(plat.cpId), time);
            }
        });

        // Renderizar Suministros Regulares
        lg.regularItems.forEach(item => {
            if (!item.collected) {
                const bob = Math.sin(time * 0.005 + item.id) * 5;
                ctx.font = '22px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(item.icon, item.x, item.y + bob);
            }
        });

        // Renderizar Peligros (rocas rodantes, ráfagas)
        lg.hazards.forEach(h => {
            drawHazard(h, time);
        });

        // Renderizar LAS 5 GEMAS FLOTANTES ESCONDIDAS
        lg.secretGems.forEach(gem => {
            if (!gem.collected) {
                drawFloatingSecretGem(gem, time);
            }
        });

        // Renderizar LA GRAN META AL FINAL (x: 3740)
        drawFinishGoal(lg.goalX, 490, time, lg.state === 'WON');

        // Renderizar partículas del mundo
        lg.particles.forEach(pt => {
            ctx.fillStyle = pt.color;
            ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
        });

        // Renderizar al Niño (Avatar del jugador)
        const p = lg.player;
        const isBlinking = p.invulnerableTimer > 0 && Math.floor(p.invulnerableTimer / 4) % 2 === 0;
        if (!isBlinking) {
            const isWalking = Math.abs(p.vx) > 0.4 && p.isGrounded;
            drawKidAvatar(p.x, p.y, time, p.facing, isWalking, !p.isGrounded);
        }

        ctx.restore(); // Fin de la cámara del mundo

        // 3. HUD FIJO SUPERIOR (Barra de progreso 4x, Gemas, Vidas)
        drawLevelHUD(lg);

        // 4. Overlays de fin de nivel
        if (lg.state === 'WON') {
            drawLevelWonOverlay(lg);
        }

        ctx.restore();
    }

    // Dibujado del fondo Parallax de la montaña
    function drawParallaxBackground(camX, time) {
        // Cielo alpino
        const skyGrad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
        skyGrad.addColorStop(0, '#0f172a');
        skyGrad.addColorStop(0.4, '#1e3a8a');
        skyGrad.addColorStop(0.75, '#ea580c');
        skyGrad.addColorStop(1, '#fed7aa');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

        // Sol matutino
        ctx.save();
        const sunX = 720 - (camX * 0.03) % V_WIDTH;
        const sunGrad = ctx.createRadialGradient(sunX, 150, 10, sunX, 150, 120);
        sunGrad.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
        sunGrad.addColorStop(0.4, 'rgba(251, 146, 60, 0.3)');
        sunGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sunX, 150, 120, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Capa 1: Cordillera lejana (Parallax 0.1)
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        const off1 = (camX * 0.1) % 600;
        ctx.moveTo(0, 380);
        for (let x = -600; x < V_WIDTH + 600; x += 300) {
            ctx.lineTo(x - off1 + 150, 240);
            ctx.lineTo(x - off1 + 300, 380);
        }
        ctx.lineTo(V_WIDTH, V_HEIGHT);
        ctx.lineTo(0, V_HEIGHT);
        ctx.closePath();
        ctx.fill();

        // Capa 2: Picos medios con nieve y pinos (Parallax 0.28)
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        const off2 = (camX * 0.28) % 450;
        ctx.moveTo(0, 440);
        for (let x = -450; x < V_WIDTH + 450; x += 220) {
            ctx.lineTo(x - off2 + 110, 310);
            ctx.lineTo(x - off2 + 220, 440);
        }
        ctx.lineTo(V_WIDTH, V_HEIGHT);
        ctx.lineTo(0, V_HEIGHT);
        ctx.closePath();
        ctx.fill();
    }

    // Decoraciones del mundo (carteles de ruta, flechas, raíces)
    function drawWorldDecorations(camX) {
        ctx.save();

        // Carteles de señalización de rutas alternas
        drawSignPost(660, 520, "▲ RUTA ALTA", "💎 Gemas");
        drawSignPost(1700, 470, "▼ EL ABISMO", "💎 Gemas");
        drawSignPost(2800, 510, "▲ CUMBRE CELESTE", "👑 Diamante");

        ctx.restore();
    }

    function drawSignPost(x, y, text1, text2) {
        ctx.save();
        // Poste de madera
        ctx.fillStyle = '#451a03';
        ctx.fillRect(x - 3, y - 40, 6, 40);

        // Tabla de cartel
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 1.5;
        roundRect(ctx, x - 42, y - 56, 84, 28, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 9px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(text1, x, y - 44);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '8px "Segoe UI", sans-serif';
        ctx.fillText(text2, x, y - 32);
        ctx.restore();
    }

    // RENDERIZADO DETALLADO DE PLATAFORMAS DE TIERRA ELEVADAS
    function drawDirtPlatform(plat) {
        ctx.save();

        // 1. Sombra bajo la plataforma
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fillRect(plat.x + 4, plat.y + plat.h, plat.w - 8, 8);

        // 2. Bloque principal de tierra / roca estratificada
        const dirtGrad = ctx.createLinearGradient(plat.x, plat.y, plat.x, plat.y + plat.h);
        if (plat.type === 'bouncy') {
            dirtGrad.addColorStop(0, '#ec4899');
            dirtGrad.addColorStop(1, '#831843');
        } else {
            dirtGrad.addColorStop(0, '#854d0e'); // Tierra arcillosa clara
            dirtGrad.addColorStop(0.3, '#713f12'); // Tierra oscura
            dirtGrad.addColorStop(1, '#451a03'); // Subsuelo rocoso profundo
        }
        ctx.fillStyle = dirtGrad;
        roundRect(ctx, plat.x, plat.y, plat.w, plat.h, 6);
        ctx.fill();

        // 3. Piedras incrustadas y vetas de tierra
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        for (let i = 20; i < plat.w - 20; i += 38) {
            ctx.beginPath();
            ctx.arc(plat.x + i, plat.y + 18, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // 4. Capa superior de césped natural verde con relieves
        if (plat.type === 'bouncy') {
            ctx.fillStyle = '#f472b6';
            ctx.fillRect(plat.x, plat.y, plat.w, 8);
        } else {
            // Capa verde de hierba
            ctx.fillStyle = '#16a34a';
            ctx.fillRect(plat.x, plat.y, plat.w, 9);

            ctx.fillStyle = '#22c55e';
            ctx.fillRect(plat.x, plat.y, plat.w, 5);

            // Briznas de hierba colgantes
            ctx.fillStyle = '#15803d';
            for (let bx = plat.x + 6; bx < plat.x + plat.w - 6; bx += 10) {
                ctx.beginPath();
                ctx.moveTo(bx, plat.y + 5);
                ctx.lineTo(bx + 4, plat.y + 12);
                ctx.lineTo(bx + 8, plat.y + 5);
                ctx.fill();
            }
        }

        // 5. Raíces colgantes debajo si es una plataforma suspendida
        if (plat.h < 60) {
            ctx.strokeStyle = '#451a03';
            ctx.lineWidth = 2;
            for (let rx = plat.x + 15; rx < plat.x + plat.w - 15; rx += 28) {
                ctx.beginPath();
                ctx.moveTo(rx, plat.y + plat.h);
                ctx.quadraticCurveTo(rx + 5, plat.y + plat.h + 8, rx + 2, plat.y + plat.h + 16);
                ctx.stroke();
            }
        }

        // Si es una plataforma móvil, dibujar engranaje o aura
        if (plat.type === 'moving') {
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(plat.x + plat.w / 2, plat.y + plat.h / 2, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // Dibujar farol de Checkpoint
    function drawCheckpointLantern(x, y, active, time) {
        ctx.save();
        // Poste
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 36);
        ctx.stroke();

        // Farol
        const lampColor = active ? '#facc15' : '#64748b';
        ctx.fillStyle = lampColor;
        ctx.beginPath();
        ctx.arc(x, y - 42, 8, 0, Math.PI * 2);
        ctx.fill();

        // Resplandor si está activo
        if (active) {
            const glow = ctx.createRadialGradient(x, y - 42, 2, x, y - 42, 24);
            glow.addColorStop(0, 'rgba(250, 204, 21, 0.7)');
            glow.addColorStop(1, 'rgba(250, 204, 21, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y - 42, 24, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // RENDERIZADO DE LAS GEMAS FLOTANTES ESCONDIDAS
    function drawFloatingSecretGem(gem, time) {
        ctx.save();
        const bob = Math.sin(time * 0.005 + gem.pulse * Math.PI) * 7;
        const gx = gem.x;
        const gy = gem.y + bob;

        // Aura de luz mística pulsante
        const glowRadius = 26 + Math.sin(time * 0.008 + gem.pulse) * 6;
        const gemGlow = ctx.createRadialGradient(gx, gy, 4, gx, gy, glowRadius);
        gemGlow.addColorStop(0, gem.color);
        gemGlow.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        gemGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gemGlow;
        ctx.beginPath();
        ctx.arc(gx, gy, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Dibujo geométrico del diamante / gema
        ctx.translate(gx, gy);
        ctx.fillStyle = gem.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(13, -4);
        ctx.lineTo(0, 16);
        ctx.lineTo(-13, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Facetas internas para dar reflejo de cristal
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(5, -4);
        ctx.lineTo(0, 4);
        ctx.lineTo(-5, -4);
        ctx.closePath();
        ctx.fill();

        // Pequeño cartel de "¡GEMA SECRETA!"
        ctx.font = 'bold 9px "Segoe UI", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText("💎 SECRETA", 0, -22);

        ctx.restore();
    }

    // Dibujado de peligros
    function drawHazard(h, time) {
        ctx.save();
        if (h.type === 'rock') {
            ctx.fillStyle = '#78350f';
            ctx.beginPath();
            ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#451a03';
            ctx.beginPath();
            ctx.arc(h.x - 3, h.y - 3, h.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();
        } else if (h.type === 'ice') {
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(h.x, h.y - h.radius);
            ctx.lineTo(h.x + h.radius, h.y + h.radius);
            ctx.lineTo(h.x - h.radius, h.y + h.radius);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(h.x, h.y, h.radius, time * 0.015, time * 0.015 + Math.PI * 1.5);
            ctx.stroke();
        }
        ctx.restore();
    }

    // DIBUJADO DE LA META (x: 3740)
    function drawFinishGoal(x, y, time, reached) {
        ctx.save();

        // 1. Arco triunfal de madera y piedra
        ctx.fillStyle = '#451a03';
        ctx.fillRect(x - 30, y - 110, 14, 110);
        ctx.fillRect(x + 30, y - 110, 14, 110);

        // Viga superior
        ctx.fillStyle = '#78350f';
        roundRect(ctx, x - 45, y - 130, 104, 26, 6);
        ctx.fill();

        // Cartel luminoso "¡META!"
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 15px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏁 ¡META! 🏁', x + 7, y - 112);

        // 2. Mástil y Bandera a cuadros ondeante
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 37, y - 130);
        ctx.lineTo(x + 37, y - 180);
        ctx.stroke();

        // Bandera a cuadros
        const wave = Math.sin(time * 0.01) * 4;
        ctx.fillStyle = reached ? '#22c55e' : '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(x + 37, y - 180);
        ctx.lineTo(x + 72, y - 165 + wave);
        ctx.lineTo(x + 37, y - 150);
        ctx.closePath();
        ctx.fill();

        // Cuadros negros en la bandera
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x + 40, y - 176, 8, 8);
        ctx.fillRect(x + 52, y - 168 + wave * 0.5, 8, 8);

        ctx.restore();
    }

    // DIBUJADO DEL AVATAR DEL NIÑO EXPLORADOR
    function drawKidAvatar(x, y, time, facing, isWalking, isJumping) {
        ctx.save();

        // Sombra suave en el suelo
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 14, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rebote al correr o saltar
        const bob = isWalking ? Math.abs(Math.sin(time * 0.016)) * 4 : (isJumping ? -6 : Math.sin(time * 0.005) * 1.5);
        const charY = y - 16 - bob;

        ctx.translate(x, charY);
        ctx.scale(facing, 1);

        // 1. Mochila de expedición en la espalda
        ctx.fillStyle = '#92400e';
        roundRect(ctx, -14, -8, 8, 14, 3);
        ctx.fill();

        // 2. Piernas y botas
        const legSwing = isWalking ? Math.sin(time * 0.02) * 6 : (isJumping ? 3 : 0);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-6 + legSwing, 8, 4, 8);
        ctx.fillRect(2 - legSwing, 8, 4, 8);

        // 3. Abrigo rojo cálido del niño
        ctx.fillStyle = '#dc2626';
        roundRect(ctx, -8, -6, 16, 16, 4);
        ctx.fill();

        // Bufanda amarilla ondeando
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-7, -8, 14, 4);
        const scarfWave = Math.sin(time * 0.01) * 3;
        ctx.fillRect(-12, -7 + scarfWave, 6, 8);

        // 4. Cabeza alegre del niño
        ctx.fillStyle = '#fed7aa';
        ctx.beginPath();
        ctx.arc(0, -14, 7.5, 0, Math.PI * 2);
        ctx.fill();

        // Ojo vivaz
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(3, -15, 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Sonrisa del niño
        ctx.strokeStyle = '#9a3412';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(2, -12, 2.5, 0, Math.PI * 0.8);
        ctx.stroke();

        // 5. Gorro azul de lana con pompón blanco
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(0, -16, 8.5, Math.PI, 0);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-2, -25, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // HUD SUPERIOR DEL NIVEL (Progreso 4x, Gemas, Vidas)
    function drawLevelHUD(lg) {
        ctx.save();

        // Fondo del panel superior
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(0, 0, V_WIDTH, 56);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 56);
        ctx.lineTo(V_WIDTH, 56);
        ctx.stroke();

        // Nombre del nivel
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 15px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`NIVEL ${lg.level.id}: ${lg.level.title.toUpperCase()}`, 20, 34);

        // BARRA DE PROGRESO 4X HACIA LA META
        const barX = 240;
        const barY = 22;
        const barW = 240;
        const barH = 12;

        ctx.fillStyle = '#334155';
        roundRect(ctx, barX, barY, barW, barH, 6);
        ctx.fill();

        // Progreso actual del niño en el mundo 4x
        const progressPct = Math.min(1, Math.max(0, lg.player.x / lg.goalX));
        ctx.fillStyle = '#22c55e';
        roundRect(ctx, barX, barY, Math.max(12, barW * progressPct), barH, 6);
        ctx.fill();

        // Icono del niño corriendo en la barra
        const kidBarX = barX + barW * progressPct;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏃', kidBarX, barY + 11);

        // Icono de meta al final de la barra
        ctx.fillText('🏁', barX + barW + 12, barY + 11);

        // CONTADOR DE MUERTES
        ctx.fillStyle = '#fca5a5';
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`💀 ${gameState.deathCount}`, 515, 34);

        // CONTADOR DE GEMAS SECRETAS ENCONTRADAS
        const collectedGems = lg.secretGems.filter(g => g.collected).length;
        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`💎 ${collectedGems}/5`, 600, 34);

        // VIDAS / CORAZONES
        let heartsStr = '';
        for (let i = 0; i < lg.player.hearts; i++) heartsStr += '❤️';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(heartsStr, V_WIDTH - 20, 34);

        ctx.restore();
    }

    // OVERLAY DE VICTORIA: "¡NIVEL COMPLETADO!" CON RESUMEN, DESBLOQUEO Y RETORNO AL MAPA
    function drawLevelWonOverlay(lg) {
        ctx.save();
        ctx.fillStyle = 'rgba(10, 15, 29, 0.88)';
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

        const cx = V_WIDTH / 2;
        const cy = V_HEIGHT / 2;
        const mw = 560;
        const mh = 420;

        // Tarjeta modal con sombra y doble borde luminoso
        ctx.save();
        ctx.shadowColor = 'rgba(250, 204, 21, 0.45)';
        ctx.shadowBlur = 24;
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3.5;
        roundRect(ctx, cx - mw / 2, cy - mh / 2, mw, mh, 18);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Marco interior sutil
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        roundRect(ctx, cx - mw / 2 + 8, cy - mh / 2 + 8, mw - 16, mh - 16, 14);
        ctx.stroke();

        // 1. TÍTULO PRINCIPAL DESTACADO: "¡NIVEL COMPLETADO!"
        ctx.textAlign = 'center';
        ctx.save();
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#fde047';
        ctx.font = '900 32px "Segoe UI", sans-serif';
        ctx.fillText('🏆 ¡NIVEL COMPLETADO! 🏆', cx, cy - 145);
        ctx.restore();

        // Subtítulo del nivel
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 16px "Segoe UI", sans-serif';
        ctx.fillText(`Nivel ${lg.level.id}: ${lg.level.title} — ¡Expedición Cumplida!`, cx, cy - 115);

        // 2. PANEL DE ESTADÍSTICAS (3 Tarjetas horizontales)
        const gemsFound = lg.secretGems.filter(g => g.collected).length;
        const starsEarned = gemsFound >= 5 ? 3 : (gemsFound >= 3 ? 2 : 1);

        const cardY = cy - 88;
        const cardW = 160;
        const cardH = 82;
        const spacing = 16;
        const startX = cx - (cardW * 3 + spacing * 2) / 2;

        // Caja 1: Gemas Secretas
        const b1X = startX;
        ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, b1X, cardY, cardW, cardH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.fillText('Gemas Secretas', b1X + cardW / 2, cardY + 22);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 20px "Segoe UI", sans-serif';
        ctx.fillText(`💎 ${gemsFound} / 5`, b1X + cardW / 2, cardY + 48);

        let miniGemIcons = '';
        for (let i = 0; i < 5; i++) {
            miniGemIcons += (i < gemsFound) ? '◆' : '◇';
        }
        ctx.font = '13px sans-serif';
        ctx.fillText(miniGemIcons, b1X + cardW / 2, cardY + 70);

        // Caja 2: Calificación Estrellas
        const b2X = startX + cardW + spacing;
        ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
        roundRect(ctx, b2X, cardY, cardW, cardH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.fillText('Calificación', b2X + cardW / 2, cardY + 22);

        let starIcons = '';
        for (let i = 0; i < 3; i++) {
            starIcons += (i < starsEarned) ? '⭐' : '☆';
        }
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(starIcons, b2X + cardW / 2, cardY + 54);

        // Caja 3: Muertes / Caídas
        const b3X = startX + (cardW + spacing) * 2;
        ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        roundRect(ctx, b3X, cardY, cardW, cardH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.fillText('Caídas / Muertes', b3X + cardW / 2, cardY + 22);
        ctx.fillStyle = '#fca5a5';
        ctx.font = 'bold 20px "Segoe UI", sans-serif';
        ctx.fillText(`💀 ${gameState.deathCount}`, b3X + cardW / 2, cardY + 52);

        // 3. BANNER DE DESBLOQUEO DEL SIGUIENTE NIVEL
        const bannerY = cy + 16;
        const bannerW = mw - 48;
        const bannerH = 72;
        const bannerX = cx - bannerW / 2;

        if (gameState.pendingUnlock && gameState.pendingUnlock.newLevels && gameState.pendingUnlock.newLevels.length > 0) {
            const nextLvlNames = gameState.pendingUnlock.newLevels.map(id => getLevel(id)?.title).join(', ');

            ctx.fillStyle = 'rgba(22, 101, 52, 0.45)';
            ctx.strokeStyle = '#4ade80';
            ctx.lineWidth = 1.5;
            roundRect(ctx, bannerX, bannerY, bannerW, bannerH, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#4ade80';
            ctx.font = 'bold 16px "Segoe UI", sans-serif';
            ctx.fillText('🔓 ¡SIGUIENTE NIVEL DESBLOQUEADO EN EL MAPA!', cx, bannerY + 28);

            ctx.fillStyle = '#f8fafc';
            ctx.font = '600 14px "Segoe UI", sans-serif';
            ctx.fillText(`Nuevo sendero abierto hacia: ${nextLvlNames}`, cx, bannerY + 52);
        } else if (lg.level.id === 7) {
            ctx.fillStyle = 'rgba(120, 53, 15, 0.45)';
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 1.5;
            roundRect(ctx, bannerX, bannerY, bannerW, bannerH, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#facc15';
            ctx.font = 'bold 16px "Segoe UI", sans-serif';
            ctx.fillText('👑 ¡CUMBRE DEL TITÁN CONQUISTADA!', cx, bannerY + 28);

            ctx.fillStyle = '#f8fafc';
            ctx.font = '14px "Segoe UI", sans-serif';
            ctx.fillText('¡Felicidades! Has completado los 7 niveles de la expedición.', cx, bannerY + 52);
        } else {
            ctx.fillStyle = 'rgba(30, 41, 59, 0.45)';
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
            ctx.lineWidth = 1.5;
            roundRect(ctx, bannerX, bannerY, bannerW, bannerH, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 15px "Segoe UI", sans-serif';
            ctx.fillText('✨ ¡NIVEL COMPLETADO ANTERIORMENTE!', cx, bannerY + 28);

            ctx.fillStyle = '#cbd5e1';
            ctx.font = '13px "Segoe UI", sans-serif';
            ctx.fillText('Progreso y gemas verificados y guardados con firma criptográfica.', cx, bannerY + 52);
        }

        // 4. BOTÓN PRINCIPAL DE RETORNO AL MAPA
        const btnW = 340;
        const btnH = 50;
        const btnX = cx - btnW / 2;
        const btnY = cy + 110;

        lg.winButtonRect = { x: btnX, y: btnY, w: btnW, h: btnH };

        const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
        btnGrad.addColorStop(0, '#22c55e');
        btnGrad.addColorStop(1, '#15803d');
        ctx.fillStyle = btnGrad;
        ctx.strokeStyle = '#86efac';
        ctx.lineWidth = 2;
        roundRect(ctx, btnX, btnY, btnW, btnH, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px "Segoe UI", sans-serif';
        ctx.fillText('🗺️ VOLVER AL MAPA Y CONTINUAR', cx, btnY + 28);

        ctx.fillStyle = '#dcfce7';
        ctx.font = '11px "Segoe UI", sans-serif';
        ctx.fillText('Presiona [ESPACIO], [ENTER] o haz clic aquí', cx, btnY + 44);

        ctx.restore();
    }

    function exitToMap() {
        const completedLevelId = gameState.levelGame ? gameState.levelGame.level.id : gameState.currentLevelId;
        gameState.mode = 'MAP';
        gameState.levelGame = null;

        // Si se completó el nivel y hay nuevos niveles desbloqueados, activar animación en el mapa
        if (gameState.pendingUnlock && gameState.pendingUnlock.newLevels && gameState.pendingUnlock.newLevels.length > 0) {
            const targets = gameState.pendingUnlock.newLevels;
            const targetNames = targets.map(id => getLevel(id)?.title).join(', ');

            gameState.mapUnlockAnim = {
                sourceLevelId: gameState.pendingUnlock.sourceLevelId || completedLevelId,
                targetLevelIds: targets,
                progress: 0,
                soundPlayed: false,
                sparks: []
            };

            showToast(`🎉 ¡Desbloqueado: ${targetNames}! Explora el nuevo sendero en el mapa.`, 240);
            window.soundFX.playSecretGem();
            gameState.pendingUnlock = null;
        }

        updateHUD();
        updateLevelCard();
    }

    // ==========================================
    // CONTROLES DE ENTRADA
    // ==========================================
    const keysPressed = {};

    function handleKeyDown(e) {
        window.soundFX.init();
        keysPressed[e.code] = true;

        if (gameState.mode === 'LEVEL') {
            if (e.code === 'Escape') {
                exitToMap();
                return;
            }

            const lg = gameState.levelGame;
            if (lg && lg.state === 'WON') {
                if (e.code === 'Space' || e.code === 'Enter') {
                    exitToMap();
                }
            }
            return;
        }

        if (gameState.mode === 'MAP') {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                tryEnterLevel(gameState.currentLevelId);
                return;
            }

            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) {
                e.preventDefault();
                handleDirectionalMove(e.code);
            }
        }
    }

    function handleKeyUp(e) {
        keysPressed[e.code] = false;
    }

    function handleDirectionalMove(code) {
        if (gameState.moving) return;

        const currentLvl = getLevel(gameState.currentLevelId);
        if (!currentLvl || !currentLvl.neighbors || currentLvl.neighbors.length === 0) return;

        let desiredAngle = 0;
        if (code === 'ArrowRight' || code === 'KeyD') desiredAngle = 0;
        else if (code === 'ArrowDown' || code === 'KeyS') desiredAngle = Math.PI / 2;
        else if (code === 'ArrowLeft' || code === 'KeyA') desiredAngle = Math.PI;
        else if (code === 'ArrowUp' || code === 'KeyW') desiredAngle = -Math.PI / 2;

        let bestNeighbor = null;
        let minAngleDiff = Infinity;

        currentLvl.neighbors.forEach(neighborId => {
            const neighbor = getLevel(neighborId);
            if (!neighbor) return;

            const dx = neighbor.x - currentLvl.x;
            const dy = neighbor.y - currentLvl.y;
            const angle = Math.atan2(dy, dx);

            let diff = Math.abs(angle - desiredAngle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;

            if (diff < minAngleDiff) {
                minAngleDiff = diff;
                bestNeighbor = neighborId;
            }
        });

        if (bestNeighbor && minAngleDiff < Math.PI * 0.6) {
            moveToLevel(bestNeighbor);
        }
    }

    function getVirtualMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const scaleX = V_WIDTH / rect.width;
        const scaleY = V_HEIGHT / rect.height;
        return {
            x: clientX * scaleX,
            y: clientY * scaleY
        };
    }

    function handleMouseMove(e) {
        const mouse = getVirtualMousePos(e);

        if (gameState.mode === 'LEVEL') {
            const lg = gameState.levelGame;
            if (lg && lg.state === 'WON') {
                canvas.style.cursor = 'pointer';
            } else {
                canvas.style.cursor = 'default';
            }
            return;
        }

        if (gameState.mode !== 'MAP') return;

        let found = null;
        window.LEVELS_DATA.forEach(lvl => {
            const dist = Math.hypot(mouse.x - lvl.x, mouse.y - lvl.y);
            if (dist <= 30) found = lvl.id;
        });

        if (found !== gameState.hoveredLevelId) {
            gameState.hoveredLevelId = found;
            canvas.style.cursor = found ? 'pointer' : 'default';
        }
    }

    function processCanvasCoordClick(virtualX, virtualY) {
        window.soundFX.init();

        if (gameState.mode === 'LEVEL') {
            const lg = gameState.levelGame;
            if (lg && lg.state === 'WON') {
                exitToMap();
            }
            return;
        }

        if (gameState.mode !== 'MAP') return;

        window.LEVELS_DATA.forEach(lvl => {
            const dist = Math.hypot(virtualX - lvl.x, virtualY - lvl.y);
            if (dist <= 32) {
                if (lvl.id === gameState.currentLevelId) {
                    tryEnterLevel(lvl.id);
                } else {
                    const currentLvl = getLevel(gameState.currentLevelId);
                    if (currentLvl.neighbors.includes(lvl.id)) {
                        moveToLevel(lvl.id);
                    } else {
                        window.soundFX.playSelect();
                        showToast(`Debes viajar primero a través de los senderos conectados.`, 80);
                    }
                }
            }
        });
    }

    function handleCanvasClick(e) {
        const mouse = getVirtualMousePos(e);
        processCanvasCoordClick(mouse.x, mouse.y);
    }

    function handleCanvasTouch(e) {
        if (e.touches && e.touches.length > 0) {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const clientX = touch.clientX - rect.left;
            const clientY = touch.clientY - rect.top;
            const scaleX = V_WIDTH / rect.width;
            const scaleY = V_HEIGHT / rect.height;
            processCanvasCoordClick(clientX * scaleX, clientY * scaleY);
        }
    }

    // ==========================================
    // RENDERIZADO DEL MAPA DE LA MONTAÑA
    // ==========================================

    function drawMountainBackground() {
        const skyGrad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
        skyGrad.addColorStop(0, '#0c1a30');
        skyGrad.addColorStop(0.35, '#1e3a8a');
        skyGrad.addColorStop(0.65, '#f59e0b');
        skyGrad.addColorStop(1, '#fed7aa');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

        // Sol matutino
        ctx.save();
        const sunX = 720, sunY = 160;
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 15, sunX, sunY, 160);
        sunGrad.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
        sunGrad.addColorStop(0.3, 'rgba(251, 191, 36, 0.4)');
        sunGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 160, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Nubes del mapa
        ctx.save();
        gameState.cloudParticles.forEach(cloud => {
            cloud.x += cloud.speed;
            if (cloud.x > V_WIDTH + 150) cloud.x = -150;
            drawStylizedCloud(cloud.x, cloud.y, cloud.scale);
        });
        ctx.restore();

        // Cordillera lejana
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(0, 360);
        ctx.lineTo(120, 260);
        ctx.lineTo(260, 340);
        ctx.lineTo(440, 200);
        ctx.lineTo(600, 310);
        ctx.lineTo(820, 180);
        ctx.lineTo(V_WIDTH, 290);
        ctx.lineTo(V_WIDTH, V_HEIGHT);
        ctx.lineTo(0, V_HEIGHT);
        ctx.closePath();
        ctx.fill();

        // Macizo Central
        drawMainMountain();

        // Colinas de la base
        drawFoothills();
    }

    function drawStylizedCloud(x, y, s) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.arc(x, y, 28 * s, 0, Math.PI * 2);
        ctx.arc(x + 24 * s, y - 10 * s, 34 * s, 0, Math.PI * 2);
        ctx.arc(x + 55 * s, y - 4 * s, 26 * s, 0, Math.PI * 2);
        ctx.arc(x + 75 * s, y + 6 * s, 18 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawMainMountain() {
        ctx.save();

        const cliffGrad = ctx.createLinearGradient(200, 80, 700, 500);
        cliffGrad.addColorStop(0, '#cbd5e1');
        cliffGrad.addColorStop(0.3, '#475569');
        cliffGrad.addColorStop(0.7, '#334155');
        cliffGrad.addColorStop(1, '#1e293b');

        ctx.fillStyle = cliffGrad;
        ctx.beginPath();
        ctx.moveTo(530, 70);
        ctx.lineTo(390, 175);
        ctx.lineTo(210, 340);
        ctx.lineTo(120, 520);
        ctx.lineTo(480, 580);
        ctx.lineTo(820, 480);
        ctx.lineTo(730, 270);
        ctx.lineTo(580, 160);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.beginPath();
        ctx.moveTo(530, 70);
        ctx.lineTo(580, 160);
        ctx.lineTo(730, 270);
        ctx.lineTo(820, 480);
        ctx.lineTo(480, 580);
        ctx.lineTo(460, 340);
        ctx.closePath();
        ctx.fill();

        // Nieve en la cumbre
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(530, 68);
        ctx.lineTo(560, 110);
        ctx.lineTo(530, 130);
        ctx.lineTo(470, 140);
        ctx.lineTo(430, 120);
        ctx.lineTo(480, 95);
        ctx.closePath();
        ctx.fill();

        // Pinos decorativos
        drawPineTrees();

        ctx.restore();
    }

    function drawFoothills() {
        ctx.save();
        const hillGrad = ctx.createLinearGradient(0, 460, 0, V_HEIGHT);
        hillGrad.addColorStop(0, '#15803d');
        hillGrad.addColorStop(1, '#166534');

        ctx.fillStyle = hillGrad;
        ctx.beginPath();
        ctx.moveTo(0, 500);
        ctx.quadraticCurveTo(180, 470, 360, 520);
        ctx.quadraticCurveTo(600, 560, V_WIDTH, 510);
        ctx.lineTo(V_WIDTH, V_HEIGHT);
        ctx.lineTo(0, V_HEIGHT);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.moveTo(0, 560);
        ctx.quadraticCurveTo(240, 520, 500, 570);
        ctx.quadraticCurveTo(740, 610, V_WIDTH, 560);
        ctx.lineTo(V_WIDTH, V_HEIGHT);
        ctx.lineTo(0, V_HEIGHT);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    function drawPineTrees() {
        const trees = [
            { x: 120, y: 560, s: 1.1 },
            { x: 175, y: 575, s: 0.9 },
            { x: 280, y: 530, s: 0.8 },
            { x: 330, y: 500, s: 1.0 },
            { x: 395, y: 495, s: 0.9 },
            { x: 260, y: 380, s: 0.65 },
            { x: 200, y: 400, s: 0.7 },
            { x: 500, y: 375, s: 0.75 },
            { x: 540, y: 390, s: 0.8 }
        ];

        trees.forEach(t => {
            ctx.save();
            ctx.fillStyle = '#064e3b';
            for (let i = 0; i < 3; i++) {
                const offsetY = i * 9 * t.s;
                const w = (14 - i * 3) * t.s;
                ctx.beginPath();
                ctx.moveTo(t.x, t.y - 26 * t.s + offsetY);
                ctx.lineTo(t.x - w, t.y - 8 * t.s + offsetY);
                ctx.lineTo(t.x + w, t.y - 8 * t.s + offsetY);
                ctx.closePath();
                ctx.fill();
            }
            ctx.fillStyle = '#451a03';
            ctx.fillRect(t.x - 2 * t.s, t.y + 10 * t.s, 4 * t.s, 6 * t.s);
            ctx.restore();
        });
    }

    function drawPaths(time) {
        window.PATHS_DATA.forEach(path => {
            const lvl1 = getLevel(path.from);
            const lvl2 = getLevel(path.to);
            if (!lvl1 || !lvl2) return;

            const isUnlocked = gameState.unlockedLevels.has(path.from) && gameState.unlockedLevels.has(path.to);

            ctx.save();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(lvl1.x, lvl1.y + 3);
            ctx.quadraticCurveTo(path.cpx, path.cpy + 3, lvl2.x, lvl2.y + 3);
            ctx.stroke();

            if (isUnlocked) {
                ctx.strokeStyle = '#e2e8f0';
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(lvl1.x, lvl1.y);
                ctx.quadraticCurveTo(path.cpx, path.cpy, lvl2.x, lvl2.y);
                ctx.stroke();

                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 12]);
                ctx.lineDashOffset = -(time * 0.02) % 20;
                ctx.beginPath();
                ctx.moveTo(lvl1.x, lvl1.y);
                ctx.quadraticCurveTo(path.cpx, path.cpy, lvl2.x, lvl2.y);
                ctx.stroke();
            } else {
                ctx.strokeStyle = 'rgba(71, 85, 105, 0.7)';
                ctx.lineWidth = 4;
                ctx.setLineDash([5, 8]);
                ctx.beginPath();
                ctx.moveTo(lvl1.x, lvl1.y);
                ctx.quadraticCurveTo(path.cpx, path.cpy, lvl2.x, lvl2.y);
                ctx.stroke();
            }
            ctx.restore();
        });

        // ANIMACIÓN DE DESBLOQUEO DE SENDEROS (Haz de energía dorado y chispas)
        if (gameState.mapUnlockAnim) {
            const anim = gameState.mapUnlockAnim;
            anim.targetLevelIds.forEach(targetId => {
                const path = getPathBetween(anim.sourceLevelId, targetId);
                if (!path) return;

                const lvl1 = getLevel(path.from);
                const lvl2 = getLevel(path.to);
                if (!lvl1 || !lvl2) return;

                const p0 = (path.from === anim.sourceLevelId) ? lvl1 : lvl2;
                const p1 = (path.from === anim.sourceLevelId) ? lvl2 : lvl1;
                const cp = { x: path.cpx, y: path.cpy };

                const beamT = Math.min(1, anim.progress);

                ctx.save();
                ctx.strokeStyle = '#fde047';
                ctx.shadowColor = '#facc15';
                ctx.shadowBlur = 18;
                ctx.lineWidth = 8;
                ctx.lineCap = 'round';
                ctx.beginPath();

                const steps = Math.floor(beamT * 40);
                for (let i = 0; i <= steps; i++) {
                    const t = (steps === 0) ? 0 : (i / 40);
                    const pt = getBezierPoint(p0, cp, p1, t);
                    if (i === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();

                // Núcleo blanco brillante del rayo
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3.5;
                ctx.shadowBlur = 4;
                ctx.stroke();

                // Cabeza del haz luminoso con orbe pulsante
                const tip = getBezierPoint(p0, cp, p1, beamT);
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(tip.x, tip.y, 6 + Math.sin(time * 0.02) * 2, 0, Math.PI * 2);
                ctx.fill();

                // Generar chispas en la cabeza del haz
                if (beamT < 1 && Math.random() < 0.7) {
                    anim.sparks.push({
                        x: tip.x,
                        y: tip.y,
                        vx: (Math.random() - 0.5) * 4,
                        vy: (Math.random() - 0.5) * 4,
                        color: Math.random() > 0.4 ? '#fde047' : '#ffffff',
                        radius: Math.random() * 3 + 1.5,
                        life: 30
                    });
                }
                ctx.restore();
            });

            // Dibujar chispas de la animación de desbloqueo
            ctx.save();
            anim.sparks.forEach(sp => {
                ctx.fillStyle = sp.color;
                ctx.globalAlpha = Math.max(0, sp.life / 30);
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }
    }

    function drawLevelNodes(time) {
        window.LEVELS_DATA.forEach(lvl => {
            const isUnlocked = gameState.unlockedLevels.has(lvl.id);
            const isCompleted = gameState.completedLevels.has(lvl.id);
            const isCurrent = gameState.currentLevelId === lvl.id && !gameState.moving;
            const isHovered = gameState.hoveredLevelId === lvl.id;

            ctx.save();

            ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
            ctx.beginPath();
            ctx.ellipse(lvl.x, lvl.y + 16, 26, 10, 0, 0, Math.PI * 2);
            ctx.fill();

            if (isCurrent || isHovered) {
                const pulse = Math.sin(time * 0.006) * 5;
                ctx.strokeStyle = isUnlocked ? 'rgba(250, 204, 21, 0.85)' : 'rgba(239, 68, 68, 0.6)';
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(lvl.x, lvl.y, 28 + pulse, 0, Math.PI * 2);
                ctx.stroke();
            }

            // ONDA EXPANSIVA Y BRILLO EN EL NODO RECIÉN DESBLOQUEADO
            if (gameState.mapUnlockAnim && gameState.mapUnlockAnim.targetLevelIds.includes(lvl.id)) {
                const anim = gameState.mapUnlockAnim;
                if (anim.progress >= 0.7) {
                    const normT = Math.min(1, (anim.progress - 0.7) / 0.5);
                    const shockRadius = 24 + normT * 55;
                    const shockAlpha = Math.max(0, 1 - normT);

                    ctx.save();
                    ctx.strokeStyle = `rgba(250, 204, 21, ${shockAlpha})`;
                    ctx.lineWidth = 4;
                    ctx.shadowColor = '#facc15';
                    ctx.shadowBlur = 14;
                    ctx.beginPath();
                    ctx.arc(lvl.x, lvl.y, shockRadius, 0, Math.PI * 2);
                    ctx.stroke();

                    // Halo dorado pulsante en el nuevo nodo desbloqueado
                    ctx.fillStyle = `rgba(250, 204, 21, ${shockAlpha * 0.35})`;
                    ctx.beginPath();
                    ctx.arc(lvl.x, lvl.y, 30, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    if (!anim.soundPlayed && anim.progress >= 0.85) {
                        anim.soundPlayed = true;
                        window.soundFX.playSecretGem();
                    }
                }
            }

            ctx.beginPath();
            ctx.arc(lvl.x, lvl.y, 22, 0, Math.PI * 2);

            if (isUnlocked) {
                const grad = ctx.createRadialGradient(lvl.x - 4, lvl.y - 6, 2, lvl.x, lvl.y, 24);
                grad.addColorStop(0, '#ffffff');
                grad.addColorStop(0.3, lvl.color);
                grad.addColorStop(1, lvl.borderColor);
                ctx.fillStyle = grad;
                ctx.fill();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.stroke();

                ctx.fillStyle = lvl.id === 7 ? '#78350f' : '#ffffff';
                ctx.font = 'bold 15px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(lvl.id, lvl.x, lvl.y + 1);

                if (isCompleted) {
                    ctx.font = '14px sans-serif';
                    ctx.fillText('⭐', lvl.x, lvl.y - 25);
                }
            } else {
                ctx.fillStyle = '#334155';
                ctx.fill();

                ctx.strokeStyle = '#64748b';
                ctx.lineWidth = 2.5;
                ctx.stroke();

                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🔒', lvl.x, lvl.y);
            }

            // Título flotante
            ctx.font = '600 12px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';

            const tagY = lvl.y + 36;
            const textWidth = ctx.measureText(lvl.title).width;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
            roundRect(ctx, lvl.x - textWidth / 2 - 8, tagY - 11, textWidth + 16, 20, 6);
            ctx.fill();

            ctx.fillStyle = isUnlocked ? '#f8fafc' : '#94a3b8';
            ctx.fillText(lvl.title, lvl.x, tagY + 3);

            ctx.restore();
        });
    }

    function updateParticles() {
        gameState.snowParticles.forEach(pt => {
            pt.x += pt.speedX;
            pt.y += pt.speedY;
            if (pt.y > 280) {
                pt.y = -10;
                pt.x = Math.random() * V_WIDTH;
            }
        });

        gameState.leafParticles.forEach(pt => {
            pt.x += pt.speedX;
            pt.y += pt.speedY;
            pt.rot += pt.rotSpeed;
            if (pt.x > V_WIDTH + 20) {
                pt.x = -20;
                pt.y = 380 + Math.random() * 240;
            }
        });
    }

    function renderWeatherParticles() {
        ctx.save();
        ctx.fillStyle = '#f8fafc';
        gameState.snowParticles.forEach(pt => {
            ctx.globalAlpha = pt.alpha;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        gameState.leafParticles.forEach(pt => {
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = pt.color;
            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.rotate(pt.rot);
            ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size * 1.5);
            ctx.restore();
        });
        ctx.restore();
    }

    function renderToast() {
        if (gameState.messageTimer > 0 && gameState.messageToast) {
            gameState.messageTimer--;
            ctx.save();
            ctx.font = 'bold 14px "Segoe UI", sans-serif';
            const width = ctx.measureText(gameState.messageToast).width + 36;
            const cx = V_WIDTH / 2;
            const cy = 40;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.5;
            roundRect(ctx, cx - width / 2, cy - 16, width, 34, 8);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fef08a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(gameState.messageToast, cx, cy + 1);
            ctx.restore();
        }
    }

    function getBezierPoint(p0, cp, p1, t) {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        return {
            x: uu * p0.x + 2 * u * t * cp.x + tt * p1.x,
            y: uu * p0.y + 2 * u * t * cp.y + tt * p1.y
        };
    }

    function easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function roundRect(context, x, y, width, height, radius) {
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(x + width - radius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + radius);
        context.lineTo(x + width, y + height - radius);
        context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        context.lineTo(x + radius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - radius);
        context.lineTo(x, y + radius);
        context.quadraticCurveTo(x, y, x + radius, y);
        context.closePath();
    }

    // Bucle principal de animación a 60 FPS
    function gameLoop(time) {
        ctx.clearRect(0, 0, V_WIDTH, V_HEIGHT);

        if (gameState.mode === 'LEVEL') {
            updatePlatformerLevel();
            drawPlatformerScreen(time);
        } else {
            // MODO OVERWORLD MAPA
            // Actualizar animación de apertura de senderos
            if (gameState.mapUnlockAnim) {
                const anim = gameState.mapUnlockAnim;
                anim.progress += 0.016;

                for (let i = anim.sparks.length - 1; i >= 0; i--) {
                    const sp = anim.sparks[i];
                    sp.x += sp.vx;
                    sp.y += sp.vy;
                    sp.life--;
                    if (sp.life <= 0) anim.sparks.splice(i, 1);
                }

                if (anim.progress >= 1.35) {
                    gameState.mapUnlockAnim = null;
                }
            }

            updateParticles();
            drawMountainBackground();
            drawPaths(time);
            drawLevelNodes(time);

            if (gameState.moving) {
                gameState.moveProgress += 0.022;

                if (gameState.moveProgress >= 1) {
                    gameState.moveProgress = 1;
                    gameState.moving = false;
                    gameState.currentLevelId = gameState.moveTargetLevelId;
                    gameState.moveTargetLevelId = null;
                    saveProgress();
                    updateLevelCard();
                    window.soundFX.playSelect();
                }

                const easedT = easeInOutQuad(gameState.moveProgress);
                const pos = getBezierPoint(gameState.moveStartPos, gameState.moveCP, gameState.moveEndPos, easedT);
                drawKidAvatar(pos.x, pos.y, time, gameState.moveFacing, true, false);
            } else {
                const currentLvl = getLevel(gameState.currentLevelId);
                if (currentLvl) {
                    drawKidAvatar(currentLvl.x, currentLvl.y, time, gameState.moveFacing, false, false);
                }
            }

            renderWeatherParticles();
        }

        renderToast();
        requestAnimationFrame(gameLoop);
    }

    window.addEventListener('DOMContentLoaded', init);

})();
