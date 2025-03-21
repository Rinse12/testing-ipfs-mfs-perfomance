import { globSource } from "kubo-rpc-client";
import all from "it-all";
import { performance } from "perf_hooks";
import { generateFile, getTempDirectory } from "./utils.js";
import fs from "fs";
import path from "path";
import chalk from "chalk";

// Method 1: Using addAll + cp
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

    // Create the files in the temp directory with the same structure
    for (const filePath of filePaths) {
      const relativePath = filePath.replace(mfsRootDir, "");
      const fullPath = path.join(tempDir, relativePath);
      const dirName = path.dirname(fullPath);

      // Create parent directories
      fs.mkdirSync(dirName, { recursive: true });

      // Create the file
      const fileContent = generateFile(1024); // 1KB files
      fs.writeFileSync(fullPath, fileContent);
    }

    console.log(chalk.blue("Adding files to IPFS..."));
    const startAdd = performance.now();
    const files = await all(
      ipfs.addAll(globSource(tempDir, "**/*"), {
        wrapWithDirectory: true,
        pin: false,
      })
    );
    const endAdd = performance.now();
    console.log(
      chalk.blue(
        `Added files in ${((endAdd - startAdd) / 1000).toFixed(2)} seconds`
      )
    );

    // Get the CID of the added directory
    const dirCid = files.find((file) => file.path === "").cid;

    console.log(
      chalk.blue(`Copying directory to MFS: /ipfs/${dirCid} -> ${mfsRootDir}`)
    );
    // Remove existing directory
    await ipfs.files.rm(mfsRootDir, { recursive: true });

    // Copy to MFS
    const startCp = performance.now();
    await ipfs.files.cp(`/ipfs/${dirCid}`, mfsRootDir);
    const endCp = performance.now();
    console.log(
      chalk.blue(
        `Copied directory in ${((endCp - startCp) / 1000).toFixed(2)} seconds`
      )
    );
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
    const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));

    try {
      await ipfs.files.stat(parentDir);
    } catch (error) {
      // Directory doesn't exist, create it
      await ipfs.files.mkdir(parentDir, { parents: true });
    }

    // Generate and write file
    const fileContent = generateFile(1024); // 1KB files
    await ipfs.files.write(filePath, fileContent, {
      create: true,
      parents: false,
    });
  }

  console.log(chalk.blue("All files written individually"));
}
