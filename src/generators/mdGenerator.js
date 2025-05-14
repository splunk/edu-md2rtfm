import MarkdownIt from "markdown-it";
import { registerContainers } from "../generators/htmlGenerator.js";

export async function renderMarkdown(markdown, sourceDir, embedFn) {
  const embedded = await embedFn(markdown, sourceDir); // <- await async embed
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  registerContainers(md);
  return md.render(embedded);
}
