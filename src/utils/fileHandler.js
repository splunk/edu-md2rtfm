import path from "path";
import fs from "fs/promises";

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
