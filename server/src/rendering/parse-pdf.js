const fs = require('fs');
const { parseScienceText } = require('./parse-science');

function ensurePdfPolyfills() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor() {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.e = 0;
        this.f = 0;
      }
      static fromMatrix() {
        return new DOMMatrix();
      }
      invertSelf() {
        return this;
      }
      multiply() {
        return this;
      }
      translate() {
        return this;
      }
      scale() {
        return this;
      }
      rotate() {
        return this;
      }
    };
  }
}

async function extractPdfTextFromBuffer(buffer) {
  ensurePdfPolyfills();
  const pdfParseModule = require('pdf-parse');

  if (typeof pdfParseModule === 'function') {
    const pdfData = await pdfParseModule(buffer);
    return pdfData?.text || '';
  }

  if (pdfParseModule && typeof pdfParseModule.default === 'function') {
    const pdfData = await pdfParseModule.default(buffer);
    return pdfData?.text || '';
  }

  if (pdfParseModule && typeof pdfParseModule.PDFParse === 'function') {
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result?.text || '';
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    }
  }

  throw new Error('Unsupported pdf-parse module export');
}

async function extractPdfTextFromFile(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  const text = await extractPdfTextFromBuffer(buffer);
  return {
    text,
    byteLength: buffer.byteLength,
  };
}

function normalizePdfText(text, options = {}) {
  const minLength = options.minLength || 50;
  const maxChars = options.maxChars || 8000;
  const normalized = String(text || '');

  if (normalized.trim().length < minLength) {
    throw new Error('Could not extract sufficient text from PDF');
  }

  const trimmedText = normalized.slice(0, maxChars);
  return {
    originalText: normalized,
    trimmedText,
    originalLength: normalized.length,
    trimmedLength: trimmedText.length,
    wasTrimmed: normalized.length > trimmedText.length,
  };
}

async function parseSciencePdfFile({ filePath, minLength = 50, maxChars = 8000 }) {
  const extracted = await extractPdfTextFromFile(filePath);
  const normalized = normalizePdfText(extracted.text, { minLength, maxChars });
  const parsed = await parseScienceText({ text: normalized.trimmedText });

  return {
    parsed,
    ...normalized,
    byteLength: extracted.byteLength,
  };
}

module.exports = {
  ensurePdfPolyfills,
  extractPdfTextFromBuffer,
  extractPdfTextFromFile,
  normalizePdfText,
  parseSciencePdfFile,
};
