/*!
 * Hexo Theme Suka-bulie | local-search.js
 * 站内搜索: 前端 fetch search.json 本地匹配
 * 重写说明: 修复 PJAX 提交后无结果 (关键词改为每次调用时从当前 URL 读取)、
 * 结果数累加、摘要截取越界、高亮注入错词/未转义等历史问题
 */
(function () {
    'use strict';

    window.getParameterByName = function (name) {
        name = String(name).replace(/[\[\]]/g, '\\$&');
        var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
        var results = regex.exec(window.location.search);
        return results == null ? '' : decodeURIComponent(results[1]);
    };

    window.searchEscape = function (keyword) {
        var htmlEntityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;'
        };
        return String(keyword).replace(/[&<>"'/]/g, function (i) {
            return htmlEntityMap[i];
        });
    };

    // 在转义后的文本上按转义后的关键词高亮, 避免注入/错位
    function highlight(text, keywords) {
        var escaped = window.searchEscape(text);
        keywords.forEach(function (kw) {
            var kwEsc = window.searchEscape(kw);
            var re;
            try {
                re = new RegExp(kwEsc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            } catch (e) {
                return;
            }
            escaped = escaped.replace(re, function (m) {
                return '<strong><mark>' + m + '</mark></strong>';
            });
        });
        return escaped;
    }

    window.searchFunc = function (searchFilePath, noResultText) {
        fetch(searchFilePath).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }).then(function (datas) {
            var $resultContent = document.getElementById('search-output');
            if (!$resultContent) return;
            var $resultNum = document.getElementById('search-result-num');
            var $resultInfo = document.getElementById('search-result-info');

            function search(key) {
                // 分词: 空格 / 连字符 / 加号分隔
                var keywords = String(key).trim().toLowerCase().split(/[\s\-+]+/).filter(Boolean);

                $resultContent.innerHTML = '';
                if ($resultNum) $resultNum.textContent = '';
                if ($resultInfo) $resultInfo.style.display = 'none';

                if (keywords.length === 0) return;

                var results = [];

                datas.forEach(function (data) {
                    if (!data.title || !data.content) return;
                    var title = String(data.title).trim();
                    var content = String(data.content).replace(/<[^>]+>/g, '');
                    var titleL = title.toLowerCase();
                    var contentL = content.toLowerCase();
                    var tags = (data.tags || []).map(function (t) {
                        return String(t).toLowerCase();
                    });

                    var weight = 0;
                    var firstPos = -1;
                    var matched = true;

                    keywords.forEach(function (kw) {
                        var inTitle = titleL.indexOf(kw);
                        var inContent = contentL.indexOf(kw);
                        var inTags = tags.some(function (t) {
                            return t.indexOf(kw) !== -1;
                        });
                        if (inTitle < 0 && inContent < 0 && !inTags) {
                            matched = false;
                            return;
                        }
                        if (inTitle >= 0) weight += 4;
                        if (inTags) weight += 2;
                        if (inContent >= 0) {
                            weight += 1;
                            if (firstPos < 0 || inContent < firstPos) firstPos = inContent;
                        }
                    });
                    if (!matched) return;

                    var str = '<div class="tile"><div class="tile-content">';
                    str += '<a href="' + window.searchEscape(data.url) + '"><p class="tile-title search-result-title">'
                        + highlight(title, keywords) + '</p></a>';
                    str += '<p class="text-gray search-result-summary"><span class="saerch-result-date">'
                        + (data.date ? new Date(data.date).toLocaleDateString() : '') + '</span>';
                    if (firstPos >= 0) {
                        var start = Math.max(0, firstPos - 15);
                        var end = Math.min(content.length, firstPos + 25);
                        str += highlight(content.substring(start, end), keywords) + '...</p>';
                    } else {
                        str += '</p>';
                    }
                    str += '</div></div>';

                    results.push([str, weight]);
                });

                results.sort(function (a, b) {
                    return b[1] - a[1];
                });

                if (results.length === 0) {
                    $resultContent.innerHTML = noResultText || '';
                    return;
                }
                if ($resultInfo) $resultInfo.style.display = 'block';
                if ($resultNum) $resultNum.textContent = results.length;
                $resultContent.innerHTML = results.map(function (r) {
                    return r[0];
                }).join('');
            }

            // PJAX 兼容: 每次调用都从当前 URL 读取关键词 (脚本被重放时 URL 已更新)
            var keyword = window.getParameterByName('s');
            if (keyword) {
                search(keyword);
                var field = document.getElementById('search-field');
                if (field) field.value = keyword;
            } else {
                search('');
            }
        }).catch(function () {
            var $out = document.getElementById('search-output');
            if ($out) $out.innerHTML = noResultText || '';
        });
    };
})();
