/* 电影片库客户端：由本地 serve.py 代理豆瓣的列表、详情、海报与条目页。
 * 页面由 serve.py 托管时走同源 api/movie/；用 file:// 或别的本地端口打开时，
 * 自动回退到本机 127.0.0.1:8765，只要服务在跑，找电影就能直接用。 */
window.MovieSource = (function () {
  'use strict';

  const RELATIVE = 'api/movie/';
  const LOCAL_BASES = ['http://127.0.0.1:8765/api/movie/', 'http://localhost:8765/api/movie/'];
  let activeBase = null;
  let probe = null;

  function absolute(base) {
    try {
      return new URL(base, document.baseURI).toString();
    } catch (error) {
      return base;
    }
  }

  function candidates() {
    const list = [absolute(RELATIVE)];
    LOCAL_BASES.forEach(function (base) {
      if (list.indexOf(base) < 0) list.push(base);
    });
    return list;
  }

  function base() {
    return activeBase || absolute(RELATIVE);
  }

  function probeBase(candidate) {
    return fetch(candidate + 'health', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      mode: 'cors'
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      if (!data || data.source !== 'douban') throw new Error('不是电影服务');
      return candidate;
    });
  }

  function online() {
    if (probe) return probe;
    probe = candidates().reduce(function (chain, candidate) {
      return chain.catch(function () { return probeBase(candidate); });
    }, Promise.reject(new Error('尚未探测'))).then(function (hit) {
      activeBase = hit;
      return true;
    }).catch(function () {
      activeBase = null;
      probe = null;
      return false;
    });
    return probe;
  }

  function retry() {
    activeBase = null;
    probe = null;
    return online();
  }

  function getJSON(path) {
    return online().then(function (ok) {
      if (!ok) throw new Error('本地服务未启动');
      return fetch(base() + path, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        mode: 'cors'
      });
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      if (data && data.error) throw new Error(data.error);
      return data;
    });
  }

  function paramsOf(options) {
    const params = new URLSearchParams();
    params.set('start', String(options.start || 0));
    return params;
  }

  function discover(options) {
    const params = paramsOf(options);
    if (options.sort) params.set('sort', options.sort);
    if (options.genres) params.set('genres', options.genres);
    if (options.countries) params.set('countries', options.countries);
    if (options.from) params.set('from', String(options.from));
    if (options.to) params.set('to', String(options.to));
    return getJSON('discover?' + params.toString());
  }

  function search(options) {
    const params = paramsOf(options);
    params.set('q', options.q || '');
    if (options.sort) params.set('sort', options.sort);
    if (options.genres) params.set('genres', options.genres);
    if (options.countries) params.set('countries', options.countries);
    if (options.from) params.set('from', String(options.from));
    if (options.to) params.set('to', String(options.to));
    return getJSON('search?' + params.toString());
  }

  function detail(id) {
    return getJSON('detail?id=' + encodeURIComponent(id));
  }

  function poster(url) {
    if (!url) return '';
    if (/^data:|^blob:|^assets\//.test(url)) return url;
    return base() + 'poster?u=' + encodeURIComponent(url);
  }

  function pageUrl(id) {
    return base() + 'page?id=' + encodeURIComponent(id);
  }

  // 悬停时先把条目页 HTML 灌进浏览器缓存，点击后 iframe 直接命中，不再等豆瓣。
  const preloaded = {};
  function preload(id) {
    if (!id || preloaded[id]) return;
    preloaded[id] = true;
    online().then(function (ok) {
      if (!ok) return;
      fetch(pageUrl(id), { cache: 'force-cache' }).catch(function () {});
    });
  }

  return {
    online: online,
    retry: retry,
    discover: discover,
    search: search,
    detail: detail,
    poster: poster,
    pageUrl: pageUrl,
    preload: preload
  };
})();
