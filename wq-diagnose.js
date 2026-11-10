/**
 * WorldQuant BRAIN 学习进度脚本 —— 页面结构诊断（v3）
 *
 * 用法：在看不到勾选框的页面按 F12 → Console → 粘贴本文件全部内容 → 回车
 * 把打印出来的 JSON 整段复制发给开发者。只读取 DOM，不修改任何东西。
 */
(function () {
  var ZERO = /[\u200b-\u200f\ufeff\u00a0\u3000]/g;
  var clean = function (s) {
    return String(s || '').replace(ZERO, ' ').replace(/\s+/g, ' ').trim();
  };
  var cut = function (s, n) {
    s = String(s || '').replace(/\s+/g, ' ');
    return s.length > n ? s.slice(0, n) + ' …[截断]' : s;
  };
  var sig = function (el) {
    if (!el || !el.tagName) return '?';
    var cls = typeof el.className === 'string' ? el.className.trim().replace(/\s+/g, '.') : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cut(cls, 40) : '') + (el.id ? '#' + el.id : '');
  };

  var body = document.body;
  var out = {
    url: location.href,
    path: location.pathname,
    installed: window.__WQ || '未检测到 window.__WQ（脚本未运行或版本 < 1.2.2）',
    injected: {
      style: !!document.getElementById('wq-learn-style'),
      badge: !!document.getElementById('wq-learn-badge'),
      checkbox: document.querySelectorAll('.wq-lesson-box').length
    },
    iframes: document.querySelectorAll('iframe').length,
    counts: {},
    samples: {}
  };

  var RE_NUM = /^(\d{1,3})\s*[.)．、]\s*/;
  var RE_DUR = /\d+\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)(?![a-z])|\b\d{1,2}:\d{2}\b/i;
  var RE_SIG = /^[a-z][a-z0-9_]{0,40}\s*\((?:[^()]|\([^()]*\))*\)$/i;

  var lesson = [], sigLeaf = [], sigEl = [], artLabel = [], paren = [], mono = [];
  var heads = body.querySelectorAll('h3');
  var all = body.querySelectorAll('*');

  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (!el.tagName) continue;
    if (el.id === 'wq-learn-badge') continue;
    if (el.classList && (el.classList.contains('wq-box-wrap') || el.classList.contains('wq-lesson-box'))) continue;

    var t = clean(el.textContent);
    if (!t) continue;

    if (el.childElementCount === 0) {
      if (RE_SIG.test(t) && t.length <= 90) sigLeaf.push(el);
      if (/^\d+\s*articles?$/i.test(t)) artLabel.push(el);
    }
    if (el.childElementCount <= 8 && RE_SIG.test(t) && t.length <= 90) sigEl.push(el);

    // 只要"以 name( 开头"的短块，不要求完整闭合 —— 用来抓被拆开的签名
    if (el.childElementCount <= 6 && /^[a-z][a-z0-9_]{0,40}\s*\(/i.test(t) && t.length <= 100) paren.push(el);

    if (el.childElementCount <= 12 && t.length >= 5 && t.length <= 220 && RE_NUM.test(t) && RE_DUR.test(t)) lesson.push(el);

    if (el.childElementCount === 0 && t.length <= 60) {
      try {
        var ff = getComputedStyle(el).fontFamily || '';
        if (/mono|menlo|consolas|courier/i.test(ff)) mono.push(el);
      } catch (e) {}
    }
  }

  out.counts = {
    lessonRows: lesson.length,
    signatureLeaves: sigLeaf.length,
    signatureBlocks: sigEl.length,
    parenBlocks: paren.length,
    articleLabels: artLabel.length,
    docLinks: document.querySelectorAll('a[href*="/documentation"]').length,
    codeTags: document.querySelectorAll('code,pre,kbd').length,
    monoLeaves: mono.length,
    h3: heads.length
  };

  // 术语表页（Zendesk 文章页）专用：每个候选容器里有多少 h3，以及 h3 的包裹结构
  var GLOSS_CONTAINERS = ['.article-body', '[data-article-body]', '.article__body', '.article-body-content', 'article', 'main', '[role="main"]'];
  out.glossary = {
    containers: GLOSS_CONTAINERS.map(function (sel) {
      var el = document.querySelector(sel);
      return {
        selector: sel,
        found: !!el,
        h3: el ? el.querySelectorAll('h3').length : 0,
        where: el ? sig(el) : null
      };
    }),
    h3Samples: Array.prototype.slice.call(heads, 0, 8).map(function (h) {
      return {
        text: cut(clean(h.textContent), 70),
        where: sig(h) + '  in ' + sig(h.parentElement) + '  in ' + sig(h.parentElement && h.parentElement.parentElement),
        kids: h.childElementCount,
        rect: (function () {
          var r = h.getBoundingClientRect();
          return Math.round(r.width) + 'x' + Math.round(r.height);
        })(),
        html: cut(h.outerHTML, 320)
      };
    })
  };

  out.samples.operatorBlocks = paren.slice(0, 5).map(function (el) {
    return {
      where: sig(el) + '  in ' + sig(el.parentElement),
      text: cut(clean(el.textContent), 60),
      html: cut(el.outerHTML, 700)
    };
  });

  out.samples.parentOfOperator = paren.slice(0, 2).map(function (el) {
    return cut(el.parentElement ? el.parentElement.outerHTML : '', 900);
  });

  out.samples.monoTexts = mono.slice(0, 8).map(function (el) {
    return clean(el.textContent) + ' [' + sig(el) + ']';
  });

  out.samples.lessonRows = lesson.slice(0, 2).map(function (el) { return cut(el.outerHTML, 700); });

  // Documentation 页：没有勾选框、但看起来像「一行条目」的元素。
  // 刻意比正式识别宽松（不要求图标、不要求是链接），宁多勿漏 —— 否则漏掉的行
  // 恰好是因为不满足某个条件而被拒的，诊断里也看不到，等于白查。
  var docMiss = [];
  for (var m2 = 0; m2 < all.length; m2++) {
    var cand = all[m2];
    if (cand.closest && cand.closest('#wq-learn-badge')) continue;
    if (cand.classList && (cand.classList.contains('wq-box-wrap') || cand.classList.contains('wq-lesson-box'))) continue;
    if (cand.querySelector && cand.querySelector('.wq-lesson-box, .wq-box-wrap')) continue;
    var ct = clean(cand.textContent);
    if (!ct || ct.length < 2 || ct.length > 140) continue;
    if (/^\d+\s*articles?$/i.test(ct)) continue;
    var cr = cand.getBoundingClientRect();
    if (cr.width < 60 || cr.height < 12 || cr.height > 90) continue;
    // Cookie 同意弹窗（cky-* / cookie / consent）是纯噪音，排除
    if (cand.closest && cand.closest('[class*="cky-"], [id*="cky"], [class*="cookie"], [id*="cookie"], [class*="consent"]')) continue;
    // 父节点（行规模）里已经有框 → 自己是已挂框行内部的东西（标题 span 等），不算
    var par = cand.parentElement;
    if (par && par.querySelector('.wq-lesson-box') && par.childElementCount <= 8) continue;
    docMiss.push(cand);
  }
  var docMissInner = docMiss.filter(function (el) {
    for (var q = 0; q < docMiss.length; q++) {
      if (docMiss[q] !== el && el.contains(docMiss[q])) return false;
    }
    return true;
  });
  out.docRowsWithoutBox = {
    count: docMissInner.length,
    samples: docMissInner.slice(0, 20).map(function (el) {
      return {
        text: cut(clean(el.textContent), 60),
        where: sig(el) + '  in ' + sig(el.parentElement) + '  in ' + sig(el.parentElement && el.parentElement.parentElement),
        tag: el.tagName,
        href: el.tagName === 'A' ? (el.getAttribute('href') || '(无 href)') : '(非链接)',
        kids: el.childElementCount,
        hasIcon: !!(el.querySelector && el.querySelector('svg,img,i,[class*="icon"],[class*="Icon"],[class*="fa-"]')),
        rect: (function () {
          var r2 = el.getBoundingClientRect();
          return Math.round(r2.width) + 'x' + Math.round(r2.height);
        })(),
        html: cut(el.outerHTML, 300)
      };
    })
  };

  // 类名热度：短文本元素上出现最多的 class，能看出"行"叫什么
  var freq = {};
  for (var j = 0; j < all.length; j++) {
    var e2 = all[j];
    if (!e2.classList || e2.childElementCount > 6) continue;
    var tx = clean(e2.textContent);
    if (!tx || tx.length > 80) continue;
    for (var c = 0; c < e2.classList.length; c++) {
      freq[e2.classList[c]] = (freq[e2.classList[c]] || 0) + 1;
    }
  }
  out.topClasses = Object.keys(freq)
    .sort(function (a, b) { return freq[b] - freq[a]; })
    .slice(0, 15)
    .map(function (k) { return k + ' ×' + freq[k]; });

  // 主内容区结构：文本量最大的容器，往下看一层
  var main = null, best = 0;
  for (var k2 = 0; k2 < all.length; k2++) {
    var e3 = all[k2];
    var len = (e3.textContent || '').length;
    if (len > best && e3.childElementCount >= 3 && e3.childElementCount <= 40) {
      best = len;
      main = e3;
    }
  }
  if (main) {
    out.mainArea = {
      container: sig(main) + ' (text=' + best + ')',
      children: Array.prototype.slice.call(main.children, 0, 6).map(function (ch) {
        return sig(ch) + ' kids=' + ch.childElementCount + ' text="' + cut(clean(ch.textContent), 70) + '"';
      })
    };
  }

  var text = JSON.stringify(out, null, 2);

  // 先把最关键的信息压缩成一行，复制失败时至少能肉眼读出
  var brief = [
    'path=' + out.path,
    'installed=' + (out.installed && out.installed.version ? 'v' + out.installed.version + ' items=' + out.installed.items : String(out.installed)),
    'checkbox=' + out.injected.checkbox,
    'signatures=' + out.counts.signatureBlocks,
    'parenBlocks=' + out.counts.parenBlocks,
    'mono=' + out.counts.monoLeaves,
    'lessonRows=' + out.counts.lessonRows,
    'articleLabels=' + out.counts.articleLabels,
    'h3=' + out.counts.h3,
    'docRowsWithoutBox=' + out.docRowsWithoutBox.count,
    'main=' + (out.mainArea ? out.mainArea.container : '?')
  ].join(' | ');

  console.log('%c[WQ 摘要] ' + brief, 'color:#c0392b;font-weight:700');
  console.log('%c[WQ 诊断] 下面是完整 JSON，请整段复制给开发者', 'color:#2bb673;font-weight:700;font-size:13px');
  console.log(text);

  var copied = false;
  try {
    if (typeof copy === 'function') { copy(text); copied = true; } // DevTools 自带，最可靠
  } catch (e) {}
  if (!copied) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text); } catch (e) {}
  }

  return '诊断完成：摘要=[WQ 摘要]，完整 JSON 已输出并尝试复制到剪贴板；若剪贴板为空，请在控制台右键该 JSON → Copy string contents';
})();
