import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import logger from "./logger.js";

// ---------------------------------------------------------------------------
// Field accessors — support both new camelCase and legacy snake_case keys,
// whether the metadata is a flat root object or nested under a `metadata` key.
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
  const v = _field(metadata, "courseTitle", "course_title");
  if (v === undefined) throw new Error("No 'courseTitle' or 'course_title' found in the metadata");
  return v;
}

export function getCourseId(metadata) {
  const v = _field(metadata, "courseId", "course_id");
  if (v === undefined) throw new Error("No 'courseId' or 'course_id' found in the metadata");
  return v;
}

export function getProductVersion(metadata) {
  const v = _field(metadata, "version", "version");
  if (v === undefined) throw new Error("No 'version' found in the metadata");
  return v;
}

export function getCourseFormat(metadata) {
  const v = _field(metadata, "format", "format");
  if (v === undefined) throw new Error("No 'format' found in the metadata");
  return v;
}

export function getCourseDuration(metadata) {
  const v = _field(metadata, "duration", "duration");
  if (v === undefined) throw new Error("No 'duration' found in the metadata");
  return v;
}

export function getCourseAudience(metadata) {
  const v = _field(metadata, "audience", "audience");
  if (v === undefined) throw new Error("No 'audience' found in the metadata");
  return v;
}

export function slugify(text) {
  logger.debug(`Slugifying text: "${text}"`);
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ---------------------------------------------------------------------------
// Schema detection & migration
// ---------------------------------------------------------------------------

/**
 * Returns true when the parsed object is a legacy flat metadata file
 * (snake_case keys at root, no top-level `metadata:` wrapper).
 */
function isLegacySchema(raw) {
  return (
    raw !== null &&
    typeof raw === "object" &&
    !raw.metadata &&
    (raw.course_id !== undefined || raw.course_title !== undefined)
  );
}

/**
 * Maps a legacy flat object to the new nested schema and writes a
 * `metadata.new.yaml` draft for the user to review.  Does NOT overwrite
 * the original file.
 */
async function writeMigrationDraft(originalPath, legacy) {
  const newSchema = {
    metadata: {
      ...(legacy.course_id !== undefined && { courseId: String(legacy.course_id) }),
      ...(legacy.course_title !== undefined && { courseTitle: legacy.course_title }),
      ...(legacy.slug !== undefined && { slug: legacy.slug }),
      ...(legacy.version !== undefined && { version: String(legacy.version) }),
      ...(legacy.format !== undefined && { format: legacy.format }),
      ...(legacy.duration !== undefined && { duration: legacy.duration }),
      ...(legacy.audience !== undefined && { audience: legacy.audience }),
      ...(legacy.ga !== undefined && { ga: legacy.ga }),
      ...(legacy.updated !== undefined && { updated: legacy.updated }),
    },
  };

  const dir = path.dirname(originalPath);
  const draftPath = path.join(dir, "metadata.new.yaml");
  await fs.writeFile(draftPath, yaml.dump(newSchema, { lineWidth: 120, noRefs: true }), "utf8");

  logger.warn(`  Legacy metadata detected. Review migrated schema at: metadata.new.yaml`);
  logger.warn(`  Replace your ${path.basename(originalPath)} with metadata.new.yaml when ready.`);
}

// ---------------------------------------------------------------------------
// File discovery & parsing
// ---------------------------------------------------------------------------

const METADATA_CANDIDATES = ["metadata.json", "metadata.yaml", "metadata.yml"];
const MANIFEST_CANDIDATES = ["manifest.json", "manifest.yaml", "manifest.yml"];

/**
 * Parse a file as JSON or YAML depending on its extension.
 */
async function parseFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return filePath.endsWith(".json") ? JSON.parse(raw) : yaml.load(raw) || {};
}

/**
 * Find and return the path of the first existing candidate file.
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
    "Metadata file not found. Checked: " +
      [...METADATA_CANDIDATES, ...MANIFEST_CANDIDATES].join(", ")
  );
  process.exit(1);
}

/**
 * Load, parse, and optionally migrate a metadata/manifest file.
 *
 * Returns the full parsed object — either:
 *   - Legacy flat:  { course_id, course_title, ... }
 *   - New schema:   { metadata: { courseId, courseTitle, ... }, input?, output? }
 *
 * Consumers should use the accessor functions (getCourseTitle, etc.) or
 * buildOutputFilename(), which handle both shapes.
 */
export async function loadMetadata(metadataPath) {
  const parsed = await parseFile(metadataPath);

  if (isLegacySchema(parsed)) {
    logger.warn("⚠️  Legacy metadata format detected (snake_case fields at root level).");
    logger.warn("    Consider migrating to the new schema.");
    await writeMigrationDraft(metadataPath, parsed).catch(() => {
      logger.warn("    Could not write migration draft (check file permissions).");
    });
  }

  if (parsed.course_id) {
    parsed.course_id = parsed.course_id.toString().padStart(4, "0");
  }
  if (parsed.metadata?.courseId) {
    parsed.metadata.courseId = String(parsed.metadata.courseId).padStart(4, "0");
  }

  logger.info(`🚚 Loading metadata ${metadataPath}`);
  return parsed;
}

// ---------------------------------------------------------------------------
// Date update — supports flat legacy, new nested schema, JSON and YAML
// ---------------------------------------------------------------------------

export async function updateMetadataDate(metadataPath, metadata, updatedDate) {
  const isJson = metadataPath.endsWith(".json");

  if (isJson) {
    const doc = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    if (doc.metadata) {
      doc.metadata.updated = updatedDate;
    } else {
      doc.updated = updatedDate;
    }
    await fs.writeFile(metadataPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
  } else {
    // YAML — write back the full object (preserves structure whether flat or nested)
    const doc = { ...metadata };
    if (doc.metadata) {
      doc.metadata = { ...doc.metadata, updated: updatedDate };
    } else {
      doc.updated = updatedDate;
    }
    if (doc.course_id) {
      doc.course_id = doc.course_id.toString().padStart(4, "0");
    }
    await fs.writeFile(metadataPath, yaml.dump(doc), "utf8");
  }

  logger.info(`🏷️  Updating metadata.updated: ${updatedDate}`);
}

export function getFormattedDate(input) {
  const date = input ? new Date(input) : new Date();

  if (isNaN(date.getTime())) {
    logger.error(
      `Invalid date format. Use YYYY-MM-DD.`,
      `You entered: ${input}`
    );
    process.exit(1);
  }

  return date.toISOString().split("T")[0];
}

