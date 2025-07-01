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

import {
  loadMetadata,
  updateMetadataDate,
  getFormattedDate,
  getMetadataPath,
} from "./utils/metadataHandler.js";
import { buildOutputFilename, fileExists } from "./utils/fileHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.join(__dirname, "./assets");

const program = new Command();

program
  .name("md2rtfm")
  .description("Convert *-readme.md or *-README.md to a fantastic manual.")
  .argument(
    "[sourceDir]",
    "Directory containing a Markdown file ending in `-readme.md` or `-README.md`.",
    process.cwd()
  )
  // .option("-v, --verbose", "Enable verbose logging")
  .option(
    "-d, --date <date>",
    "Custom date for 'updated' field in YYYY-MM-DD format"
  )
  .action(async (sourceDir, options) => {
    try {
      const files = await fs.readdir(sourceDir);
      const readmeFile = files.find((file) => /-readme\.md$/i.test(file));

      if (!readmeFile) {
        logger.error(
          "No '-readme.md' or '-README.md' file found in",
          sourceDir
        );
        process.exit(1);
      }

      const markdownPath = path.join(sourceDir, readmeFile);
      logger.info(`🚚 Loading Markdown ${markdownPath}`);
      const markdown = await fs.readFile(markdownPath, "utf8");

      const metadataPath = await getMetadataPath(sourceDir);
      const metadata = await loadMetadata(metadataPath);

      const updatedDate = getFormattedDate(options.date);
      await updateMetadataDate(metadataPath, metadata, updatedDate);

      const htmlBody = await renderMarkdown(
        markdown,
        sourceDir,
        embedLocalImages
      );
      const htmlContent = injectDateAfterH1(htmlBody, updatedDate);

      const outputFilename = buildOutputFilename(metadata, sourceDir);
      const outputPath = path.join(sourceDir, outputFilename);

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

      logger.info(`🌟 Read the fantastic manual!`);
    } catch (err) {
      logger.error("Error:", err.stack || err.message || err);
      console.error(err);
      process.exit(1);
    }
  });

program.parse();
