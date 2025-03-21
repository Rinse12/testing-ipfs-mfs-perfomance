import crypto from "crypto";
import path from "path";
import os from "os";

// Generate random content for a file of specified size in bytes
export function generateFile(sizeInBytes) {
  return crypto.randomBytes(sizeInBytes);
}

// Generate a random file path with specified depth
export function generateRandomFilePath(rootDir, depth) {
  let filePath = rootDir;

  // Generate random directories for the path
  for (let i = 0; i < depth; i++) {
    const dirName = `dir_${crypto.randomBytes(4).toString("hex")}`;
    filePath = path.join(filePath, dirName);
  }

  // Generate a random filename
  const fileName = `file_${crypto.randomBytes(8).toString("hex")}.dat`;
  return path.join(filePath, fileName).replace(/\\/g, "/"); // Ensure forward slashes for IPFS
}

// Get a temporary directory path for file operations
export function getTempDirectory() {
  return path.join(
    os.tmpdir(),
    `ipfs-mfs-test-${crypto.randomBytes(4).toString("hex")}`
  );
}
