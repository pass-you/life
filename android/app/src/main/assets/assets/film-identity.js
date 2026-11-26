/* 电影身份判定：把「同一部片」的多个记录认成一条。
 *
 * 同一部片可能有两个片源的记录：
 *   TMDB     → 数字 id、中文展示名、英文原名 originalTitle
 *   Cinemeta → IMDb id（tt…）、英文片名
 * 收藏里也可能留着旧版导入的畸形行（片名、年份、评分粘在一起）。
 * 这里集中处理「认片 / 合并 / 唯一化 / 旧标题拆分」，纯函数，可单独测试。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilmIdentity = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function filmIdOf(item) {
    if (!item) return '';
    if (item.imdbId) return String(item.imdbId);
    const id = String(item.id || '');
    return /^tt\d{3,}$/.test(id) ? id : '';
  }

  function filmTitleKey(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function filmTitleOf(item) {
    if (!item) return '';
    return filmTitleKey(item.originalTitle || item.title);
  }

  // 跨片源认片用的稳定键：片名（原名优先）+ 年份。
  function filmKeyOf(item) {
    if (!item) return '';
    const title = filmTitleOf(item);
    if (title) return title + '|' + String(item.year || '');
    const imdb = filmIdOf(item);
    if (imdb) return imdb;
    return '';
  }

  function filmTmdbOf(item) {
    if (!item) return '';
    if (/^\d{1,9}$/.test(String(item.tmdbId || ''))) return String(item.tmdbId);
    const id = String(item.id || '');
    return /^\d{1,9}$/.test(id) ? id : '';
  }

  function filmTitleKeys(item) {
    const keys = [];
    if (!item) return keys;
    [item.originalTitle, item.title].forEach(function (value) {
      const key = filmTitleKey(value);
      if (key && keys.indexOf(key) < 0) keys.push(key);
    });
    return keys;
  }

  function shareTitleAlias(a, b) {
    const aKeys = filmTitleKeys(a);
    const bKeys = filmTitleKeys(b);
    return aKeys.some(function (key) { return bKeys.indexOf(key) >= 0; });
  }

  function sameFilm(a, b) {
    if (!a || !b) return false;
    const aImdb = filmIdOf(a);
    const bImdb = filmIdOf(b);
    // 两边都有 IMDb id 时这是最强证据：不同就是不同的片。
    if (aImdb && bImdb) return aImdb === bImdb;
    const aTmdb = filmTmdbOf(a);
    const bTmdb = filmTmdbOf(b);
    if (aTmdb && bTmdb && aTmdb === bTmdb) return true;
    if (a.id && b.id && String(a.id) === String(b.id)) return true;
    if (!shareTitleAlias(a, b)) return false;
    const aYear = String(a.year || '');
    const bYear = String(b.year || '');
    // 年份都不缺时必须一致；缺年份时只能在标题完全一致的前提下认作同一部。
    return !aYear || !bYear || aYear === bYear;
  }

  // 合并同一部片的两条记录：保留更完整的一条，另一条只用来补空缺。
  function mergeFilm(target, source) {
    if (!target || !source) return;
    ['imdbId', 'tmdbId', 'originalTitle'].forEach(function (field) {
      if (!target[field] && source[field]) target[field] = source[field];
    });
    if (!target.year && source.year) target.year = source.year;
    if (!target.title && source.title) target.title = source.title;
    // 两个片源的记录合并时优先显示中文名，英文名留在原名里供搜索与认片。
    if (source.title && /[\u3400-\u9fff]/.test(source.title) &&
        !/[\u3400-\u9fff]/.test(target.title || '')) {
      target.originalTitle = target.originalTitle || target.title;
      target.title = source.title;
    }
    if (!target.rating && source.rating) target.rating = source.rating;
    if (!target.cover && source.cover) target.cover = source.cover;
    if (!target.id && source.id) target.id = source.id;
    if (!(target.genres || []).length && (source.genres || []).length) {
      target.genres = source.genres.slice(0, 4);
    }
    if (!(target.regions || []).length && (source.regions || []).length) {
      target.regions = source.regions.slice(0, 3);
    }
    // 收藏日期保留更早的那次。
    if (source.added && (!target.added || source.added < target.added)) {
      target.added = source.added;
    }
  }

  // 同一部片在一份清单里只保留第一条；重复项按 mergeFilm 规则补齐字段。
  // 用于计数和渲染，保证「同一部片不重复统计」。
  // 合并会补齐 id，可能让原本认不出的第三条也能认出来，所以要反复收敛到不再变化。
  function uniqueFilms(list) {
    let out = (Array.isArray(list) ? list : []).filter(Boolean);
    let merged = true;
    while (merged) {
      merged = false;
      const next = [];
      out.forEach(function (entry) {
        const hit = next.filter(function (kept) { return sameFilm(kept, entry); })[0];
        if (hit) {
          mergeFilm(hit, entry);
          merged = true;
          return;
        }
        next.push(Object.assign({}, entry));
      });
      out = next;
    }
    return out;
  }

  // 旧版导入行会把「片名 + 年份 + 评分（+ 评分人数）」粘成一个字段，
  // 例如「杀死比尔20038.0」「幽灵公主19978.3128」。
  const LEGACY_TITLE = /^(.+?)((?:19|20)\d{2})(\d{1,2}(?:\.\d)?)(\d{2,})?$/;

  function splitLegacyTitle(title) {
    const text = String(title || '').replace(/\s+/g, ' ').trim();
    const hit = LEGACY_TITLE.exec(text);
    if (!hit) return { title: text };
    const rating = Number(hit[3]);
    if (!(rating > 0 && rating <= 10)) return { title: text };
    return { title: hit[1].trim(), year: hit[2], rating: rating };
  }

  return {
    filmIdOf: filmIdOf,
    filmTitleKey: filmTitleKey,
    filmTitleOf: filmTitleOf,
    filmKeyOf: filmKeyOf,
    filmTmdbOf: filmTmdbOf,
    filmTitleKeys: filmTitleKeys,
    shareTitleAlias: shareTitleAlias,
    sameFilm: sameFilm,
    mergeFilm: mergeFilm,
    uniqueFilms: uniqueFilms,
    splitLegacyTitle: splitLegacyTitle
  };
});
