// ==UserScript==
// @name         WorldQuant BRAIN 学习进度记录
// @namespace    https://platform.worldquantbrain.com/
// @version      1.5.1
// @description  在 BRAIN Learn 的课程目录（课节右侧）、Documentation 文档目录（条目前）、Operators 操作符（签名前）、帮助中心术语表（每个术语标题前）加勾选框，点击标记「已学习」，状态保存在本机浏览器，下次打开自动恢复；右下角显示当前页面进度并可一键重置。
// @author       story5
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/Story5/tampermonkey-js/main/worldquant-learn-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/Story5/tampermonkey-js/main/worldquant-learn-tracker.user.js
// @match        https://platform.worldquantbrain.com/*
// @match        https://support.worldquantbrain.com/*
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
 * 5. 操作符页 https://platform.worldquantbrain.com/learn/operators
 *    每个操作符签名（如 rank(x)）前面会出现一个勾选框。
 * 6. 帮助中心术语表 https://support.worldquantbrain.com/hc/en-us/articles/4902349883927-...
 *    每个术语标题（h3）前面会出现一个勾选框；进度单独存在该站点下。
 * 7. 右下角会显示「已学 3/19」的进度，点「重置」可清空当前页面的记录。
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
    headingClass: 'wq-box-wrap--heading',
    boxClass: 'wq-lesson-box',
    badgeId: 'wq-learn-badge'
  };

  var VERSION = '1.5.1';

  // 行首的课序号，例如 "1. What is an Alpha" / "13)" / "7、"
  var RE_NUM = /^(\d{1,3})\s*[.)．、]\s*/;
  // 时长，覆盖 "4m 15s" / "1m" / "55s" / "1:09" / "1h 2m"
  // 用 (?![a-z]) 做右边界、不用 \b，因为 DOM 里标题与时长可能是紧贴的（"Investing1m"）
  // 冒号形式同理：左边界用 (?<!\d) 而不是 \b，否则 "Simulation1:09" 匹配不到
  var RE_DUR = /\d+\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)(?![a-z])|(?<!\d)\d{1,2}:\d{2}(?!\d)/i;
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
    // 帮助中心文章只用文章 id 当桶名：标题 slug 变了、语言前缀变了都不丢进度
    var m = p.match(/^\/hc\/[^/]+\/articles\/(\d+)/);
    if (m) return '/hc/articles/' + m[1];
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

  // 操作符页（/learn/operators）
  function isOperatorPage() {
    return /^\/learn\/operators\/?$/.test(location.pathname);
  }

  function isDocArticle() {
    return /^\/learn\/documentation\/.+/.test(location.pathname);
  }

  /* ------------------------------------------------------------------ */
  /* 帮助中心术语表（support.worldquantbrain.com，Zendesk 文章页）        */
  /* ------------------------------------------------------------------ */

  // 只在这些文章里挂勾选框，避免把普通帮助文档的每个小标题都勾上。
  // 以后想加别的术语表文章，把文章 id 追加到这里即可。
  var GLOSSARY_ARTICLE_IDS = ['4902349883927'];

  function isGlossaryPage() {
    // ?wqgloss=1 强制启用：本地调试用，或文章 id 变了、想给别的术语表页也挂上时用
    if (/(^|[?&])wqgloss=1(&|$)/.test(location.search)) return true;
    if (!/(^|\.)support\.worldquantbrain\.com$/i.test(location.hostname)) return false;
    var m = location.pathname.match(/\/articles\/(\d+)/);
    if (!m) return false;
    return GLOSSARY_ARTICLE_IDS.indexOf(m[1]) !== -1;
  }

  // 术语正文容器：Zendesk 各主题的类名不同，按优先级挨个试
  var GLOSS_CONTAINERS = ['.article-body', '[data-article-body]', '.article__body', '.article-body-content', 'article', 'main', '[role="main"]'];

  function articleRoot() {
    for (var i = 0; i < GLOSS_CONTAINERS.length; i++) {
      var el = document.querySelector(GLOSS_CONTAINERS[i]);
      if (el && el.querySelector('h3')) return el;
    }
    return document.body;
  }

  // 侧边栏 / 相关文章里的 h3 不算术语
  function inSidebarArea(el) {
    return !!el.closest('nav, aside, header, footer, [class*="related"], [class*="sidebar"], [class*="breadcrumb"], [role="navigation"]');
  }

  function findGlossaryHeads() {
    var root = articleRoot();
    if (!root) return [];
    var hs = root.querySelectorAll('h3');
    var out = [];
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      if (h.closest('#' + CFG.badgeId)) continue;
      if (inSidebarArea(h)) continue;
      // 折叠/隐藏的标题先跳过，展开后下一轮扫描会补上
      if (!h.getClientRects().length) continue;
      var t = leadText(h) || clean(h.textContent);
      if (!t || t.length > 120) continue;
      out.push(h);
    }
    return out;
  }

  // 术语 title 用标题自身文字；key 用 slug，重名的按出现顺序加 #2、#3
  function collectGlossary() {
    var hs = findGlossaryHeads();
    var seen = {};
    var out = [];

    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      var title = (leadText(h) || clean(h.textContent)).slice(0, 120);
      var slug = title
        .toLowerCase()
        .replace(/[^0-9a-z\u4e00-\u9fa5]+/g, ' ')
        .trim()
        .slice(0, 64);
      if (!slug) continue;

      var n = (seen[slug] || 0) + 1;
      seen[slug] = n;

      out.push({
        el: h,
        meta: {
          idx: null,
          title: title,
          key: 'gl|' + slug + (n > 1 ? '#' + n : ''),
          srcId: h.id,
          srcText: title
        }
      });
    }
    return out;
  }

  // 插在 h3 内部、术语文字之前：标题是块级元素，行内框放在它外面会单独占一行
  function ensureGlossBox(h, meta) {
    var wrap = null;
    for (var c = h.firstElementChild; c; c = c.nextElementSibling) {
      if (c.classList && c.classList.contains(CFG.wrapClass)) { wrap = c; break; }
    }

    if (!wrap || !wrap.firstElementChild) {
      wrap = document.createElement('span');
      wrap.className = CFG.wrapClass + ' ' + CFG.prependClass + ' ' + CFG.headingClass;
      wrap.appendChild(createBox(meta));
      h.insertBefore(wrap, h.firstChild);
    }

    var box = wrap.firstElementChild;
    if (!box) return null;
    setVisual(box, meta, isDone(meta.key));
    return box;
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

  // 少数条目没有 href（渲染成普通 div），只按链接找就会漏掉。
  // 和已命中的链接行同级、形状相同、且自身不含链接的元素，补进来。
  function isDocRowBlock(el) {
    if (!isDocItem(el, false)) return false;
    if (el.querySelector('a[href]')) return false; // 含链接的要么是容器，要么已被链接行覆盖
    var r = el.getBoundingClientRect();
    if (r.height > 40) return false; // 单行高度，排除整段区块
    return true;
  }

  function docRowsBeside(anchors) {
    var parents = [];
    var out = [];
    for (var i = 0; i < anchors.length; i++) {
      var par = anchors[i].parentElement;
      if (!par || par === document.body) continue;
      if (parents.indexOf(par) !== -1) continue;
      parents.push(par);

      for (var c = par.firstElementChild; c; c = c.nextElementSibling) {
        if (c.nodeType !== 1) continue;
        if (anchors.indexOf(c) !== -1 || out.indexOf(c) !== -1) continue;
        if (isDocRowBlock(c)) out.push(c);
      }
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
        if (items.length >= 2) {
          addAll(items);
          addAll(docRowsBeside(items)); // 补上同组里没有 href 的行
          break;
        }
        items = docItemCandidates(p, false);
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

  /* ------------------------------------------------------------------ */
  /* 识别操作符（/learn/operators）                                        */
  /* ------------------------------------------------------------------ */

  // 真实页面用 react-table 渲染，定义单元格形如：
  // <div class="rt-td rt-td--definition" role="gridcell">
  //   <div id="abs" class="operator-explorer__definition-content ...">abs(x)
  //     <div><div class="ui grey tiny label operator-explorer__scope-label">base</div></div>
  //   </div>
  // </div>
  var OP_DEF_SELECTOR = '.rt-td--definition, [class*="operator-explorer__definition"]';

  // rank(x) / ts_mean(x, d) / bucket(rank(x), range="0,1,0.1") —— 允许一层嵌套括号、允许名字与括号间有空格
  var RE_SIG = /^[a-z][a-z0-9_]{0,40}\s*\((?:[^()]|\([^()]*\))*\)$/i;

  // 主路径：直接找"定义单元格"（比文本正则稳得多，且能拿到 id 当 key）
  function findOperatorCells() {
    if (!document.body) return [];
    var defs = document.body.querySelectorAll(OP_DEF_SELECTOR);
    var out = [];
    var seen = {};

    for (var i = 0; i < defs.length; i++) {
      var def = defs[i];
      if (def.closest('#' + CFG.badgeId)) continue;

      var r = def.getBoundingClientRect();
      if (r.height < 10 || r.width < 20) continue;

      var meta = opCellMetaOf(def);
      if (!meta) continue;
      if (seen[meta.key]) continue;
      seen[meta.key] = 1;
      out.push(def);
    }
    return out;
  }

  // 取定义块"自己的"开头文本：跳过我们注入的勾选框，遇到第一个真实元素就停。
  // 注入后 firstChild 变成了勾选框，不能直接读 firstChild.nodeValue。
  function leadText(inner) {
    var s = '';
    for (var n = inner.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { s += n.nodeValue; continue; }
      if (n.nodeType === 1 && n.classList && n.classList.contains(CFG.wrapClass)) continue;
      break;
    }
    return normText(s);
  }

  function opCellMetaOf(def) {
    // 定义块自带 id（abs / add / ts_mean …），是比标题稳定得多的 key
    var inner = def.querySelector('[id]') || def.firstElementChild || def;
    var id = inner.id || def.id || '';

    // 标题取定义块开头的签名文本："abs(x)"、"add(x, y, filter = false), x + y"
    var title = leadText(inner);

    // react-table 会复用行节点（翻页/搜索），缓存必须校验当前内容，否则 key 会串行
    var cached = metaCache.get(def);
    if (cached && cached.srcId === id && cached.srcText === title) return cached;

    if (!title) title = normText(def.textContent).slice(0, 60);
    if (!id && !title) return null;

    var key = 'op|' + (id || title.toLowerCase().slice(0, 48));
    var meta = { idx: null, title: title || id, key: key, srcId: id, srcText: title };
    metaCache.set(def, meta);
    return meta;
  }

  function collectOperatorTargets() {
    var cells = findOperatorCells();
    // 有 id 的单元格几乎可以确定就是操作符行；只有 1 条（筛选后）也算数
    var hasId = false;
    for (var k = 0; k < cells.length; k++) {
      var m = metaCache.get(cells[k]);
      if (m && m.srcId) { hasId = true; break; }
    }
    if (cells.length >= 2 || (cells.length === 1 && hasId)) {
      var byCell = [];
      for (var i = 0; i < cells.length; i++) byCell.push({ el: cells[i], mode: 'opcell' });
      return byCell;
    }
    // 结构变了就退回按签名文本识别
    var sigs = findOperatorItems();
    var bySig = [];
    for (var j = 0; j < sigs.length; j++) bySig.push({ el: sigs[j], mode: 'op' });
    return bySig;
  }

  var opCellBoxCache = new WeakMap();

  // 插到「定义内容」div 内部、签名文本之前：块级子元素会把行内勾选框挤到上一行，
  // 所以必须进到内容 div 里面才能做到「☐ abs(x)」同一行。
  function ensureOpCellBox(def, meta) {
    var cached = opCellBoxCache.get(def);
    if (cached && cached.isConnected) {
      setVisual(cached, meta, isDone(meta.key));
      return cached;
    }

    var inner = def.querySelector('[id]') || def.firstElementChild || def;

    var existing = inner.querySelector('.' + CFG.wrapClass);
    if (existing && existing.firstElementChild) {
      opCellBoxCache.set(def, existing.firstElementChild);
      setVisual(existing.firstElementChild, meta, isDone(meta.key));
      return existing.firstElementChild;
    }

    var wrap = document.createElement('span');
    wrap.className = CFG.wrapClass + ' ' + CFG.prependClass;

    var box = createBox(meta);
    wrap.appendChild(box);
    inner.insertBefore(wrap, inner.firstChild);

    opCellBoxCache.set(def, box);
    setVisual(box, meta, isDone(meta.key));
    return box;
  }

  // 归一化：去掉零宽字符、不换行空格，压缩空白
  function normText(s) {
    return String(s || '')
      .replace(/[\u200b-\u200f\ufeff\u00a0\u3000]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function childIndex(el) {
    var p = el.parentElement;
    if (!p) return -1;
    var idx = 0;
    for (var c = p.firstElementChild; c; c = c.nextElementSibling) {
      if (c === el) return idx;
      idx++;
    }
    return -1;
  }

  // 子元素里已经有同文本的（说明当前是外层包装），交给更内层的元素处理
  function hasInnerSameText(el, t) {
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      if (normText(kids[i].textContent) === t) return true;
    }
    return false;
  }

  function opCandidates(strict) {
    if (!document.body) return [];

    var out = [];
    var seen = {};
    var all = document.body.querySelectorAll('*');

    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el.tagName) continue;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') continue;
      // 允许带子元素：语法高亮常把 rank(x) 拆成多个 span
      if (el.childElementCount > 8) continue;
      if (el.closest('#' + CFG.badgeId)) continue;
      if (el.classList && (el.classList.contains(CFG.wrapClass) || el.classList.contains(CFG.boxClass))) continue;

      var t = normText(el.textContent);
      if (!t || t.length < 4 || t.length > 90) continue;
      if (!RE_SIG.test(t)) continue;
      if (hasInnerSameText(el, t)) continue;

      var r = el.getBoundingClientRect();
      if (r.width < 16 || r.height < 8 || r.height > 48) continue;

      var p = el.parentElement;
      if (!p) continue;
      var pt = normText(p.textContent);

      // 严格模式：行首就是签名；或签名是这一行的前几个元素之一（前面可能有图标/名称小标签），
      // 且后面还得跟着兄弟元素（通常是描述块）—— 这样能排除正文里的行内举例
      var atStart = pt.indexOf(t) === 0;
      var early = childIndex(el) !== -1 && childIndex(el) <= 2 && !!el.nextElementSibling;
      if (strict && !(atStart || early)) continue;
      // 宽松模式：父块里出现过这个签名即可
      if (!strict && pt.indexOf(t) === -1) continue;

      var key = t.toLowerCase().replace(/\s+/g, '');
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(el);
    }
    return out;
  }

  function findOperatorItems() {
    var items = opCandidates(true);
    if (items.length >= 3) return items;
    var loose = opCandidates(false);
    return loose.length > items.length ? loose : items;
  }

  function opMetaOf(leaf) {
    if (metaCache.has(leaf)) return metaCache.get(leaf);
    var sig = normText(leaf.textContent);
    if (!sig) return null;
    var meta = { idx: null, title: sig, key: 'op|' + sig.toLowerCase().replace(/\s+/g, ' ') };
    metaCache.set(leaf, meta);
    return meta;
  }

  var opBoxCache = new WeakMap();

  function ensureOpBox(leaf, meta) {
    var cached = opBoxCache.get(leaf);
    if (cached && cached.isConnected) {
      setVisual(cached, meta, isDone(meta.key));
      return cached;
    }

    var p = leaf.parentElement;
    if (!p) return null;

    // 页面上已经有（例如上层只替换了签名节点、保留了行容器时）
    var prev = leaf.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains(CFG.wrapClass) && prev.firstElementChild) {
      var reused = prev.firstElementChild;
      opBoxCache.set(leaf, reused);
      setVisual(reused, meta, isDone(meta.key));
      return reused;
    }

    var wrap = document.createElement('span');
    wrap.className = CFG.wrapClass + ' ' + CFG.prependClass;

    var box = createBox(meta);
    wrap.appendChild(box);
    p.insertBefore(wrap, leaf);

    opBoxCache.set(leaf, box);
    setVisual(box, meta, isDone(meta.key));
    return box;
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

  // 勾选框当前绑定的 meta。react-table 复用行节点时会用新的 meta 重绘同一个 box，
  // 而 click 闭包里握着的还是创建时的旧 meta —— 必须走这个指针，否则会写错 key。
  var boxMeta = new WeakMap();

  function metaOfBox(box, fallback) {
    return boxMeta.get(box) || fallback;
  }

  // 自绘勾选框（不用原生 input）：原生 checkbox 若被 preventDefault 会回滚勾选状态，
  // 而行本身常常包在 <a> 里，必须阻止默认跳转。
  function createBox(meta) {
    var box = document.createElement('span');
    box.className = CFG.boxClass;
    box.setAttribute('role', 'checkbox');
    box.setAttribute('tabindex', '0');
    box.setAttribute('aria-checked', 'false');

    box.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      commit(box, metaOfBox(box, meta), box.getAttribute('aria-checked') !== 'true');
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') {
        e.preventDefault();
        e.stopPropagation();
        commit(box, metaOfBox(box, meta), box.getAttribute('aria-checked') !== 'true');
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
    return box;
  }

  function ensureBox(row, meta, prepend) {
    var host = attachPoint(row);
    if (!host) return null;

    var wrap = row.querySelector('.' + CFG.wrapClass);

    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = CFG.wrapClass + (prepend ? ' ' + CFG.prependClass : '');

      wrap.appendChild(createBox(meta));
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
    if (meta) boxMeta.set(box, meta);
    box.setAttribute('aria-checked', on ? 'true' : 'false');
    box.setAttribute('aria-label', (on ? '已学习：' : '标记为已学习：') + meta.title);
    box.title = on ? '已学习（点击取消）' : '点击标记为「已学习」';
    if (meta.key) box.dataset.wqKey = meta.key;
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

  // 这些页面本来就应该有条目；识别到 0 条时给个可见提示，方便区分「脚本没跑」和「没认出条目」
  function isListPage() {
    return isGlossaryPage() || isDocPage() || isOperatorPage() || /^\/learn\/courses\/[^/]+\/?$/.test(location.pathname);
  }

  function updateBadge(done, total, recognized) {
    var badge = document.getElementById(CFG.badgeId);
    if (!badge) {
      if (total <= 0 && !isListPage()) return;
      badge = ensureBadge();
    }
    var txt = badge.querySelector('.wq-badge-text');

    // 悬停徽标能看到版本 + 识别数，方便「框没出来」时不用开控制台就能反馈
    badge.title = 'WorldQuant BRAIN 学习进度（保存在本机浏览器）\n' +
      'v' + VERSION + ' · 识别 ' + (recognized == null ? total : recognized) + ' 条 / 页面 ' + total + ' 个框';

    if (total <= 0) {
      if (!isListPage()) {
        badge.style.display = 'none';
        return;
      }
      badge.style.display = 'flex';
      badge.style.opacity = '0.9';
      if (txt) txt.textContent = 'v' + VERSION + ' 已运行 · 未识别到条目';
      return;
    }

    badge.style.display = 'flex';
    badge.style.opacity = '1';
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
      '.' + CFG.wrapClass + '.' + CFG.prependClass + '{margin-left:0;margin-right:7px;vertical-align:middle;}',
      // 标题里的框：h3 字号大，靠 baseline 对齐会偏，单独微调
      '.' + CFG.wrapClass + '.' + CFG.headingClass + '{margin-right:10px;vertical-align:-1px;}',
      '.' + CFG.headingClass + ' .' + CFG.boxClass + '{width:17px;height:17px;}',
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

    if (isGlossaryPage()) {
      runGlossary();
      return;
    }

    if (!inLearn()) {
      var b = document.getElementById(CFG.badgeId);
      if (b) b.style.display = 'none';
      return;
    }

    injectStyle();
    if (mo) mo.disconnect();
    try {
      var mode = isDocPage() ? 'doc' : isOperatorPage() ? 'op' : 'lesson';
      var items = [];

      if (mode === 'doc') {
        var docs = findDocItems();
        for (var d = 0; d < docs.length; d++) items.push({ el: docs[d], mode: 'doc' });
      } else if (mode === 'op') {
        var targets = collectOperatorTargets();
        for (var o = 0; o < targets.length; o++) items.push({ el: targets[o].el, mode: targets[o].mode });
      } else {
        var rows = findRows();
        for (var i = 0; i < rows.length; i++) items.push({ el: rows[i], mode: 'lesson' });
      }

      var done = 0;
      var total = 0;
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        var meta = it.mode === 'doc' ? docMetaOf(it.el)
          : it.mode === 'op' ? opMetaOf(it.el)
          : it.mode === 'opcell' ? opCellMetaOf(it.el)
          : metaOf(it.el);
        if (!meta) continue;
        var box = it.mode === 'op' ? ensureOpBox(it.el, meta)
          : it.mode === 'opcell' ? ensureOpCellBox(it.el, meta)
          : ensureBox(it.el, meta, it.mode === 'doc');
        if (!box) continue;
        total++;
        if (box.getAttribute('aria-checked') === 'true') done++;
      }

      // 页面上可能存在上一轮渲染留下的框（React 复用节点），本轮没再识别到。
      // 它们还在、还能点，进度按「实际存在的框」算才不会和肉眼看到的对不上。
      var recognized = total;
      var live = document.querySelectorAll('.' + CFG.boxClass);
      if (live.length > recognized) {
        done = 0;
        total = live.length;
        for (var live_i = 0; live_i < live.length; live_i++) {
          if (live[live_i].getAttribute('aria-checked') === 'true') done++;
        }
      }
      updateBadge(done, total, recognized);

      // 自检日志：在控制台里能直接看到脚本是否运行、当前页识别到多少条目
      selfCheck(mode, recognized, total);
    } catch (e) {
      /* 页面结构变化时不让脚本整体挂掉 */
      console && console.debug && console.debug('[wq-tracker]', e);
    } finally {
      observe();
    }
  }

  function runGlossary() {
    injectStyle();
    if (mo) mo.disconnect();
    try {
      var list = collectGlossary();
      var done = 0;
      var total = 0;
      for (var i = 0; i < list.length; i++) {
        var box = ensureGlossBox(list[i].el, list[i].meta);
        if (!box) continue;
        total++;
        if (box.getAttribute('aria-checked') === 'true') done++;
      }
      updateBadge(done, total);
      selfCheck('glossary', total);
    } catch (e) {
      console && console.debug && console.debug('[wq-tracker]', e);
    } finally {
      observe();
    }
  }

  var lastCheckKey = '';

  function selfCheck(mode, recognized, live) {
    // 给诊断片段 / 控制台留个标记，没装或没运行时可据此判断
    var boxes = (live == null ? recognized : live);
    try {
      window.__WQ = { version: VERSION, path: location.pathname, mode: mode, items: recognized, boxes: boxes };
    } catch (e) {}

    var key = mode + '|' + recognized + '|' + boxes + '|' + location.pathname;
    if (key === lastCheckKey) return; // 避免重渲染时刷屏
    lastCheckKey = key;
    if (typeof console === 'undefined' || !console.log) return;
    // 用 log 而不是 debug：Chrome 默认级别不显示 debug，排障时看不到
    console.log(
      '[WQ] v' + VERSION + ' path=' + location.pathname + ' mode=' + mode + ' items=' + recognized +
      (boxes !== recognized ? ' boxes=' + boxes + '（有框没被本轮识别，可能漏了条目）' : '') +
      (recognized === 0 ? '  ← 没识别到条目，请执行 wq-diagnose.js 并把输出发给开发者' : '')
    );
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    // 用 setTimeout 而不是 requestAnimationFrame：rAF 在后台标签页/无帧环境不会触发，
    // 会把 pending 永久卡在 true，之后所有重扫都被丢弃。
    setTimeout(function () {
      pending = false;
      run();
    }, 60);
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

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WQ] script v' + VERSION + ' loaded on ' + location.href);
  }

  boot();
})();
