import mammoth from "mammoth";
import type { SupportedFileType } from "officeparser";

import { IMAGE_EXTENSIONS, OFFICE_EXTENSIONS, extensionOf } from "./file-types";
import { transcribeImage } from "./openai";

/** A page (PDF) or the whole document (everything else, where `page` is null). */
export type Segment = { page: number | null; text: string };

export async function extractSegments(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<Segment[]> {
  const ext = extensionOf(filename);

  if (ext === "pdf" || mimeType === "application/pdf") {
    // unpdf ships a serverless-friendly pdf.js build — no worker, no canvas.
    // Kept separate from officeparser because it reports per-page text, which
    // is what makes "page 4" citations possible.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (text as string[])
      .map((pageText, i) => ({ page: i + 1, text: pageText.trim() }))
      .filter((segment) => segment.text.length > 0);

    // A scanned PDF has pages but no text layer; fall through to the image path
    // rather than failing with "no readable text".
    if (pages.length > 0) return pages;
    return [];
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return [{ page: null, text: value.trim() }];
  }

  if ((OFFICE_EXTENSIONS as readonly string[]).includes(ext)) {
    const { parseOffice } = await import("officeparser");
    // The type hint is required, not optional: csv, html and rtf have no magic
    // bytes, so auto-detection throws on exactly the formats a user is most
    // likely to paste in. `htm` isn't a recognised hint, so normalise it.
    const fileType = (ext === "htm" ? "html" : ext) as SupportedFileType;
    const ast = await parseOffice(buffer, { fileType });
    return [{ page: null, text: ast.toText().trim() }];
  }

  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext) || mimeType.startsWith("image/")) {
    const type = mimeType.startsWith("image/") ? mimeType : `image/${ext === "jpg" ? "jpeg" : ext}`;
    return [{ page: null, text: (await transcribeImage(buffer, type)).trim() }];
  }

  return [{ page: null, text: buffer.toString("utf-8").trim() }];
}
