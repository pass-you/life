/* 电影片库客户端：由本地 serve.py 代理豆瓣电影资料，静态托管时自动退回离线片库。 */
window.MovieSource = (function () {
  'use strict';

  const BASE = 'api/movie/';
  let onlineState = null;

  function endpoint(path) {
    return new URL(BASE + path, document.baseURI).toString();
  }

  function getJSON(path) {
    return fetch(endpoint(path), {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
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

  function online() {
    if (!onlineState) {
      onlineState = getJSON('health').then(function () { return true; }, function () {
        onlineState = null;
        return false;
      });
    }
    return onlineState;
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
    return endpoint('poster?u=' + encodeURIComponent(url));
  }

  return {
    online: online,
    discover: discover,
    search: search,
    detail: detail,
    poster: poster
  };
})();
