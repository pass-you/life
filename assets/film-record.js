/* 电影收藏的 Markdown 行格式：解析（导入）与生成（保存）。
 *
 * 一行示例：
 *   - 杀死比尔 · 2003 · 8.0 · tmdb=24 · 2023-05-01 · https://… · 原名=Kill Bill
 * 尾部可选字段从后往前剥离，片名里带「·」也能原样还原。
 * 历史版本有「片名+年份+评分」粘连的行，解析时拆开，避免同一部片被当成两条。
 */
(function (root, factory) {
  const identity = typeof module === 'object' && module.exports
    ? require('./film-identity.js')
    : (root && root.FilmIdentity);
  const api = factory(identity);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilmRecord = api;
})(typeof window !== 'undefined' ? window : null, function (Film) {
  'use strict';

  function normalizeTagList(value, limit) {
    const list = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/[\/、,]/) : []);
    const out = [];
    list.forEach(function (entry) {
      const text = typeof entry === 'string' ? entry.replace(/\s+/g, ' ').trim() : '';
      if (text && out.indexOf(text) < 0 && out.length < limit) out.push(text);
    });
    return out;
  }

  function normalizeCollectionItem(item) {
    const raw = item && typeof item === 'object' ? item : {};
    const title = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim() : '';
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const year = /^\d{4}$/.test(raw.year || '') ? String(raw.year) : '';
    const rating = Number.isFinite(raw.rating) && raw.rating > 0
      ? Math.round(raw.rating * 10) / 10
      : 0;
    const cover = typeof raw.cover === 'string' && /^https?:\/\//.test(raw.cover) ? raw.cover : '';
    const added = /^\d{4}-\d{2}-\d{2}$/.test(raw.added || '') ? raw.added : '';
    // 原名与 IMDb id 不参与展示，只用来把两个片源里的同一部片认成一部。
    const originalTitle = typeof raw.originalTitle === 'string'
      ? raw.originalTitle.replace(/\s+/g, ' ').trim()
      : '';
    const imdbId = /^tt\d{3,}$/.test(raw.imdbId || '') ? raw.imdbId
      : (/^tt\d{3,}$/.test(id) ? id : '');
    // 两个片源对同一部片给的是两套 id。收藏必须同时记住 TMDB 数字 id 与 IMDb id，
    // 切换片源、重新导入 MD 之后才能在两边都认出「这部片已经收藏过」。
    const tmdbId = /^\d{1,9}$/.test(raw.tmdbId || '') ? String(raw.tmdbId)
      : (/^\d{1,9}$/.test(id) ? id : '');
    return {
      id: id, title: title, originalTitle: originalTitle, imdbId: imdbId,
      tmdbId: tmdbId,
      year: year, rating: rating, cover: cover, added: added,
      genres: normalizeTagList(raw.genres, 4),
      regions: normalizeTagList(raw.regions || raw.region, 3)
    };
  }

  function parseMovieLine(line, fallbackDate) {
    const text = String(line || '').replace(/^\s*-\s*/, '').replace(/\s+$/, '');
    if (!text) return null;
    let parts = text.split(/\s+·\s+/).map(function (part) { return part.trim(); });
    // 旧版导出的个别行少了「·」分隔：标题、年份、评分粘在一起
    // （如「杀死比尔20038.0」「幽灵公主19978.3128」）。不拆开的话
    // 整行会被当成一个片名，既显示错乱，也无法和另一个片源的同一部片去重。
    const repaired = [];
    parts.forEach(function (part) {
      // 裸 IMDb id、海报地址、日期都是合法字段，不能拿去匹配「标题+年份+评分」，
      // 否则 tt6019206 会被拆成「tt60 / 1920 / 6」。
      if (/^tt\d{3,}$/.test(part) || /^https?:\/\//.test(part) ||
          /^\d{4}-\d{2}-\d{2}$/.test(part) ||
          /^(类型|地区|原名|imdb|tmdb)=/.test(part)) {
        repaired.push(part);
        return;
      }
      const glued = /^(.+?)((?:19|20)\d{2})(\d{1,2}(?:\.\d)?)(\d{1,9})?$/.exec(part);
      // 更早的导出行用空格分隔：- 杀死比尔 2003 8.0 · tmdb=24 …
      // 片名、年份、评分（后面可能跟评分人数）会落在同一个片段里。
      const spaced = /^(.+?)\s+((?:19|20)\d{2})\s+(\d{1,2}(?:\.\d)?)(?:\s+\d{1,9})?$/.exec(part);
      const strayId = /^(\d{1,9})\.0$/.exec(part);
      if (glued && glued[1].trim()) {
        repaired.push(glued[1].trim(), glued[2], glued[3]);
        // 粘在评分后面的长数字是评分人数，不能当成 TMDB id（会把海报和链接指错片）。
        return;
      }
      if (spaced && spaced[1].trim()) {
        repaired.push(spaced[1].trim(), spaced[2], spaced[3]);
        return;
      }
      // 「24.0」这种一位小数不是评分（评分不超过 10），是 TMDB id 被误写成小数。
      if (strayId && Number(strayId[1]) > 10) {
        repaired.push('tmdb=' + strayId[1]);
        return;
      }
      repaired.push(part);
    });
    parts = repaired;
    const item = { title: '', year: '', rating: 0, id: '', cover: '', added: fallbackDate || '' };
    // 类型 / 地区 / 原名 / IMDb id 用带标签的段落写在行尾，既能被旧解析器当成普通文本保留，
    // 也能让清单页做与找电影一致的筛选、跨片源认出同一部片。
    const tags = { genres: [], regions: [] };
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const tagged = /^(类型|地区|原名|imdb|tmdb)=(.+)$/.exec(parts[index]);
      if (!tagged) continue;
      if (tagged[1] === '原名') {
        item.originalTitle = tagged[2].trim();
      } else if (tagged[1] === 'tmdb') {
        if (/^\d{1,9}$/.test(tagged[2].trim())) {
          item.tmdbId = tagged[2].trim();
          if (!item.id) item.id = item.tmdbId;
        }
      } else if (tagged[1] === 'imdb') {
        if (/^tt\d{3,}$/.test(tagged[2].trim())) {
          item.imdbId = tagged[2].trim();
          if (!item.id) item.id = item.imdbId;
        }
      } else {
        const key = tagged[1] === '类型' ? 'genres' : 'regions';
        tags[key] = normalizeTagList(tagged[2], 4);
      }
      parts.splice(index, 1);
    }
    if (parts.length > 1 && /^https?:\/\/\S+$/.test(parts[parts.length - 1])) item.cover = parts.pop();
    if (parts.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(parts[parts.length - 1])) item.added = parts.pop();
    // TMDB 的 id 可能只有 3 位（如《搏击俱乐部》是 550），不能只认 5 位以上；
    // 但 4 位且落在 1900–2100 的数字是年份，必须留给后面的年份解析。
    const tail = parts[parts.length - 1] || '';
    const looksYear = /^(?:19|20|21)\d{2}$/.test(tail);
    if (parts.length > 1 && (/^tt\d{3,}$/.test(tail) ||
        (/^\d{3,8}$/.test(tail) && !looksYear))) {
      item.id = parts.pop();
    }
    // 评分只会是 0-10 的一位小数（如 9.2、8），4 位纯数字是年份，不能当评分吃掉。
    if (parts.length > 1 && /^\d{1,2}(?:\.\d)?$/.test(parts[parts.length - 1])) {
      item.rating = Number(parts.pop()) || 0;
    }
    if (parts.length > 1 && /^\d{4}$/.test(parts[parts.length - 1])) item.year = parts.pop();
    // 旧版解析曾把 4 位年份写成评分（如 2026.0），读回时还原成年份。
    if (!item.year && item.rating >= 1900 && item.rating <= 2100) {
      item.year = String(Math.round(item.rating));
      item.rating = 0;
    }
    item.title = parts.join(' · ').trim();
    // 兜底：仍是「片名+年份+评分」粘连的一整段就再拆一次。
    if (parts.length === 1 && (!item.year || !item.rating)) {
      const legacy = Film.splitLegacyTitle(item.title);
      if (legacy.title !== item.title) {
        item.title = legacy.title;
        if (!item.year && legacy.year) item.year = legacy.year;
        if (!item.rating && legacy.rating) item.rating = legacy.rating;
      }
    }
    if (!item.title) return null;
    item.genres = tags.genres;
    item.regions = tags.regions;
    return normalizeCollectionItem(item);
  }

  function parseMovieLines(value) {
    const items = [];
    String(value || '').split('\n').forEach(function (line) {
      if (!/^\s*-/.test(line)) return;
      const item = parseMovieLine(line, '');
      if (item) items.push(item);
    });
    return items;
  }

  function movieRecordLine(item) {
    const title = String(item.title || '').replace(/\s*·\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const bits = [title];
    if (item.year) bits.push(item.year);
    if (item.rating) bits.push(item.rating.toFixed(1));
    // 主 id 的写法固定：有 IMDb id 就裸写（跨片源最稳定），否则写 tmdb=数字。
    // 这样同一个条目反复保存 / 导入不会在两种 id 之间来回翻转。
    const tmdbId = Film.filmTmdbOf(item);
    const imdbId = Film.filmIdOf(item);
    const mainId = imdbId || item.id;
    if (mainId) bits.push(/^tt\d{3,}$/.test(mainId) ? mainId : 'tmdb=' + mainId);
    // 两条 id 都要落盘：TMDB 数字 id 与 IMDb id 互相补位，
    // 切到另一个片源后仍能认出同一部片，不会被当成新片再推一遍。
    if (tmdbId && tmdbId !== mainId) bits.push('tmdb=' + tmdbId);
    if (imdbId && imdbId !== mainId) bits.push('imdb=' + imdbId);
    if (item.added) bits.push(item.added);
    if (item.cover) bits.push(item.cover);
    if (item.genres && item.genres.length) bits.push('类型=' + item.genres.join('/'));
    if (item.regions && item.regions.length) bits.push('地区=' + item.regions.join('/'));
    // 原名负责在 TMDB / Cinemeta 两套片名之间认出同一部片，导回后仍能去重。
    if (item.originalTitle && Film.filmTitleKey(item.originalTitle) !== Film.filmTitleKey(title)) {
      bits.push('原名=' + item.originalTitle);
    }
    return '- ' + bits.join(' · ');
  }

  return {
    normalizeTagList: normalizeTagList,
    normalizeCollectionItem: normalizeCollectionItem,
    parseMovieLine: parseMovieLine,
    parseMovieLines: parseMovieLines,
    movieRecordLine: movieRecordLine
  };
});
