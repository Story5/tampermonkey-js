// ==UserScript==
// @name         WorldQuant BRAIN 课程学习记录
// @namespace    https://platform.worldquantbrain.com/
// @version      1.0.0
// @description  在 BRAIN Learn 课程目录的每一节课右侧加一个勾选框，点击标记「已学习」，状态保存在本机浏览器，下次打开自动恢复；右下角显示本课进度并可一键重置。
// @author       story5
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/Story5/tampermonkey-js/main/worldquant-learn-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/Story5/tampermonkey-js/main/worldquant-learn-tracker.user.js
// @match        https://platform.worldquantbrain.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/**
 * 使用说明
 * 1. 安装 Tampermonkey（油猴）扩展。
 * 2. 新建脚本，把本文件内容整体粘贴进去，保存。
 * 3. 打开 https://platform.worldquantbrain.com/learn/courses/quantcepts/what-alpha
 *    每节课右侧（时长后面）会出现一个勾选框，勾上即记录为「已学习」。
 * 4. 右下角会显示「已学 3/19」的进度，点「重置」可清空当前课程的记录。
 *
 * 备注
 * - 记录按「课程 URL + 课序号 + 标题」存放在 localStorage 的 wq-learn-progress-v1 里，
 *   换浏览器 / 清缓存 / 无痕窗口不会同步。
 * - 页面是 React 单页应用，脚本用 MutationObserver 监听重渲染，切换课程会自动重新挂载勾选框。
 */
(function () {
  'use strict';

  var CFG = {
    storeKey: 'wq-learn-progress-v1',
    styleId: 'wq-learn-style',
    wrapClass: 'wq-box-wrap',
    boxClass: 'wq-lesson-box',
    badgeId: 'wq-learn-badge'
  };

  // 行首的课序号，例如 "1. What is an Alpha" / "13)" / "7、"
  var RE_NUM = /^(\d{1,3})\s*[.)．、]\s*/;
  // 时长，覆盖 "4m 15s" / "1m" / "55s" / "1:09" / "1h 2m"
  // 用 (?![a-z]) 做右边界、不用 \b，因为 DOM 里标题与时长可能是紧贴的（"Investing1m"）
  var RE_DUR = /\d+\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)(?![a-z])|\b\d{1,2}:\d{2}\b/i;
  // 行尾的时长，用于从标题里剔除
  var RE_TAIL_DUR = /(?:\d+\s*(?:h|hr|hrs|hour|hours)\s*)?(?:\d+\s*(?:m|min|mins|minute|minutes)\s*)?\d+\s*(?:s|sec|secs|second|seconds)\s*$|\d+\s*(?:m|min|mins|minute|minutes)\s*$|\d{1,2}:\d{2}\s*$/i;

  /* ------------------------------------------------------------------ */
  /* 存储                                                                */
  /* ------------------------------------------------------------------ */

  function readStore() {
    try {
      var raw = localStorage.getItem(CFG.storeKey);
      var obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function writeStore(data) {
    try {
      localStorage.setItem(CFG.storeKey, JSON.stringify(data));
    } catch (e) {
      /* 隐私模式等场景静默失败 */
    }
  }

  function courseKey() {
    return location.pathname.replace(/\/+$/, '') || '/learn';
  }

  function isDone(key) {
    var all = readStore();
    var bucket = all[courseKey()];
    return !!(bucket && bucket[key]);
  }

  function setDone(key, on) {
    var all = readStore();
    var k = courseKey();
    if (!all[k] || typeof all[k] !== 'object') all[k] = {};
    if (on) all[k][key] = Date.now();
    else delete all[k][key];
    writeStore(all);
  }

  function clearCourse() {
    var all = readStore();
    delete all[courseKey()];
    writeStore(all);
  }

  /* ------------------------------------------------------------------ */
  /* 工具                                                                */
  /* ------------------------------------------------------------------ */

  function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function inLearn() {
    return location.pathname.indexOf('/learn') === 0 || location.pathname.indexOf('/learn/') !== -1;
  }

  /* ------------------------------------------------------------------ */
  /* 识别课程行                                                          */
  /* ------------------------------------------------------------------ */

  function findRows() {
    var body = document.body;
    if (!body) return [];

    var all = body.querySelectorAll('*');
    var candidates = [];

    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.childElementCount > 12) continue;
      var tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
      if (el.closest('#' + CFG.badgeId)) continue;
      if (el.classList && el.classList.contains(CFG.wrapClass)) continue;

      // 用 textContent 做粗筛（不触发重排，性能友好）
      var raw = el.textContent;
      if (!raw || raw.length < 5 || raw.length > 220) continue;

      var t = clean(raw);
      if (!RE_NUM.test(t) || !RE_DUR.test(t)) continue;
      candidates.push(el);
    }

    if (!candidates.length) return [];

    // 只保留最内层的匹配元素，避免父子重复
    var deepest = candidates.filter(function (el) {
      for (var j = 0; j < candidates.length; j++) {
        var c = candidates[j];
        if (c !== el && el.contains(c)) return false;
      }
      return true;
    });

    var out = [];
    var seen = {};
    for (var k = 0; k < deepest.length; k++) {
      var node = deepest[k];
      var r = node.getBoundingClientRect();
      if (r.width < 120 || r.height < 14 || r.height > 96) continue;
      var sig = Math.round(r.top) + ':' + Math.round(r.left) + ':' + Math.round(r.width);
      if (seen[sig]) continue;
      seen[sig] = 1;
      out.push(node);
    }

    out.sort(function (a, b) {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });
    return out;
  }

  var metaCache = new WeakMap();

  function metaOf(row) {
    if (metaCache.has(row)) return metaCache.get(row);

    var text = '';
    try {
      text = clean(row.innerText || row.textContent);
    } catch (e) {
      text = clean(row.textContent);
    }
    if (!text) return null;

    var m = text.match(RE_NUM);
    var idx = m ? parseInt(m[1], 10) : null;

    var title = clean(text.replace(RE_NUM, '').replace(RE_TAIL_DUR, ''));
    if (!title) return null;

    var norm = title
      .toLowerCase()
      .replace(/[^0-9a-z\u4e00-\u9fa5]+/g, ' ')
      .trim()
      .slice(0, 48);

    var meta = { idx: idx, title: title, key: (idx !== null ? '#' + idx : '#') + '|' + norm };
    metaCache.set(row, meta);
    return meta;
  }

  function attachPoint(row) {
    if (row.tagName === 'TR') {
      var cells = row.children;
      if (!cells.length) return null;
      var last = cells[cells.length - 1];
      return /^(TD|TH)$/.test(last.tagName) ? last : null;
    }
    return row;
  }

  function ensureBox(row, meta) {
    var host = attachPoint(row);
    if (!host) return null;

    var wrap = row.querySelector('.' + CFG.wrapClass);

    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = CFG.wrapClass;

      // 自绘勾选框（不用原生 input）：原生 checkbox 若被 preventDefault 会回滚勾选状态，
      // 而行本身常常包在 <a> 里，必须阻止默认跳转。
      var box = document.createElement('span');
      box.className = CFG.boxClass;
      box.setAttribute('role', 'checkbox');
      box.setAttribute('tabindex', '0');
      box.setAttribute('aria-checked', 'false');

      box.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var next = box.getAttribute('aria-checked') !== 'true';
        commit(box, meta, next);
      });
      box.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') {
          e.preventDefault();
          e.stopPropagation();
          commit(box, meta, box.getAttribute('aria-checked') !== 'true');
        }
      });
      box.addEventListener('mousedown', function (e) {
        e.stopPropagation();
      });
      box.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
      });
      box.addEventListener('dblclick', function (e) {
        e.stopPropagation();
      });

      wrap.appendChild(box);
      host.appendChild(wrap);
    }

    var el = wrap.firstElementChild;
    if (!el) return null;

    el.dataset.wqKey = meta.key;
    setVisual(el, meta, isDone(meta.key));
    return el;
  }

  function setVisual(box, meta, on) {
    box.setAttribute('aria-checked', on ? 'true' : 'false');
    box.setAttribute('aria-label', (on ? '已学习：' : '标记为已学习：') + meta.title);
    box.title = on ? '已学习（点击取消）' : '点击标记为「已学习」';
  }

  function commit(box, meta, on) {
    setDone(meta.key, on);
    setVisual(box, meta, on);
    refreshBadge();
  }

  /* ------------------------------------------------------------------ */
  /* 右下角进度                                                                 */
  /* ------------------------------------------------------------------ */

  function ensureBadge() {
    var badge = document.getElementById(CFG.badgeId);
    if (badge) return badge;

    badge = document.createElement('div');
    badge.id = CFG.badgeId;
    badge.title = 'WorldQuant BRAIN 课程学习记录（保存在本机浏览器）';

    var txt = document.createElement('span');
    txt.className = 'wq-badge-text';

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'wq-badge-reset';
    reset.textContent = '重置';
    reset.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!window.confirm('清空当前课程的全部「已学习」记录？')) return;
      clearCourse();
      var boxes = document.querySelectorAll('.' + CFG.boxClass);
      for (var i = 0; i < boxes.length; i++) boxes[i].setAttribute('aria-checked', 'false');
      refreshBadge();
    });

    badge.appendChild(txt);
    badge.appendChild(reset);
    document.body.appendChild(badge);
    return badge;
  }

  function updateBadge(done, total) {
    var badge = document.getElementById(CFG.badgeId);
    if (!badge) {
      if (total <= 0) return;
      badge = ensureBadge();
    }
    if (total <= 0) {
      badge.style.display = 'none';
      return;
    }
    badge.style.display = 'flex';
    var txt = badge.querySelector('.wq-badge-text');
    if (txt) {
      txt.textContent = '已学 ' + done + ' / ' + total + (done >= total ? ' 🎉' : '');
    }
  }

  function refreshBadge() {
    var boxes = document.querySelectorAll('.' + CFG.boxClass);
    if (!boxes.length) return;
    var done = 0;
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].getAttribute('aria-checked') === 'true') done++;
    }
    updateBadge(done, boxes.length);
  }

  /* ------------------------------------------------------------------ */
  /* 样式                                                                */
  /* ------------------------------------------------------------------ */

  function injectStyle() {
    if (document.getElementById(CFG.styleId)) return;
    var s = document.createElement('style');
    s.id = CFG.styleId;
    s.textContent = [
      '.' + CFG.wrapClass + '{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;margin-left:8px;padding:1px;line-height:0;cursor:pointer;}',
      '.' + CFG.boxClass + '{position:relative;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;' +
        'width:16px;height:16px;border:1.5px solid #b3bfcc;border-radius:4px;background:#fff;cursor:pointer;' +
        'transition:background .12s ease,border-color .12s ease;flex:0 0 auto;-webkit-user-select:none;user-select:none;}',
      '.' + CFG.boxClass + ':hover{border-color:#2bb673;}',
      '.' + CFG.boxClass + ':focus-visible{outline:2px solid rgba(43,182,115,.45);outline-offset:1px;}',
      '.' + CFG.boxClass + '[aria-checked="true"]{background:#2bb673;border-color:#2bb673;}',
      '.' + CFG.boxClass + '::after{content:"";display:block;width:8px;height:4px;margin-top:-2px;' +
        'border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg) scale(.4);' +
        'opacity:0;transition:transform .12s ease,opacity .12s ease;}',
      '.' + CFG.boxClass + '[aria-checked="true"]::after{transform:rotate(-45deg) scale(1);opacity:1;}',
      '#' + CFG.badgeId + '{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;',
      'font:500 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;',
      'color:#2b3a4a;background:#fff;border:1px solid #dfe5ec;border-radius:14px;box-shadow:0 4px 14px rgba(20,40,70,.12);padding:6px 10px;user-select:none;}',
      '#' + CFG.badgeId + ' .wq-badge-text{white-space:nowrap;}',
      '#' + CFG.badgeId + ' .wq-badge-reset{font:inherit;color:#5b6b7d;background:transparent;border:0;padding:0 2px;cursor:pointer;}',
      '#' + CFG.badgeId + ' .wq-badge-reset:hover{color:#c0392b;text-decoration:underline;}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  /* ------------------------------------------------------------------ */
  /* 主循环                                                              */
  /* ------------------------------------------------------------------ */

  var mo = null;

  function observe() {
    if (!mo || !document.body) return;
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function run() {
    if (!document.body) return;

    if (!inLearn()) {
      var b = document.getElementById(CFG.badgeId);
      if (b) b.style.display = 'none';
      return;
    }

    injectStyle();
    if (mo) mo.disconnect();
    try {
      var rows = findRows();
      var done = 0;
      for (var i = 0; i < rows.length; i++) {
        var meta = metaOf(rows[i]);
        if (!meta) continue;
        var box = ensureBox(rows[i], meta);
        if (box && box.getAttribute('aria-checked') === 'true') done++;
      }
      updateBadge(done, rows.length);
    } catch (e) {
      /* 页面结构变化时不让脚本整体挂掉 */
      console && console.debug && console.debug('[wq-tracker]', e);
    } finally {
      observe();
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      run();
    });
  }

  var lastHref = location.href;
  var scrollTimer = null;

  function boot() {
    if (!document.body) {
      setTimeout(boot, 300);
      return;
    }

    mo = new MutationObserver(schedule);
    observe();

    window.addEventListener('scroll', function () {
      if (scrollTimer) return;
      scrollTimer = setTimeout(function () {
        scrollTimer = null;
        schedule();
      }, 250);
    }, true);

    window.addEventListener('resize', schedule);

    // SPA 路由变化检测
    setInterval(function () {
      if (location.href !== lastHref) {
        lastHref = location.href;
        metaCache = new WeakMap();
        schedule();
      }
    }, 800);

    schedule();
  }

  boot();
})();
