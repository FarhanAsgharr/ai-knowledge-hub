/**
 * Shared between the upload UI and the server extractor, so it must stay free of
 * server-only imports — pulling these constants out of extract.ts keeps mammoth
 * and the OpenAI SDK out of the browser bundle.
 */

/**
 * Parsed by officeparser. Deliberately excludes the legacy binary `.ppt` and
 * `.xls` — officeparser handles only the XML-based formats, so listing them
 * would accept an upload that could never be parsed.
 */
export const OFFICE_EXTENSIONS = [
  "pptx",
  "xlsx",
  "odt",
  "odp",
  "ods",
  "rtf",
  "csv",
  "epub",
  "html",
  "htm",
] as const;

/** Read by a vision model, since there's no text layer to extract. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;

/** Read as-is. */
export const TEXT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "log",
  "json",
  "yaml",
  "yml",
] as const;

export const SUPPORTED_EXTENSIONS: string[] = [
  "pdf",
  "docx",
  ...OFFICE_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ...TEXT_EXTENSIONS,
];

/** The `accept` attribute for the file picker. */
export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isSupported(mimeType: string, filename: string): boolean {
  if (SUPPORTED_EXTENSIONS.includes(extensionOf(filename))) return true;
  // Some browsers send no extension-bearing name but a usable type.
  return mimeType.startsWith("text/") || mimeType.startsWith("image/");
}
