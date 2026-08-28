import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import logger from './logger.js';

/**
 * Normalizes duration to 'X hour'/'X hours' format (singular only for exactly 1).
 * Extracts the numeric value and converts any time unit variation accordingly.
 */
function normalizeDuration(duration) {
    if (!duration || typeof duration !== 'string') return duration;

    const match = duration.match(/^\s*([\d.]+)\s*/);
    if (!match || !match[1]) return duration;

    const number = match[1];
    const unit = parseFloat(number) === 1 ? 'hour' : 'hours';
    return `${number} ${unit}`;
}

/**
 * Detects whether the raw loaded metadata object uses the legacy flat schema.
 * Legacy schema has snake_case keys like course_id / course_title at the root level.
 * A file is only legacy if it lacks BOTH the `metadata` wrapper AND any new-schema
 * camelCase equivalents — otherwise a stray snake_case field on an already-migrated
 * file would falsely trigger legacy migration and drop camelCase-only data.
 */
export function isLegacySchema(raw) {
    return (
        raw !== null &&
        typeof raw === 'object' &&
        !raw.metadata &&
        !raw.courseId &&
        !raw.courseTitle &&
        (raw.course_id !== undefined || raw.course_title !== undefined)
    );
}

/**
 * Detects a redundant top-level `metadata` wrapper in a metadata file.
 */
export function hasRedundantMetadataWrapper(raw) {
    return (
        raw !== null &&
        typeof raw === 'object' &&
        raw.metadata !== null &&
        typeof raw.metadata === 'object' &&
        !Array.isArray(raw.metadata)
    );
}

/**
 * Promotes the contents of a redundant top-level `metadata` wrapper to the root.
 */
export function unwrapRedundantMetadata(raw) {
    const { metadata, ...rest } = raw;
    return { ...metadata, ...rest };
}

/**
 * Maps a legacy flat metadata object to the new flat manifest schema.
 *
 * Legacy fields:
 *   course_id, course_title, slug, version, format|modality (string), duration,
 *   audience (array), course_developer
 *
 * New schema:
 *   courseId, courseTitle, slug, courseDeveloper,
 *   format (array of {mode, duration}), roles ({customer, internal}),
 *   splunk.platform.version
 *
 * Fields shared verbatim between schemas (ga, updated, projectId, lmsId,
 * description, prerequisites, etc.) pass through unchanged.
 */
export function buildManifestFromLegacy(legacy) {
    const {
        course_id,
        course_title,
        course_developer,
        format: legacyFormat,
        modality,
        duration,
        audience,
        version,
        slug: legacySlug,
        ...passthrough
    } = legacy;

    const courseId = course_id !== undefined ? String(course_id).padStart(4, '0') : undefined;

    // Derive slug from courseId when not explicitly present in legacy data
    const slug = legacySlug || courseId;

    // Map course_developer (string or array) -> courseDeveloper (array)
    let courseDeveloper;
    if (course_developer !== undefined) {
        courseDeveloper = Array.isArray(course_developer)
            ? course_developer
            : [course_developer].filter(Boolean);
    }

    // Map legacy mode (format string, or modality) + duration string → new format array of objects
    const mode = legacyFormat !== undefined ? legacyFormat : modality;
    let format;
    if (mode !== undefined || duration !== undefined) {
        format = [
            {
                ...(mode !== undefined && { mode }),
                ...(duration !== undefined && { duration: normalizeDuration(duration) }),
            },
        ];
    }

    // Map legacy audience array → new roles object
    let roles;
    if (audience !== undefined) {
        const customer = Array.isArray(audience) ? audience : [audience].filter(Boolean);
        roles = { customer, internal: [] };
    }

    // Map legacy top-level version -> splunk.platform.version
    let splunk;
    if (version !== undefined) {
        splunk = { platform: { version: String(version) } };
    }

    const manifest = {
        ...passthrough,
        ...(courseId !== undefined && { courseId }),
        ...(course_title !== undefined && { courseTitle: course_title }),
        ...(slug !== undefined && { slug }),
        ...(courseDeveloper !== undefined && { courseDeveloper }),
        ...(format !== undefined && { format }),
        ...(roles !== undefined && { roles }),
        ...(splunk !== undefined && { splunk }),
    };

    return manifest;
}

/**
 * Serializes a manifest object as YAML.
 */
export function serializeManifestAsYaml(manifest) {
    return yaml.dump(manifest, { lineWidth: 120, noRefs: true });
}

/**
 * Serializes a manifest object as JSON.
 */
export function serializeManifestAsJson(manifest) {
    return JSON.stringify(manifest, null, 2) + '\n';
}

/**
 * Writes the migrated manifest to a new file alongside the original for review.
 * Does NOT overwrite the original; writes to metadata.new.<ext>.
 *
 * @param {string} metadataPath - Original metadata file path
 * @param {Object} manifest - Migrated manifest object
 * @param {'json'|'yaml'} [format='yaml'] - Output format for the migrated file
 */
export async function writeMigratedManifest(metadataPath, manifest, format = 'yaml') {
    const srcExt = path.extname(metadataPath);
    const base = path.basename(metadataPath, srcExt);
    const dir = path.dirname(metadataPath);

    const outExt = format === 'json' ? '.json' : srcExt || '.yaml';
    const newPath = path.join(dir, `${base}.new${outExt}`);

    const content =
        format === 'json' ? serializeManifestAsJson(manifest) : serializeManifestAsYaml(manifest);

    await fs.writeFile(newPath, content, 'utf8');

    logger.warn(`  Legacy metadata detected. Review migrated schema at: ${path.basename(newPath)}`);
    logger.warn(
        `  Replace your ${path.basename(metadataPath)} with ${path.basename(newPath)} when ready.`,
    );

    return newPath;
}
