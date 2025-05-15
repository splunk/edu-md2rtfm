import logger from "../utils/logger.js";
import container from "markdown-it-container";

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

  logger.info("📅 Stamping datestamp", dateString);

  return html.replace(
    /(<h1[^>]*>.*?<\/h1>)/i,
    `$1\n<p>Updated: ${dateString}</p>`
  );
}

export function registerContainers(md) {
  const types = [
    "caution",
    "danger",
    "hint",
    "info",
    "note",
    "tip",
    "warning",
    "scenario",
  ];

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
          const classList = ["admonition"];
          let titleHTML = "";

          classList.push(type);
          const defaultTitle = type.charAt(0).toUpperCase() + type.slice(1);
          titleHTML = `<div class="admonition-title">${defaultTitle}</div>`;

          return `<div class="${classList.join(
            " "
          )}">${titleHTML}<div class="admonition-content">\n`;
        } else {
          return `</div></div>\n`;
        }
      },

      marker: ":",
    });
  });
}
