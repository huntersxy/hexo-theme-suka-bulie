/*!
 * Hexo Theme Suka-bulie | gallery.js
 * 画廊灯箱: 点击缩略图查看原图, 支持左右切换 / Esc 关闭 / 点背景关闭
 * 事件全部委托到 document, PJAX 局部刷新后依然有效
 */
(function () {
    'use strict';

    var box = null;
    var items = [];
    var index = 0;

    function open(i) {
        if (!items.length) return;
        index = (i + items.length) % items.length;
        if (!box) {
            box = document.createElement('div');
            box.className = 'gallery-lightbox';
            var img = document.createElement('img');
            img.alt = '';
            box.appendChild(img);
            document.body.appendChild(box);
        }
        box.style.display = 'flex';
        box.querySelector('img').src = items[index];
    }

    function close() {
        if (box) box.style.display = 'none';
    }

    function step(d) {
        open(index + d);
    }

    // 打开灯箱 (捕获阶段, 先于 PJAX 链接拦截)
    document.addEventListener('click', function (e) {
        var link = e.target && e.target.closest ? e.target.closest('a.gallery-link') : null;
        if (!link) return;
        e.preventDefault();
        items = Array.prototype.map.call(
            document.querySelectorAll('a.gallery-link'),
            function (a) { return a.getAttribute('href'); }
        );
        open(items.indexOf(link.getAttribute('href')));
    }, true);

    // 点击浮层背景关闭 (图片本身不触发)
    document.addEventListener('click', function (e) {
        if (!box || box.style.display === 'none') return;
        if (e.target === box || (e.target.closest && e.target.closest('.gallery-lightbox') && e.target.tagName !== 'IMG')) {
            close();
        }
    });

    // 键盘: Esc 关闭, 左右切换
    document.addEventListener('keydown', function (e) {
        if (!box || box.style.display === 'none') return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') step(-1);
        else if (e.key === 'ArrowRight') step(1);
    });
})();
