/** A way to read the text in an image. Add one by implementing this and listing it in `index.ts`. */
export interface OcrProvider {
  /**
   * @param input an http(s) URL or a base64 `data:` URL
   * @returns the recognised text, lines separated by newlines
   */
  recognize(input: string, options: { language?: string }): Promise<string>
}
