(() => {
  const $ = id => document.getElementById(id);
  const state = {
    file: null,
    bytes: null,
    pageCount: 0,
    mode: 'groups',
    ranges: [],
    outputs: [],
    isCompressing: false
  };

  const els = {
    dropzone: $('dropzone'),
    fileInput: $('fileInput'),
    fileCard: $('fileCard'),
    fileName: $('fileName'),
    fileMeta: $('fileMeta'),
    removeBtn: $('removeBtn'),
    uploadStatus: $('uploadStatus'),
    assignmentName: $('assignmentName'),
    pagesPerFile: $('pagesPerFile'),
    startPage: $('startPage'),
    rangesInput: $('rangesInput'),
    groupsMode: $('groupsMode'),
    customMode: $('customMode'),
    previewList: $('previewList'),
    rangeCount: $('rangeCount'),
    previewNote: $('previewNote'),
    splitBtn: $('splitBtn'),
    splitStatus: $('splitStatus'),
    resultsGrid: $('resultsGrid'),
    resultsSub: $('resultsSub'),
    downloadAllBtn: $('downloadAllBtn'),
    toast: $('toast'),
    // Compression Elements
    compressionPanel: $('compressionPanel'),
    compressAllBtn: $('compressAllBtn'),
    targetSizeInput: $('targetSizeInput'),
    targetSizeUnit: $('targetSizeUnit'),
    compressProgressBox: $('compressProgressBox'),
    compressProgressStatus: $('compressProgressStatus'),
    compressProgressPercent: $('compressProgressPercent'),
    compressProgressBar: $('compressProgressBar'),
    presetChips: document.querySelectorAll('.preset-chip')
  };

  let toastTimer;

  // Initialize PDF.js worker if available
  if (window.pdfjsLib) {
    try {
      if (window.location.protocol.startsWith('http')) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    } catch (e) {
      console.warn('PDF.js worker notice:', e);
    }
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
  }

  function niceSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function safeName(s) {
    return (s || 'Assignment').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').slice(0, 90) || 'Assignment';
  }

  function setStatus(el, msg, type = '') {
    el.textContent = msg;
    el.className = 'status' + (type ? ' ' + type : '');
  }

  function getTargetBytes() {
    const val = parseFloat(els.targetSizeInput.value);
    if (isNaN(val) || val <= 0) return 2 * 1024 * 1024;
    const unit = els.targetSizeUnit.value;
    return unit === 'KB' ? Math.round(val * 1024) : Math.round(val * 1024 * 1024);
  }

  function getTargetLabel() {
    const val = parseFloat(els.targetSizeInput.value) || 2;
    return `${val} ${els.targetSizeUnit.value}`;
  }

  function clearOutputs() {
    state.outputs.forEach(o => {
      if (o.url) URL.revokeObjectURL(o.url);
    });
    state.outputs = [];
    els.resultsGrid.innerHTML = '<div class="empty-results" style="grid-column:1/-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg><div>Nothing here yet</div><div style="font-size:11px;margin-top:3px">Upload a PDF and split it to see your files.</div></div>';
    els.resultsSub.textContent = 'Your generated files will appear here.';
    els.downloadAllBtn.disabled = true;
    if (els.compressionPanel) els.compressionPanel.classList.add('hidden');
    if (els.compressProgressBox) els.compressProgressBox.classList.add('hidden');
  }

  function resetFile() {
    state.file = null;
    state.bytes = null;
    state.pageCount = 0;
    els.fileInput.value = '';
    els.fileCard.classList.add('hidden');
    els.dropzone.classList.remove('hidden');
    els.fileName.textContent = '';
    els.fileMeta.textContent = '';
    setStatus(els.uploadStatus, '');
    setStatus(els.splitStatus, '');
    clearOutputs();
    updatePreview();
  }

  function getRanges() {
    if (!state.pageCount) return { ranges: [], error: '' };
    let ranges = [];
    if (state.mode === 'groups') {
      const group = Number(els.pagesPerFile.value), start = Number(els.startPage.value);
      if (!Number.isInteger(start) || start < 1 || start > state.pageCount) {
        return { ranges: [], error: `Start page must be between 1 and ${state.pageCount}.` };
      }
      for (let p = start; p <= state.pageCount; p += group) {
        ranges.push({ start: p, end: Math.min(p + group - 1, state.pageCount) });
      }
    } else {
      const raw = els.rangesInput.value.trim();
      if (!raw) return { ranges: [], error: '' };
      const chunks = raw.split(',');
      for (const chunk of chunks) {
        const m = chunk.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
        if (!m) return { ranges: [], error: `“${chunk.trim()}” is not a valid range. Try 1-2, 3-4.` };
        const start = Number(m[1]), end = m[2] ? Number(m[2]) : start;
        if (start < 1 || end < start || end > state.pageCount) {
          return { ranges: [], error: `Range ${start}-${end} is outside the PDF. Pages go from 1 to ${state.pageCount}.` };
        }
        ranges.push({ start, end });
      }
    }
    if (ranges.length > 250) return { ranges: [], error: 'Please create 250 or fewer PDFs at a time.' };
    return { ranges, error: '' };
  }

  function updatePreview() {
    const result = getRanges();
    state.ranges = result.ranges;
    els.previewList.innerHTML = '';
    if (result.error) {
      const span = document.createElement('span');
      span.className = 'range-chip invalid';
      span.textContent = result.error;
      els.previewList.appendChild(span);
      els.rangeCount.textContent = 'Check ranges';
      els.previewNote.textContent = 'Fix the settings above to continue.';
      els.splitBtn.disabled = true;
      return;
    }
    if (!state.pageCount) {
      const span = document.createElement('span');
      span.className = 'range-chip';
      span.textContent = 'Upload a PDF to preview ranges';
      els.previewList.appendChild(span);
      els.rangeCount.textContent = '0 files';
      els.previewNote.textContent = '';
      els.splitBtn.disabled = true;
      return;
    }
    if (!result.ranges.length) {
      const span = document.createElement('span');
      span.className = 'range-chip';
      span.textContent = state.mode === 'custom' ? 'Enter page ranges above' : 'No pages to split';
      els.previewList.appendChild(span);
      els.rangeCount.textContent = '0 files';
      els.previewNote.textContent = `This PDF has ${state.pageCount} pages.`;
      els.splitBtn.disabled = true;
      return;
    }
    result.ranges.slice(0, 12).forEach((r, i) => {
      const span = document.createElement('span');
      span.className = 'range-chip';
      span.textContent = `${i + 1}: ${r.start}${r.end !== r.start ? '-' + r.end : ''}`;
      els.previewList.appendChild(span);
    });
    if (result.ranges.length > 12) {
      const span = document.createElement('span');
      span.className = 'range-chip';
      span.textContent = `+${result.ranges.length - 12} more`;
      els.previewList.appendChild(span);
    }
    els.rangeCount.textContent = `${result.ranges.length} file${result.ranges.length === 1 ? '' : 's'}`;
    els.previewNote.textContent = `${state.pageCount} pages in original PDF · ${result.ranges.length} output file${result.ranges.length === 1 ? '' : 's'}.`;
    els.splitBtn.disabled = !state.file || !result.ranges.length;
  }

  async function loadFile(file) {
    if (!file) return;
    if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
      setStatus(els.uploadStatus, 'Please choose a PDF file.', 'error');
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setStatus(els.uploadStatus, 'This file is larger than 200 MB. Try a smaller PDF for better browser performance.', 'error');
      return;
    }
    setStatus(els.uploadStatus, 'Reading PDF in your browser...');
    try {
      const bytes = await file.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: false });
      state.file = file;
      state.bytes = bytes;
      state.pageCount = doc.getPageCount();
      els.fileName.textContent = file.name;
      els.fileMeta.textContent = `${state.pageCount} pages · ${niceSize(file.size)}`;
      els.dropzone.classList.add('hidden');
      els.fileCard.classList.remove('hidden');
      setStatus(els.uploadStatus, 'PDF ready to split.', 'success');
      setStatus(els.splitStatus, '');
      clearOutputs();
      updatePreview();
    } catch (err) {
      console.error(err);
      const message = String(err && err.message || '');
      setStatus(els.uploadStatus, message.toLowerCase().includes('encrypt') ? 'This PDF is password-protected. Please unlock it first.' : 'Could not read this PDF. Make sure it is a valid, unprotected PDF.', 'error');
    }
  }

  function renderOutputs() {
    els.resultsGrid.innerHTML = '';
    if (!state.outputs.length) {
      clearOutputs();
      return;
    }

    const targetLabel = getTargetLabel();

    state.outputs.forEach((o, index) => {
      const card = document.createElement('article');
      card.className = 'result-card';

      const top = document.createElement('div');
      top.className = 'result-top';

      const icon = document.createElement('div');
      icon.className = 'mini-pdf';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>';

      const info = document.createElement('div');
      info.style.minWidth = '0';
      info.style.flex = '1';

      const title = document.createElement('div');
      title.className = 'result-title';
      title.textContent = o.name;
      title.title = o.name;

      const pages = document.createElement('div');
      pages.className = 'result-pages';

      const pageRangeStr = `Pages ${o.range.start}${o.range.end !== o.range.start ? '-' + o.range.end : ''}`;

      if (o.isCompressed) {
        const pct = Math.max(1, Math.round((1 - o.blob.size / o.originalSize) * 100));
        pages.innerHTML = `<div>${pageRangeStr} · <strong>${niceSize(o.blob.size)}</strong> <span style="text-decoration:line-through;color:#9aa3b5;font-size:10px">${niceSize(o.originalSize)}</span></div><span class="badge-compressed"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Compressed (-${pct}%)</span>`;
        const revertBtn = document.createElement('button');
        revertBtn.type = 'button';
        revertBtn.className = 'revert-btn';
        revertBtn.textContent = '↩ Revert to original';
        revertBtn.title = 'Restore uncompressed PDF';
        revertBtn.addEventListener('click', () => revertSingleOutput(index));
        pages.appendChild(revertBtn);
      } else if (o.alreadyWithinTarget) {
        pages.innerHTML = `<div>${pageRangeStr} · <strong>${niceSize(o.blob.size)}</strong></div><span class="badge-smaller"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Already under target</span>`;
      } else {
        pages.textContent = `${pageRangeStr} · ${niceSize(o.blob.size)}`;
      }

      info.append(title, pages);
      top.append(icon, info);

      const actions = document.createElement('div');
      actions.className = 'result-actions';

      const dl = document.createElement('button');
      dl.type = 'button';
      dl.textContent = 'Download PDF';
      dl.addEventListener('click', () => downloadBlob(o.blob, o.name));

      const compBtn = document.createElement('button');
      compBtn.type = 'button';
      compBtn.className = 'compress-card-btn';
      compBtn.textContent = o.isCompressed ? 'Re-compress' : `Compress to ${targetLabel}`;
      compBtn.addEventListener('click', () => compressSingleOutput(index));

      actions.append(dl, compBtn);
      card.append(top, actions);
      els.resultsGrid.append(card);
    });

    const anyCompressed = state.outputs.some(o => o.isCompressed);
    els.resultsSub.textContent = `${state.outputs.length} PDF${state.outputs.length === 1 ? '' : 's'} ready.${anyCompressed ? ' Includes compressed files.' : ''}`;
    els.downloadAllBtn.disabled = false;
    els.compressionPanel.classList.remove('hidden');
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function compressPdfBlob(inputBlob, targetBytes, onProgress) {
    if (inputBlob.size <= targetBytes) {
      return {
        blob: inputBlob,
        alreadySmaller: true,
        size: inputBlob.size
      };
    }

    if (!window.pdfjsLib) {
      throw new Error('PDF compression engine is not available. Check your internet connection.');
    }

    const arrayBuffer = await inputBlob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const ratio = Math.max(0.06, targetBytes / inputBlob.size);

    let scale = 1.35;
    let quality = 0.72;

    if (ratio > 0.75) {
      scale = 1.45;
      quality = 0.80;
    } else if (ratio > 0.50) {
      scale = 1.30;
      quality = 0.70;
    } else if (ratio > 0.30) {
      scale = 1.15;
      quality = 0.58;
    } else if (ratio > 0.15) {
      scale = 1.00;
      quality = 0.46;
    } else {
      scale = 0.82;
      quality = 0.36;
    }

    async function buildPdf(currentScale, currentQuality) {
      const newPdf = await PDFLib.PDFDocument.create();
      for (let p = 1; p <= numPages; p++) {
        if (onProgress) onProgress(p, numPages);
        const page = await pdfDoc.getPage(p);
        const viewport = page.getViewport({ scale: currentScale });
        const origViewport = page.getViewport({ scale: 1.0 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d', { alpha: false });

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        const imgDataUrl = canvas.toDataURL('image/jpeg', currentQuality);
        const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
        const embeddedJpg = await newPdf.embedJpg(imgBytes);

        const outPage = newPdf.addPage([origViewport.width, origViewport.height]);
        outPage.drawImage(embeddedJpg, {
          x: 0,
          y: 0,
          width: origViewport.width,
          height: origViewport.height
        });

        // Yield execution to keep the browser UI responsive
        await new Promise(r => setTimeout(r, 0));
      }

      const pdfBytes = await newPdf.save();
      return new Blob([pdfBytes], { type: 'application/pdf' });
    }

    let compressed = await buildPdf(scale, quality);

    // If size exceeds target by more than 5% and we have room to downsample further
    if (compressed.size > targetBytes && (quality > 0.32 || scale > 0.75)) {
      const secondRatio = targetBytes / compressed.size;
      scale = Math.max(0.70, scale * Math.sqrt(secondRatio));
      quality = Math.max(0.28, quality * secondRatio * 0.94);
      compressed = await buildPdf(scale, quality);
    }

    return {
      blob: compressed,
      alreadySmaller: false,
      size: compressed.size
    };
  }

  async function compressSingleOutput(index) {
    if (state.isCompressing) return;
    const output = state.outputs[index];
    if (!output) return;

    const targetBytes = getTargetBytes();
    state.isCompressing = true;
    toast(`Compressing ${output.name} to ${getTargetLabel()}...`);

    try {
      const sourceBlob = output.originalBlob || output.blob;
      const res = await compressPdfBlob(sourceBlob, targetBytes);

      if (res.alreadySmaller) {
        output.alreadyWithinTarget = true;
        toast(`${output.name} is already within ${getTargetLabel()} (${niceSize(sourceBlob.size)}).`);
      } else {
        output.blob = res.blob;
        output.compressedBlob = res.blob;
        output.isCompressed = true;
        output.alreadyWithinTarget = false;
        toast(`Compressed to ${niceSize(res.size)} (Target: ${getTargetLabel()})`);
      }
      renderOutputs();
    } catch (err) {
      console.error(err);
      toast('Could not compress this PDF. Try a higher target size.');
    } finally {
      state.isCompressing = false;
    }
  }

  function revertSingleOutput(index) {
    const output = state.outputs[index];
    if (!output) return;
    output.blob = output.originalBlob;
    output.isCompressed = false;
    output.alreadyWithinTarget = false;
    renderOutputs();
    toast(`Restored original ${output.name}`);
  }

  async function compressAllOutputs() {
    if (!state.outputs.length || state.isCompressing) return;
    state.isCompressing = true;

    const targetBytes = getTargetBytes();
    const targetLabel = getTargetLabel();
    const totalFiles = state.outputs.length;

    els.compressProgressBox.classList.remove('hidden');
    els.compressAllBtn.disabled = true;
    els.downloadAllBtn.disabled = true;
    els.splitBtn.disabled = true;

    let compressedCount = 0;
    let skippedCount = 0;

    try {
      for (let i = 0; i < totalFiles; i++) {
        const item = state.outputs[i];
        const overallPercent = Math.round((i / totalFiles) * 100);
        els.compressProgressPercent.textContent = `${overallPercent}%`;
        els.compressProgressBar.style.width = `${overallPercent}%`;
        els.compressProgressStatus.textContent = `Compressing ${i + 1} of ${totalFiles}: ${item.name}...`;

        const sourceBlob = item.originalBlob || item.blob;
        const res = await compressPdfBlob(sourceBlob, targetBytes, (currPage, totalPages) => {
          const pagePct = Math.round((currPage / totalPages) * 100);
          els.compressProgressStatus.textContent = `File ${i + 1}/${totalFiles} (${item.name}): Page ${currPage}/${totalPages} (${pagePct}%)`;
        });

        if (res.alreadySmaller) {
          item.alreadyWithinTarget = true;
          skippedCount++;
        } else {
          item.blob = res.blob;
          item.compressedBlob = res.blob;
          item.isCompressed = true;
          item.alreadyWithinTarget = false;
          compressedCount++;
        }
      }

      els.compressProgressBar.style.width = '100%';
      els.compressProgressPercent.textContent = '100%';
      els.compressProgressStatus.textContent = 'All files processed successfully!';

      renderOutputs();
      toast(`Finished: ${compressedCount} compressed, ${skippedCount} already within ${targetLabel}.`);
    } catch (err) {
      console.error(err);
      toast('An error occurred during compression.');
    } finally {
      state.isCompressing = false;
      els.compressAllBtn.disabled = false;
      els.downloadAllBtn.disabled = false;
      els.splitBtn.disabled = !state.file || !getRanges().ranges.length;
      setTimeout(() => {
        els.compressProgressBox.classList.add('hidden');
      }, 3000);
    }
  }

  async function splitPdf() {
    const { ranges, error } = getRanges();
    if (!state.bytes || error || !ranges.length) {
      updatePreview();
      return;
    }
    els.splitBtn.disabled = true;
    els.splitBtn.innerHTML = '<span class="spinner"></span> Splitting PDF...';
    setStatus(els.splitStatus, 'Creating separate PDFs on your device...');
    clearOutputs();
    try {
      const source = await PDFLib.PDFDocument.load(state.bytes);
      const base = safeName(els.assignmentName.value);
      const outputs = [];
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        const out = await PDFLib.PDFDocument.create();
        const indices = Array.from({ length: range.end - range.start + 1 }, (_, n) => range.start - 1 + n);
        const copied = await out.copyPages(source, indices);
        copied.forEach(page => out.addPage(page));
        const bytes = await out.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const pageLabel = `${range.start}-${range.end}`;
        const name = `${String(i + 1).padStart(2, '0')} - Pages ${pageLabel} - ${base}.pdf`;
        outputs.push({
          name,
          blob,
          originalBlob: blob,
          originalSize: blob.size,
          compressedBlob: null,
          isCompressed: false,
          alreadyWithinTarget: false,
          range
        });
        if (i % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
      }
      state.outputs = outputs;
      renderOutputs();
      setStatus(els.splitStatus, `Done! ${outputs.length} PDFs created successfully.`, 'success');
      toast(`${outputs.length} PDFs are ready.`);
      document.querySelector('.results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      setStatus(els.splitStatus, 'Something went wrong while splitting. Try a smaller or different PDF.', 'error');
      toast('Could not split this PDF.');
    } finally {
      els.splitBtn.disabled = !state.file || !getRanges().ranges.length;
      els.splitBtn.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m13 5h3a2 2 0 0 0 2-2v-3M8 12h8m-4-4v8"/></svg> Split my PDF';
    }
  }

  async function downloadZip() {
    if (!state.outputs.length) return;
    const btn = els.downloadAllBtn;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Preparing ZIP...';
    try {
      const zip = new JSZip();
      state.outputs.forEach(o => zip.file(o.name, o.blob));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } });
      const hasCompressed = state.outputs.some(o => o.isCompressed);
      downloadBlob(blob, `${safeName(els.assignmentName.value)} - ${hasCompressed ? 'Compressed Split PDFs' : 'Split PDFs'}.zip`);
      toast('Your ZIP download is ready.');
    } catch (err) {
      console.error(err);
      toast('Could not create ZIP. Download files individually instead.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></svg> Download all (.ZIP)';
    }
  }

  // Preset chips event handlers
  els.presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      els.presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      els.targetSizeInput.value = chip.dataset.val;
      els.targetSizeUnit.value = chip.dataset.unit;
      if (state.outputs.length) renderOutputs();
    });
  });

  function syncPresetChips() {
    const currVal = parseFloat(els.targetSizeInput.value);
    const currUnit = els.targetSizeUnit.value;
    els.presetChips.forEach(chip => {
      const chipVal = parseFloat(chip.dataset.val);
      const chipUnit = chip.dataset.unit;
      chip.classList.toggle('active', chipVal === currVal && chipUnit === currUnit);
    });
    if (state.outputs.length) renderOutputs();
  }

  els.targetSizeInput.addEventListener('input', syncPresetChips);
  els.targetSizeUnit.addEventListener('change', syncPresetChips);
  els.compressAllBtn.addEventListener('click', compressAllOutputs);

  $('chooseBtn').addEventListener('click', e => {
    e.stopPropagation();
    els.fileInput.click();
  });
  els.dropzone.addEventListener('click', () => els.fileInput.click());
  els.dropzone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      els.fileInput.click();
    }
  });
  els.fileInput.addEventListener('change', e => loadFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach(type => els.dropzone.addEventListener(type, e => {
    e.preventDefault();
    els.dropzone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(type => els.dropzone.addEventListener(type, e => {
    e.preventDefault();
    els.dropzone.classList.remove('drag');
  }));
  els.dropzone.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
  els.removeBtn.addEventListener('click', resetFile);
  [els.pagesPerFile, els.startPage, els.rangesInput].forEach(el => el.addEventListener('input', updatePreview));
  els.assignmentName.addEventListener('input', () => {
    if (state.outputs.length) setStatus(els.splitStatus, 'Assignment name changed. Split again to update the generated filenames.');
  });
  document.querySelectorAll('.mode-tab').forEach(btn => btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    document.querySelectorAll('.mode-tab').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });
    els.groupsMode.classList.toggle('hidden', state.mode !== 'groups');
    els.customMode.classList.toggle('hidden', state.mode !== 'custom');
    updatePreview();
  }));
  els.splitBtn.addEventListener('click', splitPdf);
  els.downloadAllBtn.addEventListener('click', downloadZip);

  if (!window.PDFLib || !window.JSZip) {
    setStatus(els.uploadStatus, 'Could not load the PDF tools. Check your internet connection and refresh the page.', 'error');
  }
})();
