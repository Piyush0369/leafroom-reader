/* Map wide PDF sheets to individual book leaves without changing the source PDF. */
(() => {
  const modes = ['auto', 'single', 'split'];
  const validMode = mode => modes.includes(mode) ? mode : 'auto';
  function pageRatio(sources = [], mode = 'auto') {
    // Keep one sheet shape throughout a turn. The most common logical page
    // size also prevents an occasional landscape insert from resizing a book.
    const sizes = new Map();
    for (const source of sources) {
      const split = validMode(mode) === 'split' || (validMode(mode) === 'auto' && source.width / source.height >= 1.2);
      const ratio = source.width / source.height / (split ? 2 : 1);
      if (!Number.isFinite(ratio) || ratio <= 0) continue;
      const key = Math.round(ratio * 10000);
      const size = sizes.get(key) || {ratio, count:0};
      size.count += split ? 2 : 1;
      sizes.set(key, size);
    }
    return [...sizes.values()].sort((a,b) => b.count-a.count)[0]?.ratio || 350/480;
  }
  function pages(sources, mode = 'auto') {
    return sources.flatMap(source => {
      const split = validMode(mode) === 'split' || (validMode(mode) === 'auto' && source.width / source.height >= 1.2);
      return split ? [{sourcePage:source.sourcePage, half:0}, {sourcePage:source.sourcePage, half:1}] : [{sourcePage:source.sourcePage, half:null}];
    });
  }
  function anchor(items, position, total, single = false) {
    if (position === 0) return {edge:'cover'};
    if (position === total) return {edge:'end'};
    const item = items[Math.min(items.length - 1, (single ? position - 1 : position * 2 - 2))];
    return item ? {...item} : {edge:'cover'};
  }
  function position(items, saved, total, single = false) {
    if (!saved) return null;
    if (saved.edge === 'cover') return 0;
    if (saved.edge === 'end') return total;
    let index = items.findIndex(item => item.sourcePage === saved.sourcePage && item.half === saved.half);
    if (index < 0) index = items.findIndex(item => item.sourcePage === saved.sourcePage);
    return index < 0 ? null : (single ? index + 1 : Math.floor(index / 2) + 1);
  }
  async function inspect(pdf, progress = () => {}) {
    const result = [];
    // Small batches avoid overwhelming the PDF worker on large documents.
    for (let first = 1; first <= pdf.numPages; first += 8) {
      progress(`Preparing PDF pages · ${first} of ${pdf.numPages}…`);
      const batch = await Promise.all(Array.from({length:Math.min(8,pdf.numPages-first+1)}, async (_, offset) => {
        const sourcePage = first + offset;
        const page = await pdf.getPage(sourcePage);
        const {width,height} = page.getViewport({scale:1});
        return {sourcePage,width,height};
      }));
      result.push(...batch);
    }
    return result;
  }
  async function hasCoverImage(pdf, ops) {
    // Inspect only the opening page. Render its complete composition as the
    // cover so image masks, embedded titles and multiple images stay intact.
    const imageOps = new Set([
      'paintImageXObject', 'paintInlineImageXObject', 'paintInlineImageXObjectGroup',
      'paintImageXObjectRepeat', 'paintImageMaskXObject', 'paintImageMaskXObjectGroup',
      'paintImageMaskXObjectRepeat'
    ].map(name => ops?.[name]).filter(Number.isInteger));
    if (!imageOps.size) return false;
    try {
      const page = await pdf.getPage(1);
      const list = await page.getOperatorList();
      return list.fnArray.some(op => imageOps.has(op));
    } catch {
      // Cover detection is optional; a damaged image must not block reading.
      return false;
    }
  }
  const api = {pages, anchor, position, inspect, validMode, hasCoverImage, pageRatio};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PdfLayout = api;
})();
