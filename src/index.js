#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Command } from "commander";

import { embedLocalImages, getLogoBase64 } from "./utils/imageHandler.js";
import logger from "./utils/logger.js";
import {
  injectDateAfterH1,
  buildHeader,
  buildFooter,
} from "./generators/htmlGenerator.js";
import { renderMarkdown } from "./generators/mdGenerator.js";
import { generatePdf } from "./generators/pdfGenerator.js";

import { loadMetadata, updateMetadataDate } from "./utils/metadataHandler.js";
import { buildOutputFilename } from "./utils/fileHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.join(__dirname, "./assets");

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getFormattedDate(input) {
  const date = input ? new Date(input) : new Date();
  if (isNaN(date)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }
  return date.toISOString().split("T")[0];
}

const program = new Command();

program
  .name("md2rtfm")
  .description("Convert *-readme.md to a fantastic manual.")
  .argument(
    "[sourceDir]",
    "Directory containing a Markdown file ending in `-readme.md`.",
    process.cwd()
  )
  .option("-v, --verbose", "Enable verbose logging")
  .option(
    "-d, --date <date>",
    "Custom date for 'updated' field in YYYY-MM-DD format"
  )
  .action(async (sourceDir, options) => {
    try {
      // Check directory content for readme file
      const files = await fs.readdir(sourceDir);
      const readmeFile = files.find((file) => /-readme\.md$/i.test(file));

      if (!readmeFile) {
        logger.error("❌ No '-readme.md' file found in", sourceDir);
        process.exit(1);
      }

      const markdownPath = path.join(sourceDir, readmeFile);
      const markdown = await fs.readFile(markdownPath, "utf8");

      const metadataPath = path.join(sourceDir, "metadata.yaml");
      const metadata = await loadMetadata(metadataPath);

      const updatedDate = getFormattedDate(options.date);
      await updateMetadataDate(
        metadataPath,
        metadata,
        updatedDate,
        options.verbose,
        logger
      );

      const htmlBody = await renderMarkdown(
        markdown,
        sourceDir,
        embedLocalImages
      );
      const htmlContent = injectDateAfterH1(htmlBody, updatedDate);

      const outputFilename = buildOutputFilename(metadata, sourceDir);
      const outputPath = path.join(sourceDir, "pdfs", outputFilename);

      const logoPath = path.join(ASSETS_DIR, "logo-splunk-cisco.png");
      const logoBase64 = await getLogoBase64(logoPath);

      const cssPath = path.join(__dirname, "styles", "style.css");
      const cssContent = (await fileExists(cssPath))
        ? await fs.readFile(cssPath, "utf8")
        : "";

      // Generate PDF
      await generatePdf({
        htmlContent,
        outputPath,
        cssContent,
        logoBase64,
        headerTemplate: buildHeader(logoBase64),
        footerTemplate: buildFooter(),
      });

      logger.log(`🦄 Generated fantastic manual: ${outputPath}`);
    } catch (err) {
      logger.error("❌ Error:", err.stack || err.message || err);
      console.error(err);
      process.exit(1);
    }
  });

program.parse();
