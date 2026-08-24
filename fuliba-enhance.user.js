// ==UserScript==
// @name         福利吧增强
// @namespace    https://fuliba2025.net/
// @version      0.0.1
// @description  福利吧全站增强：一键关闭/开启帖子中的图片，只显示文字。支持地址发布页（fuliba.de）下列出的全部主站与论坛地址；状态自动记忆，支持快捷键 Alt+I，按钮可拖动。
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

  var STATE_KEY = 'flbNoImgOn';
  var POS_KEY = 'flbNoImgBtnPos';
  var CLASS_NAME = 'flb-noimg';
  var BTN_ID = 'flb-noimg-toggle-btn';

  try { console.log('[福利吧增强] 脚本已加载，当前页面：' + location.href); } catch (e) {}

  /* ---------------- 持久化 ---------------- */
  function getState() {
    try { return GM_getValue(STATE_KEY, false) === true; }
    catch (e) {
      try { return localStorage.getItem(STATE_KEY) === '1'; } catch (e2) { return false; }
    }
  }
  function setState(v) {
    try { GM_setValue(STATE_KEY, v); } catch (e) {}
    try { localStorage.setItem(STATE_KEY, v ? '1' : '0'); } catch (e) {}
  }
  function getPos() {
    try {
      var p = GM_getValue(POS_KEY, null);
      if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
    } catch (e) {}
    return null;
  }
  function savePos(pos) {
    try { GM_setValue(POS_KEY, pos); } catch (e) {}
  }

  /* ---------------- 核心 CSS ---------------- */
  var cssText = [
    /* 主站（WordPress DUX 主题）：
       列表页帖子缩略图（a.focus 容器 + img.thumb），兜底 .excerpt 内所有图片 */
    'html.' + CLASS_NAME + ' .excerpt > a.focus,',
    'html.' + CLASS_NAME + ' .excerpt img.thumb,',
    'html.' + CLASS_NAME + ' .excerpt img,',
    /* 主站详情页：正文所有图片 + 正文顶部广告横幅 */
    'html.' + CLASS_NAME + ' .article-content img,',
    'html.' + CLASS_NAME + ' .article-topbanner,',
    /* 论坛（Discuz 类）：帖内正文图片 */
    'html.' + CLASS_NAME + ' td.t_f img,',
    'html.' + CLASS_NAME + ' .pcb img',
    '{ display: none !important; }',

    /* 纯文字模式下，列表项左右间距微调，让文字占满 */
    'html.' + CLASS_NAME + ' .excerpt { padding-left: 0 !important; }',

    /* 悬浮按钮样式 */
    '#' + BTN_ID + '{',
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
    '#' + BTN_ID + ':hover{ background: rgba(35,42,54,.92); }',
    '#' + BTN_ID + '.flb-off{ background: rgba(88,166,255,.9); border-color: rgba(255,255,255,.28); }',
    '#' + BTN_ID + ' .flb-dot{',
    '  width: 8px; height: 8px; border-radius: 50%; background: #ff5e52;',
    '  flex: 0 0 auto;',
    '}',
    '#' + BTN_ID + '.flb-off .flb-dot{ background: #2ea043; }',
    '#' + BTN_ID + ' .flb-key{',
    '  font-size: 10px; font-weight: 400; opacity: .55;',
    '  border: 1px solid rgba(255,255,255,.35); border-radius: 4px;',
    '  padding: 1px 4px; margin-left: 2px;',
    '}',
    '#' + BTN_ID + ' .flb-title{',
    '  position: absolute; left: 50%; bottom: calc(100% + 8px);',
    '  transform: translateX(-50%); white-space: nowrap;',
    '  background: rgba(22,27,34,.95); color: #fff; font-size: 11px;',
    '  font-weight: 400; padding: 4px 8px; border-radius: 6px;',
    '  opacity: 0; pointer-events: none; transition: opacity .15s;',
    '}',
    '#' + BTN_ID + ':hover .flb-title{ opacity: 1; }'
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
    setState(next);
    apply(next);
  }

  /* ---------------- 悬浮按钮（可拖动） ---------------- */
  function createButton() {
    if (document.getElementById(BTN_ID)) return;
    if (!document.body) return;

    var btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.innerHTML =
      '<span class="flb-dot"></span>' +
      '<span class="flb-label"></span>' +
      '<span class="flb-key">Alt+I</span>' +
      '<span class="flb-title"></span>';
    document.body.appendChild(btn);

    // 初始位置：默认右下角；有记忆位置则恢复并夹回可视区
    var vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    var vh = window.innerHeight || document.documentElement.clientHeight || 768;
    var pos = getPos();
    if (pos) {
      pos.x = Math.min(Math.max(pos.x, 0), Math.max(vw - btn.offsetWidth, 0));
      pos.y = Math.min(Math.max(pos.y, 0), Math.max(vh - btn.offsetHeight, 0));
    } else {
      pos = { x: Math.max(vw - btn.offsetWidth - 20, 0), y: Math.max(vh - btn.offsetHeight - 90, 0) };
    }
    btn.style.left = pos.x + 'px';
    btn.style.top = pos.y + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';

    bindDrag(btn);
    apply(getState()); // 同步按钮文案与状态
    try { console.log('[福利吧增强] 按钮已创建'); } catch (e) {}
  }

  function bindDrag(btn) {
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
      if (moved) savePos({ x: btn.offsetLeft, y: btn.offsetTop });
      else toggle(); // 未拖动视为点击
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
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }

  /* ---------------- 快捷键 Alt+I ---------------- */
  document.addEventListener('keydown', function (e) {
    if (e.altKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      toggle();
    }
  }, true);

  /* ---------------- 看门狗：防止站点脚本重建/替换 body 后按钮丢失 ---------------- */
  var watchdogTimer = null;
  function ensureButton() {
    injectStyle();
    if (!document.getElementById(BTN_ID)) {
      createButton();
    }
    // 页面可能被站点脚本整体重建（如 PJAX/SPA），保持监听
    if (!document.getElementById(BTN_ID) && !watchdogTimer) {
      watchdogTimer = setInterval(function () {
        if (document.getElementById(BTN_ID)) {
          clearInterval(watchdogTimer);
          watchdogTimer = null;
          return;
        }
        createButton();
      }, 1500);
    }
  }

  /* ---------------- 启动 ---------------- */
  // document-start：尽早注入样式并应用记忆状态，防止图片闪现
  injectStyle();
  apply(getState());

  function onReady() {
    ensureButton();
    // body 若被站点脚本重建，也会自动重建按钮
    try {
      new MutationObserver(function () {
        if (!document.getElementById(BTN_ID)) ensureButton();
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
