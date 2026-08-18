// ==UserScript==
// @name         1080zyk 播放列表优化
// @namespace    https://github.com/Story5/tampermonkey-js
// @version      1.1.5
// @description  统一播放列表，去除 zykyun 和 1080zyk 重复项，支持源切换、日期展示、点击复制链接、手动切换正/倒序、一键复制全部链接、按年复制
// @author       Story5
// @license      MIT
// @match        *://1080zyk1.com/*
// @match        *://www.1080zyk1.com/*
// @include      *://*1080zyk*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 调试开关 ====================
    const DEBUG = true;
    const TAG = '[1080zyk]';
    function log(...args) { if (DEBUG) console.log(TAG, ...args); }
    function warn(...args) { console.warn(TAG, ...args); }

    log('=== 脚本启动 ===');
    log('URL:', location.href);
    log('readyState:', document.readyState);

    // ==================== 页面检测 ====================
    // 仅在 vod-detail 详情页运行
    if (!/m=vod-detail/.test(location.search)) {
        log('跳过：非 vod-detail 页面，search =', location.search);
        return;
    }
    log('页面检测通过，vod-detail 详情页');

    // ==================== 常量 ====================
    const SOURCE_NAMES = ['zykyun', '1080zyk'];
    const CONTAINER_IDS = ['play_1', 'play_2'];
    const PANEL_ID = 'zyk-opt-panel';
    const TOAST_ID = 'zyk-toast';
    const MAX_RETRIES = 50; // 10 秒超时 (50 * 200ms)
    const RETRY_INTERVAL = 200;

    // ==================== 样式注入 ====================
    const CSS = `
#${PANEL_ID} {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    margin: 12px 0;
    background: #fff;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

/* 源切换标签栏 */
.zyk-tabs {
    display: flex;
    border-bottom: 2px solid #f0f0f0;
    background: #fafafa;
    padding: 0 12px;
}

.zyk-tab {
    flex: 0 0 auto;
    padding: 10px 24px;
    border: none;
    background: none;
    font-size: 14px;
    font-weight: 500;
    color: #888;
    cursor: pointer;
    position: relative;
    transition: color 0.2s, background 0.2s;
    outline: none;
    border-radius: 0;
}

.zyk-tab:hover {
    color: #333;
    background: rgba(0,0,0,0.03);
}

.zyk-tab.active {
    color: #4A90D9;
    font-weight: 600;
}

.zyk-tab.active::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: #4A90D9;
}

/* 统计信息 */
.zyk-info {
    padding: 8px 16px;
    font-size: 12px;
    color: #999;
    background: #fafafa;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
}

.zyk-info .zyk-info-text {
    flex: 1;
}

.zyk-info strong {
    color: #666;
}

.zyk-sort-btn {
    padding: 3px 10px;
    border: 1px solid #d8d8d8;
    border-radius: 4px;
    background: #fff;
    color: #666;
    font-size: 12px;
    line-height: 1.4;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
}

.zyk-sort-btn:hover {
    border-color: #4A90D9;
    color: #4A90D9;
}

.zyk-sort-btn:active {
    background: #f0f7ff;
}

/* 全部复制按钮（复用 sort-btn 基础样式，hover 用绿色强调） */
.zyk-sort-btn.zyk-copy-all:hover {
    border-color: #52c41a;
    color: #52c41a;
}

.zyk-sort-btn.zyk-copy-all:active {
    background: #f6ffed;
}

.zyk-sort-btn.zyk-copy-all.copied {
    border-color: #52c41a;
    color: #fff;
    background: #52c41a;
}

/* 日期网格（主滚动容器） */
.zyk-grid {
    max-height: 520px;
    overflow-y: auto;
    padding: 12px 0;
    -webkit-overflow-scrolling: touch;
}

/* 日期按钮 */
.zyk-date {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 7px 4px;
    border: 1px solid #e8e8e8;
    border-radius: 5px;
    background: #fafafa;
    color: #333;
    font-size: 13px;
    font-family: "SF Mono", "Menlo", "Monaco", monospace;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: all 0.15s ease;
    outline: none;
    user-select: none;
    -webkit-user-select: none;
    line-height: 1.2;
    text-align: center;
}

.zyk-date:hover {
    background: #4A90D9;
    color: #fff;
    border-color: #4A90D9;
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(74,144,217,0.25);
}

.zyk-date:active {
    transform: scale(0.96);
    transition: transform 0.08s ease;
}

.zyk-date.copied {
    background: #4CAF50;
    color: #fff;
    border-color: #4CAF50;
    animation: zyk-flash 0.6s ease;
}

@keyframes zyk-flash {
    0%   { transform: scale(1); }
    30%  { transform: scale(1.05); }
    100% { transform: scale(1); }
}

/* Toast 提示 */
#${TOAST_ID} {
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: #fff;
    padding: 10px 22px;
    border-radius: 6px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    z-index: 99999;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease, transform 0.25s ease;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    display: flex;
    align-items: center;
    gap: 8px;
}

#${TOAST_ID}.show {
    opacity: 1;
    transform: translateX(-50%) translateY(-4px);
}

#${TOAST_ID} .zyk-toast-icon {
    font-size: 16px;
}

#${TOAST_ID} .zyk-toast-link {
    color: #9eceff;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    margin-left: 4px;
}

/* 年份分组 */
.zyk-year-group {
    margin-bottom: 4px;
}

.zyk-year-header {
    padding: 8px 14px 6px;
    font-size: 13px;
    font-weight: 600;
    color: #555;
    border-bottom: 1px solid #f0f0f0;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.zyk-year-header .zyk-year-num {
    color: #4A90D9;
}

.zyk-year-header .zyk-year-count {
    font-weight: 400;
    font-size: 12px;
    color: #999;
}

/* 年份标题右侧的「按年复制」按钮 */
.zyk-year-copy-btn {
    margin-left: auto;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 400;
    color: #67c23a;
    background: #f0f9eb;
    border: 1px solid #e1f3d8;
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
    line-height: 1.4;
}

.zyk-year-copy-btn:hover {
    background: #67c23a;
    color: #fff;
    border-color: #67c23a;
}

.zyk-year-copy-btn.copied {
    background: #67c23a;
    color: #fff;
    border-color: #67c23a;
}

.zyk-year-copy-btn:active {
    background: #5daf34;
}

/* 日期子网格（年分组内） */
.zyk-year-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(95px, 1fr));
    gap: 6px;
    padding: 0 12px 8px;
}

/* 滚动条美化 */
.zyk-grid::-webkit-scrollbar {
    width: 5px;
}
.zyk-grid::-webkit-scrollbar-track {
    background: transparent;
}
.zyk-grid::-webkit-scrollbar-thumb {
    background: #d0d0d0;
    border-radius: 3px;
}
.zyk-grid::-webkit-scrollbar-thumb:hover {
    background: #b0b0b0;
}
`;

    // ==================== 工具函数 ====================

    function injectStyles() {
        log('注入 CSS 样式');
        const style = document.createElement('style');
        style.id = 'zyk-opt-styles';
        style.textContent = CSS;
        document.head.appendChild(style);
        log('CSS 注入完成');
    }

    /**
     * 复制文本到剪贴板
     * 优先使用 Navigator Clipboard API，降级到 execCommand
     */
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
                document.body.appendChild(ta);
                ta.select();
                ta.setSelectionRange(0, text.length);
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                return ok;
            } catch (e2) {
                return false;
            }
        }
    }

    /**
     * 从播放列表容器中提取集数数据（通用版）
     * 用 $ 分割文本，左边是展示文案，右边是 URL；
     * 优先从 <input name="copy_sel"> 取直链（更可靠）。
     * 自动识别日期格式（如 20260719期 / 20260719）以便后续按年分组。
     * @param {string} containerId - DOM 元素 ID (如 'play_1')
     * @returns {Array<{label: string, url: string, dateStr: string|null}>}
     */
    function extractEpisodes(containerId) {
        const container = document.getElementById(containerId);
        log(`提取数据: #${containerId}`, container ? '存在' : '不存在');
        if (!container) return [];

        const items = container.querySelectorAll('li a[href*="vod-play"]');
        log(`  - 找到 ${items.length} 个链接`);
        const episodes = [];

        items.forEach((a, i) => {
            const text = (a.textContent || '').trim();

            // 用 $ 分割：左边展示文案，右边 URL（用 lastIndexOf 防止 URL 里含 $）
            const dollarIdx = text.lastIndexOf('$');
            let label = '', urlFromText = '';
            if (dollarIdx >= 0) {
                label = text.substring(0, dollarIdx).trim();
                urlFromText = text.substring(dollarIdx + 1).trim();
            } else {
                label = text; // 兜底：无 $ 则整段当文案
            }

            // 优先用 checkbox 的 value 作为直链
            const checkbox = a.querySelector('input[name="copy_sel"]');
            const url = (checkbox && checkbox.value) ? checkbox.value : urlFromText;

            // 判断是否日期格式：纯 6~8 位数字，可选「期」后缀
            const dateMatch = label.match(/^(\d{6,8})期?$/);
            const dateStr = dateMatch ? dateMatch[1] : null;
            // 展示文案：日期则去「期」只留数字，否则保留完整文案
            const display = dateStr ? dateStr : label;

            if (url && label) {
                episodes.push({ label: display, url, dateStr });
            }
            if (i < 3 || i >= items.length - 3) {
                log(`  - [${i}] label="${display}" dateStr=${dateStr} url="${url.substring(0, 50)}..."`);
            }
        });

        // 排序 / 分组决策在 renderGrid 中统一处理（提取阶段不做排序）
        log(`  - 提取完成: ${episodes.length} 项`);
        return episodes;
    }

    // ==================== Toast 提示 ====================

    let toastTimer = null;

    function getToast() {
        let toast = document.getElementById(TOAST_ID);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            document.body.appendChild(toast);
        }
        return toast;
    }

    /**
     * 显示复制成功的 toast
     * @param {string} label - 展示文案（日期或集数）
     * @param {string} url - 视频链接
     */
    function showToast(label, url) {
        const toast = getToast();

        // 显示域名部分作为简短提示
        let urlPreview = '';
        try {
            const u = new URL(url);
            urlPreview = u.hostname + u.pathname.substring(0, 30);
        } catch {
            urlPreview = url.substring(0, 40);
        }

        toast.innerHTML = `
            <span class="zyk-toast-icon">&#10003;</span>
            已复制 <strong>${label}</strong>
            <span class="zyk-toast-link">${urlPreview}...</span>
        `;
        toast.classList.add('show');

        // 清除之前的定时器
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    // ==================== UI 构建 ====================

    /**
     * 构建统一的播放列表面板
     * @param {Array<{name: string, episodes: Array}>} sourcesData
     * @returns {HTMLElement}
     */
    function buildPanel(sourcesData) {
        log('buildPanel 开始...');
        const panel = document.createElement('div');
        panel.id = PANEL_ID;

        // -- 标签栏 --
        const tabs = document.createElement('div');
        tabs.className = 'zyk-tabs';

        sourcesData.forEach((src, idx) => {
            const tab = document.createElement('button');
            tab.className = 'zyk-tab';
            tab.textContent = src.name;
            tab.dataset.index = String(idx);
            tabs.appendChild(tab);
        });

        panel.appendChild(tabs);

        // -- 统计信息 --
        const info = document.createElement('div');
        info.className = 'zyk-info';
        panel.appendChild(info);

        // -- 日期网格 --
        const grid = document.createElement('div');
        grid.className = 'zyk-grid';
        panel.appendChild(grid);

        // -- 状态 --
        let activeIndex = 0;
        // 每个播放源当前的排序方向：'asc' 正序 / 'desc' 倒序
        // 初始为 null，首次渲染时根据数据类型决定默认值
        const sortStates = sourcesData.map(() => null);

        /**
         * 构造单个日期/集数按钮
         */
        function makeDateBtn(ep) {
            const btn = document.createElement('button');
            btn.className = 'zyk-date';
            btn.textContent = ep.label;
            btn.title = `${ep.label} — ${ep.url}`;
            btn.addEventListener('click', async () => {
                const ok = await copyToClipboard(ep.url);
                if (ok) {
                    btn.classList.add('copied');
                    showToast(ep.label, ep.url);
                    setTimeout(() => btn.classList.remove('copied'), 600);
                }
            });
            return btn;
        }

        function renderGrid(index) {
            grid.innerHTML = '';
            const src = sourcesData[index];
            const eps = src.episodes;

            // ---- 统一排序+分组决策 ----
            // 规则：存在日期项 且 日期跨 ≥ 2 个年份 → 按年分组（默认倒序）
            //       否则 → 平铺（默认正序）
            const dateItems = eps.filter(ep => ep.dateStr);
            const yearSet = new Set(dateItems.map(ep => ep.dateStr.substring(0, 4)));
            const shouldGroup = yearSet.size >= 2;

            // 初始化默认排序方向：跨年份日期默认倒序，其他默认正序
            const defaultOrder = shouldGroup ? 'desc' : 'asc';
            if (!sortStates[index]) sortStates[index] = defaultOrder;
            const order = sortStates[index];

            // 更新统计信息 + 排序按钮
            info.innerHTML = `<span class="zyk-info-text"><strong>${src.name}</strong> &middot; 共 <strong>${eps.length}</strong> 集 &middot; 点击可复制视频链接</span>`;
            const sortBtn = document.createElement('button');
            sortBtn.className = 'zyk-sort-btn';
            sortBtn.textContent = order === 'desc' ? '倒序' : '正序';
            sortBtn.title = '点击切换排序方向';
            sortBtn.addEventListener('click', () => {
                sortStates[index] = order === 'desc' ? 'asc' : 'desc';
                renderGrid(index);
            });
            info.appendChild(sortBtn);

            // 全部复制按钮：按当前渲染顺序复制所有视频链接
            const copyAllBtn = document.createElement('button');
            copyAllBtn.className = 'zyk-sort-btn zyk-copy-all';
            copyAllBtn.textContent = '全部复制';
            copyAllBtn.title = '复制当前列表所有视频链接';
            copyAllBtn.addEventListener('click', async () => {
                const cmp = (a, b) =>
                    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
                let ordered;
                if (shouldGroup) {
                    const sortedDates = [...dateItems].sort((a, b) =>
                        order === 'desc' ? b.dateStr.localeCompare(a.dateStr) : a.dateStr.localeCompare(b.dateStr)
                    );
                    const nonDates = eps.filter(ep => !ep.dateStr).sort((a, b) =>
                        order === 'desc' ? cmp(b, a) : cmp(a, b)
                    );
                    ordered = [...sortedDates, ...nonDates];
                } else {
                    ordered = [...eps].sort((a, b) => order === 'desc' ? cmp(b, a) : cmp(a, b));
                }
                const text = ordered.map(ep => ep.url).join('\n');
                const ok = await copyToClipboard(text);
                if (ok) {
                    copyAllBtn.classList.add('copied');
                    showToast(`全部 ${ordered.length} 条`, ordered[0]?.url || '');
                    setTimeout(() => copyAllBtn.classList.remove('copied'), 800);
                }
            });
            info.appendChild(copyAllBtn);

            log(`renderGrid: ${src.name}, shouldGroup=${shouldGroup}, order=${order}, eps=${eps.length}`);

            // 通用 label 比较函数
            const compareLabel = (a, b) =>
                a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });

            if (shouldGroup) {
                // 日期项按当前排序方向排列
                const sortedDates = [...dateItems].sort((a, b) =>
                    order === 'desc' ? b.dateStr.localeCompare(a.dateStr) : a.dateStr.localeCompare(b.dateStr)
                );
                const yearGroups = new Map();
                sortedDates.forEach(ep => {
                    const year = ep.dateStr.substring(0, 4);
                    if (!yearGroups.has(year)) yearGroups.set(year, []);
                    yearGroups.get(year).push(ep);
                });
                const sortedYears = [...yearGroups.keys()].sort((a, b) =>
                    order === 'desc' ? b.localeCompare(a) : a.localeCompare(b)
                );

                sortedYears.forEach(year => {
                    const yearEps = yearGroups.get(year);

                    const group = document.createElement('div');
                    group.className = 'zyk-year-group';

                    // 年份标题 + 右侧按年复制按钮
                    const header = document.createElement('div');
                    header.className = 'zyk-year-header';

                    const titleSpan = document.createElement('span');
                    titleSpan.innerHTML = `<span class="zyk-year-num">${year}</span> 年 &middot; <span class="zyk-year-count">${yearEps.length} 期</span>`;
                    header.appendChild(titleSpan);

                    const yearCopyBtn = document.createElement('button');
                    yearCopyBtn.className = 'zyk-year-copy-btn';
                    yearCopyBtn.textContent = '复制本年';
                    yearCopyBtn.title = `复制 ${year} 年所有视频链接`;
                    yearCopyBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const text = yearEps.map(ep => ep.url).join('\n');
                        const ok = await copyToClipboard(text);
                        if (ok) {
                            yearCopyBtn.classList.add('copied');
                            yearCopyBtn.textContent = '已复制';
                            showToast(`${year} 年 ${yearEps.length} 条`, yearEps[0]?.url || '');
                            setTimeout(() => {
                                yearCopyBtn.classList.remove('copied');
                                yearCopyBtn.textContent = '复制本年';
                            }, 1000);
                        }
                    });
                    header.appendChild(yearCopyBtn);

                    group.appendChild(header);

                    const yearGrid = document.createElement('div');
                    yearGrid.className = 'zyk-year-grid';
                    yearEps.forEach(ep => yearGrid.appendChild(makeDateBtn(ep)));
                    group.appendChild(yearGrid);
                    grid.appendChild(group);
                });

                // 非日期项按当前排序方向追加在分组后面
                const nonDates = eps.filter(ep => !ep.dateStr);
                if (nonDates.length > 0) {
                    nonDates.sort((a, b) => order === 'desc' ? compareLabel(b, a) : compareLabel(a, b));

                    const sep = document.createElement('div');
                    sep.className = 'zyk-year-header';
                    sep.innerHTML = '<span style="color:#999;">其他</span> &middot; <span class="zyk-year-count">' + nonDates.length + ' 项</span>';
                    grid.appendChild(sep);

                    const flatGrid = document.createElement('div');
                    flatGrid.className = 'zyk-year-grid';
                    nonDates.forEach(ep => flatGrid.appendChild(makeDateBtn(ep)));
                    grid.appendChild(flatGrid);
                }
            } else {
                // 平铺：按当前排序方向统一排列
                const sorted = [...eps].sort((a, b) => order === 'desc' ? compareLabel(b, a) : compareLabel(a, b));
                const flatGrid = document.createElement('div');
                flatGrid.className = 'zyk-year-grid';
                sorted.forEach(ep => flatGrid.appendChild(makeDateBtn(ep)));
                grid.appendChild(flatGrid);
            }
        }

        // 绑定标签点击事件
        tabs.querySelectorAll('.zyk-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const idx = parseInt(tab.dataset.index, 10);
                if (idx === activeIndex) return;

                // 切换 active 状态
                tabs.querySelector('.zyk-tab.active')?.classList.remove('active');
                tab.classList.add('active');

                activeIndex = idx;
                renderGrid(idx);
            });
        });

        // 初始渲染
        tabs.querySelector('.zyk-tab[data-index="0"]')?.classList.add('active');
        renderGrid(0);

        log(`buildPanel 完成: panel.id=${panel.id}, childElementCount=${panel.childElementCount}`);
        return panel;
    }

    // ==================== 初始化 ====================

    let retryCount = 0;

    function init() {
        try {
            const play1 = document.getElementById('play_1');
            const play2 = document.getElementById('play_2');

            if (retryCount === 0) {
                log(`首次检查: play_1=${!!play1}, play_2=${!!play2}`);
            }

            if (!play1 || !play2) {
                retryCount++;
                if (retryCount < MAX_RETRIES) {
                    if (retryCount % 10 === 1) {
                        log(`重试 ${retryCount}/${MAX_RETRIES}...`);
                    }
                    setTimeout(init, RETRY_INTERVAL);
                } else {
                    warn('等待播放列表超时 (10s)，页面结构可能不同');
                    warn(`  play_1 存在: ${!!play1}, play_2 存在: ${!!play2}`);
                    // 列出页面上所有以 play_ 开头的元素
                    const allPlays = document.querySelectorAll('[id^="play_"]');
                    warn(`  页面上 id^="play_" 的元素: ${allPlays.length} 个`);
                    allPlays.forEach(el => warn(`    #${el.id}`));
                }
                return;
            }

            log('播放列表元素就绪');
            retryCount = 0;

            // 检查是否已初始化（防止重复执行）
            if (document.getElementById(PANEL_ID)) {
                log('面板已存在，跳过');
                return;
            }

            // 1. 提取数据
            log('开始提取数据...');
            const sourcesData = [
                { name: 'zykyun', episodes: extractEpisodes('play_1') },
                { name: '1080zyk', episodes: extractEpisodes('play_2') }
            ];

            // 验证数据有效性
            const totalEpisodes = sourcesData.reduce((sum, s) => sum + s.episodes.length, 0);
            log(`数据提取完成: ${sourcesData[0].episodes.length} + ${sourcesData[1].episodes.length} = ${totalEpisodes} 集`);
            if (totalEpisodes === 0) {
                warn('未找到有效的集数数据，中止');
                return;
            }

            // 2. 隐藏原始元素
            log('隐藏原始元素...');
            play1.style.setProperty('display', 'none', 'important');
            play2.style.setProperty('display', 'none', 'important');

            // 隐藏源名称标签
            let hiddenLabels = 0;
            document.querySelectorAll('span.suf').forEach(s => {
                const text = s.textContent.trim();
                if (text === 'zykyun' || text === '1080zyk') {
                    s.style.setProperty('display', 'none', 'important');
                    hiddenLabels++;
                    // 如果父元素内容为空或只剩空白，也尝试隐藏
                    const parent = s.parentElement;
                    if (parent && parent.childElementCount <= 2) {
                        const visibleChildren = Array.from(parent.children).filter(
                            c => c.style.display !== 'none'
                        );
                        if (visibleChildren.length === 0) {
                            parent.style.setProperty('display', 'none', 'important');
                        }
                    }
                }
            });
            log(`隐藏了 ${hiddenLabels} 个源标签`);

            // 3. 构建并插入新面板
            log('构建新面板...');
            const panel = buildPanel(sourcesData);
            log('插入面板到页面...');
            play1.parentNode.insertBefore(panel, play1);
            log(`✓ 已完成！共 ${totalEpisodes} 集，面板已插入 #play_1 之前`);

        } catch (e) {
            console.error(TAG, '初始化异常:', e);
            console.error(TAG, '错误堆栈:', e.stack);
        }
    }

    // ==================== 启动 ====================
    log('注入 CSS...');
    injectStyles();

    // 以 document-idle 运行，此时 DOM 已 ready
    if (document.readyState === 'loading') {
        log('DOM 仍在 loading，等待 DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
    } else {
        log(`DOM 状态: ${document.readyState}，立即启动 init`);
        init();
    }
})();
