/*!
 * Hexo Theme Suka (bulie fork) | pjax.js
 * PJAX 无刷新加载: 拦截站内链接点击, 通过 AJAX 获取页面并局部替换 #pjax-container 内容。
 *
 * 特性:
 * - 脚本按序执行 (外部脚本去重、行内脚本重放、document.write 保护)
 * - 容器内 <link rel="stylesheet"> 提升到 <head> 加载
 * - 页面标题更新、history.pushState / popstate 前进后退、滚动位置恢复
 * - 会话内页面缓存、请求超时回退整页跳转、顶部加载进度条
 * - 页面切换过渡动画: View Transitions API 优先, 不支持时回退 CSS 淡入淡出 (均尊重 prefers-reduced-motion)
 * - TOC/锚点平滑滚动 (尊重 prefers-reduced-motion)
 * - 链接预加载: 悬停/触摸/键盘聚焦去抖预取文章页, 首屏可见文章链接自动预取
 * - 适配主题: 畅言评论、本地搜索表单、Prism
 *
 * 用法:
 * - 配置注入: <script>window.SukaPjaxConfig = {...}</script> 后引入本文件
 * - 链接可加 data-pjax-ignore 属性跳过 PJAX, 脚本可加 data-pjax-skip 属性跳过重放
 * - 事件: pjax:start / pjax:end / pjax:error (document 上派发, 也可 SukaPjax.on())
 */
(function () {
    'use strict';

    var config = window.SukaPjaxConfig || {};
    var CONTAINER_SELECTOR = config.container || '#pjax-container';
    var EXCLUDES = Array.isArray(config.exclude) ? config.exclude : [];
    var TIMEOUT = config.timeout || 10000;
    var CACHE_SIZE = config.cache || 20;

    // 页面切换过渡动画时长 (ms), 0 表示关闭
    var TRANSITION_MS = (typeof config.transition === 'number') ? config.transition : 160;
    // 链接预加载
    var prefetchOpts = config.prefetch || {};
    var PREFETCH_ENABLED = prefetchOpts.enable !== false;
    var PREFETCH_DELAY = prefetchOpts.delay || 150;
    var PREFETCH_IDLE = prefetchOpts.idle !== false;

    var container = null;          // 当前页面的刷新容器
    var cache = new Map();         // key(pathname+search) -> { html, title }
    var loadedScripts = {};        // 已加载的外部脚本绝对地址
    var currentKey = '';           // 当前页面 key
    var scrollPositions = {};      // key -> scrollTop (popstate 时恢复)
    var loading = false;
    var currentAbort = null;       // 进行中的请求 (用于取消)
    var currentToken = 0;          // 请求令牌, 防止过期响应覆盖新响应
    var applySeq = 0;              // 应用页面序号, 防止重叠过渡互相干扰

    /* ---------- 工具 ---------- */

    function keyOf(url) {
        return url.pathname + url.search;
    }

    function fire(name, detail) {
        var evt;
        try {
            evt = new CustomEvent(name, { detail: detail || {} });
        } catch (e) {
            evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(name, false, false, detail || {});
        }
        document.dispatchEvent(evt);
    }

    function seedLoadedScripts() {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].src) loadedScripts[scripts[i].src] = true;
        }
    }

    /* ---------- 顶部加载进度条 ---------- */

    var bar = null;
    var barTimer = null;

    function createBar() {
        var style = document.createElement('style');
        style.textContent = '.pjax-progress{position:fixed;top:0;left:0;z-index:99999;'
            + 'height:2px;width:0;background:#3273dc;opacity:0;'
            + 'transition:width .25s ease,opacity .3s ease;pointer-events:none}';
        document.head.appendChild(style);
        bar = document.createElement('div');
        bar.className = 'pjax-progress';
        document.body.appendChild(bar);
    }

    function showBar() {
        if (!bar) return;
        bar.style.opacity = '1';
        bar.style.width = '15%';
        barTimer = setTimeout(function () {
            if (bar) bar.style.width = '60%';
        }, 120);
    }

    function hideBar() {
        if (!bar) return;
        clearTimeout(barTimer);
        bar.style.width = '100%';
        setTimeout(function () {
            if (!bar) return;
            bar.style.opacity = '0';
            bar.style.width = '0';
        }, 200);
    }

    /* ---------- 页面切换过渡动画 ---------- */

    function prefersReducedMotion() {
        return !!(window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function injectTransitionStyle() {
        var style = document.createElement('style');
        style.textContent = '#pjax-container.pjax-leaving{opacity:0;transform:translateY(10px)}'
            + '#pjax-container.pjax-entering{opacity:0;transform:translateY(10px)}';
        document.head.appendChild(style);
    }

    /* ---------- 链接 / 表单拦截 ---------- */

    function shouldIntercept(link) {
        if (link.hasAttribute('data-pjax-ignore')) return false;
        // target="_blank" 等新窗口/新上下文链接不拦截
        if (link.target && link.target !== '_self') return false;
        if (link.hasAttribute('download')) return false;
        if (link.rel && /\bexternal\b/i.test(link.rel)) return false;
        // 位于被标记忽略的区域内的链接
        if (link.closest('[data-pjax-ignore]')) return false;

        var href = link.getAttribute('href');
        if (!href) return false;
        if (href.charAt(0) === '#') return false;      // 纯锚点, 交给浏览器滚动
        if (/^javascript:/i.test(href)) return false;

        var url;
        try {
            url = new URL(link.href, location.href);
        } catch (e) {
            return false;
        }
        if (url.origin !== location.origin) return false;
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

        for (var i = 0; i < EXCLUDES.length; i++) {
            try {
                if (link.matches(EXCLUDES[i])) return false;
            } catch (e) { /* 无效选择器忽略 */ }
        }
        return true;
    }

    document.addEventListener('click', function (e) {
        if (!container || e.defaultPrevented) return;
        if (e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (e.target.nodeType !== 1) return;
        var link = e.target.closest('a');
        if (!link) return;

        // TOC 纯锚点链接: 平滑滚动并同步 URL hash (其余锚点链接仍交给浏览器原生处理)
        var rawHref = link.getAttribute('href') || '';
        if (rawHref.charAt(0) === '#' && link.closest('#post-toc')) {
            e.preventDefault();
            scrollToHash(rawHref);
            if (location.hash !== rawHref) {
                try {
                    history.pushState({ pjax: true, key: keyOf(new URL(location.href)) }, '', rawHref);
                } catch (err) { /* 受限环境忽略 */ }
            }
            return;
        }

        if (!shouldIntercept(link)) return;

        var url;
        try {
            url = new URL(link.href, location.href);
        } catch (err) {
            return;
        }
        var key = keyOf(url);
        if (key === currentKey) {
            // 同页链接: 有锚点则滚动, 否则忽略
            if (url.hash && url.hash !== location.hash) {
                e.preventDefault();
                scrollToHash(url.hash);
            }
            return;
        }
        e.preventDefault();
        load(url.href, { hash: url.hash });
    }, true);

    // 本地搜索表单: 拦截提交, 通过 PJAX 携带 ?s= 参数跳转
    document.addEventListener('submit', function (e) {
        if (!container || e.defaultPrevented) return;
        var form = e.target;
        if (!form || form.tagName !== 'FORM') return;
        if (!form.closest(CONTAINER_SELECTOR)) return;
        var field = form.querySelector('input[name="s"]');
        if (!field) return;
        e.preventDefault();
        var url = new URL(form.action || location.href);
        var value = field.value.trim();
        if (value) {
            url.searchParams.set('s', value);
        } else {
            url.searchParams.delete('s');
        }
        load(url.toString(), {});
    }, true);

    /* ---------- 获取页面 ---------- */

    function fetchPage(url, token, done) {
        var controller = null;
        if (window.AbortController) {
            controller = new AbortController();
            currentAbort = controller;
        }
        var timer = setTimeout(function () {
            if (controller) controller.abort();
        }, TIMEOUT);

        var reqOpts = { headers: { 'X-PJAX': 'true' } };
        if (controller) reqOpts.signal = controller.signal;

        fetch(url.href, reqOpts).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var ct = res.headers.get('content-type') || '';
            if (ct && ct.indexOf('text/html') === -1) throw new Error('Not HTML: ' + ct);
            return res.text();
        }).then(function (html) {
            if (token !== currentToken) return;
            clearTimeout(timer);
            if (currentAbort === controller) currentAbort = null;
            done(null, html);
        }).catch(function (err) {
            if (token !== currentToken) return;
            clearTimeout(timer);
            if (currentAbort === controller) currentAbort = null;
            done(err || new Error('fetch failed'));
        });
    }

    /* ---------- 应用页面 ---------- */

    function applyPage(url, payload, opts) {
        // payload: { html, title } 或 { doc }
        var parsed = payload.doc || new DOMParser().parseFromString(payload.html, 'text/html');
        var newContainer = parsed.querySelector(CONTAINER_SELECTOR);
        if (!newContainer) {
            // 目标页面没有刷新容器 (如 404), 回退为整页跳转
            window.location.href = url.href;
            return;
        }

        var key = keyOf(url);

        if (CACHE_SIZE > 0 && !payload.fromCache) {
            var titleEl = parsed.querySelector('title');
            cache.set(key, {
                // 缓存容器 outerHTML, 缓存命中时解析后仍能找到 #pjax-container
                html: newContainer.outerHTML,
                title: titleEl ? titleEl.textContent : ''
            });
            if (cache.size > CACHE_SIZE) {
                cache.delete(cache.keys().next().value); // 淘汰最旧
            }
        }

        if (opts.push !== false) {
            try {
                history.pushState({ pjax: true, key: key }, '', url.href);
            } catch (e) { /* 受限环境 (如 file://) 忽略 */ }
        }
        currentKey = key;

        var seq = ++applySeq;
        var commit = function () {
            // 替换内容 (innerHTML 不会执行脚本, 由 runScripts 控制)
            container.innerHTML = newContainer.innerHTML;

            // 容器内的样式表提升到 <head> 加载
            loadStyles(container);

            // 标题
            var title = payload.title;
            if (title === undefined || title === '') {
                var tEl = parsed.querySelector('title');
                title = tEl ? tEl.textContent : '';
            }
            if (title) document.title = title;

            // 按序执行容器内脚本, 完成后做重初始化与滚动
            runScripts(container, function () {
                reinit(container);
                if (opts.hash) {
                    scrollToHash(opts.hash);
                } else if (typeof opts.scroll === 'number') {
                    window.scrollTo(0, opts.scroll);
                } else {
                    window.scrollTo(0, 0);
                }
                fire('pjax:end', { url: url.href });
                hideBar();
                loading = false;
            });
        };

        // 过渡动画: 优先 View Transitions API (浏览器原生平滑过渡),
        // 不支持时回退 CSS 淡出 -> 隐藏态换内容 -> 淡入; 快速连点由 seq 兜底
        // 行内 transition 保证移除 pjax-entering 触发淡入时动画仍生效
        if (typeof document.startViewTransition === 'function' && TRANSITION_MS > 0 && !prefersReducedMotion()) {
            document.startViewTransition(function () {
                commit();
            });
        } else if (TRANSITION_MS > 0 && !prefersReducedMotion()) {
            container.style.transition = 'opacity ' + TRANSITION_MS + 'ms ease,'
                + 'transform ' + TRANSITION_MS + 'ms ease';
            container.classList.add('pjax-leaving');
            setTimeout(function () {
                if (seq !== applySeq) return; // 已被更新的导航覆盖
                container.classList.add('pjax-entering');
                container.classList.remove('pjax-leaving');
                commit();
                setTimeout(function () {
                    if (seq !== applySeq) return;
                    container.classList.remove('pjax-entering');
                    setTimeout(function () {
                        if (seq !== applySeq) return;
                        container.style.transition = '';
                    }, TRANSITION_MS + 60);
                }, 50);
            }, TRANSITION_MS);
        } else {
            commit();
        }
    }

    /* ---------- 脚本执行 ---------- */

    // 行内脚本执行期间保护 document.write, 防止其清空整页
    function withSafeWrite(fn) {
        var docWrite = document.write;
        var docWriteln = document.writeln;
        var buffer = [];
        document.write = function (str) { buffer.push(String(str)); };
        document.writeln = function (str) { buffer.push(String(str) + '\n'); };
        try {
            fn();
        } finally {
            document.write = docWrite;
            document.writeln = docWriteln;
        }
        for (var i = 0; i < buffer.length; i++) {
            processWritten(buffer[i]);
        }
    }

    // 处理被 document.write 的 HTML: 提取脚本执行, 其余内容追加进容器
    function processWritten(html) {
        if (!html) return;
        var div = document.createElement('div');
        div.innerHTML = html; // innerHTML 不会执行其中的脚本
        var scripts = div.querySelectorAll('script');
        for (var i = 0; i < scripts.length; i++) {
            var s = scripts[i];
            if (s.src) {
                if (loadedScripts[s.src]) continue;
                loadedScripts[s.src] = true;
                var el = document.createElement('script');
                el.src = s.src;
                document.body.appendChild(el);
            } else {
                var code = s.textContent || '';
                if (code.trim()) {
                    withSafeWrite(function () {
                        var e = document.createElement('script');
                        e.text = code;
                        document.head.appendChild(e);
                    });
                }
            }
        }
        for (var j = 0; j < scripts.length; j++) {
            if (scripts[j].parentNode) scripts[j].parentNode.removeChild(scripts[j]);
        }
        while (div.firstChild) container.appendChild(div.firstChild);
    }

    // 按序执行容器内的 <script>: 外部脚本去重按序加载, 行内脚本依次重放
    function runScripts(root, done) {
        var scripts = root.querySelectorAll('script');
        var i = 0;

        function next() {
            while (i < scripts.length) {
                var s = scripts[i++];
                if (s.hasAttribute('data-pjax-skip')) continue;
                if (s.type && s.type.toLowerCase() === 'module') {
                    // module 脚本异步执行, 不阻塞后续
                    var m = document.createElement('script');
                    if (s.src) m.src = s.src;
                    else m.text = s.textContent || '';
                    m.type = 'module';
                    document.body.appendChild(m);
                    continue;
                }
                if (s.src) {
                    var src = s.src;
                    if (loadedScripts[src]) continue; // 已加载过, 跳过
                    loadedScripts[src] = true;
                    var el = document.createElement('script');
                    el.async = false; // 保证按插入顺序执行
                    el.src = src;
                    el.onload = el.onerror = next;
                    document.body.appendChild(el);
                    return;
                }
                var code = s.textContent || '';
                if (!code.trim()) continue;
                try {
                    withSafeWrite(function () {
                        var e = document.createElement('script');
                        e.text = code;
                        document.head.appendChild(e);
                    });
                } catch (err) {
                    if (window.console) console.error('[pjax] inline script error:', err);
                }
            }
            done();
        }

        next();
    }

    /* ---------- 样式表 ---------- */

    function loadStyles(root) {
        var links = root.querySelectorAll('link[rel~="stylesheet"]');
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var href = link.getAttribute('href');
            if (!href) continue;
            var abs;
            try {
                abs = new URL(href, location.href).href;
            } catch (e) {
                continue;
            }
            var exists = false;
            var headLinks = document.querySelectorAll('link[rel~="stylesheet"]');
            for (var j = 0; j < headLinks.length; j++) {
                if (headLinks[j].href === abs) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                var clone = document.createElement('link');
                clone.rel = 'stylesheet';
                clone.href = abs;
                document.head.appendChild(clone);
            }
            if (link.parentNode) link.parentNode.removeChild(link);
        }
    }

    /* ---------- 刷新后重初始化 ---------- */

    function reinit(root) {
        // Prism 代码高亮 (站点启用 prism 时)
        if (window.Prism && Prism.highlightAllUnder) {
            try {
                Prism.highlightAllUnder(root);
            } catch (e) { }
        }

        // vanilla-lazyload: 主题只在 footer 配置了 lazyLoadOptions,
        // 这里负责首次初始化与每次 PJAX 刷新后的增量扫描
        // (已移除: 图片懒加载改用原生 loading="lazy", 由 hexo 过滤器输出时直接带上)

        // 首屏可见的文章链接预取 (每次页面切换后重新扫描)
        prefetchVisiblePosts();

    }

    /* ---------- 滚动 ---------- */

    function scrollToHash(hash) {
        if (!hash || hash === '#') {
            if (prefersReducedMotion()) {
                window.scrollTo(0, 0);
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            return;
        }
        // TOC href 是 URL 编码形式 (如 #%E5%BC%80%E5%A7%8B), 需解码后查找
        var id;
        try {
            id = decodeURIComponent(hash.slice(1));
        } catch (e) {
            id = hash.slice(1);
        }
        var el;
        try {
            el = document.getElementById(id);
        } catch (e) {
            el = null;
        }
        if (el) {
            // TOC/锚点点击: 平滑滚动到标题 (系统减少动态效果时直接跳转)
            if (prefersReducedMotion()) {
                el.scrollIntoView(true);
            } else {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
        // 找不到目标: 静默, 与浏览器原生行为一致
    }

    /* ---------- 链接预加载 ---------- */

    var prefetching = {};    // key -> true (请求中/已完成)
    var prefetchTimers = {}; // 链接元素 -> 悬停去抖定时器

    function prefetchLink(link) {
        if (!container || !PREFETCH_ENABLED) return;
        var url;
        try {
            url = new URL(link.href, location.href);
        } catch (e) {
            return;
        }
        var key = keyOf(url);
        if (key === currentKey) return;
        if (prefetching[key]) return;
        if (CACHE_SIZE > 0 && cache.has(key)) return;
        prefetching[key] = true;

        // 独立请求, 不打断 currentAbort; 失败静默, 允许下次重试
        var controller = null;
        if (window.AbortController) controller = new AbortController();
        var timer = setTimeout(function () {
            if (controller) controller.abort();
        }, TIMEOUT);
        var reqOpts = { headers: { 'X-PJAX': 'true' } };
        if (controller) reqOpts.signal = controller.signal;

        fetch(url.href, reqOpts).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var ct = res.headers.get('content-type') || '';
            if (ct && ct.indexOf('text/html') === -1) throw new Error('Not HTML: ' + ct);
            return res.text();
        }).then(function (html) {
            clearTimeout(timer);
            if (CACHE_SIZE <= 0) return;
            var parsed = new DOMParser().parseFromString(html, 'text/html');
            var newContainer = parsed.querySelector(CONTAINER_SELECTOR);
            if (!newContainer) return;
            var titleEl = parsed.querySelector('title');
            cache.set(key, {
                html: newContainer.outerHTML,
                title: titleEl ? titleEl.textContent : ''
            });
            while (cache.size > CACHE_SIZE) {
                cache.delete(cache.keys().next().value); // 淘汰最旧
            }
        }).catch(function () {
            clearTimeout(timer);
            delete prefetching[key];
        });
    }

    // 默认 hexo 文章链接: /YYYY/MM/DD/title/
    function isPostHref(href) {
        return /^\/\d{4}\/\d{2}\/\d{2}\//.test(href || '');
    }

    // 首屏可见的文章链接自动预取 (首页/归档列表)
    function prefetchVisiblePosts() {
        if (!container || !PREFETCH_ENABLED || !PREFETCH_IDLE) return;
        var links = container.querySelectorAll('a[href]');
        var vh = window.innerHeight || document.documentElement.clientHeight;
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            if (!shouldIntercept(link)) continue;
            if (!isPostHref(link.getAttribute('href'))) continue;
            var rect = link.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > vh) continue; // 不在视口内
            prefetchLink(link);
        }
    }

    // 桌面: 悬停去抖后预取 (移出链接则取消)
    document.addEventListener('mouseover', function (e) {
        if (!container || !PREFETCH_ENABLED) return;
        if (e.target.nodeType !== 1) return;
        var link = e.target.closest ? e.target.closest('a') : null;
        if (!link || !shouldIntercept(link)) return;
        if (prefetchTimers[link]) return;
        prefetchTimers[link] = setTimeout(function () {
            delete prefetchTimers[link];
            prefetchLink(link);
        }, PREFETCH_DELAY);
    }, true);

    document.addEventListener('mouseout', function (e) {
        if (e.target.nodeType !== 1) return;
        var link = e.target.closest ? e.target.closest('a') : null;
        if (!link || !prefetchTimers[link]) return;
        if (e.relatedTarget && link.contains(e.relatedTarget)) return; // 仍在链接内
        clearTimeout(prefetchTimers[link]);
        delete prefetchTimers[link];
    }, true);

    // 移动端: 触摸链接立即预取
    document.addEventListener('touchstart', function (e) {
        if (!container || !PREFETCH_ENABLED) return;
        var link = e.target.closest ? e.target.closest('a') : null;
        if (!link || !shouldIntercept(link)) return;
        prefetchLink(link);
    }, { capture: true, passive: true });

    // 键盘: Tab 聚焦链接也预取
    document.addEventListener('focusin', function (e) {
        if (!container || !PREFETCH_ENABLED) return;
        var link = e.target.closest ? e.target.closest('a') : null;
        if (!link || !shouldIntercept(link)) return;
        prefetchLink(link);
    }, true);

    /* ---------- 入口 ---------- */

    function load(urlStr, opts) {
        opts = opts || {};
        var url;
        try {
            url = new URL(urlStr, location.href);
        } catch (e) {
            window.location.href = urlStr;
            return;
        }
        var key = keyOf(url);
        if (key === currentKey) {
            if (url.hash && url.hash !== location.hash) scrollToHash(url.hash);
            return;
        }

        // 记住离开时的滚动位置, popstate 返回时恢复
        scrollPositions[currentKey] = window.scrollY || 0;

        var token = ++currentToken;
        if (currentAbort) {
            currentAbort.abort();
            currentAbort = null;
        }

        loading = true;
        fire('pjax:start', { url: url.href });
        showBar();

        var cached = (CACHE_SIZE > 0) ? cache.get(key) : null;
        if (cached) {
            cached.fromCache = true;
            applyPage(url, cached, opts);
            return;
        }

        fetchPage(url, token, function (err, html) {
            if (err) {
                fire('pjax:error', { url: url.href });
                hideBar();
                loading = false;
                // 请求失败/超时, 回退为整页跳转
                window.location.href = url.href;
                return;
            }
            applyPage(url, { html: html, title: '' }, opts);
        });
    }

    /* ---------- 初始化 ---------- */

    function init() {
        if (!window.fetch || !window.history || !window.history.pushState) return;
        container = document.querySelector(CONTAINER_SELECTOR);
        if (!container) return;

        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

        seedLoadedScripts();
        createBar();
        injectTransitionStyle();
        currentKey = keyOf(new URL(location.href));

        // 首次加载也执行重初始化 (如 Prism 高亮、预取扫描)
        reinit(container);

        window.addEventListener('popstate', function () {
            var url = new URL(location.href);
            var key = keyOf(url);
            if (key === currentKey) {
                if (location.hash) scrollToHash(location.hash);
                return;
            }
            var saved = scrollPositions[key];
            load(url.href, {
                push: false,
                scroll: (typeof saved === 'number') ? saved : 0,
                hash: location.hash
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.SukaPjax = {
        load: load,
        on: function (name, fn) {
            document.addEventListener(name, fn);
        },
        clearCache: function () {
            cache.clear();
        },
        enabled: function () {
            return !!container;
        }
    };
})();
