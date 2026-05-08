const _players = new WeakMap();
const _settings = new WeakMap();

/**
 * Advanced Video Player Class
 * Implements YouTube-like features including playlists, chapters, subtitles, quality switching, and more.
 */
class getPlayer {
    #h;
    constructor(settings = {}) {
        const defaultSettings = {
            autoPlay: false,
            loop: false,
            muted: false,
            forceVolume: false,
            playbackRate: 1,
            volume: 1,
            gain: 1, // Volume boost (1 to 2)
            src: null,
            currentTime: 0,
            duration: 0,
            playList: [],
            autoplayNext: true,
            theaterMode: false,
            miniplayer: false,
            captions: true,
            quality: 'auto',
            chapters: [],
            subtitles: [],
            spriteTimeline: null,
            isMobile: false,
        };

        _settings.set(this, { ...defaultSettings, ...this.#validator(settings) });
        _players.set(this, {});

        // Start mobile detection observer
        this.#startMobileObserver();
    }

    #startMobileObserver() {
        const checkMobile = () => {
            const isMobile = navigator.userAgentData ? navigator.userAgentData.mobile : /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const currentSettings = _settings.get(this);
            if (currentSettings.isMobile !== isMobile) {
                this.updateAllPlayerSettings({ isMobile });
            }
        };
        checkMobile();
        setInterval(checkMobile, 2000);
    }

    #validator(settings, video = null) {
        const settingsOptions = {
            autoPlay: { type: "boolean" },
            loop: { type: "boolean" },
            muted: { type: "boolean" },
            forceVolume: { type: "boolean" },
            playbackRate: { type: "number", min: 0.25, max: 4, precision: 2 },
            volume: { type: "number", min: 0, max: 1, precision: 2 },
            gain: { type: "number", min: 1, max: 2, precision: 2 },
            src: { type: "string" },
            currentTime: { type: "number", min: 0, max: video ? video.duration : Infinity, precision: 2 },
            duration: { type: "number", min: 0, precision: 2 },
            playList: { type: "array" },
            autoplayNext: { type: "boolean" },
            theaterMode: { type: "boolean" },
            miniplayer: { type: "boolean" },
            captions: { type: "boolean" },
            quality: { type: "string" },
            chapters: { type: "array" },
            subtitles: { type: "array" },
            spriteTimeline: { type: "object" },
            isMobile: { type: "boolean" },
        };

        const validated = {};
        for (const [key, option] of Object.entries(settingsOptions)) {
            if (settings.hasOwnProperty(key)) {
                let value = settings[key];
                if (option.type === "number") {
                    value = parseFloat(value);
                    if (isNaN(value)) continue;
                    if (option.min !== undefined) value = Math.max(option.min, value);
                    if (option.max !== undefined) value = Math.min(option.max, value);
                    if (option.precision !== undefined) value = parseFloat(value.toFixed(option.precision));
                } else if (option.type === "boolean") {
                    value = !!value;
                } else if (option.type === "string") {
                    value = String(value);
                } else if (option.type === "array") {
                    if (!Array.isArray(value)) continue;
                } else if (option.type === "object") {
                    if (typeof value !== "object" || value === null) continue;
                }
                validated[key] = value;
            }
        }
        return validated;
    }

    #idGenerator() {
        const id = Math.random().toString(36).substring(2, 15);
        const players = _players.get(this);
        return players[id] ? this.#idGenerator() : id;
    }

    updateSettingByPlayerID(playerID, settings) {
        const players = _players.get(this);
        const player = players[playerID];
        if (!player) return;

        const validated = this.#validator(settings, player.videoElement);
        player.settings = { ...player.settings, ...validated };

        if (validated.isMobile !== undefined) {
            player.container.classList.toggle("mobile", validated.isMobile);
        }
        if (validated.theaterMode !== undefined) {
            player.container.classList.toggle("theater-mode", validated.theaterMode);
        }
        if (validated.miniplayer !== undefined) {
            this.#toggleMiniplayer(playerID, validated.miniplayer);
        }
        if (validated.gain !== undefined) {
            this.#updateGain(playerID, validated.gain);
            player.container.querySelector(".settings-menu [data-setting='gain'] .menu-value").textContent = validated.gain > 1 ? "Boost On" : "Off";
        }
        if (validated.playbackRate !== undefined) {
            player.videoElement.playbackRate = validated.playbackRate;
            player.container.querySelector(".settings-menu [data-setting='speed'] .menu-value").textContent = validated.playbackRate === 1 ? "Normal" : `${validated.playbackRate}x`;
        }
        if (validated.chapters !== undefined) {
            this.#renderChapters(playerID);
        }
        if (validated.src !== undefined) {
            player.videoElement.src = validated.src;
            if (validated.autoPlay) player.videoElement.play();
        }
        if (validated.quality !== undefined) {
            this.#handleQualitySwitch(playerID, validated.quality);
        }
    }

    #handleQualitySwitch(playerID, quality) {
        const player = _players.get(this)[playerID];
        if (quality === 'auto') {
            this.#startBandwidthDetection(playerID);
        } else {
            this.#stopBandwidthDetection(playerID);
            
            // Map quality to file resolution
            const qualityMap = {
                '1080p': '1920-1080',
                '720p': '1280-720',
                '480p': '640-360', // Adjusted to match available files
                '360p': '480-240'  // Adjusted to match available files
            };

            const res = qualityMap[quality];
            if (res && player.settings.src) {
                const currentSrc = player.settings.src;
                // Assuming format: video.[ext].[res].[ext]
                // Current files: video.mp4.1280-720.mp4
                const parts = currentSrc.split('.');
                if (parts.length >= 3) {
                    const ext = parts[1];
                    const newSrc = `video.${ext}.${res}.${ext}`;
                    const currentTime = player.videoElement.currentTime;
                    const isPaused = player.videoElement.paused;
                    
                    player.videoElement.src = newSrc;
                    player.videoElement.currentTime = currentTime;
                    if (!isPaused) player.videoElement.play();
                }
            }
        }
        
        // Update both main menu and any active submenu UI
        const mainQualityVal = player.container.querySelector(".settings-menu [data-setting='quality'] .menu-value");
        if (mainQualityVal) mainQualityVal.textContent = quality;
        
        player.container.querySelectorAll(".settings-menu .menu-item[data-setting='quality-val']").forEach(item => {
            item.classList.toggle("active", item.dataset.value === quality);
        });
    }

    #startBandwidthDetection(playerID) {
        const player = _players.get(this)[playerID];
        if (player.bandwidthInterval) clearInterval(player.bandwidthInterval);
        player.bandwidthInterval = setInterval(() => {
            if (navigator.connection) {
                const speed = navigator.connection.downlink;
                let suggestedQuality = '480p';
                if (speed > 5) suggestedQuality = '1080p';
                else if (speed > 2) suggestedQuality = '720p';
                console.log(`Auto quality: Bandwidth ${speed}Mbps, suggested ${suggestedQuality}`);
            }
        }, 5000);
    }

    #stopBandwidthDetection(playerID) {
        const player = _players.get(this)[playerID];
        if (player.bandwidthInterval) clearInterval(player.bandwidthInterval);
    }

    #renderChapters(playerID) {
        const player = _players.get(this)[playerID];
        const { container, settings, videoElement } = player;
        const progressArea = container.querySelector(".progress-area");
        
        // Clear existing markers
        progressArea.querySelectorAll(".chapter-marker").forEach(m => m.remove());

        if (!settings.chapters || !settings.chapters.length) return;

        settings.chapters.forEach(chapter => {
            const percent = (chapter.time / videoElement.duration) * 100;
            if (isNaN(percent)) return;
            const marker = document.createElement("div");
            marker.className = "chapter-marker";
            marker.style.left = `${percent}%`;
            marker.title = chapter.title;
            progressArea.appendChild(marker);
        });
    }

    #updateGain(playerID, gainValue) {
        const player = _players.get(this)[playerID];
        if (!player.audioCtx) {
            player.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            player.source = player.audioCtx.createMediaElementSource(player.videoElement);
            player.gainNode = player.audioCtx.createGain();
            player.source.connect(player.gainNode);
            player.gainNode.connect(player.audioCtx.destination);
        }
        player.gainNode.gain.value = gainValue;
    }

    updateAllPlayerSettings(settings) {
        const players = _players.get(this);
        Object.keys(players).forEach(id => this.updateSettingByPlayerID(id, settings));
        const globalSettings = _settings.get(this);
        _settings.set(this, { ...globalSettings, ...this.#validator(settings) });
    }

    #formatTime(time) {
        if (isNaN(time)) return "0:00";
        const h = Math.floor(time / 3600);
        const m = Math.floor((time % 3600) / 60);
        const s = Math.floor(time % 60);
        if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    #handleUiEvent(id, e) {
        const player = _players.get(this)[id];
        if (!player) return;

        const target = e.target.closest(".btn, .menu-item, .mobile-center-btn, .menu-header, .progress-area");
        if (!target) {
            // Close menus if clicked outside
            player.container.querySelectorAll(".menu").forEach(m => m.classList.remove("active"));

            // Toggle play/pause on desktop when clicking the main video area
            const isControlArea = e.target.closest(".controls-main, .progress-container, .menu");
            if (!isControlArea && !player.settings.isMobile) {
                player.videoElement.paused ? player.videoElement.play() : player.videoElement.pause();
            }
            return;
        }

        if (target.classList.contains("play-pause") || target.classList.contains("mobile-play-pause")) {
            player.videoElement.paused ? player.videoElement.play() : player.videoElement.pause();
        } else if (target.classList.contains("mute")) {
            player.videoElement.muted = !player.videoElement.muted;
        } else if (target.classList.contains("fullscreen")) {
            this.#toggleFullscreen(player);
        } else if (target.classList.contains("settings-btn")) {
            const menu = player.container.querySelector(".settings-menu");
            if (!menu.classList.contains("active")) {
                this.#renderMainMenu(id);
            }
            menu.classList.toggle("active");
        } else if (target.classList.contains("menu-header")) {
            this.#renderMainMenu(id);
        } else if (target.classList.contains("menu-item")) {
            const setting = target.dataset.setting;
            const value = target.dataset.value;

            if (setting === "gain") {
                const newGain = player.settings.gain === 1 ? 2 : 1;
                this.updateSettingByPlayerID(id, { gain: newGain });
            } else if (setting === "speed") {
                this.#showSubMenu(id, "speed");
            } else if (setting === "quality") {
                this.#showSubMenu(id, "quality");
            } else if (setting === "speed-val") {
                this.updateSettingByPlayerID(id, { playbackRate: parseFloat(value) });
                this.#closeAllMenus(id);
            } else if (setting === "quality-val") {
                this.updateSettingByPlayerID(id, { quality: value });
                this.#closeAllMenus(id);
            }
        } else if (target.classList.contains("theater-btn")) {
            this.updateSettingByPlayerID(id, { theaterMode: !player.settings.theaterMode });
        } else if (target.classList.contains("pip-btn")) {
            this.updateSettingByPlayerID(id, { miniplayer: !player.settings.miniplayer });
        } else if (target.classList.contains("miniplayer-close")) {
            this.updateSettingByPlayerID(id, { miniplayer: false });
        } else if (target.classList.contains("next-btn")) {
            this.#playNext(id);
        } else if (target.classList.contains("prev-btn")) {
            this.#playPrev(id);
        }
    }

    #closeAllMenus(id) {
        const player = _players.get(this)[id];
        player.container.querySelectorAll(".menu").forEach(m => m.classList.remove("active"));
        setTimeout(() => this.#renderMainMenu(id), 300); // Reset after fade
    }

    #renderMainMenu(id) {
        const player = _players.get(this)[id];
        const menu = player.container.querySelector(".settings-menu");
        const h = this.#h;
        menu.innerHTML = "";
        
        const items = [
            { label: 'Playback Speed', setting: 'speed', value: player.settings.playbackRate === 1 ? "Normal" : `${player.settings.playbackRate}x` },
            { label: 'Quality', setting: 'quality', value: player.settings.quality },
            { label: 'Volume Boost', setting: 'gain', value: player.settings.gain > 1 ? "Boost On" : "Off" }
        ];

        items.forEach(item => {
            menu.appendChild(h('div', { className: 'menu-item', 'data-setting': item.setting },
                h('div', { className: 'menu-label' }, item.label),
                h('div', { className: 'menu-value' }, item.value)
            ));
        });
    }

    #showSubMenu(id, type) {
        const player = _players.get(this)[id];
        const menu = player.container.querySelector(".settings-menu");
        const h = this.#h;
        menu.innerHTML = "";

        // Header with Back
        menu.appendChild(h('div', { className: 'menu-header' },
            h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' })),
            type.charAt(0).toUpperCase() + type.slice(1)
        ));

        if (type === "speed") {
            const currentSpeed = player.settings.playbackRate;
            const speedContainer = h('div', { className: 'speed-control-container' },
                h('div', { className: 'speed-display' }, `${currentSpeed.toFixed(2)}x`),
                h('div', { className: 'speed-slider-group' },
                    h('button', { className: 'btn-small speed-minus' }, '-'),
                    h('input', { type: 'range', className: 'speed-slider', min: '0.25', max: '4', step: '0.05', value: currentSpeed }),
                    h('button', { className: 'btn-small speed-plus' }, '+')
                ),
                h('div', { className: 'speed-chips' },
                    [1, 1.25, 1.5, 2, 3].map(s => 
                        h('div', { className: 'speed-chip-wrapper' },
                            h('div', { className: `speed-chip ${currentSpeed === s ? 'active' : ''}`, 'data-value': s }, s === 1 ? '1.0' : s.toFixed(2)),
                            s === 1 ? h('div', { className: 'speed-chip-sublabel' }, 'Normal') : null
                        )
                    )
                )
            );
            menu.appendChild(speedContainer);
            
            const slider = speedContainer.querySelector('.speed-slider');
            const display = speedContainer.querySelector('.speed-display');
            
            const updateSpeed = (val) => {
                const s = parseFloat(parseFloat(val).toFixed(2));
                this.updateSettingByPlayerID(id, { playbackRate: s });
                display.textContent = `${s.toFixed(2)}x`;
                slider.value = s;
                speedContainer.querySelectorAll('.speed-chip').forEach(c => c.classList.toggle('active', parseFloat(c.dataset.value) === s));
            };

            slider.oninput = (e) => updateSpeed(e.target.value);
            speedContainer.querySelector('.speed-minus').onclick = (e) => { e.stopPropagation(); updateSpeed(Math.max(0.25, player.settings.playbackRate - 0.05)); };
            speedContainer.querySelector('.speed-plus').onclick = (e) => { e.stopPropagation(); updateSpeed(Math.min(4, player.settings.playbackRate + 0.05)); };
            speedContainer.querySelectorAll('.speed-chip').forEach(chip => {
                chip.onclick = (e) => { e.stopPropagation(); updateSpeed(chip.dataset.value); };
            });
        } else if (type === "quality") {
            const qualities = ['1080p', '720p', '480p', '360p', 'auto'];
            qualities.forEach(q => {
                const item = h('div', { className: `menu-item ${player.settings.quality === q ? 'active' : ''}`, 'data-setting': 'quality-val', 'data-value': q },
                    h('div', { className: 'menu-label' }, q)
                );
                menu.appendChild(item);
            });
        }
    }

    #toggleMiniplayer(id, enable) {
        const player = _players.get(this)[id];
        player.container.classList.toggle("miniplayer", enable);
        
        if (enable) {
            this.#setupDraggable(id);
        } else {
            player.container.style.top = "";
            player.container.style.left = "";
            player.container.style.bottom = "";
            player.container.style.right = "";
        }
    }

    #setupDraggable(id) {
        const player = _players.get(this)[id];
        const container = player.container;
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        container.onmousedown = (e) => {
            if (e.target.closest(".controls-overlay, .btn, .menu")) return;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            container.style.top = (container.offsetTop - pos2) + "px";
            container.style.left = (container.offsetLeft - pos1) + "px";
            container.style.bottom = "auto";
            container.style.right = "auto";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    #toggleFullscreen(player) {
        if (!document.fullscreenElement) {
            player.container.requestFullscreen().catch(err => {
                player.videoElement.requestFullscreen();
            });
        } else {
            document.exitFullscreen();
        }
    }

    #playNext(id) {
        const player = _players.get(this)[id];
        if (!player.settings.playList.length) return;
        let currentIndex = player.settings.playList.indexOf(player.settings.src);
        let nextIndex = (currentIndex + 1) % player.settings.playList.length;
        this.updateSettingByPlayerID(id, { src: player.settings.playList[nextIndex], autoPlay: true });
    }

    #playPrev(id) {
        const player = _players.get(this)[id];
        if (!player.settings.playList.length) return;
        let currentIndex = player.settings.playList.indexOf(player.settings.src);
        let prevIndex = (currentIndex - 1 + player.settings.playList.length) % player.settings.playList.length;
        this.updateSettingByPlayerID(id, { src: player.settings.playList[prevIndex], autoPlay: true });
    }

    #setupKeyboardShortcuts(id) {
        window.addEventListener("keydown", (e) => {
            const player = _players.get(this)[id];
            if (!player || document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;

            const video = player.videoElement;
            switch (e.key.toLowerCase()) {
                case " ":
                case "k": video.paused ? video.play() : video.pause(); break;
                case "m": video.muted = !video.muted; break;
                case "f": this.#toggleFullscreen(player); break;
                case "j": video.currentTime -= 10; break;
                case "l": video.currentTime += 10; break;
                case "arrowleft": video.currentTime -= 5; break;
                case "arrowright": video.currentTime += 5; break;
                case "arrowup": video.volume = Math.min(1, video.volume + 0.05); break;
                case "arrowdown": video.volume = Math.max(0, video.volume - 0.05); break;
                case "t": this.updateSettingByPlayerID(id, { theaterMode: !player.settings.theaterMode }); break;
                case "i": player.videoElement.requestPictureInPicture(); break;
                case "c": this.updateSettingByPlayerID(id, { captions: !player.settings.captions }); break;
                case "escape": 
                    if (document.fullscreenElement) document.exitFullscreen();
                    player.container.querySelectorAll(".menu").forEach(m => m.classList.remove("active"));
                    break;
                case ".": if (video.paused) video.currentTime += 1/30; break;
                case ",": if (video.paused) video.currentTime -= 1/30; break;
            }
            if (e.key >= "0" && e.key <= "9") {
                video.currentTime = video.duration * (parseInt(e.key) / 10);
            }
        });
    }

    createPlayerByElement(element, settings = {}) {
        const id = this.#idGenerator();
        const playerSettings = { ..._settings.get(this), ...this.#validator(settings, element) };

        const container = document.createElement("div");
        container.className = `video-player paused ${playerSettings.isMobile ? 'mobile' : ''}`;
        container.id = `player-${id}`;

        element.parentNode.insertBefore(container, element);
        container.appendChild(element);

        const h = (tag, attrs = {}, ...children) => {
            const isSvg = ['svg', 'path', 'circle', 'rect'].includes(tag);
            const el = isSvg ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
            for (const [key, value] of Object.entries(attrs)) {
                if (key === 'className') el.setAttribute('class', value);
                else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
                else el.setAttribute(key, value);
            }
            const appendChildren = (parent, children) => {
                children.forEach(child => {
                    if (Array.isArray(child)) appendChildren(parent, child);
                    else if (typeof child === 'string') parent.appendChild(document.createTextNode(child));
                    else if (child) parent.appendChild(child);
                });
            };
            appendChildren(el, children);
            return el;
        };
        this.#h = h;

        const overlay = h('div', { className: 'controls-overlay' },
            h('div', { className: 'progress-container' },
                h('div', { className: 'progress-area' },
                    h('div', { className: 'thumbnail-preview', style: { display: 'none', position: 'absolute', bottom: '10px', width: '160px', height: '90px', backgroundSize: 'cover', border: '2px solid #fff', borderRadius: '4px', zIndex: '20', pointerEvents: 'none' } }),
                    h('div', { className: 'buffer-bar' }),
                    h('div', { className: 'progress-bar' }),
                    h('div', { className: 'tooltip' }, '0:00')
                )
            ),
            h('div', { className: 'controls-main' },
                h('div', { className: 'controls-group' },
                    h('button', { className: 'btn prev-btn', title: 'Previous' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M6 6h2v12H6zm3.5 6l8.5 6V6z' }))),
                    h('button', { className: 'btn play-pause', title: 'Play (k)' },
                        h('svg', { viewBox: '0 0 24 24', className: 'play-icon' }, h('path', { d: 'M8 5v14l11-7z' })),
                        h('svg', { viewBox: '0 0 24 24', className: 'pause-icon', style: { display: 'none' } }, h('path', { d: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' }))
                    ),
                    h('button', { className: 'btn next-btn', title: 'Next' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z' }))),
                    h('div', { className: 'volume-container' },
                        h('button', { className: 'btn mute', title: 'Mute (m)' },
                            h('svg', { viewBox: '0 0 24 24', className: 'vol-high' }, h('path', { d: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z' })),
                            h('svg', { viewBox: '0 0 24 24', className: 'vol-muted', style: { display: 'none' } }, h('path', { d: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z' }))
                        ),
                        h('div', { className: 'volume-slider-wrapper' },
                            h('input', { type: 'range', className: 'volume-slider', min: '0', max: '1', step: '0.05', value: playerSettings.volume })
                        )
                    ),
                    h('div', { className: 'time-display' },
                        h('span', { className: 'current-time' }, '0:00'),
                        ' / ',
                        h('span', { className: 'duration' }, '0:00')
                    )
                ),
                h('div', { className: 'controls-group' },
                    h('button', { className: 'btn cc-btn', title: 'Subtitles (c)' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z' }))),
                    h('button', { className: 'btn settings-btn', title: 'Settings' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z' }))),
                    h('button', { className: 'btn theater-btn', title: 'Theater Mode (t)' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z' }))),
                    h('button', { className: 'btn pip-btn', title: 'Miniplayer (i)' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z' }))),
                    h('button', { className: 'btn fullscreen', title: 'Fullscreen (f)' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z' })))
                )
            ),
            h('div', { className: 'settings-menu menu' },
                h('div', { className: 'menu-item', 'data-setting': 'speed' }, h('div', { className: 'menu-label' }, 'Playback Speed'), h('div', { className: 'menu-value' }, 'Normal')),
                h('div', { className: 'menu-item', 'data-setting': 'quality' }, h('div', { className: 'menu-label' }, 'Quality'), h('div', { className: 'menu-value' }, 'Auto')),
                h('div', { className: 'menu-item', 'data-setting': 'gain' }, h('div', { className: 'menu-label' }, 'Volume Boost'), h('div', { className: 'menu-value' }, 'Off'))
            ),
            h('div', { className: 'miniplayer-close', title: 'Close Miniplayer' }, h('svg', { viewBox: '0 0 24 24', style: { width: '16px', height: '16px', fill: '#fff' } }, h('path', { d: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z' }))),
            h('div', { className: 'mobile-controls' },
                h('button', { className: 'mobile-center-btn prev-btn' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M6 6h2v12H6zm3.5 6l8.5 6V6z' }))),
                h('button', { className: 'mobile-center-btn mobile-play-pause' }, h('svg', { viewBox: '0 0 24 24', className: 'play-icon' }, h('path', { d: 'M8 5v14l11-7z' }))),
                h('button', { className: 'mobile-center-btn next-btn' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z' })))
            ),
            h('div', { className: 'subtitle-container' }, h('span', { className: 'subtitle-text' }, ''))
        );

        container.appendChild(overlay);

        const player = {
            id, container, videoElement: element, settings: playerSettings, isDragging: false,
            elements: {
                progressBar: container.querySelector(".progress-bar"),
                progressArea: container.querySelector(".progress-area"),
                volumeSlider: container.querySelector(".volume-slider"),
                currentTime: container.querySelector(".current-time"),
                duration: container.querySelector(".duration"),
                playIcon: container.querySelector(".play-icon"),
                pauseIcon: container.querySelector(".pause-icon"),
                bufferBar: container.querySelector(".buffer-bar"),
                tooltip: container.querySelector(".tooltip")
            }
        };

        _players.get(this)[id] = player;

        this.#setupEvents(id);
        this.#setupKeyboardShortcuts(id);
        this.#setupContextMenu(id);

        element.controls = false;
        if (playerSettings.src) element.src = playerSettings.src;
        if (playerSettings.autoPlay) element.play();
    }

    #setupEvents(id) {
        const player = _players.get(this)[id];
        const { videoElement: video, container, elements } = player;

        container.addEventListener("click", (e) => this.#handleUiEvent(id, e));

        video.onplay = () => {
            container.classList.remove("paused");
            container.querySelectorAll(".play-icon").forEach(i => i.style.display = "none");
            container.querySelectorAll(".pause-icon").forEach(i => i.style.display = "block");
        };

        video.onpause = () => {
            container.classList.add("paused");
            container.querySelectorAll(".play-icon").forEach(i => i.style.display = "block");
            container.querySelectorAll(".pause-icon").forEach(i => i.style.display = "none");
        };

        video.onended = () => {
            if (player.settings.autoplayNext) this.#playNext(id);
        };

        video.onerror = () => {
            console.error("Video Error:", video.error);
            // Handle specific errors like CORS or Range not supported
            if (video.error.code === 4) {
                // Media Source Error
                this.#handleMediaError(id);
            }
        };

        video.ontimeupdate = () => {
            if (!player.isDragging) {
                const percent = (video.currentTime / video.duration) * 100;
                elements.progressBar.style.width = `${percent}%`;
            }
            elements.currentTime.textContent = this.#formatTime(video.currentTime);
            this.#updateSubtitlePosition(id);
        };

        video.onloadedmetadata = () => {
            elements.duration.textContent = this.#formatTime(video.duration);
            this.#renderChapters(id);
        };

        video.onprogress = () => {
            if (video.buffered.length > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                const percent = (bufferedEnd / video.duration) * 100;
                elements.bufferBar.style.width = `${percent}%`;
            }
        };

        // Dragging / Scrubbing
        const scrub = (e) => {
            const rect = elements.progressArea.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const x = clientX - rect.left;
            const percent = Math.max(0, Math.min(x / rect.width, 1));
            elements.progressBar.style.width = `${percent * 100}%`;
            video.currentTime = percent * video.duration;
        };

        elements.progressArea.addEventListener("mousedown", (e) => {
            player.isDragging = true;
            scrub(e);
            const move = (me) => scrub(me);
            const stop = () => {
                player.isDragging = false;
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", stop);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", stop);
        });

        const thumb = container.querySelector(".thumbnail-preview");
        elements.progressArea.addEventListener("mousemove", (e) => {
            const rect = elements.progressArea.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            const time = Math.floor(percent * video.duration);
            
            elements.tooltip.style.left = `${x}px`;
            elements.tooltip.textContent = this.#formatTime(time);

            if (player.settings.spriteTimeline) {
                const frame = player.settings.spriteTimeline.frames[time];
                if (frame) {
                    thumb.style.display = "block";
                    thumb.style.left = `${Math.min(Math.max(0, x - 80), rect.width - 160)}px`;
                    thumb.style.backgroundImage = `url(${frame.src})`;
                    thumb.style.backgroundPosition = `-${frame.x}px -${frame.y}px`;
                    thumb.style.width = `${frame.w}px`;
                    thumb.style.height = `${frame.h}px`;
                } else {
                    thumb.style.display = "none";
                }
            }
        });

        elements.progressArea.addEventListener("mouseleave", () => {
            thumb.style.display = "none";
        });

        elements.volumeSlider.oninput = (e) => {
            video.volume = e.target.value;
            video.muted = video.volume === 0;
        };
    }

    #updateSubtitlePosition(id) {
        const player = _players.get(this)[id];
        const subContainer = player.container.querySelector(".subtitle-container");
        const isShowingControls = !player.videoElement.paused || player.container.matches(':hover');
        subContainer.style.bottom = isShowingControls ? "80px" : "40px";
    }

    #handleMediaError(id) {
        const player = _players.get(this)[id];
        // Try fallback or show user-friendly error
        console.warn("Attempting to handle media error for player", id);
    }

    #setupContextMenu(id) {
        const player = _players.get(this)[id];
        const menu = document.createElement("div");
        menu.className = "context-menu menu";
        menu.innerHTML = `
            <div class="menu-item" data-action="loop">Loop</div>
            <div class="menu-item" data-action="pip">Miniplayer</div>
            <div class="menu-item" data-action="copy-url">Copy Video URL</div>
            <div class="menu-item" data-action="copy-url-time">Copy URL at current time</div>
            <div class="menu-item" data-action="debug">Stats for Nerds</div>
        `;
        player.container.appendChild(menu);

        menu.addEventListener("click", (e) => {
            const action = e.target.closest(".menu-item").dataset.action;
            if (action === "loop") {
                player.videoElement.loop = !player.videoElement.loop;
            } else if (action === "copy-url") {
                navigator.clipboard.writeText(player.videoElement.src);
            } else if (action === "copy-url-time") {
                const url = new URL(player.videoElement.src, window.location.href);
                url.searchParams.set("t", Math.floor(player.videoElement.currentTime));
                navigator.clipboard.writeText(url.href);
            } else if (action === "debug") {
                this.#showDebugInfo(id);
            }
        });

        player.container.oncontextmenu = (e) => {
            e.preventDefault();
            menu.style.display = "block";
            menu.style.left = `${e.offsetX}px`;
            menu.style.top = `${e.offsetY}px`;
            menu.classList.add("active");
        };

        document.addEventListener("click", () => {
            menu.style.display = "none";
            menu.classList.remove("active");
        });
    }

    #showDebugInfo(id) {
        const player = _players.get(this)[id];
        const video = player.videoElement;
        const debugInfo = `
            Resolution: ${video.videoWidth}x${video.videoHeight}
            Current Time: ${video.currentTime.toFixed(2)}
            Buffered: ${video.buffered.length ? video.buffered.end(0).toFixed(2) : 0}s
            Playback Rate: ${video.playbackRate}x
            Volume: ${video.volume} (Gain: ${player.settings.gain})
            Muted: ${video.muted}
            Network State: ${video.networkState}
            Ready State: ${video.readyState}
        `;
        alert(debugInfo); // In a real app, use a nice overlay
    }

    addPlayerBySelector(selector, settings = {}) {
        const el = document.querySelector(selector);
        if (el) this.createPlayerByElement(el, settings);
    }

    addPlayerBySelectorAll(selector, settings = {}) {
        document.querySelectorAll(selector).forEach(el => this.createPlayerByElement(el, settings));
    }

    getPlayers() { return _players.get(this); }
}

window.videoPlayer = new getPlayer();