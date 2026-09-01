// ==UserScript==
// @name         福利吧增强
// @namespace    https://fuliba2025.net/
// @icon         https://fuliba.net/favicon-portal.ico
// @version      0.0.3
// @description  福利吧全站增强：1) 一键关闭/开启帖子图片，只显示文字；2) 显示"好孩子看不见"——把正文中白色文字改为醒目红色，让被隐藏的内容现形。支持地址发布页（fuliba.de）下列出的全部主站与论坛地址；状态自动记忆，支持快捷键 Alt+I / Alt+R，按钮可拖动。
// @author       story5
// @match        https://fuliba2023.net/*
// @match        https://fuliba2025.net/*
// @match        https://fuliba.net/*
// @match        https://www.fuliba.net/*
// @match        https://fuliba66.net/*
// @match        https://f.uliba.net/*
// @match        https://fuliba123.com/*
// @match        https://fuliba123.net/*
// @match        https://www.wnflb2023.com/*
// @match        https://wnflb2023.com/*
// @match        https://www.wnflb99.com/*
// @match        https://wnflb99.com/*
// @match        https://www.wnflb00.com/*
// @match        https://wnflb00.com/*
// @match        https://bbs.fuliba.net/*
// @match        http://fuliba2023.net/*
// @match        http://fuliba2025.net/*
// @match        http://fuliba.net/*
// @match        http://www.fuliba.net/*
// @match        http://fuliba66.net/*
// @match        http://f.uliba.net/*
// @match        http://fuliba123.com/*
// @match        http://fuliba123.net/*
// @match        http://www.wnflb2023.com/*
// @match        http://wnflb2023.com/*
// @match        http://www.wnflb99.com/*
// @match        http://wnflb99.com/*
// @match        http://www.wnflb00.com/*
// @match        http://wnflb00.com/*
// @match        http://bbs.fuliba.net/*
// @include      https://fuliba2025.net/*
// @include      https://fuliba*.net/*
// @include      https://f.uliba.net/*
// @include      https://www.wnflb*.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ---------------- 功能一：无图模式 ---------------- */
  var STATE_KEY = 'flbNoImgOn';
  var POS_KEY = 'flbNoImgBtnPos';
  var CLASS_NAME = 'flb-noimg';
  var BTN_ID = 'flb-noimg-toggle-btn';

  /* ---------------- 功能二：显示"好孩子看不见"（白色文字改醒目色） ---------------- */
  var REVEAL_KEY = 'flbRevealOn';
  var REVEAL_POS_KEY = 'flbRevealBtnPos';
  var REVEAL_CLASS = 'flb-reveal';
  var REVEAL_BTN_ID = 'flb-reveal-toggle-btn';
  var REVEAL_COLOR = '#ff5e52'; // 醒目红

  try { console.log('[福利吧增强] 脚本已加载，当前页面：' + location.href); } catch (e) {}

  /* ---------------- 持久化 ---------------- */
  function getKV(key, def) {
    try { return GM_getValue(key, def); }
    catch (e) {
      try { return localStorage.getItem(key) === null ? def : localStorage.getItem(key); }
      catch (e2) { return def; }
    }
  }
  function setKV(key, v) {
    try { GM_setValue(key, v); } catch (e) {}
    try { localStorage.setItem(key, v); } catch (e) {}
  }
  function getBool(key) {
    return getKV(key, false) === true;
  }
  function getPos(key) {
    try {
      var p = getKV(key, null);
      if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
    } catch (e) {}
    return null;
  }

  /* ---------------- 核心 CSS ---------------- */
  var cssText = [
    /* ===== 功能一：无图模式 =====
       主站（WordPress DUX 主题）：列表页帖子缩略图 + 详情页正文图片 + 顶部广告横幅 */
    'html.' + CLASS_NAME + ' .excerpt > a.focus,',
    'html.' + CLASS_NAME + ' .excerpt img.thumb,',
    'html.' + CLASS_NAME + ' .excerpt img,',
    'html.' + CLASS_NAME + ' .article-content img,',
    'html.' + CLASS_NAME + ' .article-topbanner,',
    /* 论坛（Discuz 类）：帖内正文图片 */
    'html.' + CLASS_NAME + ' td.t_f img,',
    'html.' + CLASS_NAME + ' .pcb img',
    '{ display: none !important; }',
    'html.' + CLASS_NAME + ' .excerpt { padding-left: 0 !important; }',

    /* ===== 功能二：显示"好孩子看不见" =====
       正文中内联白色文字（常见写法全覆盖）改为醒目红 */
    'html.' + REVEAL_CLASS + ' .article-content [style*="color:#fff"],',
    'html.' + REVEAL_CLASS + ' .article-content [style*="color: #fff"],',
    'html.' + REVEAL_CLASS + ' .article-content [style*="color:#FFF"],',
    'html.' + REVEAL_CLASS + ' .article-content [style*="color: #FFF"],',
    'html.' + REVEAL_CLASS + ' .article-content [style*="color:white"],',
    'html.' + REVEAL_CLASS + ' .article-content [style*="color: white"],',
    'html.' + REVEAL_CLASS + ' .note [style*="color:#fff"],',
    'html.' + REVEAL_CLASS + ' .note [style*="color: #fff"],',
    'html.' + REVEAL_CLASS + ' .note [style*="color:#FFF"],',
    'html.' + REVEAL_CLASS + ' .note [style*="color: #FFF"],',
    'html.' + REVEAL_CLASS + ' .note [style*="color:white"],',
    'html.' + REVEAL_CLASS + ' .note [style*="color: white"],',
    'html.' + REVEAL_CLASS + ' td.t_f [style*="color:#fff"],',
    'html.' + REVEAL_CLASS + ' td.t_f [style*="color: #fff"],',
    'html.' + REVEAL_CLASS + ' td.t_f [style*="color:white"],',
    'html.' + REVEAL_CLASS + ' td.t_f [style*="color: white"],',
    'html.' + REVEAL_CLASS + ' .pcb [style*="color:#fff"],',
    'html.' + REVEAL_CLASS + ' .pcb [style*="color: #fff"],',
    'html.' + REVEAL_CLASS + ' .pcb [style*="color:white"],',
    'html.' + REVEAL_CLASS + ' .pcb [style*="color: white"]',
    '{ color: ' + REVEAL_COLOR + ' !important; }',

    /* ===== 悬浮按钮（两个按钮共用样式） ===== */
    '.flb-float-btn{',
    '  position: fixed; z-index: 2147483647;',
    '  display: inline-flex; align-items: center; gap: 6px;',
    '  padding: 8px 14px; border-radius: 999px;',
    '  border: 1px solid rgba(255,255,255,.18);',
    '  background: rgba(22,27,34,.88);',
    '  color: #fff; font-size: 13px; font-weight: 600; line-height: 1;',
    '  cursor: pointer; user-select: none; -webkit-user-select: none;',
    '  box-shadow: 0 4px 14px rgba(0,0,0,.25);',
    '  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);',
    '  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;',
    '  transition: transform .15s ease, background .15s ease;',
    '  touch-action: none;',
    '}',
    '.flb-float-btn:hover{ background: rgba(35,42,54,.92); }',
    '.flb-float-btn.flb-off{ background: rgba(88,166,255,.9); border-color: rgba(255,255,255,.28); }',
    '.flb-float-btn .flb-dot{',
    '  width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto;',
    '}',
    '#' + BTN_ID + ' .flb-dot{ background: #ff5e52; }',
    '#' + REVEAL_BTN_ID + ' .flb-dot{ background: #ffa94d; }',
    '.flb-float-btn.flb-off .flb-dot{ background: #2ea043; }',
    '.flb-float-btn .flb-key{',
    '  font-size: 10px; font-weight: 400; opacity: .55;',
    '  border: 1px solid rgba(255,255,255,.35); border-radius: 4px;',
    '  padding: 1px 4px; margin-left: 2px;',
    '}',
    '.flb-float-btn .flb-title{',
    '  position: absolute; left: 50%; bottom: calc(100% + 8px);',
    '  transform: translateX(-50%); white-space: nowrap;',
    '  background: rgba(22,27,34,.95); color: #fff; font-size: 11px;',
    '  font-weight: 400; padding: 4px 8px; border-radius: 6px;',
    '  opacity: 0; pointer-events: none; transition: opacity .15s;',
    '}',
    '.flb-float-btn:hover .flb-title{ opacity: 1; }'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById('flb-noimg-style')) return;
    try {
      var style = document.createElement('style');
      style.id = 'flb-noimg-style';
      style.textContent = cssText;
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {
      try { console.error('[福利吧增强] 注入样式失败', e); } catch (e2) {}
    }
  }

  /* ---------------- 状态应用 ---------------- */
  function apply(on) {
    try {
      var root = document.documentElement;
      if (!root) return;
      if (on) root.classList.add(CLASS_NAME);
      else root.classList.remove(CLASS_NAME);
    } catch (e) {}
    var btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.classList.toggle('flb-off', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      var label = btn.querySelector('.flb-label');
      if (label) label.textContent = on ? '无图模式' : '图片开启';
      var title = btn.querySelector('.flb-title');
      if (title) title.textContent = '点击' + (on ? '显示' : '隐藏') + '帖子图片（可拖动，Alt+I 切换）';
    }
  }
  function toggle() {
    var next = !document.documentElement.classList.contains(CLASS_NAME);
    setKV(STATE_KEY, next);
    apply(next);
  }

  /* ---------------- 功能二：白色文字扫描兜底（覆盖 CSS 匹配不到的写法） ---------------- */
  var revealedEls = [];
  var scanPending = false;

  function scanWhiteText() {
    if (!document.documentElement.classList.contains(REVEAL_CLASS)) return;
    try {
      var roots = document.querySelectorAll('.article-content, .note, td.t_f, .pcb, .excerpt');
      for (var r = 0; r < roots.length; r++) {
        var els = roots[r].querySelectorAll('*');
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          if (el.getAttribute && el.getAttribute('data-flb-revealed')) continue;
          if (!el.children || el.children.length) continue; // 只处理叶子元素
          var id = el.id || '';
          if (id === BTN_ID || id === REVEAL_BTN_ID || id === 'flb-noimg-style') continue;
          var c = getComputedStyle(el).color;
          var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
          if (!m) continue;
          var R = +m[1], G = +m[2], B = +m[3];
          if (R >= 240 && G >= 240 && B >= 240) { // 接近纯白
            el.style.color = REVEAL_COLOR;
            el.setAttribute('data-flb-revealed', '1');
            revealedEls.push(el);
          }
        }
      }
    } catch (e) {}
  }
  function scheduleScan() {
    if (scanPending) return;
    scanPending = true;
    setTimeout(function () { scanPending = false; scanWhiteText(); }, 300);
  }
  function restoreReveal() {
    for (var i = 0; i < revealedEls.length; i++) {
      try {
        var el = revealedEls[i];
        el.style.color = '';
        el.removeAttribute('data-flb-revealed');
      } catch (e) {}
    }
    revealedEls = [];
  }
  function applyReveal(on) {
    try {
      var root = document.documentElement;
      if (!root) return;
      if (on) root.classList.add(REVEAL_CLASS);
      else root.classList.remove(REVEAL_CLASS);
    } catch (e) {}
    var btn = document.getElementById(REVEAL_BTN_ID);
    if (btn) {
      btn.classList.toggle('flb-off', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      var label = btn.querySelector('.flb-label');
      if (label) label.textContent = on ? '已显示' : '隐藏内容';
      var title = btn.querySelector('.flb-title');
      if (title) title.textContent = '显示"好孩子看不见"隐藏内容（白色文字改醒目色，可拖动，Alt+R 切换）';
    }
    if (on) { scanWhiteText(); } else { restoreReveal(); }
  }
  function toggleReveal() {
    var next = !document.documentElement.classList.contains(REVEAL_CLASS);
    setKV(REVEAL_KEY, next);
    applyReveal(next);
  }

  /* ---------------- 悬浮按钮（可拖动，两个按钮共用） ---------------- */
  function createFloatButton(id, keyLabel, onClick) {
    if (document.getElementById(id)) return;
    if (!document.body) return;

    var btn = document.createElement('div');
    btn.id = id;
    btn.className = 'flb-float-btn';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.innerHTML =
      '<span class="flb-dot"></span>' +
      '<span class="flb-label"></span>' +
      '<span class="flb-key">' + keyLabel + '</span>' +
      '<span class="flb-title"></span>';
    document.body.appendChild(btn);

    var vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    var vh = window.innerHeight || document.documentElement.clientHeight || 768;
    var posKey = (id === REVEAL_BTN_ID) ? REVEAL_POS_KEY : POS_KEY;
    var pos = getPos(posKey);
    if (pos) {
      pos.x = Math.min(Math.max(pos.x, 0), Math.max(vw - btn.offsetWidth, 0));
      pos.y = Math.min(Math.max(pos.y, 0), Math.max(vh - btn.offsetHeight, 0));
    } else {
      // 图片按钮默认右下角；隐藏内容按钮默认在其上方 60px
      var above = (id === REVEAL_BTN_ID);
      pos = {
        x: Math.max(vw - btn.offsetWidth - 20, 0),
        y: Math.max(vh - btn.offsetHeight - (above ? 150 : 90), 0)
      };
    }
    btn.style.left = pos.x + 'px';
    btn.style.top = pos.y + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';

    bindDrag(btn, posKey, onClick);

    // 同步按钮文案与状态
    if (id === REVEAL_BTN_ID) applyReveal(getBool(REVEAL_KEY));
    else apply(getBool(STATE_KEY));
    try { console.log('[福利吧增强] 按钮已创建：' + id); } catch (e) {}
  }
  function createImgButton() { createFloatButton(BTN_ID, 'Alt+I', toggle); }
  function createRevealButton() { createFloatButton(REVEAL_BTN_ID, 'Alt+R', toggleReveal); }

  function bindDrag(btn, posKey, onClick) {
    var dragging = false, moved = false;
    var startX = 0, startY = 0, origL = 0, origT = 0;

    function onDown(x, y) {
      dragging = true; moved = false;
      startX = x; startY = y;
      origL = btn.offsetLeft; origT = btn.offsetTop;
      btn.style.transition = 'none';
    }
    function onMove(x, y) {
      if (!dragging) return;
      var dx = x - startX, dy = y - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
      if (!moved) return;
      var vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      var vh = window.innerHeight || document.documentElement.clientHeight || 768;
      var nx = Math.min(Math.max(origL + dx, 0), Math.max(vw - btn.offsetWidth, 0));
      var ny = Math.min(Math.max(origT + dy, 0), Math.max(vh - btn.offsetHeight, 0));
      btn.style.left = nx + 'px';
      btn.style.top = ny + 'px';
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      btn.style.transition = '';
      if (moved) { try { setKV(posKey, { x: btn.offsetLeft, y: btn.offsetTop }); } catch (e) {} }
      else onClick(); // 未拖动视为点击
    }

    // 鼠标
    btn.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      onDown(e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', function (e) { if (dragging) onMove(e.clientX, e.clientY); });
    document.addEventListener('mouseup', onUp);

    // 触摸
    btn.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      onDown(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!dragging || e.touches.length !== 1) return;
      var t = e.touches[0];
      onMove(t.clientX, t.clientY);
      if (moved) e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', onUp);

    // 键盘可达性
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    });
  }

  /* ---------------- 快捷键 ---------------- */
  document.addEventListener('keydown', function (e) {
    if (!e.altKey) return;
    if (e.key === 'i' || e.key === 'I') { e.preventDefault(); toggle(); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); toggleReveal(); }
  }, true);

  /* ---------------- 看门狗：防止站点脚本重建/替换 body 后按钮丢失 ---------------- */
  var watchdogTimer = null;
  function ensureButtons() {
    injectStyle();
    if (!document.getElementById(BTN_ID)) createImgButton();
    if (!document.getElementById(REVEAL_BTN_ID)) createRevealButton();
    if ((!document.getElementById(BTN_ID) || !document.getElementById(REVEAL_BTN_ID)) && !watchdogTimer) {
      watchdogTimer = setInterval(function () {
        if (document.getElementById(BTN_ID) && document.getElementById(REVEAL_BTN_ID)) {
          clearInterval(watchdogTimer);
          watchdogTimer = null;
          return;
        }
        ensureButtons();
      }, 1500);
    }
  }

  /* ---------------- 启动 ---------------- */
  // document-start：尽早注入样式并应用记忆状态，防止图片闪现
  injectStyle();
  apply(getBool(STATE_KEY));
  applyReveal(getBool(REVEAL_KEY));

  function onReady() {
    ensureButtons();
    // body 若被站点脚本重建，也会自动重建按钮；动态加载的正文持续扫描白色文字
    try {
      new MutationObserver(function () {
        if (!document.getElementById(BTN_ID) || !document.getElementById(REVEAL_BTN_ID)) ensureButtons();
        if (document.documentElement.classList.contains(REVEAL_CLASS)) scheduleScan();
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
