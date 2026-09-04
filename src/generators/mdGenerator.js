import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import { registerContainers, registerImageRules } from '../generators/htmlGenerator.js';
import logger from '../utils/logger.js';

export async function renderMarkdown(markdown, sourceDir, embedFn) {
    const embedded = await embedFn(markdown, sourceDir);

    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
    }).use(markdownItAnchor, {
        permalink: false,
        slugify: (s) =>
            s
                .trim()
                .toLowerCase()
                .replace(/[^\w]+/g, '-'),
    });

    registerContainers(md);
    registerImageRules(md);

    //   logger.info("🔧 Rendering Markdown...");

    return md.render(embedded);
}
