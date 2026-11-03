// ==UserScript==
// @name         WorldQuant BRAIN 学习进度记录
// @namespace    https://platform.worldquantbrain.com/
// @version      1.1.0
// @description  在 BRAIN Learn 的课程目录（每节课右侧）与 Documentation 文档目录（每个条目左侧）加勾选框，点击标记「已学习」，状态保存在本机浏览器，下次打开自动恢复；右下角显示当前页面进度并可一键重置。
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
 * 3. 课程页 https://platform.worldquantbrain.com/learn/courses/quantcepts/what-alpha
 *    每节课右侧（时长后面）会出现一个勾选框，勾上即记录为「已学习」。
 * 4. 文档页 https://platform.worldquantbrain.com/learn/documentation
 *    每个条目前面（图标左侧）会出现一个勾选框。
 * 5. 右下角会显示「已学 3/19」的进度，点「重置」可清空当前页面的记录。
 *
 * 备注
 * - 记录按「页面路径 + 课序号/标题」存放在 localStorage 的 wq-learn-progress-v1 里，
 *   换浏览器 / 清缓存 / 无痕窗口不会同步。
 * - 页面是 React 单页应用，脚本用 MutationObserver 监听重渲染，切换页面会自动重新挂载勾选框。
 */
(function () {
  'use strict';

  var CFG = {
    storeKey: 'wq-learn-progress-v1',
    styleId: 'wq-learn-style',
    wrapClass: 'wq-box-wrap',
    prependClass: 'wq-box-wrap--prepend',
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
  // 文档页每个分组下方的 "7 Articles" 统计
  var RE_ARTICLES = /^(\d+)\s*articles?$/i;

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
    var p = location.pathname.replace(/\/+$/, '') || '/learn';
    // 文档正文页（/learn/documentation/xxx）与文档目录页共用同一份进度
    if (/^\/learn\/documentation\/.+/.test(p)) return '/learn/documentation';
    return p;
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

  // 文档目录页（/learn/documentation）。文档正文页共用同一份进度，但不挂勾选框。
  function isDocPage() {
    return /^\/learn\/documentation\/?$/.test(location.pathname);
  }

  function isDocArticle() {
    return /^\/learn\/documentation\/.+/.test(location.pathname);
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

  /* ------------------------------------------------------------------ */
  /* 识别文档条目（Documentation 页：无课序号、无时长，靠「N Articles」分组定位） */
  /* ------------------------------------------------------------------ */

  function isDocItem(el, asAnchor) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest('#' + CFG.badgeId)) return false;
    if (el.classList && (el.classList.contains(CFG.wrapClass) || el.classList.contains(CFG.boxClass))) return false;

    if (asAnchor) {
      // 内部还套着链接，说明这是外层容器而不是条目本身
      if (el.querySelector('a[href]')) return false;
    } else {
      if (el.childElementCount < 1 || el.childElementCount > 6) return false;
      // 必须是「图标 + 文字」的一行
      if (!el.querySelector('svg,img,i,[class*="icon"],[class*="Icon"],[class*="fa-"]')) return false;
    }

    var t = clean(el.innerText || el.textContent);
    if (!t || t.length < 2 || t.length > 140) return false;
    if (RE_ARTICLES.test(t)) return false;

    var r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 12 || r.height > 64) return false;
    return true;
  }

  function docItemCandidates(root, asAnchor) {
    var out = [];
    var nodes = root.querySelectorAll(asAnchor ? 'a[href]' : '*');
    for (var i = 0; i < nodes.length; i++) {
      if (isDocItem(nodes[i], asAnchor)) out.push(nodes[i]);
    }
    return out;
  }

  function findDocItems() {
    if (!document.body) return [];

    var out = [];
    function addAll(list) {
      for (var i = 0; i < list.length; i++) {
        if (out.indexOf(list[i]) === -1) out.push(list[i]);
      }
    }

    // 1) 以每个分组下方的 "7 Articles" 为锚点，向上找到包含条目的卡片
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.childElementCount) continue;
      if (!RE_ARTICLES.test(clean(el.textContent))) continue;

      var p = el.parentElement;
      for (var up = 0; up < 4 && p && p !== document.body; up++) {
        var items = docItemCandidates(p, true);
        if (items.length < 2) items = docItemCandidates(p, false);
        if (items.length >= 2) {
          addAll(items);
          break;
        }
        p = p.parentElement;
      }
    }

    // 2) 兜底：整页找指向文档的链接（不再扩大到所有 /learn/ 链接，避免把侧边导航也勾上）
    if (!out.length) {
      var links = document.body.querySelectorAll('a[href*="/documentation"]');
      for (var j = 0; j < links.length; j++) {
        if (isDocItem(links[j], true)) out.push(links[j]);
      }
    }

    out.sort(function (a, b) {
      var ra = a.getBoundingClientRect();
      var rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    return out;
  }

  function docMetaOf(el) {
    if (metaCache.has(el)) return metaCache.get(el);

    var text = '';
    try {
      text = clean(el.innerText || el.textContent);
    } catch (e) {
      text = clean(el.textContent);
    }
    if (!text) return null;

    // 文档标题没有序号/时长，直接整段作为标题（emoji 会在生成 key 时被剔除）
    var norm = text
      .toLowerCase()
      .replace(/[^0-9a-z\u4e00-\u9fa5]+/g, ' ')
      .trim()
      .slice(0, 56);
    if (!norm) return null;

    var meta = { idx: null, title: text, key: 'doc|' + norm };
    metaCache.set(el, meta);
    return meta;
  }

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

  function ensureBox(row, meta, prepend) {
    var host = attachPoint(row);
    if (!host) return null;

    var wrap = row.querySelector('.' + CFG.wrapClass);

    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = CFG.wrapClass + (prepend ? ' ' + CFG.prependClass : '');

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
      if (prepend) host.insertBefore(wrap, host.firstChild);
      else host.appendChild(wrap);
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
    badge.title = 'WorldQuant BRAIN 学习进度（保存在本机浏览器）';

    var txt = document.createElement('span');
    txt.className = 'wq-badge-text';

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'wq-badge-reset';
    reset.textContent = '重置';
    reset.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!window.confirm('清空当前页面的全部「已学习」记录？')) return;
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
      '.' + CFG.wrapClass + '.' + CFG.prependClass + '{margin-left:0;margin-right:7px;}',
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
      var items = [];

      if (isDocPage()) {
        var docs = findDocItems();
        for (var d = 0; d < docs.length; d++) items.push({ el: docs[d], doc: true });
      } else {
        var rows = findRows();
        for (var i = 0; i < rows.length; i++) items.push({ el: rows[i], doc: false });
      }

      var done = 0;
      var total = 0;
      for (var k = 0; k < items.length; k++) {
        var meta = items[k].doc ? docMetaOf(items[k].el) : metaOf(items[k].el);
        if (!meta) continue;
        var box = ensureBox(items[k].el, meta, items[k].doc);
        if (!box) continue;
        total++;
        if (box.getAttribute('aria-checked') === 'true') done++;
      }
      updateBadge(done, total);
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
