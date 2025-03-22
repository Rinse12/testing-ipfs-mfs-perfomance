import { globSource } from "kubo-rpc-client";
import all from "it-all";
import { performance } from "perf_hooks";
import { generateFile, getTempDirectory } from "./utils.js";
import fs from "fs";
import path from "path";
import chalk from "chalk";

// Method 1: Using addAll + individual cp operations with a final flush
export async function runAddAllTest(ipfs, mfsRootDir, filePaths) {
  const tempDir = getTempDirectory();

  try {
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    console.log(
      chalk.blue(`Creating ${filePaths.length} files in temp directory...`)
    );

    // Map to track original MFS paths to their corresponding paths in the temp directory
    const pathMapping = new Map();

    // Create the files in the temp directory with a flattened structure to optimize IPFS add
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];

      // Create a flattened path in the temp directory to avoid deep nesting
      const tempFilePath = path.join(tempDir, `file_${i}`);

      // Store the mapping between temp file and desired MFS path
      pathMapping.set(tempFilePath, filePath);

      // Create the file with random content
      const fileContent = generateFile(1024); // 1KB files
      fs.writeFileSync(tempFilePath, fileContent);
    }

    console.log(chalk.blue("Adding files to IPFS in a single batch..."));
    const startAdd = performance.now();

    // Add all files to IPFS efficiently
    const addedFiles = await all(
      ipfs.addAll(globSource(tempDir, "*"), {
        // Don't wrap in directory since we're adding individual files
        wrapWithDirectory: false,
        pin: false,
      })
    );

    const endAdd = performance.now();
    console.log(
      chalk.blue(
        `Added ${addedFiles.length} files to IPFS in ${(
          (endAdd - startAdd) /
          1000
        ).toFixed(2)} seconds`
      )
    );

    // Create a mapping from tempFilePath to CID
    const cidMap = new Map();
    addedFiles.forEach((file) => {
      const tempPath = path.join(tempDir, file.path);
      cidMap.set(tempPath, file.cid);
    });

    console.log(
      chalk.blue("Copying files to their MFS paths (without flushing)...")
    );
    const startCp = performance.now();

    // Handle each file (remove if exists, then copy) without flushing between operations
    const fileOps = [];

    for (const [tempPath, mfsPath] of pathMapping.entries()) {
      const cid = cidMap.get(tempPath);
      if (cid) {
        // Queue an operation that first checks if file exists, removes it if it does, then copies
        fileOps.push(async () => {
          try {
            // Check if the file exists by attempting to stat it
            await ipfs.files.stat(mfsPath);

            // If we get here, the file exists, so remove it
            await ipfs.files.rm(mfsPath);
          } catch (err) {
            // File doesn't exist, which is fine - we'll create it
          }

          // Now copy the new file to the MFS path - parents will be created automatically
          await ipfs.files.cp(`/ipfs/${cid}`, mfsPath, {
            parents: true,
            flush: false,
          });
        });
      }
    }

    // Get stats about the MFS directory (this will trigger a flush)
    const flushCid = await ipfs.files.flush(mfsRootDir);
    const stats = await ipfs.files.stat(mfsRootDir);

    const endCp = performance.now();
    console.log(
      chalk.blue(
        `Copied all files to MFS in ${((endCp - startCp) / 1000).toFixed(
          2
        )} seconds`
      )
    );

    console.log(chalk.blue(`MFS Directory CID: ${stats.cid}`));
    console.log(chalk.blue(`MFS Directory size: ${stats.size} bytes`));
  } catch (error) {
    console.error("Error in addAll test:", error);
    throw error;
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error("Error cleaning up:", e);
    }
  }
}

// Method 2: Using individual writes
export async function runWriteIndividualTest(ipfs, filePaths) {
  console.log(chalk.blue(`Writing ${filePaths.length} files individually...`));

  for (const filePath of filePaths) {
    // Create parent directories if needed

    // Generate and write file
    const fileContent = generateFile(1024); // 1KB files
    await ipfs.files.write(filePath, fileContent, {
      create: true,
      parents: true,
      truncate: true,
    });
  }

  console.log(chalk.blue("All files written individually"));
}
