import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import logger from './logger.js';
import {
    isLegacySchema,
    hasRedundantMetadataWrapper,
    unwrapRedundantMetadata,
    buildManifestFromLegacy,
    writeMigratedManifest,
} from './migrator.js';

// ---------------------------------------------------------------------------
// Field accessors — support both new camelCase schema and legacy snake_case.
// Receives the full manifest object { metadata: {...} } or a legacy flat object.
// ---------------------------------------------------------------------------

function _field(obj, camel, snake) {
    // New nested schema: { metadata: { courseId, ... } }
    if (obj?.metadata?.[camel] !== undefined) return obj.metadata[camel];
    // New flat schema: { courseId, ... }
    if (obj?.[camel] !== undefined) return obj[camel];
    // Legacy nested: { metadata: { course_id, ... } }
    if (obj?.metadata?.[snake] !== undefined) return obj.metadata[snake];
    // Legacy flat: { course_id, ... }
    return obj?.[snake];
}

export function getCourseTitle(metadata) {
    const v = _field(metadata, 'courseTitle', 'course_title');
    if (v === undefined)
        throw new Error("No 'courseTitle' or 'course_title' found in the metadata");
    return v;
}

export function getCourseId(metadata) {
    const v = _field(metadata, 'courseId', 'course_id');
    if (v === undefined) throw new Error("No 'courseId' or 'course_id' found in the metadata");
    return v;
}

export function getProductVersion(metadata) {
    // New schema: splunk.platform.version or version
    const splunkVersion =
        metadata?.metadata?.splunk?.platform?.version ?? metadata?.splunk?.platform?.version;
    if (splunkVersion !== undefined) return splunkVersion;
    const v = _field(metadata, 'version', 'version');
    if (v === undefined) throw new Error("No 'version' found in the metadata");
    return v;
}

export function getCourseFormat(metadata) {
    // New schema: format is an array of { mode, duration } objects
    // Legacy schema: format or modality is a plain string
    const v = _field(metadata, 'format', 'format') ?? _field(metadata, 'modality', 'modality');
    if (v === undefined) throw new Error("No 'format' or 'modality' found in the metadata");
    return v;
}

export function getCourseDuration(metadata) {
    // New schema: duration lives inside format[0].duration
    const fmt = _field(metadata, 'format', 'format');
    if (Array.isArray(fmt) && fmt[0]?.duration !== undefined) return fmt[0].duration;
    // Legacy schema: top-level duration string
    const v = _field(metadata, 'duration', 'duration');
    if (v === undefined) throw new Error("No 'duration' found in the metadata");
    return v;
}

export function getCourseAudience(metadata) {
    // New schema: roles.customer array
    const rolesCustomer = metadata?.metadata?.roles?.customer ?? metadata?.roles?.customer;
    if (rolesCustomer !== undefined) return rolesCustomer;
    // Legacy schema: audience array
    const v = _field(metadata, 'audience', 'audience');
    if (v === undefined) throw new Error("No 'audience' or 'roles' found in the metadata");
    return v;
}

export function slugify(text) {
    logger.debug(`Slugifying text: "${text}"`);
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// File discovery & parsing
// ---------------------------------------------------------------------------

const METADATA_CANDIDATES = ['metadata.json', 'metadata.yaml', 'metadata.yml'];
const MANIFEST_CANDIDATES = ['manifest.json', 'manifest.yaml', 'manifest.yml'];

/**
 * Parse a file as JSON or YAML depending on its extension.
 */
async function parseFile(filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    return filePath.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw) || {};
}

/**
 * Load the manifest config (manifest.json/yaml/yml) from sourceDir.
 * Returns the parsed object, or null if no manifest file is found.
 * Does not fall back to metadata files — use getMetadataPath/loadMetadata for that.
 */
export async function loadManifestConfig(sourceDir) {
    for (const candidate of MANIFEST_CANDIDATES) {
        const filePath = path.join(sourceDir, candidate);
        try {
            await fs.access(filePath);
            return await parseFile(filePath);
        } catch {
            continue;
        }
    }
    return null;
}

/**
 * Find and return the path of the first existing metadata file.
 * Checks metadata.* first, then manifest.*.
 */
export async function getMetadataPath(sourceDir) {
    for (const candidate of [...METADATA_CANDIDATES, ...MANIFEST_CANDIDATES]) {
        const filePath = path.join(sourceDir, candidate);
        try {
            await fs.access(filePath);
            return filePath;
        } catch {
            continue;
        }
    }

    logger.error(
        'Metadata file not found. Checked: ' +
            [...METADATA_CANDIDATES, ...MANIFEST_CANDIDATES].join(', '),
    );
    process.exit(1);
}

/**
 * Load, parse, and migrate (if needed) a metadata file.
 *
 * - Detects legacy flat schema (snake_case keys at root)
 * - Migrates in-memory to new flat schema ({ courseId, ... })
 * - Writes a *.new.<ext> draft for the user to review (non-destructive)
 * - Returns normalized manifest object
 */
export async function loadMetadata(metadataPath) {
    logger.info(`🚚 Loading metadata ${metadataPath}`);
    const parsed = await parseFile(metadataPath);

    // Prefer flat metadata at the root for metadata.{yaml,json}
    let normalized = parsed;
    if (hasRedundantMetadataWrapper(parsed)) {
        logger.warn('⚠️  Redundant top-level metadata wrapper detected.');
        logger.warn('    Consider flattening fields to the file root.');
        normalized = unwrapRedundantMetadata(parsed);
    }

    if (isLegacySchema(normalized)) {
        logger.warn('⚠️  Legacy metadata format detected (snake_case fields at root level).');
        logger.warn('    Consider migrating to the new schema.');
        const migrated = buildManifestFromLegacy(normalized);
        await writeMigratedManifest(metadataPath, migrated).catch(() => {
            logger.warn('    Could not write migration draft (check file permissions).');
        });
        if (migrated.courseId) {
            migrated.courseId = String(migrated.courseId).padStart(4, '0');
        }
        return migrated;
    }

    // Normalize IDs for new schema
    if (normalized.metadata?.courseId) {
        normalized.metadata.courseId = String(normalized.metadata.courseId).padStart(4, '0');
    }
    if (normalized.courseId) {
        normalized.courseId = String(normalized.courseId).padStart(4, '0');
    }
    // Normalize ID for any partially-migrated flat file
    if (normalized.course_id) {
        normalized.course_id = normalized.course_id.toString().padStart(4, '0');
    }

    return normalized;
}

// ---------------------------------------------------------------------------
// Date update — re-reads from disk to preserve the original file format
// ---------------------------------------------------------------------------

export async function updateMetadataDate(metadataPath, _metadata, updatedDate) {
    const isJson = metadataPath.endsWith('.json');

    if (isJson) {
        const doc = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
        if (doc.metadata) {
            doc.metadata.updated = updatedDate;
        } else {
            doc.updated = updatedDate;
        }
        await fs.writeFile(metadataPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    } else {
        const doc = yaml.load(await fs.readFile(metadataPath, 'utf8')) || {};
        if (doc.metadata) {
            doc.metadata = { ...doc.metadata, updated: updatedDate };
        } else {
            doc.updated = updatedDate;
        }
        await fs.writeFile(metadataPath, yaml.dump(doc, { lineWidth: 120, noRefs: true }), 'utf8');
    }

    logger.info(`🏷️  Updating metadata.updated: ${updatedDate}`);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable date string (e.g. "June 29, 2026") from an ISO date string.
 * Consistent with md2lab's getFormattedDate.
 */
export function getFormattedDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
}

/**
 * Validates an input date string and returns it as ISO (YYYY-MM-DD).
 * Throws on invalid input.
 */
export function valiDate(input) {
    const date = new Date(input);
    if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format. Use YYYY-MM-DD. You entered: ${input}`);
    }
    return date.toISOString().split('T')[0];
}
