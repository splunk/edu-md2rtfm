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
import {
  buildOutputFilename,
  fileExists,
  findReadmeFiles,
} from "./utils/fileHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.join(__dirname, "./assets");

/**
 * Process a single markdown file and generate PDF
 * @param {Object} fileInfo - File information object
 * @param {string} customDate - Custom date for metadata
 * @param {string} sourceDir - Main source directory for metadata
 */
async function processMarkdownFile(fileInfo, customDate, sourceDir) {
  const { fullPath, fileName, directory, isSupplemental } = fileInfo;

  logger.info(`🚚 Loading Markdown ${fullPath}`);
  const markdown = await fs.readFile(fullPath, "utf8");

  // Always use metadata from the main source directory
  const metadataPath = await getMetadataPath(sourceDir);
  const metadata = await loadMetadata(metadataPath);

  const updatedDate = getFormattedDate(customDate);
  // Only update metadata once for all files (check if we're processing the main file)
  if (!isSupplemental) {
    await updateMetadataDate(metadataPath, metadata, updatedDate);
  }

  const htmlBody = await renderMarkdown(markdown, directory, embedLocalImages);
  const htmlContent = injectDateAfterH1(htmlBody, updatedDate);

  // Build output filename, considering if this is a supplemental file
  let outputFilename;
  if (isSupplemental) {
    // For supplemental files, create a filename based on the original file name
    const baseName = path.basename(fileName, path.extname(fileName));
    outputFilename = `${baseName}.pdf`;
  } else {
    outputFilename = buildOutputFilename(metadata, directory);
  }

  const outputPath = path.join(directory, outputFilename);

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

  logger.info(`📄 Generated PDF: ${outputPath}`);
  return outputPath;
}

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
  .option(
    "-r, --recursive",
    "Also process *-readme.md files in the 'supplemental' subfolder"
  )
  .action(async (sourceDir, options) => {
    try {
      // Find all readme files to process
      const filesToProcess = await findReadmeFiles(
        sourceDir,
        options.recursive
      );

      if (filesToProcess.length === 0) {
        logger.error(
          "No '-readme.md' or '-README.md' file found in",
          sourceDir
        );
        process.exit(1);
      }

      logger.info(`Found ${filesToProcess.length} file(s) to process`);

      // Process each file
      const processedFiles = [];
      for (const fileInfo of filesToProcess) {
        try {
          const outputPath = await processMarkdownFile(
            fileInfo,
            options.date,
            sourceDir
          );
          processedFiles.push(outputPath);
        } catch (fileErr) {
          logger.error(
            `Error processing ${fileInfo.fullPath}:`,
            fileErr.message
          );
          // Continue processing other files instead of exiting
        }
      }

      if (processedFiles.length > 0) {
        logger.info(
          `🌟 Generated ${processedFiles.length} fantastic manual(s)!`
        );
        if (options.recursive) {
          logger.info("📚 Processed main readme and supplemental files");
        }
      } else {
        logger.error("No files were successfully processed");
        process.exit(1);
      }
    } catch (err) {
      logger.error("Error:", err.stack || err.message || err);
      console.error(err);
      process.exit(1);
    }
  });

program.parse();
