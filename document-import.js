/* Local document import. Libraries are fetched only when their format is opened. */
(() => {
  const PDF_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
  let pdfLibrary, zipLibrary;
  const MAX_TEXT = 1_000_000;
  const xml = (source) => {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('The EPUB contains invalid XML.');
    return doc;
  };
  const nodes = (doc, name) => [...doc.getElementsByTagNameNS('*', name)];
  const limitedText = text => {
    if (text.length > MAX_TEXT) throw new Error('This book has too much text. Please choose a shorter book (up to 1 million characters).');
    if (!text.trim()) throw new Error('No readable text was found in this file.');
    return text;
  };
  function getZip() {
    if (!zipLibrary) zipLibrary = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve(window.JSZip);
      script.onerror = () => reject(new Error('The EPUB reader could not load. Check your connection and try again.'));
      document.head.append(script);
    }).catch(error => { zipLibrary = null; throw error; });
    return zipLibrary;
  }
  async function readEpub(file, progress) {
    const Zip = await getZip();
    let zip;
    try { zip = await Zip.loadAsync(file); }
    catch { throw new Error('This EPUB could not be opened. It may be damaged or encrypted. Please choose a valid DRM-free EPUB.'); }
    let expanded = 0;
    // Bound decompression before extracting archive entries.
    for (const entry of Object.values(zip.files)) {
      expanded += entry._data?.uncompressedSize || 0;
      if (expanded > 80 * 1024 * 1024) throw new Error('This EPUB expands beyond the 80 MB reading limit.');
    }
    const read = async path => {
      const entry = zip.file(path);
      if (!entry) throw new Error('The EPUB is missing a required book file.');
      return entry.async('string');
    };
    if (zip.file('META-INF/encryption.xml')) {
      const encryption = xml(await read('META-INF/encryption.xml'));
      if (nodes(encryption, 'EncryptionMethod').some(node => !['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'].includes(node.getAttribute('Algorithm')))) {
        throw new Error('This EPUB is encrypted. Please choose a DRM-free EPUB.');
      }
    }
    const container = xml(await read('META-INF/container.xml'));
    const root = nodes(container, 'rootfile')[0]?.getAttribute('full-path');
    if (!root) throw new Error('The EPUB has no book package.');
    const packageDoc = xml(await read(root));
    const manifest = new Map(nodes(packageDoc, 'item').map(item => [item.getAttribute('id'), item]));
    const chapters = nodes(packageDoc, 'itemref').filter(item => item.getAttribute('linear') !== 'no');
    if (!chapters.length) throw new Error('The EPUB has no readable chapters.');
    const urls = [];
    const imageCache = new Map();
    const resolve = (href, base) => {
      const url = new URL(href, new URL(base, 'https://epub.invalid/'));
      if (url.origin !== 'https://epub.invalid') return null;
      return decodeURIComponent(url.pathname.slice(1));
    };
    const imageTypes = new Map(nodes(packageDoc, 'item').map(item => [resolve(item.getAttribute('href'), root), item.getAttribute('media-type')]));
    const image = async (href, base, alt = '') => {
      const path = resolve(href, base);
      if (!path) return { type: 'text', text: alt || '[Remote illustration omitted]' };
      if (!imageCache.has(path)) imageCache.set(path, (async () => {
        const entry = zip.file(path);
        const type = imageTypes.get(path);
        if (!entry || !['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'].includes(type)) return null;
        let content = await entry.async('uint8array');
        if (type === 'image/svg+xml') {
          const svg = xml(new TextDecoder().decode(content));
          svg.querySelectorAll('script,foreignObject,style,animate,animateTransform,set').forEach(node => node.remove());
          for (const element of svg.querySelectorAll('*')) for (const attr of [...element.attributes]) {
            if (/^on/i.test(attr.name) || attr.name === 'style' || (/href$/i.test(attr.name) && !attr.value.startsWith('#')) || /url\(\s*[^#]/i.test(attr.value)) element.removeAttributeNode(attr);
          }
          content = new XMLSerializer().serializeToString(svg);
        }
        const url = URL.createObjectURL(new Blob([content], {type}));
        urls.push(url);
        const probe = new Image(); probe.src = url;
        try { await probe.decode(); } catch { return null; }
        return url;
      })());
      const src = await imageCache.get(path);
      return src ? {type:'image', src, alt:alt || 'Book illustration', path} : {type:'text', text:alt ? `[Illustration: ${alt}]` : '[Illustration unavailable]'};
    };
    try {
      const coverId = nodes(packageDoc, 'meta').find(node => node.getAttribute('name') === 'cover')?.getAttribute('content');
      const coverItem = nodes(packageDoc, 'item').find(node => (node.getAttribute('properties') || '').split(/\s+/).includes('cover-image')) || manifest.get(coverId);
      let cover = coverItem ? await image(coverItem.getAttribute('href'), root, 'Book cover') : null;
      if (cover?.type !== 'image') cover = null;
      const guideCover = nodes(packageDoc, 'reference').find(node => node.getAttribute('type') === 'cover');
      const coverChapter = guideCover ? resolve(guideCover.getAttribute('href'), root) : null;
      if (!cover && coverChapter) {
        const coverDoc = new DOMParser().parseFromString(await read(coverChapter), 'text/html');
        const element = coverDoc.querySelector('img, image');
        const href = element?.getAttribute('src') || element?.getAttribute('href') || element?.getAttribute('xlink:href');
        if (href) { const candidate = await image(href, coverChapter, 'Book cover'); if (candidate.type === 'image') cover = candidate; }
      }
      const blocks = [];
      let text = '';
      for (let i = 0; i < chapters.length; i++) {
        progress(`Opening EPUB · chapter ${i + 1} of ${chapters.length}…`);
        const item = manifest.get(chapters[i].getAttribute('idref'));
        if (!item) throw new Error('The EPUB reading order references a missing chapter.');
        const path = resolve(item.getAttribute('href'), root);
        if (!path) throw new Error('Remote EPUB chapters are not supported.');
        // Walk detached markup into safe text/image records, never publisher HTML.
        const doc = new DOMParser().parseFromString(await read(path), 'text/html');
        doc.querySelectorAll('script,style,iframe,object,embed,nav').forEach(node => node.remove());
        let buffer = '';
        const flush = () => {
          const clean = buffer.replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
          if (clean) { text += clean + '\n\n'; blocks.push({type:'text',text:clean}); }
          buffer = '';
          if (text.length > MAX_TEXT) limitedText(text);
        };
        const walk = async node => {
          if (node.nodeType === 3) { buffer += node.textContent; return; }
          if (node.nodeType !== 1) return;
          const tag = node.localName.toLowerCase();
          if (tag === 'img' || tag === 'image') {
            const href = node.getAttribute('src') || node.getAttribute('href') || node.getAttribute('xlink:href');
            if (href) {
              flush();
              const plate = await image(href, path, node.getAttribute('alt') || node.parentElement?.querySelector('figcaption')?.textContent.trim() || '');
              if (!cover && (path === coverChapter || /cover/i.test(item.getAttribute('id') || ''))) cover = plate.type === 'image' ? plate : null;
              plate.caption = node.parentElement?.querySelector('figcaption')?.textContent.trim() || '';
              if (!(plate.type === 'image' && cover?.path === plate.path && (path === coverChapter || /cover/i.test(item.getAttribute('id') || '')))) blocks.push(plate);
            }
            return;
          }
          if (tag === 'figcaption' && node.parentElement?.querySelector('img,image')) return;
          if (tag === 'br') buffer += '\n';
          for (const child of node.childNodes) await walk(child);
          if (/^(p|div|section|article|h[1-6]|li|blockquote|pre|tr|figure|figcaption)$/.test(tag)) buffer += '\n\n';
        };
        await walk(doc.body); flush();
      }
      if (!blocks.length && !cover) throw new Error('No readable text or illustrations were found in this EPUB.');
      return {text, blocks, cover, urls, title:nodes(packageDoc,'title')[0]?.textContent.trim()};
    } catch (error) {
      urls.forEach(url => URL.revokeObjectURL(url));
      throw error;
    }
  }
  window.DocumentImport = {
    async read(file, progress) {
      const extension = file.name.split('.').pop().toLowerCase();
      if (!['txt', 'pdf', 'epub'].includes(extension)) throw new Error('Please choose a .txt, .pdf, or .epub file.');
      if (file.size > 25 * 1024 * 1024) throw new Error('Please choose a file smaller than 25 MB.');
      if (extension === 'txt') return { text: limitedText(await file.text()) };
      if (extension === 'epub') return readEpub(file, progress);
      progress('Loading PDF reader…');
      if (!pdfLibrary) pdfLibrary = import(PDF_BASE + 'pdf.min.mjs').catch(error => { pdfLibrary = null; throw new Error('The PDF reader could not load. Check your connection and try again.'); });
      const library = await pdfLibrary;
      library.GlobalWorkerOptions.workerSrc = PDF_BASE + 'pdf.worker.min.mjs';
      const task = library.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
      task.onPassword = () => { task.destroy().catch(() => {}); };
      let pdf;
      try { pdf = await task.promise; }
      catch (error) { throw new Error(error.name === 'PasswordException' || error.message?.includes('destroyed') ? 'This PDF is password protected. Please choose an unlocked PDF.' : 'This PDF could not be opened. It may be damaged or unsupported.'); }
      if (pdf.numPages > 2000) { await pdf.destroy(); throw new Error('Please choose a PDF with 2,000 pages or fewer.'); }
      try {
        const pdfSources = await PdfLayout.inspect(pdf,progress);
        const pdfCover = await PdfLayout.hasCoverImage(pdf,library.OPS);
        return {pdf, pdfSources, pdfCover};
      }
      catch (error) { await pdf.destroy(); throw new Error('The PDF page layout could not be read. Please try another PDF.'); }
    }
  };
})();
