// ==UserScript==
// @name         Æther Player — 全网VIP视频免费解析 · 毛玻璃美学全网首发 · 免费破解去广告
// @namespace    https://github.com/shiyi312/-ther-Player-VIP-
// @version      5.9.15.1
// @description  全网VIP视频免费解析：爱奇艺、腾讯、优酷、B站等主流平台一键播放！✨毛玻璃UI ✨彻底静音  ✨记忆上次选择  ✨完全免费 ✨无广告 ✨开源维护 【仅限学习交流】
// @author       辻弌20  github：shiyi312
// @icon         https://raw.githubusercontent.com/shiyi312/-ther-Player-VIP-/main/tubiao.ico
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @run-at       document-end
// @license      MIT
// ==/UserScript==

/*
 * 特别致谢：
 * 本脚本的选集功能与解析方案，参考了 88lin 的开源项目：
 * https://github.com/88lin/video_vip
 * 感谢开源社区的无私分享！
 */

(function () {
    'use strict';

    // ─── 设计系统 ────────────────────────────────────────────────
    const DESIGN = {
        colors: {
            deepViolet: '#1a0b2e',
            royalPurple: '#2d1b69',
            electricLavender: '#4a2c8a',
            softLilac: '#c084fc',
            cyanGlow: '#67e8f9',
            pureWhite: '#f1f5f9',
            glassBg: 'rgba(26, 11, 46, 0.78)',
        },
        font: {
            family: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            weight: { regular: 400, medium: 500, bold: 700 },
            letterSpacing: '0.01em',
        },
        radius: '16px',
        shadow: '0 20px 60px rgba(0,0,0,0.6)',
    };

    // ─── 解析接口 ──────────────────────────────────────────────
    const APIS = [
        { name: '虾米', url: 'https://jx.xmflv.cc/?url=' },
        { name: '七七云', url: 'https://jx.77flv.cc/?url=' },
        { name: 'HLS', url: 'https://jx.hls.one/?url=' },
        { name: 'playm3u8', url: 'https://www.playm3u8.cn/jiexi.php?url=' },
        { name: 'CK', url: 'https://www.ckplayer.vip/jiexi/?url=' },
        { name: '冰豆', url: 'https://bd.jx.cn/?url=' },
        { name: '789', url: 'https://jiexi.789jiexi.icu:4433/?url=' },
        { name: 'M3U8', url: 'https://jx.m3u8.tv/jiexi/?url=' },
        { name: '8090', url: 'https://www.8090g.cn/?url=' },
        { name: '爱豆', url: 'https://jx.aidouer.net/?url=' },
        { name: '芒果TV', url: 'https://video.isyour.love/player/getplayer?url=' },
        { name: 'TXNQ', url: 'https://bfq.txnp.cn/player?url=' },
        { name: '七哥', url: 'https://jx.202617.xyz/tv.php?url=' },
        { name: 'fongmi', url: 'https://json.fongmi.cc/web?url=' },
        { name: '极速', url: 'https://jx.2s0.cn/player/?url=' },
        { name: '花旗', url: 'https://www.huaqi.live/?url=' },
        { name: 'Player-JY', url: 'https://jx.playerjy.com/?url=' },
        { name: '邦宁云', url: 'https://video.isyour.love/player/getplayer?url=' },
        { name: 'Yparse', url: 'https://jx.yparse.com/index.php?url=' },
        { name: '默认A', url: 'https://json.fongmi.cc/web?url=' },
        { name: '默认B', url: 'https://super.playr.top/?url=' },
    ];

    // ─── 状态 ──────────────────────────────────────────────────
    const State = {
        activeSource: null,
        currentApi: null,
        panelOpen: false,
        playing: false,
        overlayEl: null,
        iframeEl: null,
        failedSources: new Set(),
        sourceStats: new Map(),
        toastTimer: null,
        autoSwitchEnabled: true,
        isAutoSwitch: false,
        lastSwitchTime: 0,
        checkInterval: null,
        adCleaner: null,
        protectionInterval: null,
        urlWatchInterval: null,
        lastUrl: '',
        _mediaKillerStarted: false,
        _mediaBlocked: false,
        _originalPlay: null,
        _mediaObserver: null,
        _mediaInterval: null,
        episodes: [],
        _switching: false,
        _episodeObserver: null,
        sidebarVisible: false,
        manualPicked: false,
        lastSourceName: null,
    };

    // ─── 工具 ──────────────────────────────────────────────────
    const Utils = {
        getTargetUrl() { return location.href; },
        buildResolveUrl(api) { return api.url + encodeURIComponent(this.getTargetUrl()); },

        loadStats() {
            try {
                const data = GM_getValue('aether_stats', '{}');
                const parsed = JSON.parse(data);
                for (const [k, v] of Object.entries(parsed)) {
                    State.sourceStats.set(k, v);
                }
            } catch (e) {}
        },
        saveStats() {
            const obj = {};
            for (const [k, v] of State.sourceStats.entries()) {
                obj[k] = v;
            }
            GM_setValue('aether_stats', JSON.stringify(obj));
        },
        recordSuccess(name) {
            if (!name) return;
            const stat = State.sourceStats.get(name) || { success: 0, fail: 0 };
            stat.success++;
            State.sourceStats.set(name, stat);
            this.saveStats();
            State.failedSources.clear();
        },
        recordFail(name) {
            if (!name) return;
            const stat = State.sourceStats.get(name) || { success: 0, fail: 0 };
            stat.fail++;
            State.sourceStats.set(name, stat);
            this.saveStats();
        },
        getScore(name) {
            if (!name) return 0;
            const stat = State.sourceStats.get(name);
            if (!stat) return 0;
            const total = stat.success + stat.fail;
            return total === 0 ? 0 : stat.success / total;
        },
        sortApis(apis) {
            return apis.slice();
        },

        findPlayerContainer() {
            const selectors = [
                '#player-container', '#player', '.container-player',
                '#bilibili-player', '#mgtv-player-wrap', '#outlayer',
                '#ykPlayer', '#sohuplayer', '#le_player', '#pptv_playpage_box',
                '#flashContent', '#ACPlayer', '#video-player', '#xigua-player',
                '.video-area', '.player-container', '.artplayer-app',
                '.mod_player', '#tenvideo_player',
                '.iqp-player-videolayer', '.m-video-player-wrap',
                '.h5-detail-player',
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.offsetHeight > 100) return el;
            }
            return null;
        },

        getVideoRect() {
            const container = this.findPlayerContainer();
            if (!container) return null;
            const rect = container.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
        },

        hideAds() {
            const host = location.hostname;
            let selectors = [];
            if (host.includes('v.qq.com') || host.includes('m.v.qq.com')) {
                selectors = ['.mod_vip_popup', '#mask_layer', '.panel-tip-pay', '.mod_vip_popup', '[class*="vip"]', '[class*="ad"]', '.vip-cover', '.pay-tips'];
            } else if (host.includes('iqiyi.com') || host.includes('iq.com')) {
                selectors = ['.iqp-player-vipmask', '.iqp-player-paymask', '.iqp-player-loginmask', '#playerPopup', '#vipCoversBox', '[class*="vip"]', '[class*="ad"]'];
            } else if (host.includes('youku.com')) {
                selectors = ['.advertise-layer', '.youku-advertise-layer', '#youku-advertise', '#player-advertise', '.preloading-layer', '.preplay-layer', '.kui-dashboard', '.kui-layer'];
            } else if (host.includes('mgtv.com')) {
                selectors = ['.adFixedContain', '.ad-banner', '[class*="app"]', '[class*="ad"]'];
            } else if (host.includes('bilibili.com')) {
                selectors = ['.bpx-player-video-wrap .bpx-player-video-mask', '.bpx-player-video-wrap .bpx-player-video-pay', '.bpx-player-video-wrap .bpx-player-video-cover'];
            } else {
                selectors = ['[class*="vip"]', '[class*="ad"]', '[class*="popup"]', '[class*="mask"]', '[class*="cover"]'];
            }
            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('opacity', '0', 'important');
                    el.style.setProperty('pointer-events', 'none', 'important');
                });
            });
        },

        // ─── （静音核心） ──────────────────────
        _removeNativeMedia(root) {
            if (!root || !root.querySelectorAll) return;
            root.querySelectorAll('video, audio').forEach((media) => {
                try {
                    media.pause();
                    media.removeAttribute('autoplay');
                    media.removeAttribute('src');
                    media.srcObject = null;
                    media.load();
                    if (media.parentNode) {
                        media.parentNode.removeChild(media);
                    }
                } catch (e) {}
            });
        },

        _stopMedia(media) {
            if (!media) return;
            try {
                media.pause();
                media.autoplay = false;
                media.loop = false;
                media.muted = true;
                media.defaultMuted = true;
                media.volume = 0;
                media.playbackRate = 1;
                media.removeAttribute('autoplay');
                media.removeAttribute('src');
                media.srcObject = null;
                media.querySelectorAll('source').forEach((node) => node.remove());
                if (media.currentSrc || media.srcObject || media.querySelector('source')) {
                    media.load();
                }
                media.style.setProperty('display', 'none', 'important');
                media.style.setProperty('visibility', 'hidden', 'important');
                media.style.setProperty('pointer-events', 'none', 'important');
                if (media.parentNode) {
                    media.parentNode.removeChild(media);
                }
            } catch (e) {}
        },

        _mutePageMedia(root) {
            if (!root || !root.querySelectorAll) return;
            root.querySelectorAll('video, audio').forEach((media) => this._stopMedia(media));
        },

        _blockNativeMediaPlayback() {
            if (State._mediaBlocked || !window.HTMLMediaElement) return;
            State._mediaBlocked = true;
            const rawPlay = HTMLMediaElement.prototype.play;
            State._originalPlay = rawPlay;
            HTMLMediaElement.prototype.play = function () {
                try {
                    this.pause();
                    this.muted = true;
                    this.volume = 0;
                    this.style.setProperty('display', 'none', 'important');
                    this.removeAttribute('autoplay');
                    if (this.parentNode) {
                        this.parentNode.removeChild(this);
                    }
                } catch (e) {}
                return Promise.resolve();
            };
            document.addEventListener('play', (event) => {
                if (event.target instanceof HTMLMediaElement) {
                    Utils._stopMedia(event.target);
                }
            }, true);
            document.addEventListener('playing', (event) => {
                if (event.target instanceof HTMLMediaElement) {
                    Utils._stopMedia(event.target);
                }
            }, true);
            document.addEventListener('volumechange', (event) => {
                if (event.target instanceof HTMLMediaElement) {
                    Utils._stopMedia(event.target);
                }
            }, true);
            try {
                HTMLMediaElement.prototype.play.toString = () => rawPlay.toString();
            } catch (e) {}
        },

        startMediaKiller() {
            if (State._mediaKillerStarted) {
                this._removeNativeMedia(document);
                return;
            }
            State._mediaKillerStarted = true;
            this._removeNativeMedia(document);
            setTimeout(() => {
                this._blockNativeMediaPlayback();
                if (State._mediaInterval) clearInterval(State._mediaInterval);
                State._mediaInterval = setInterval(() => {
                    this._removeNativeMedia(document);
                    document.querySelectorAll('iframe').forEach(f => {
                        try {
                            const doc = f.contentDocument;
                            if (doc) this._removeNativeMedia(doc);
                        } catch (e) {}
                    });
                }, 100);
                const target = document.documentElement || document.body;
                if (target && !State._mediaObserver) {
                    State._mediaObserver = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.type === 'attributes' && mutation.target instanceof Element) {
                                if (mutation.target.matches('video, audio')) {
                                    Utils._stopMedia(mutation.target);
                                    return;
                                }
                            }
                            mutation.addedNodes.forEach((node) => {
                                if (!(node instanceof Element)) return;
                                if (node.matches && node.matches('video, audio')) {
                                    Utils._stopMedia(node);
                                    return;
                                }
                                Utils._removeNativeMedia(node);
                            });
                        });
                    });
                    State._mediaObserver.observe(target, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['src', 'autoplay']
                    });
                }
            }, 100);
        },

        stopMediaKiller() {
            if (State._mediaInterval) {
                clearInterval(State._mediaInterval);
                State._mediaInterval = null;
            }
            if (State._mediaObserver) {
                try {
                    State._mediaObserver.disconnect();
                } catch (e) {}
                State._mediaObserver = null;
            }
            if (State._originalPlay && window.HTMLMediaElement) {
                try {
                    HTMLMediaElement.prototype.play = State._originalPlay;
                } catch (e) {}
                State._mediaBlocked = false;
                State._originalPlay = null;
            }
            State._mediaKillerStarted = false;
        },

        clearAllTimers() {
            if (State.adCleaner) {
                clearInterval(State.adCleaner);
                State.adCleaner = null;
            }
            if (State.checkInterval) {
                clearInterval(State.checkInterval);
                State.checkInterval = null;
            }
            if (State.toastTimer) {
                clearTimeout(State.toastTimer);
                State.toastTimer = null;
            }
            if (State.protectionInterval) {
                clearInterval(State.protectionInterval);
                State.protectionInterval = null;
            }
            if (State.urlWatchInterval) {
                clearInterval(State.urlWatchInterval);
                State.urlWatchInterval = null;
            }
            if (State._episodeObserver) {
                try { State._episodeObserver.disconnect(); } catch(e) {}
                State._episodeObserver = null;
            }
            this.stopMediaKiller();
        },

        // ─── 选集提取 ──────────────────────────────────────────────
        extractEpisodes() {
            const host = location.hostname;
            let links = [];
            let selectors = [];

            const siteSelectorMap = {
                'v.qq.com': [
                    '.episode-list__item a',
                    '.episode-item a',
                    '[class*="episode_item"] a',
                    '[class*="episode-list"] a',
                    '[class*="playlist"] a',
                    '[class*="episode"] a',
                    'a[href*="/video/"][href*=".html"]',
                    '[data-episode-index] a',
                    '[data-index] a',
                    '.playlist .item a',
                    '.list-item a',
                    '[class*="item"] a[href*="/x/cover/"]',
                ],
                'iqiyi.com': [
                    '.qy-episode-item a',
                    '[class*="episode"] a',
                    '[class*="album-list"] a',
                    '.playlist-item a',
                    '[data-episode] a',
                ],
                'iq.com': [
                    '.qy-episode-item a',
                    '[class*="episode"] a',
                    '[class*="album-list"] a',
                    '.playlist-item a',
                ],
                'youku.com': [
                    '.anthology-item a',
                    '[class*="anthology"] a',
                    '.box-anthology-item a',
                    '[data-episode] a',
                    '.episode-list a',
                    '[class*="episode"] a',
                ],
                'bilibili.com': [
                    '.ep-item a',
                    '[class*="ep"] a',
                    '.bpx-player-ctrl-playlist a',
                    '[data-episode] a',
                ],
                'mgtv.com': [
                    '[class*="episode"] a',
                    '.episode-list a',
                    '.number-item a',
                ],
                'sohu.com': [
                    '.pane-item a',
                    '.player-album-list a',
                ],
                'le.com': [
                    '.js-episode-item a',
                    '.juji_bar a',
                ]
            };

            for (const [key, selList] of Object.entries(siteSelectorMap)) {
                if (host.includes(key)) {
                    selectors = selList;
                    break;
                }
            }

            if (!selectors.length) {
                selectors = [
                    '[class*="episode"] a',
                    '[class*="playlist"] a',
                    '[class*="list"] a',
                    '[class*="item"] a',
                    '[data-episode] a',
                    '[data-index] a',
                ];
            }

            const visitedUrls = new Set();
            for (const sel of selectors) {
                const elements = document.querySelectorAll(sel);
                for (const el of elements) {
                    let href = el.getAttribute('href') || el.getAttribute('data-url');
                    if (!href) continue;
                    if (href.startsWith('//')) href = 'https:' + href;
                    else if (href.startsWith('/')) href = location.origin + href;
                    else if (!href.startsWith('http')) href = location.origin + '/' + href;

                    if (!href.includes('/video/') && !href.includes('v_') && !href.includes('play') && !href.includes('episode') && !href.includes('/x/cover/')) {
                        if (!el.hasAttribute('data-episode') && !el.hasAttribute('data-index')) continue;
                    }

                    if (visitedUrls.has(href)) continue;
                    visitedUrls.add(href);

                    let title = el.textContent.trim() || el.getAttribute('title') || '';
                    if (/^\d+$/.test(title)) {
                        title = '第' + title + '集';
                    }
                    if (!title) {
                        const match = href.match(/[?&]p=(\d+)/) || href.match(/[?&]episode=(\d+)/);
                        if (match) title = '第' + match[1] + '集';
                    }
                    links.push({ title, url: href });
                }
            }

            if (!links.length) {
                try {
                    const data = window.__INITIAL_STATE__ || window.__STATE__;
                    if (data && data.video && data.video.episodes) {
                        for (const ep of data.video.episodes) {
                            const title = ep.title || '第' + ep.index + '集';
                            const url = location.origin + ep.url;
                            if (!visitedUrls.has(url)) {
                                visitedUrls.add(url);
                                links.push({ title, url });
                            }
                        }
                    }
                    if (data && data.videoData && data.videoData.episodeList) {
                        for (const ep of data.videoData.episodeList) {
                            const title = ep.title || '第' + ep.episode + '集';
                            const url = location.origin + ep.url;
                            if (!visitedUrls.has(url)) {
                                visitedUrls.add(url);
                                links.push({ title, url });
                            }
                        }
                    }
                } catch (e) {}
            }

            links.sort((a, b) => {
                const numA = parseInt(a.title.match(/\d+/)?.[0] || '0');
                const numB = parseInt(b.title.match(/\d+/)?.[0] || '0');
                return numA - numB;
            });

            return links;
        },
    };

    // ─── UI 系统 ──────────────────────────────────────────────────
    const UI = {
        container: null,
        btn: null,
        panel: null,
        toast: null,
        list: null,
        autoToggle: null,
        refreshBtn: null,
        viewTitle: null,
        viewBack: null,
        currentApi: null,
        sidebar: null,
        sidebarList: null,
        sidebarClose: null,

        init() {
            this.injectStyles();
            this.createElements();
            this.bindEvents();
            this.loadPosition();
            Utils.loadStats();
            State.autoSwitchEnabled = GM_getValue('aether_auto_switch', true);
            this.updateToggleUI();

            const lastSource = GM_getValue('aether_last_source', null);
            State.lastSourceName = lastSource;

            State.adCleaner = setInterval(() => Utils.hideAds(), 500);
            this.startUrlWatcher();
        },

        startUrlWatcher() {
            State.lastUrl = location.href;
            State.urlWatchInterval = setInterval(() => {
                const currentUrl = location.href;
                if (currentUrl !== State.lastUrl) {
                    State.lastUrl = currentUrl;
                    if (!State._switching) {
                        this.onUrlChanged();
                    }
                }
            }, 600);

            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            const self = this;
            history.pushState = function (...args) {
                originalPushState.apply(this, args);
                setTimeout(() => { if (!State._switching) self.onUrlChanged(); }, 100);
            };
            history.replaceState = function (...args) {
                originalReplaceState.apply(this, args);
                setTimeout(() => { if (!State._switching) self.onUrlChanged(); }, 100);
            };
            window.addEventListener('popstate', () => {
                setTimeout(() => { if (!State._switching) self.onUrlChanged(); }, 100);
            });

            const observer = new MutationObserver(() => {
                if (State.sidebarVisible) {
                    const eps = Utils.extractEpisodes();
                    if (eps.length) this.renderEpisodesSidebar(eps, this.switchEpisode.bind(this));
                }
            });
            const targetNode = document.querySelector('#player-container') || document.querySelector('.mod_player') || document.querySelector('#ykPlayer');
            if (targetNode) {
                observer.observe(targetNode, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['src', 'class'],
                });
            }
            State._episodeObserver = observer;
        },

        onUrlChanged() {
            if (State.playing && this.currentApi && State.iframeEl) {
                const isVideo = /v\.qq\.com|iqiyi\.com|youku\.com|bilibili\.com|mgtv\.com|sohu\.com|le\.com|pptv\.com|1905\.com|acfun\.cn/.test(location.hostname);
                if (isVideo) {
                    const newUrl = Utils.buildResolveUrl(this.currentApi);
                    State.iframeEl.src = newUrl;
                    Utils.startMediaKiller();
                    this.toast('已切换集数', 1500);
                }
            }
        },

        injectStyles() {
            GM_addStyle(`
                #aether-root {
                    position: fixed;
                    z-index: 2147483647;
                    font-family: ${DESIGN.font.family};
                    font-weight: ${DESIGN.font.weight.regular};
                    letter-spacing: ${DESIGN.font.letterSpacing};
                    user-select: none;
                    pointer-events: none;
                }
                #aether-root * { pointer-events: auto; box-sizing: border-box; }

                #aether-btn {
                    width: 56px;
                    height: 56px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, ${DESIGN.colors.royalPurple}, ${DESIGN.colors.electricLavender});
                    box-shadow: 0 8px 28px rgba(74,44,138,0.5), 0 0 0 2px rgba(192,132,252,0.2);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease;
                    color: white;
                    font-size: 18px;
                    font-weight: ${DESIGN.font.weight.bold};
                    letter-spacing: 0.02em;
                    position: relative;
                    pointer-events: auto;
                }
                #aether-btn:hover {
                    transform: scale(1.08);
                    box-shadow: 0 12px 36px rgba(74,44,138,0.7), 0 0 0 4px rgba(192,132,252,0.4);
                }
                #aether-btn:active { transform: scale(0.94); }
                #aether-btn .glow {
                    position: absolute;
                    inset: -4px;
                    border-radius: 50%;
                    background: conic-gradient(from 0deg, ${DESIGN.colors.electricLavender}, ${DESIGN.colors.cyanGlow}, ${DESIGN.colors.electricLavender});
                    opacity: 0;
                    transition: opacity 0.4s;
                    z-index: -1;
                    filter: blur(8px);
                    animation: spin 6s linear infinite;
                }
                #aether-btn:hover .glow { opacity: 0.6; }
                @keyframes spin { to { transform: rotate(360deg); } }

                #aether-panel {
                    position: absolute;
                    top: 64px;
                    left: 0;
                    width: 340px;
                    max-height: 70vh;
                    background: ${DESIGN.colors.glassBg};
                    backdrop-filter: blur(24px) saturate(1.6);
                    -webkit-backdrop-filter: blur(24px) saturate(1.6);
                    border: 1px solid rgba(192,132,252,0.2);
                    border-radius: ${DESIGN.radius};
                    box-shadow: ${DESIGN.shadow};
                    padding: 18px 16px 16px;
                    display: none;
                    flex-direction: column;
                    gap: 12px;
                    color: ${DESIGN.colors.pureWhite};
                    opacity: 0;
                    transform: translateY(-8px) scale(0.96);
                    transition: opacity 0.25s ease, transform 0.25s ease;
                    pointer-events: auto;
                    overflow: hidden;
                }
                #aether-panel.open {
                    display: flex;
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }

                .aether-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 14px;
                    font-weight: ${DESIGN.font.weight.medium};
                    color: ${DESIGN.colors.softLilac};
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(192,132,252,0.15);
                }
                .aether-header .close {
                    cursor: pointer;
                    font-size: 20px;
                    line-height: 1;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                    background: none;
                    border: none;
                    color: inherit;
                }
                .aether-header .close:hover { opacity: 1; }

                .aether-control-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 6px 10px;
                    background: rgba(255,255,255,0.04);
                    border-radius: 10px;
                    font-size: 13px;
                    color: ${DESIGN.colors.pureWhite};
                    gap: 12px;
                }
                .aether-control-row .left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .aether-control-row .left label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                }
                .aether-control-row input[type="checkbox"] {
                    width: 40px;
                    height: 22px;
                    border-radius: 11px;
                    appearance: none;
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.1);
                    transition: all 0.25s ease;
                    position: relative;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .aether-control-row input[type="checkbox"]:checked {
                    background: ${DESIGN.colors.electricLavender};
                    border-color: ${DESIGN.colors.softLilac};
                }
                .aether-control-row input[type="checkbox"]::after {
                    content: "";
                    position: absolute;
                    top: 2px;
                    left: 2px;
                    width: 16px;
                    height: 16px;
                    background: white;
                    border-radius: 50%;
                    transition: transform 0.25s ease;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .aether-control-row input[type="checkbox"]:checked::after {
                    transform: translateX(18px);
                }

                .aether-refresh-btn {
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(192,132,252,0.2);
                    border-radius: 8px;
                    padding: 4px 12px;
                    font-size: 13px;
                    color: ${DESIGN.colors.pureWhite};
                    cursor: pointer;
                    transition: all 0.15s ease;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-family: inherit;
                    white-space: nowrap;
                    flex-shrink: 0;
                }
                .aether-refresh-btn:hover {
                    background: rgba(192,132,252,0.2);
                    border-color: ${DESIGN.colors.softLilac};
                    transform: scale(1.03);
                }
                .aether-refresh-btn:active {
                    transform: scale(0.95);
                }
                .aether-refresh-btn .icon {
                    font-size: 16px;
                    line-height: 1;
                }

                .aether-list {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    overflow-y: auto;
                    max-height: 40vh;
                    padding-right: 4px;
                }
                .aether-list::-webkit-scrollbar { width: 4px; }
                .aether-list::-webkit-scrollbar-thumb { background: ${DESIGN.colors.softLilac}; border-radius: 4px; }

                .aether-item {
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 10px;
                    padding: 10px 14px;
                    font-size: 13px;
                    font-weight: ${DESIGN.font.weight.medium};
                    color: ${DESIGN.colors.pureWhite};
                    cursor: pointer;
                    transition: all 0.15s ease;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .aether-item:hover {
                    background: rgba(192,132,252,0.2);
                    border-color: ${DESIGN.colors.softLilac};
                    transform: translateX(4px);
                }
                .aether-item.active {
                    background: linear-gradient(135deg, ${DESIGN.colors.royalPurple}, ${DESIGN.colors.electricLavender});
                    border-color: ${DESIGN.colors.softLilac};
                    box-shadow: 0 4px 12px rgba(74,44,138,0.4);
                }
                .aether-item .badge {
                    font-size: 10px;
                    opacity: 0.6;
                    color: ${DESIGN.colors.cyanGlow};
                }

                .aether-overlay-embedded {
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    background: #000;
                    border-radius: inherit;
                    overflow: hidden;
                    z-index: 2147483647 !important;
                    pointer-events: auto;
                    box-shadow: none;
                }
                .aether-overlay-embedded iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    display: block;
                    pointer-events: auto;
                }

                #aether-episode-sidebar {
                    position: absolute;
                    top: 0;
                    right: 0;
                    bottom: 0;
                    width: 200px;
                    background: rgba(26,11,46,0.85);
                    backdrop-filter: blur(20px) saturate(1.8);
                    -webkit-backdrop-filter: blur(20px) saturate(1.8);
                    border-left: 1px solid rgba(192,132,252,0.3);
                    box-shadow: -8px 0 30px rgba(0,0,0,0.5);
                    padding: 12px 8px;
                    overflow-y: auto;
                    z-index: 2147483647;
                    display: none;
                    flex-direction: column;
                    gap: 6px;
                    border-radius: 0 12px 12px 0;
                    transition: transform 0.3s ease, opacity 0.3s ease;
                    transform: translateX(100%);
                    opacity: 0;
                }
                #aether-episode-sidebar.visible {
                    display: flex;
                    transform: translateX(0);
                    opacity: 1;
                }
                #aether-episode-sidebar::-webkit-scrollbar { width: 4px; }
                #aether-episode-sidebar::-webkit-scrollbar-thumb { background: ${DESIGN.colors.softLilac}; border-radius: 4px; }

                .aether-sidebar-title {
                    color: ${DESIGN.colors.softLilac};
                    font-weight: ${DESIGN.font.weight.medium};
                    font-size: 14px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(192,132,252,0.2);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-shrink: 0;
                }
                .aether-sidebar-title .close-sidebar {
                    cursor: pointer;
                    font-size: 18px;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                    background: none;
                    border: none;
                    color: inherit;
                }
                .aether-sidebar-title .close-sidebar:hover { opacity: 1; }

                .aether-sidebar-item {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 8px;
                    padding: 8px 10px;
                    font-size: 12px;
                    color: ${DESIGN.colors.pureWhite};
                    cursor: pointer;
                    transition: all 0.15s ease;
                    text-align: center;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .aether-sidebar-item:hover {
                    background: rgba(192,132,252,0.2);
                    border-color: ${DESIGN.colors.softLilac};
                    transform: scale(1.02);
                }
                .aether-sidebar-item.active {
                    background: ${DESIGN.colors.electricLavender};
                    border-color: ${DESIGN.colors.softLilac};
                    font-weight: ${DESIGN.font.weight.bold};
                }

                #aether-toast {
                    position: fixed;
                    top: 24px;
                    left: 50%;
                    transform: translateX(-50%) translateY(-20px);
                    background: rgba(26,11,46,0.88);
                    backdrop-filter: blur(12px);
                    color: ${DESIGN.colors.softLilac};
                    font-size: 14px;
                    font-weight: ${DESIGN.font.weight.medium};
                    padding: 10px 24px;
                    border-radius: 30px;
                    border: 1px solid rgba(192,132,252,0.3);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    pointer-events: none;
                    opacity: 0;
                    z-index: 2147483647;
                    transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);
                }
                #aether-toast.show {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }

                @media (max-width:600px) {
                    #aether-panel { width: calc(100vw - 32px); left: 16px; top: 72px; max-height: 60vh; }
                    #aether-episode-sidebar { width: 160px; }
                    .aether-control-row { flex-wrap: wrap; gap: 6px; }
                    .aether-refresh-btn { padding: 2px 10px; font-size: 12px; }
                }
            `);
        },

        createElements() {
            const root = document.createElement('div');
            root.id = 'aether-root';
            document.body.appendChild(root);

            const btn = document.createElement('div');
            btn.id = 'aether-btn';
            btn.innerHTML = `<span>Æ</span><div class="glow"></div>`;
            root.appendChild(btn);
            this.btn = btn;

            const panel = document.createElement('div');
            panel.id = 'aether-panel';
            panel.innerHTML = `
                <div class="aether-header">
                    <span class="view-title" id="view-title">解析源</span>
                    <button class="close" id="aether-panel-close">✕</button>
                </div>
                <div class="aether-control-row">
                    <div class="left">
                        <label>
                            <span>自动解析</span>
                            <input type="checkbox" id="aether-auto-toggle">
                        </label>
                    </div>
                    <button class="aether-refresh-btn" id="aether-refresh-btn">
                        <span class="icon">↻</span> 刷新
                    </button>
                </div>
                <div class="aether-list" id="aether-list"></div>
            `;
            root.appendChild(panel);
            this.panel = panel;
            this.list = document.getElementById('aether-list');
            this.autoToggle = document.getElementById('aether-auto-toggle');
            this.refreshBtn = document.getElementById('aether-refresh-btn');
            this.viewTitle = document.getElementById('view-title');

            const sidebar = document.createElement('div');
            sidebar.id = 'aether-episode-sidebar';
            sidebar.innerHTML = `
                <div class="aether-sidebar-title">
                    <span>📋 选集</span>
                    <button class="close-sidebar" id="sidebar-close">✕</button>
                </div>
                <div id="sidebar-list" style="display:flex;flex-direction:column;gap:4px;overflow-y:auto;"></div>
            `;
            document.body.appendChild(sidebar);
            this.sidebar = sidebar;
            this.sidebarList = document.getElementById('sidebar-list');
            this.sidebarClose = document.getElementById('sidebar-close');

            const toast = document.createElement('div');
            toast.id = 'aether-toast';
            document.body.appendChild(toast);
            this.toast = toast;

            this.container = root;
        },

        bindEvents() {
            const self = this;
            const btn = this.btn;
            let dragActive = false;
            let dragMoved = false;
            let startX = 0, startY = 0;
            let origLeft = 0, origTop = 0;
            let moveHandler = null, upHandler = null;
            const btnSize = 56;

            this.refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.refreshPlayer();
            });

            const onDragMove = (e) => {
                if (!dragActive) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                    dragMoved = true;
                }
                let nx = origLeft + dx;
                let ny = origTop + dy;

                const videoRect = Utils.getVideoRect();
                if (videoRect) {
                    const cx = nx + btnSize/2;
                    const cy = ny + btnSize/2;
                    if (cx > videoRect.left && cx < videoRect.right &&
                        cy > videoRect.top && cy < videoRect.bottom) {
                        nx = videoRect.right + 10;
                        ny = Math.max(8, Math.min(window.innerHeight - btnSize - 8, ny));
                    }
                }

                nx = Math.max(8, Math.min(window.innerWidth - btnSize - 8, nx));
                ny = Math.max(8, Math.min(window.innerHeight - btnSize - 8, ny));

                self.container.style.left = nx + 'px';
                self.container.style.top = ny + 'px';
            };

            const onDragUp = (e) => {
                if (!dragActive) return;
                dragActive = false;
                if (moveHandler) {
                    document.removeEventListener('mousemove', moveHandler);
                    moveHandler = null;
                }
                if (upHandler) {
                    document.removeEventListener('mouseup', upHandler);
                    upHandler = null;
                }
                if (self.overlay) {
                    self.overlay.style.pointerEvents = 'auto';
                    if (self.iframe) self.iframe.style.pointerEvents = 'auto';
                }
                if (!dragMoved) {
                    self.handleBtnClick();
                } else {
                    const rect = self.container.getBoundingClientRect();
                    GM_setValue('aether_pos', { left: rect.left, top: rect.top });
                }
                dragMoved = false;
                window.removeEventListener('blur', onBlur);
            };

            const onBlur = () => {
                if (dragActive) {
                    onDragUp(null);
                }
            };

            btn.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                if (moveHandler) {
                    document.removeEventListener('mousemove', moveHandler);
                }
                if (upHandler) {
                    document.removeEventListener('mouseup', upHandler);
                }
                const rect = self.container.getBoundingClientRect();
                dragActive = true;
                dragMoved = false;
                startX = e.clientX;
                startY = e.clientY;
                origLeft = rect.left;
                origTop = rect.top;
                if (self.overlay) {
                    self.overlay.style.pointerEvents = 'none';
                    if (self.iframe) self.iframe.style.pointerEvents = 'none';
                }
                moveHandler = onDragMove;
                upHandler = onDragUp;
                document.addEventListener('mousemove', moveHandler);
                document.addEventListener('mouseup', upHandler);
                window.addEventListener('blur', onBlur);
                e.preventDefault();
            });

            document.getElementById('aether-panel-close').addEventListener('click', () => this.closePanel());

            this.autoToggle.addEventListener('change', (e) => {
                State.autoSwitchEnabled = e.target.checked;
                GM_setValue('aether_auto_switch', State.autoSwitchEnabled);
                this.updateToggleUI();
                this.toast(State.autoSwitchEnabled ? '自动解析已开启' : '自动解析已关闭', 1500);
            });

            this.sidebarClose.addEventListener('click', () => {
                this.hideSidebar();
            });

            this.list.addEventListener('click', (e) => {
                const item = e.target.closest('.aether-item');
                if (!item) return;
                const name = item.dataset.name;
                if (name) {
                    const api = APIS.find(a => a.name === name);
                    if (api) this.playSource(api);
                }
            });

            GM_registerMenuCommand('Æther Player — 切换面板', () => {
                if (this.panel.classList.contains('open')) this.closePanel();
                else this.openPanel();
            });
        },

        refreshPlayer() {
            if (State.iframeEl && State.iframeEl.src) {
                const oldSrc = State.iframeEl.src;
                State.iframeEl.src = '';
                setTimeout(() => {
                    State.iframeEl.src = oldSrc;
                    Utils.startMediaKiller();
                    this.toast('刷新播放器', 1000);
                }, 50);
            } else {
                this.toast('没有正在播放的视频', 1500);
            }
        },

        handleBtnClick() {
            if (this.panel.classList.contains('open')) {
                this.closePanel();
            } else {
                this.openPanel();
            }
        },

        toggleSidebar() {
            if (State.sidebarVisible) {
                this.hideSidebar();
            } else {
                this.showSidebar();
            }
        },

        showSidebar() {
            const container = Utils.findPlayerContainer();
            if (!container) {
                this.toast('未找到播放器区域', 2000);
                return;
            }
            if (this.sidebar.parentNode !== container) {
                container.style.position = 'relative';
                container.appendChild(this.sidebar);
            }
            let eps = State.episodes.length ? State.episodes : Utils.extractEpisodes();
            if (!eps || !eps.length) {
                eps = Utils.extractEpisodes();
                State.episodes = eps;
            }
            this.renderEpisodesSidebar(eps, this.switchEpisode.bind(this));
            this.sidebar.classList.add('visible');
            State.sidebarVisible = true;
            this.closePanel();
        },

        hideSidebar() {
            this.sidebar.classList.remove('visible');
            State.sidebarVisible = false;
        },

        renderEpisodesSidebar(episodes, onClick) {
            const list = this.sidebarList;
            list.innerHTML = '';
            if (!episodes || episodes.length === 0) {
                list.innerHTML = `<div style="color:rgba(255,255,255,0.5);text-align:center;padding:20px 0;font-size:12px;">未识别到选集</div>`;
                return;
            }
            episodes.forEach(ep => {
                const div = document.createElement('div');
                div.className = 'aether-sidebar-item';
                div.textContent = ep.title || '未命名';
                div.dataset.url = ep.url;
                div.addEventListener('click', () => {
                    if (onClick) onClick(ep);
                    list.querySelectorAll('.aether-sidebar-item').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');
                });
                list.appendChild(div);
            });
            const currentUrl = location.href;
            list.querySelectorAll('.aether-sidebar-item').forEach(el => {
                if (el.dataset.url === currentUrl) el.classList.add('active');
            });
        },

        switchEpisode(ep) {
            if (!ep || !ep.url || State._switching) return;
            State._switching = true;
            const state = { ...history.state };
            history.pushState(state, '', ep.url);
            State.lastUrl = ep.url;

            if (this.currentApi && State.iframeEl) {
                const newUrl = Utils.buildResolveUrl(this.currentApi);
                State.iframeEl.src = newUrl;
                this.toast('切换集数', 1000);
            } else {
                location.href = ep.url;
            }
            Utils.startMediaKiller();
            setTimeout(() => { State._switching = false; }, 300);
            this.hideSidebar();
        },

        loadPosition() {
            const pos = GM_getValue('aether_pos', { left: 20, top: 120 });
            this.container.style.left = pos.left + 'px';
            this.container.style.top = pos.top + 'px';
        },

        updateToggleUI() {
            if (this.autoToggle) {
                this.autoToggle.checked = State.autoSwitchEnabled;
            }
        },

        openPanel() {
            this.renderSources();
            this.panel.classList.add('open');
            this.panel.style.display = 'flex';
            State.panelOpen = true;
        },

        closePanel() {
            this.panel.classList.remove('open');
            setTimeout(() => { this.panel.style.display = 'none'; }, 300);
            State.panelOpen = false;
        },

        renderSources() {
            const sorted = Utils.sortApis(APIS);
            this.list.innerHTML = '';
            sorted.forEach(api => {
                const div = document.createElement('div');
                div.className = 'aether-item' + (api.name === State.activeSource ? ' active' : '');
                div.dataset.name = api.name;
                const score = Math.round(Utils.getScore(api.name) * 100);
                div.innerHTML = `<span>${api.name}</span><span class="badge">${score}%</span>`;
                this.list.appendChild(div);
            });
        },

        // ─── 核心播放 ──────────────────────────────────────────
        playSource(api) {
            Utils.clearAllTimers();
            document.querySelectorAll('.aether-overlay-embedded').forEach(el => el.remove());

            if (State.playing) {
                this.closePlayerImmediate();
            }

            Utils.startMediaKiller();

            GM_setValue('aether_last_source', api.name);
            State.lastSourceName = api.name;

            const url = Utils.buildResolveUrl(api);
            State.activeSource = api.name;
            this.currentApi = api;
            State.failedSources.clear();
            this.closePanel();
            State.manualPicked = true;

            const container = Utils.findPlayerContainer();
            if (!container) {
                this.toast('未找到播放器区域，请刷新页面', 3000);
                return;
            }

            Utils._removeNativeMedia(container);

            const containerStyle = window.getComputedStyle(container);
            if (containerStyle.position === 'static') {
                container.style.position = 'relative';
            }

            const overlay = document.createElement('div');
            overlay.className = 'aether-overlay-embedded';
            overlay.innerHTML = `
                <iframe id="aether-iframe-${Date.now()}" 
                        allow="autoplay; fullscreen" 
                        allowfullscreen="true" 
                        webkitallowfullscreen="true"
                        mozallowfullscreen="true"
                        loading="eager"
                        src="${url}">
                </iframe>
            `;
            const iframeEl = overlay.querySelector('iframe');

            iframeEl.addEventListener('load', () => {
                if (State.activeSource) {
                    Utils.recordSuccess(State.activeSource);
                }
                if (State.checkInterval) {
                    clearInterval(State.checkInterval);
                    State.checkInterval = null;
                }
                Utils.startMediaKiller();
                this.toast('播放加载成功', 1500);
            });

            iframeEl.addEventListener('error', () => {
                this.toast('加载失败，自动切换', 2000);
                overlay.remove();
                State.playing = false;
                this.autoSwitch();
            });

            container.insertBefore(overlay, container.firstChild);
            overlay.style.display = 'block';

            State.overlayEl = overlay;
            State.iframeEl = iframeEl;
            State.playing = true;

            State.protectionInterval = setInterval(() => {
                if (!State.playing) {
                    clearInterval(State.protectionInterval);
                    State.protectionInterval = null;
                    return;
                }
                if (!document.contains(overlay) || overlay.style.display === 'none') {
                    if (container && container.parentNode) {
                        container.insertBefore(overlay, container.firstChild);
                        overlay.style.display = 'block';
                    }
                }
                Utils._removeNativeMedia(container);
                overlay.style.setProperty('z-index', '2147483647', 'important');
            }, 500);

            Utils.hideAds();

            let checkCount = 0;
            State.checkInterval = setInterval(() => {
                if (!State.playing) {
                    clearInterval(State.checkInterval);
                    State.checkInterval = null;
                    return;
                }
                checkCount++;
                if (checkCount > 20) {
                    clearInterval(State.checkInterval);
                    State.checkInterval = null;
                    this.toast('加载超时，自动切换...', 2000);
                    this.autoSwitch();
                }
            }, 500);

            this.toast(`正在加载 ${api.name}...`, 3000);
        },

        closePlayerImmediate() {
            document.querySelectorAll('.aether-overlay-embedded').forEach(el => el.remove());
            State.overlayEl = null;
            State.iframeEl = null;
            State.playing = false;
            State.activeSource = null;
            State.currentApi = null;
            Utils.stopMediaKiller();
            if (State.protectionInterval) {
                clearInterval(State.protectionInterval);
                State.protectionInterval = null;
            }
            this.hideSidebar();
        },

        autoSwitch() {
            if (!State.autoSwitchEnabled) {
                this.toast('自动解析已关闭，请手动选择源', 2000);
                return;
            }
            if (State.isAutoSwitch) return;
            if (State.manualPicked) {
                this.toast('您已手动选择解析源，自动切换已停用', 2000);
                return;
            }
            const now = Date.now();
            if (now - State.lastSwitchTime < 3000) return;
            State.lastSwitchTime = now;
            State.isAutoSwitch = true;

            if (State.activeSource) {
                State.failedSources.add(State.activeSource);
                Utils.recordFail(State.activeSource);
            }

            const sorted = Utils.sortApis(APIS);
            for (const api of sorted) {
                if (!State.failedSources.has(api.name)) {
                    this.playSource(api);
                    State.isAutoSwitch = false;
                    this.toast(`自动切换至 ${api.name}`, 2000);
                    return;
                }
            }
            this.toast('所有源均失败，请刷新重试', 3000);
            State.isAutoSwitch = false;
        },

        toast(msg, duration = 2000) {
            if (duration === undefined || duration === null) duration = 2000;
            if (duration === 0) duration = 9999;
            this.toast.textContent = msg;
            this.toast.classList.add('show');
            clearTimeout(State.toastTimer);
            State.toastTimer = setTimeout(() => {
                this.toast.classList.remove('show');
            }, duration);
        },
    };

    // ─── 启动 ──────────────────────────────────────────────────
    function bootstrap() {
        const isVideo = /v\.qq\.com|iqiyi\.com|youku\.com|bilibili\.com|mgtv\.com|sohu\.com|le\.com|pptv\.com|1905\.com|acfun\.cn/.test(location.hostname);
        if (!isVideo) return;

        UI.init();

        setTimeout(() => {
            const lastSourceName = State.lastSourceName;
            let targetApi = null;
            if (lastSourceName) {
                targetApi = APIS.find(a => a.name === lastSourceName);
            }
            if (!targetApi && State.autoSwitchEnabled) {
                targetApi = APIS[0];
            }
            if (targetApi) {
                UI.playSource(targetApi);
            } else {
                UI.toast('自动解析已关闭，点击Æ按钮手动选择', 3000);
            }
        }, 1200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();