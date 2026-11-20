import type { Page } from "@playwright/test";

/**
 * A page's raw HTML followed by its RSC payload (the props passed to client components) joined into one string:
 * the payload streams in chunks that can split any string, so checks on the HTML alone can miss text.
 */
export async function pagePayload(page: Page, url: string): Promise<string> {
  const html = await (await page.request.get(url)).text();
  const chunks = html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g);
  return html + Array.from(chunks, (m) => JSON.parse(m[1]) as string).join("");
}
