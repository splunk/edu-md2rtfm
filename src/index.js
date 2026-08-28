#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';

import { embedLocalImages, getLogoBase64 } from './utils/imageHandler.js';
import logger from './utils/logger.js';
import {
    injectDateAfterH1,
    extractTitle,
    buildHeader,
    buildFooter,
} from './generators/htmlGenerator.js';
import { renderMarkdown } from './generators/mdGenerator.js';
import { generatePdf } from './generators/pdfGenerator.js';

import {
    loadMetadata,
    loadManifestConfig,
    updateMetadataDate,
    getFormattedDate,
    getMetadataPath,
    valiDate,
} from './utils/metadataHandler.js';
import { fileExists, findReadmeFiles, resolveRtfmFiles } from './utils/fileHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.join(__dirname, './assets');

/**
 * Process a single markdown file and generate PDF
 * @param {Object} fileInfo - File information object
 * @param {string} customDate - Custom date for metadata
 * @param {string} sourceDir - Main source directory for metadata
 * @param {string} outputDir - Directory to write the generated PDF
 * @param {string|null} customOutputName - Custom PDF filename for this file, from manifest output.rtfm[index] (or legacy output.pdfs.readme)
 */
async function processMarkdownFile(
    fileInfo,
    customDate,
    sourceDir,
    outputDir,
    customOutputName = null,
) {
    const { fullPath, fileName, directory, isSupplemental } = fileInfo;

    logger.info(`🚚 Loading Markdown ${fullPath}`);
    const markdown = await fs.readFile(fullPath, 'utf8');

    // Always use metadata from the main source directory
    const metadataPath = await getMetadataPath(sourceDir);
    const metadata = await loadMetadata(metadataPath);

    // Use ISO date for metadata storage; human-readable for HTML display
    const isoDate = customDate ? valiDate(customDate) : new Date().toISOString().split('T')[0];
    const displayDate = getFormattedDate(isoDate);

    // Only update metadata once for all files (check if we're processing the main file)
    if (!isSupplemental) {
        await updateMetadataDate(metadataPath, metadata, isoDate);
    }

    const htmlBody = await renderMarkdown(markdown, directory, embedLocalImages);
    const htmlContent = injectDateAfterH1(htmlBody, displayDate);
    const pdfTitle = extractTitle(htmlBody);

    // Build output filename: customOutputName always wins so manifest output.rtfm
    // can rename any file; otherwise default to the source markdown's own filename,
    // always capitalizing README so people know to RTFM.
    let outputFilename;
    if (customOutputName) {
        outputFilename = path.basename(customOutputName);
    } else {
        const baseName = path
            .basename(fileName, path.extname(fileName))
            .replace(/readme/i, 'README');
        outputFilename = `${baseName}.pdf`;
    }

    const outputPath = path.join(outputDir, outputFilename);

    const logoPath = path.join(ASSETS_DIR, 'logo-splunk-cisco.png');
    const logoBase64 = await getLogoBase64(logoPath);

    const cssPath = path.join(__dirname, 'styles', 'style.css');
    const cssContent = (await fileExists(cssPath)) ? await fs.readFile(cssPath, 'utf8') : '';

    // Generate PDF
    await generatePdf({
        htmlContent,
        outputPath,
        cssContent,
        logoBase64,
        headerTemplate: buildHeader(logoBase64),
        footerTemplate: buildFooter(),
        title: pdfTitle,
    });

    logger.info(`📄 Generated PDF: ${outputPath}`);
    return outputPath;
}

// Accumulate repeated -i/--input flags into an ordered array
function collect(value, previous) {
    previous.push(value);
    return previous;
}

const program = new Command();

program
    .name('md2rtfm')
    .description('Convert *-readme.md or *-README.md to a fantastic manual.')
    .argument(
        '[sourceDir]',
        'Directory containing a Markdown file ending in `-readme.md` or `-README.md`.',
        process.cwd(),
    )
    // .option("-v, --verbose", "Enable verbose logging")
    .option('-d, --date <date>', "Custom date for 'updated' field in YYYY-MM-DD format")
    .option('-r, --recursive', 'Also process *-readme.md files in subdirectories')
    .option('-o, --output <dir>', 'Custom output directory (default: <sourceDir>/dist)')
    .option(
        '-i, --input <file>',
        'Explicit Markdown file to process, relative to sourceDir (repeatable; first use is the primary file, overrides manifest input.rtfm)',
        collect,
        [],
    )
    .action(async (sourceDir, options) => {
        try {
            const resolvedSourceDir = path.resolve(sourceDir);
            const manifestConfig = await loadManifestConfig(resolvedSourceDir);
            const outputDir = options.output
                ? path.resolve(options.output)
                : manifestConfig?.output?.destination
                  ? path.join(resolvedSourceDir, manifestConfig.output.destination)
                  : path.join(resolvedSourceDir, 'dist');
            await fs.mkdir(outputDir, { recursive: true });
            // output.rtfm names PDFs by position, mirroring input.rtfm; output.pdfs.readme
            // is a legacy alias for the first (main) file's name only.
            const outputRtfmList = manifestConfig?.output?.rtfm;
            const legacyReadmeName = manifestConfig?.output?.pdfs?.readme || null;

            // -i/--input takes precedence over manifest input.rtfm, which takes precedence
            // over scanning for *-readme.md/*-README.md files.
            const rtfmList = options.input.length > 0 ? options.input : manifestConfig?.input?.rtfm;
            const filesToProcess =
                Array.isArray(rtfmList) && rtfmList.length > 0
                    ? await resolveRtfmFiles(resolvedSourceDir, rtfmList)
                    : await findReadmeFiles(resolvedSourceDir, options.recursive);

            if (filesToProcess.length === 0) {
                logger.error("No '-readme.md' or '-README.md' file found in", sourceDir);
                process.exit(1);
            }

            logger.info(`Found ${filesToProcess.length} file(s) to process`);

            // Process each file
            const processedFiles = [];
            for (const [index, fileInfo] of filesToProcess.entries()) {
                try {
                    const customOutputName = Array.isArray(outputRtfmList)
                        ? outputRtfmList[index]
                        : index === 0
                          ? legacyReadmeName
                          : null;
                    const outputPath = await processMarkdownFile(
                        fileInfo,
                        options.date,
                        resolvedSourceDir,
                        outputDir,
                        customOutputName,
                    );
                    processedFiles.push(outputPath);
                } catch (fileErr) {
                    logger.error(`Error processing ${fileInfo.fullPath}:`, fileErr.message);
                    // Continue processing other files instead of exiting
                }
            }

            if (processedFiles.length > 0) {
                logger.info(`🌟 Generated ${processedFiles.length} fantastic manual(s)!`);
                if (options.recursive) {
                    logger.info('📚 Processed main readme and supplemental files');
                }
            } else {
                logger.error('No files were successfully processed');
                process.exit(1);
            }
        } catch (err) {
            logger.error('Error:', err.stack || err.message || err);
            console.error(err);
            process.exit(1);
        }
    });

program.parse();
