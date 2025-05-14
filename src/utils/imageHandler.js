import fsp from "fs/promises";
import path from "path";
import logger from "./logger.js";

export async function embedLocalImages(markdown, sourceDir) {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  const matches = [...markdown.matchAll(imageRegex)];

  const replacements = await Promise.all(
    matches.map(async (match) => {
      const [fullMatch, alt, imgPath] = match;
      const resolvedPath = path.resolve(sourceDir, imgPath);

      try {
        const buffer = await fsp.readFile(resolvedPath);
        const ext = path.extname(resolvedPath).slice(1).toLowerCase();
        const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;
        const base64 = buffer.toString("base64");

        logger.info(`🖼️  Embedding ${imgPath}`);
        return {
          original: fullMatch,
          replacement: `![${alt}](data:${mime};base64,${base64})`,
        };
      } catch (err) {
        logger.warn(
          `⚠️ Could not embed image: ${imgPath} (resolved: ${resolvedPath}). Reason: ${err.message}`
        );
        return { original: fullMatch, replacement: fullMatch };
      }
    })
  );

  let result = markdown;
  for (const { original, replacement } of replacements) {
    result = result.replace(original, replacement);
  }

  return result;
}

export async function getLogoBase64(logoPath) {
  const buffer = await fsp.readFile(logoPath);
  return buffer.toString("base64");
}
