(() => {
  const originalInput = document.querySelector('#resumeFile');
  const textArea = document.querySelector('#resumeText');
  const count = document.querySelector('#count');
  const status = document.querySelector('#status');
  if (!originalInput || !textArea || !count || !status) return;

  // Replacing the node removes the original text-only change handler.
  const fileInput = originalInput.cloneNode(true);
  originalInput.replaceWith(fileInput);

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_TEXT_LENGTH = 50000;
  const supportedExtensions = new Set(['pdf', 'docx', 'txt', 'md']);

  function extensionOf(filename) {
    return filename.toLowerCase().split('.').pop() || '';
  }

  function normalizeExtractedText(text) {
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  async function extractPdf(file) {
    const pdfjs = await import('/vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
    const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let line = '';
      let previousY = null;
      const lines = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform?.[5];
        if (previousY !== null && typeof y === 'number' && Math.abs(y - previousY) > 3) {
          if (line.trim()) lines.push(line.trim());
          line = '';
        }
        line += (line && !/^\s/.test(item.str) ? ' ' : '') + item.str;
        if (typeof y === 'number') previousY = y;
      }
      if (line.trim()) lines.push(line.trim());
      pages.push(lines.join('\n'));
      if (pages.join('\n\n').length >= MAX_TEXT_LENGTH) break;
    }
    return pages.join('\n\n');
  }

  async function extractDocx(file) {
    if (!window.mammoth?.extractRawText) {
      throw new Error('The DOCX reader did not load. Refresh the page and try again.');
    }
    const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }

  async function extractFile(file, extension) {
    if (extension === 'pdf') return extractPdf(file);
    if (extension === 'docx') return extractDocx(file);
    return file.text();
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const extension = extensionOf(file.name);
    status.textContent = '';

    if (!supportedExtensions.has(extension)) {
      status.textContent = 'Choose a PDF, DOCX, TXT, or MD resume.';
      fileInput.value = '';
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      status.textContent = 'Choose a resume file smaller than 10 MB.';
      fileInput.value = '';
      return;
    }

    status.textContent = `Reading ${file.name} locally…`;
    fileInput.disabled = true;
    try {
      const extracted = normalizeExtractedText(await extractFile(file, extension));
      if (!extracted) {
        status.textContent = extension === 'pdf'
          ? 'No selectable text was found. This may be a scanned or image-only PDF; paste the resume text instead.'
          : 'No readable text was found in this file.';
        return;
      }
      textArea.value = extracted.slice(0, MAX_TEXT_LENGTH);
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
      const truncated = extracted.length > MAX_TEXT_LENGTH
        ? ' The extracted text was limited to 50,000 characters.'
        : '';
      status.textContent = `${file.name} opened locally.${truncated} Review the text, then click scan.`;
      textArea.focus();
    } catch (error) {
      console.error('Resume file extraction failed:', error);
      status.textContent = error?.message?.startsWith('The DOCX reader')
        ? error.message
        : 'This file could not be read. It may be password-protected, damaged, or use an unsupported format.';
    } finally {
      fileInput.disabled = false;
      fileInput.value = '';
    }
  });
})();
