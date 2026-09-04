import logger from '../utils/logger.js';
import container from 'markdown-it-container';

export function buildHeader(logoBase64) {
    // logger.info("🪚 Building header...");
    return `
    <div style="width: 100%; padding: 0 60px; margin-top: 12px; box-sizing: border-box;">
      <div style="width: 100%; height: 50px; border-bottom: 1px solid black; display: flex; align-items: center; box-sizing: border-box;">
        <img 
          src="data:image/png;base64,${logoBase64}" 
          style="
            height: 40px; 
            width: auto; 
            max-width: 100%; 
            object-fit: contain;
          " />
      </div>
    </div>
  `;
}

export function buildFooter() {
    // logger.info("🔨 Building footer...");
    return `
    <div style="
      width:100%;
      padding:0 2cm; 
      padding-bottom: .5cm;
      display:flex; 
      justify-content:right;
    ">
      <span style="
        font-size:14px;
        color: #7f7f7f;
      "><span class="pageNumber"></span>
      </span>
    </div>
  `;
}

export function injectDateAfterH1(html, dateString) {
    if (!dateString) return html;

    logger.info('📅 Stamping datestamp', dateString);

    return html.replace(/(<h1[^>]*>.*?<\/h1>)/i, `$1\n<p>Updated: ${dateString}</p>`);
}

// Default PDF title: plain text of the rendered document's first H1.
export function extractTitle(html) {
    const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (!match) return null;

    const text = match[1].replace(/<[^>]+>/g, '').trim();
    return text || null;
}

export function registerImageRules(md) {
    // Custom image renderer — supports scale= and align= in the title attribute
    // Usage: ![alt](image.png "scale=50% align=center")
    md.renderer.rules.image = function (tokens, idx) {
        const token = tokens[idx];
        const src = token.attrGet('src') ?? '';
        const alt = token.children ? token.children.reduce((acc, t) => acc + t.content, '') : '';
        const title = token.attrGet('title') ?? '';

        const scaleMatch = title.match(/\bscale=(\d+%|\d+px)/);
        const alignMatch = title.match(/\balign=(left|center|right)/);

        // Only strip text that actually matched the whitelisted patterns above, so
        // invalid directives (e.g. `scale=huge`) stay put as real title text.
        let cleanTitle = title;
        if (scaleMatch) cleanTitle = cleanTitle.replace(scaleMatch[0], '');
        if (alignMatch) cleanTitle = cleanTitle.replace(alignMatch[0], '');
        cleanTitle = cleanTitle.trim();

        const styles = [];
        if (scaleMatch) styles.push(`width: ${scaleMatch[1]}`);
        if (alignMatch) {
            const align = alignMatch[1];
            if (align === 'center') {
                styles.push('display: block', 'margin-left: auto', 'margin-right: auto');
            } else if (align === 'left') {
                styles.push('display: block', 'margin-right: auto');
            } else if (align === 'right') {
                styles.push('display: block', 'margin-left: auto');
            }
        }

        const attrs = [
            // src is escaped here (unlike the reference impl) to prevent attribute-breaking injection
            `src="${md.utils.escapeHtml(src)}"`,
            `alt="${md.utils.escapeHtml(alt)}"`,
            cleanTitle ? `title="${md.utils.escapeHtml(cleanTitle)}"` : '',
            styles.length ? `style="${styles.join('; ')}"` : '',
        ]
            .filter(Boolean)
            .join(' ');

        return `<img ${attrs}>`;
    };
}

export function registerContainers(md) {
    const types = ['caution', 'danger', 'hint', 'info', 'note', 'tip', 'warning', 'scenario'];

    const originalRender = md.renderer.render;

    md.renderer.render = function (tokens, options, env) {
        tokens = tokens.filter((t, idx) => {
            if (t._skip) {
                let nesting = 1;
                for (let i = idx + 1; i < tokens.length; i++) {
                    nesting += tokens[i].nesting;
                    if (nesting === 0) {
                        tokens.splice(idx, i - idx + 1);
                        break;
                    }
                }
                return false;
            }
            return true;
        });

        return originalRender.call(this, tokens, options, env);
    };

    types.forEach((type) => {
        md.use(container, type, {
            validate(params) {
                return params.trim().startsWith(type);
            },

            render: (tokens, idx) => {
                const token = tokens[idx];
                const info = token.info.trim();

                if (token.nesting === 1) {
                    const classList = ['admonition'];
                    let titleHTML = '';

                    classList.push(type);
                    const defaultTitle = type.charAt(0).toUpperCase() + type.slice(1);
                    titleHTML = `<div class="admonition-title">${defaultTitle}</div>`;

                    return `<div class="${classList.join(
                        ' ',
                    )}">${titleHTML}<div class="admonition-content">\n`;
                } else {
                    return `</div></div>\n`;
                }
            },

            marker: ':',
        });
    });
}
