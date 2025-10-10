import path from "path";
import fs from "fs/promises";

/**
 * Find all readme files to process based on recursive option
 * @param {string} sourceDir - Source directory
 * @param {boolean} recursive - Whether to include supplemental folder
 * @returns {Array} Array of file objects with path and relative path info
 */
export async function findReadmeFiles(sourceDir, recursive = false) {
  const files = [];

  // Find main readme file in source directory
  const mainFiles = await fs.readdir(sourceDir);
  const mainReadmeFile = mainFiles.find((file) => /-readme\.md$/i.test(file));

  if (mainReadmeFile) {
    files.push({
      fullPath: path.join(sourceDir, mainReadmeFile),
      fileName: mainReadmeFile,
      directory: sourceDir,
      isSupplemental: false,
    });
  }

  // If recursive, also check supplemental subfolder
  if (recursive) {
    const supplementalDir = path.join(sourceDir, "supplemental");

    try {
      const supplementalStats = await fs.stat(supplementalDir);
      if (supplementalStats.isDirectory()) {
        const supplementalFiles = await fs.readdir(supplementalDir);
        const supplementalReadmeFiles = supplementalFiles.filter((file) =>
          /-readme\.md$/i.test(file)
        );

        for (const file of supplementalReadmeFiles) {
          files.push({
            fullPath: path.join(supplementalDir, file),
            fileName: file,
            directory: supplementalDir,
            isSupplemental: true,
          });
        }
      }
    } catch (err) {
      // Supplemental directory doesn't exist or isn't accessible, that's okay
    }
  }

  return files;
}

export function buildOutputFilename(metadata, sourceDir) {
  try {
    let { course_id, course_title } = metadata;

    if (typeof course_id === "number") {
      course_id = course_id.toString().padStart(4, "0");
    } else if (typeof course_id !== "string") {
      throw new Error("Invalid course_id type");
    }

    if (!course_id || !course_title) throw new Error("Missing fields");

    const safeTitle = course_title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    return `${course_id}-${safeTitle}-README.pdf`;
  } catch {
    const fallback = path
      .basename(sourceDir)
      .toLowerCase()
      .replace(/\s+/g, "-");

    return `${fallback}-README.pdf`;
  }
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
