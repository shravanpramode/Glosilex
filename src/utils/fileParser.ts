import { extractTextFromPdf } from './pdfParser';
import mammoth from 'mammoth';

/**
 * Universal file text extractor.
 * Supports: .pdf, .txt, .docx
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  // ── PDF ──────────────────────────────────────────────────────────────────
  if (ext === 'pdf' || file.type === 'application/pdf') {
    return extractTextFromPdf(file);
  }

  // ── Plain text ────────────────────────────────────────────────────────────
  if (ext === 'txt' || file.type === 'text/plain') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve((e.target?.result as string) ?? '');
      reader.onerror = () => reject(new Error('Failed to read .txt file.'));
      reader.readAsText(file);
    });
  }

  // ── DOCX ──────────────────────────────────────────────────────────────────
  if (
    ext === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (!result.value?.trim()) {
      throw new Error('The .docx file appears to be empty or could not be read.');
    }
    return result.value;
  }

  // ── Unsupported ───────────────────────────────────────────────────────────
  throw new Error(
    `Unsupported file type: .${ext}. Please upload a PDF, DOCX, or TXT file.`
  );
}

/** Returns a friendly label for the upload zone based on the file extension. */
export function getFileTypeLabel(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf')  return 'PDF Document';
  if (ext === 'docx') return 'Word Document (.docx)';
  if (ext === 'txt')  return 'Text File (.txt)';
  return 'Document';
}