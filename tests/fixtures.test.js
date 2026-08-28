import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import {
    loadManifestConfig,
    getMetadataPath,
    loadMetadata,
    getCourseId,
    getCourseTitle,
    getCourseFormat,
    getCourseDuration,
    getCourseAudience,
} from '../src/utils/metadataHandler.js';
import { resolveRtfmFiles, buildOutputFilename } from '../src/utils/fileHandler.js';
import { renderMarkdown } from '../src/generators/mdGenerator.js';
import { injectDateAfterH1 } from '../src/generators/htmlGenerator.js';
import { embedLocalImages } from '../src/utils/imageHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('custom-input fixture', () => {
    const fixtureDir = path.join(__dirname, 'fixtures/custom-input');
    let manifest;
    let metadata;

    beforeAll(async () => {
        manifest = await loadManifestConfig(fixtureDir);
        const metadataPath = await getMetadataPath(fixtureDir);
        metadata = await loadMetadata(metadataPath);
    });

    it('loads manifest.yaml with an input.rtfm file list', () => {
        expect(manifest.input?.rtfm).toEqual(['./etc/this-README.md', './etc/THAT-readme.md']);
    });

    it('parses courseId correctly', () => {
        expect(getCourseId(metadata)).toBe('course-template');
    });

    it('parses courseTitle correctly', () => {
        expect(getCourseTitle(metadata)).toBe('Using a course template');
    });

    it('parses format as an array', () => {
        const format = getCourseFormat(metadata);
        expect(Array.isArray(format)).toBe(true);
        expect(format[0].mode).toBe('Instructor-led training');
    });

    it('parses duration from format[0].duration', () => {
        expect(getCourseDuration(metadata)).toBe('9 hours');
    });

    it('parses audience from roles.customer', () => {
        const audience = getCourseAudience(metadata);
        expect(audience).toContain('System Administrator');
        expect(audience).toContain('Power User');
    });

    it('builds the default output filename from courseId/courseTitle', () => {
        expect(buildOutputFilename(metadata, fixtureDir)).toBe(
            'course-template-using-a-course-template-README.pdf',
        );
    });

    describe('resolveRtfmFiles', () => {
        let files;

        beforeAll(async () => {
            files = await resolveRtfmFiles(fixtureDir, manifest.input.rtfm);
        });

        it('resolves both files listed under input.rtfm', () => {
            expect(files).toHaveLength(2);
            expect(files[0].fileName).toBe('this-README.md');
            expect(files[1].fileName).toBe('THAT-readme.md');
        });

        it('resolves paths relative to the fixture directory', () => {
            expect(files[0].fullPath).toBe(path.join(fixtureDir, 'etc/this-README.md'));
            expect(files[1].fullPath).toBe(path.join(fixtureDir, 'etc/THAT-readme.md'));
        });

        it('marks only the first file as the primary (non-supplemental) file', () => {
            expect(files[0].isSupplemental).toBe(false);
            expect(files[1].isSupplemental).toBe(true);
        });

        it('renders each resolved file to HTML with a stamped date', async () => {
            for (const file of files) {
                const markdown = await fs.readFile(file.fullPath, 'utf8');
                const html = await renderMarkdown(markdown, file.directory, embedLocalImages);
                const stamped = injectDateAfterH1(html, 'August 14, 2026');
                expect(stamped).toContain('Updated: August 14, 2026');
            }
        });

        it('renders the this-README.md heading', async () => {
            const markdown = await fs.readFile(files[0].fullPath, 'utf8');
            const html = await renderMarkdown(markdown, files[0].directory, embedLocalImages);
            expect(html).toContain('This README');
        });

        it('renders the THAT-readme.md heading', async () => {
            const markdown = await fs.readFile(files[1].fullPath, 'utf8');
            const html = await renderMarkdown(markdown, files[1].directory, embedLocalImages);
            expect(html).toContain('That README');
        });
    });
});
