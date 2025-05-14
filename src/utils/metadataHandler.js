import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";

export async function loadMetadata(metadataPath) {
  const metadataRaw = await fs.readFile(metadataPath, "utf8");
  const metadata = yaml.load(metadataRaw) || {};

  if (metadata.course_id) {
    metadata.course_id = metadata.course_id.toString().padStart(4, "0");
  }

  return metadata;
}

export async function updateMetadataDate(
  metadataPath,
  metadata,
  updatedDate,
  verbose,
  logger
) {
  if (metadata.course_id) {
    metadata.course_id = metadata.course_id.toString().padStart(4, "0");
  }

  const newYaml = yaml.dump(metadata);
  await fs.writeFile(metadataPath, newYaml, "utf8");

  if (verbose) {
    logger.log(`📆 Updated metadata: ${updatedDate}`);
  }
}
