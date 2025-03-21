import { create, globSource } from "kubo-rpc-client";
import { performance } from "perf_hooks";
import chalk from "chalk";
import ProgressBar from "progress";
import all from "it-all";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { generateFile, generateRandomFilePath } from "./utils.js";
import { execSync } from "child_process";

const IPFS_API_URL = "http://localhost:15001/api/v0";
const MFS_ROOT_DIR = "/mfs-test";
const TOTAL_FILES = 5000; // Adjust as needed
const MAX_DEPTH = 2; // Use a shallow depth for better performance

// Specify approach: "disk" = disk-based with JS API, "memory" = in-memory, "cli" = command line tool
const approach = "memory";

// Main function
async function setupMfsDirectory() {
  try {
    const ipfs = create({ url: IPFS_API_URL });
    console.log(chalk.blue("Setting up MFS test directory..."));

    await cleanupExistingMfsDirectory(ipfs);

    const startTime = performance.now();

    if (approach === "disk") {
      await runDiskBasedApproach(ipfs);
    } else if (approach === "cli") {
      await runCommandLineApproach(ipfs);
    } else {
      await runInMemoryApproach(ipfs);
    }

    // Report final stats
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;
    reportFinalStats(ipfs, duration);
  } catch (error) {
    console.error(chalk.red("Error setting up MFS directory:"), error);
  }
}

// Run the command line approach
async function runCommandLineApproach(ipfs) {
  const tempDir = createTempDirectory();

  try {
    const fileCreationStart = performance.now();
    await createFilesOnDisk(tempDir);
    const fileCreationEnd = performance.now();
    const fileCreationTime = (fileCreationEnd - fileCreationStart) / 1000;

    // Use ipfs command line tool to add files
    console.log(
      chalk.yellow("Adding files to IPFS using command line tool...")
    );
    const addStart = performance.now();

    // Fix the API address format for the command line tool
    const apiAddress = "/ip4/127.0.0.1/tcp/15001";

    // Use dynamic import instead of require
    const { spawn } = await import("child_process");

    // Create a custom progress bar
    const cliProgressBar = new ProgressBar(
      "IPFS CLI: [:bar] :fileCount files processed - :elapsed seconds",
      {
        complete: "=",
        incomplete: " ",
        width: 30,
        total: TOTAL_FILES,
        renderThrottle: 500, // Update twice a second
      }
    );

    let fileCount = 0;

    // Important: Don't return the promise - await it instead
    await new Promise((resolve, reject) => {
      // Use specific flags to reduce output but still see progress
      const cmd = spawn(
        "ipfs",
        [
          `--api=${apiAddress}`,
          "add",
          "-r",
          "-w",
          "--progress=false", // Disable default progress
          "--quiet", // Only output hashes
          "--pin=false",
          tempDir,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      let lastCid = "";
      let outputBuffer = "";

      // Process the output to extract CIDs
      cmd.stdout.on("data", (data) => {
        outputBuffer += data.toString();

        // Process complete lines
        const lines = outputBuffer.split("\n");
        outputBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          // Most lines should be CIDs in quiet mode
          if (/^[a-zA-Z0-9]{46,59}$/.test(line.trim())) {
            lastCid = line.trim();

            // Update file count and progress bar
            fileCount++;

            // Only update progress bar occasionally to avoid excessive rendering
            if (fileCount % 100 === 0 || fileCount === 1) {
              cliProgressBar.update(Math.min(fileCount / TOTAL_FILES, 1), {
                fileCount,
              });
            }
          }
        }
      });

      // For debugging: print stderr to help diagnose issues
      cmd.stderr.on("data", (data) => {
        const text = data.toString().trim();
        if (text) {
          console.error(chalk.red(text));
        }
      });

      // Get the final result when the command completes
      cmd.on("close", async (code) => {
        // Complete the progress bar
        cliProgressBar.update(1, { fileCount: TOTAL_FILES });
        console.log("");

        if (code !== 0) {
          reject(new Error(`IPFS CLI command failed with exit code ${code}`));
          return;
        }

        if (!lastCid) {
          reject(new Error("Failed to extract root CID from command output"));
          return;
        }

        const addEnd = performance.now();
        const addTime = (addEnd - addStart) / 1000;

        console.log(
          chalk.green(`Added files to IPFS in ${addTime.toFixed(2)} seconds`)
        );
        console.log(chalk.yellow(`Root directory CID: ${lastCid}`));

        try {
          await copyToMfs(ipfs, lastCid);
          console.log(
            chalk.green(
              `Created ${TOTAL_FILES} files on disk in ${fileCreationTime.toFixed(
                2
              )} seconds`
            )
          );
          console.log(
            chalk.green(`Added via CLI in ${addTime.toFixed(2)} seconds`)
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  } finally {
    // Clean up temporary directory after the process completes
    cleanupTempDirectory(tempDir);
  }
}

// Report CLI-based approach statistics
function reportCliBasedStats(fileCreationTime, addTime) {
  console.log(chalk.green(`\nCommand line approach summary:`));
  console.log(
    chalk.green(`- File creation: ${fileCreationTime.toFixed(2)} seconds`)
  );
  console.log(chalk.green(`- IPFS CLI add: ${addTime.toFixed(2)} seconds`));
}

// Clean up any existing MFS directory
async function cleanupExistingMfsDirectory(ipfs) {
  try {
    console.log(
      chalk.yellow(
        `Removing existing MFS directory ${MFS_ROOT_DIR} if it exists...`
      )
    );
    await ipfs.files.rm(MFS_ROOT_DIR, { recursive: true });
  } catch (error) {
    // Directory might not exist yet, which is fine
  }
}

// Report final statistics
async function reportFinalStats(ipfs, duration) {
  let approachName;
  switch (approach) {
    case "disk":
      approachName = "Disk-based";
      break;
    case "cli":
      approachName = "Command line";
      break;
    default:
      approachName = "In-memory";
      break;
  }

  console.log(
    chalk.green(
      `\nSetup complete! ${approachName} approach finished in ${duration.toFixed(
        2
      )} seconds`
    )
  );
  console.log(
    chalk.green(
      `Average time per file: ${(duration / TOTAL_FILES).toFixed(4)} seconds`
    )
  );

  // Get stats about the directory
  const stats = await ipfs.files.stat(MFS_ROOT_DIR);
  console.log(chalk.blue(`Directory CID: ${stats.cid}`));
  console.log(chalk.blue(`Directory size: ${stats.size} bytes`));
}

// Run the disk-based approach
async function runDiskBasedApproach(ipfs) {
  const tempDir = createTempDirectory();

  try {
    const fileCreationStart = performance.now();
    await createFilesOnDisk(tempDir);
    const fileCreationEnd = performance.now();
    const fileCreationTime = (fileCreationEnd - fileCreationStart) / 1000;

    const { files, addTime, processedBytes, maxRate } = await addFilesToIpfs(
      ipfs,
      tempDir
    );

    const rootDir = files[files.length - 1];
    await copyToMfs(ipfs, rootDir.cid);

    // Report disk-specific stats
    reportDiskBasedStats(fileCreationTime, addTime, processedBytes, maxRate);
  } finally {
    cleanupTempDirectory(tempDir);
  }
}

// Create a temporary directory
function createTempDirectory() {
  const tempDirName = `ipfs-mfs-test-${crypto.randomBytes(4).toString("hex")}`;
  const tempDir = path.join(os.tmpdir(), tempDirName);

  console.log(chalk.yellow(`Creating temporary directory at ${tempDir}...`));
  fs.mkdirSync(tempDir, { recursive: true });

  return tempDir;
}

// Clean up the temporary directory
function cleanupTempDirectory(tempDir) {
  console.log(chalk.yellow(`Cleaning up temporary directory ${tempDir}...`));
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error(chalk.red("Error cleaning up:"), error);
  }
}

// Generate and create files on disk
async function createFilesOnDisk(tempDir) {
  console.log(chalk.yellow(`Creating ${TOTAL_FILES} files on disk...`));
  const fileProgressBar = new ProgressBar(
    "[:bar] :current/:total files (:percent) - ETA: :etas",
    {
      complete: "=",
      incomplete: " ",
      width: 30,
      total: TOTAL_FILES,
    }
  );

  // Organize files by directory to minimize redundant mkdir calls
  const { dirMap, filePaths } = generateFilePaths(tempDir);

  // Create directories first
  createDirectories(dirMap);

  // Create files
  await createFiles(filePaths, fileProgressBar);
}

// Generate file paths and organize by directory
function generateFilePaths(tempDir) {
  const dirMap = new Map();
  const filePaths = [];

  for (let i = 0; i < TOTAL_FILES; i++) {
    const depth = Math.floor(Math.random() * MAX_DEPTH) + 1;
    const relativePath = generateRandomFilePath("", depth).substring(1);
    const fullPath = path.join(tempDir, relativePath);
    const dirName = path.dirname(fullPath);

    if (!dirMap.has(dirName)) {
      dirMap.set(dirName, []);
    }
    dirMap.get(dirName).push(fullPath);
    filePaths.push(fullPath);
  }

  return { dirMap, filePaths };
}

// Create directories
function createDirectories(dirMap) {
  console.log(chalk.yellow(`Creating ${dirMap.size} directories...`));
  for (const dirName of dirMap.keys()) {
    fs.mkdirSync(dirName, { recursive: true });
  }
}

// Create files in parallel batches
async function createFiles(filePaths, progressBar) {
  console.log(chalk.yellow(`Creating ${TOTAL_FILES} files...`));
  const chunkSize = 1000;

  for (let i = 0; i < filePaths.length; i += chunkSize) {
    const chunk = filePaths.slice(i, i + chunkSize);

    // Process files in parallel batches
    const promises = chunk.map(async (fullPath) => {
      const fileContent = generateFile(1024);
      fs.writeFileSync(fullPath, fileContent);
      progressBar.tick();
    });

    await Promise.all(promises);
  }
}

// Add files to IPFS using globSource
async function addFilesToIpfs(ipfs, tempDir) {
  console.log(chalk.yellow("Adding files to IPFS using globSource..."));
  const addStart = performance.now();

  // Create a progress bar for the addAll operation
  const addProgressBar = new ProgressBar(
    "[:bar] :current/:total bytes (:percent) | :etas | :rateb/s",
    {
      complete: "=",
      incomplete: " ",
      width: 30,
      total: TOTAL_FILES * 1024, // Estimate based on 1KB files
      renderThrottle: 100,
    }
  );

  let processedBytes = 0;
  let maxRate = 0;

  const files = await all(
    ipfs.addAll(globSource(tempDir, "**/*"), {
      wrapWithDirectory: true,
      pin: false,
      progress: (bytes) => {
        // Update progress tracking
        processedBytes += bytes;

        // Calculate rate
        const rate = processedBytes / ((performance.now() - addStart) / 1000);
        if (rate > maxRate) maxRate = rate;

        // Update progress bar
        addProgressBar.tick(bytes, {
          rateb: `${(rate / 1024).toFixed(1)} KB`,
        });
      },
    })
  );

  const addEnd = performance.now();
  const addTime = (addEnd - addStart) / 1000;

  console.log(
    chalk.green(`Added files to IPFS in ${addTime.toFixed(2)} seconds`)
  );

  return { files, addTime, processedBytes, maxRate };
}

// Report disk-based approach statistics
function reportDiskBasedStats(
  fileCreationTime,
  addTime,
  processedBytes,
  maxRate
) {
  console.log(
    chalk.green(
      `Created ${TOTAL_FILES} files on disk in ${fileCreationTime.toFixed(
        2
      )} seconds`
    )
  );
  console.log(
    chalk.green(
      `Average speed: ${(processedBytes / addTime / 1024).toFixed(2)} KB/s`
    )
  );
  console.log(
    chalk.green(`Max throughput: ${(maxRate / 1024).toFixed(2)} KB/s`)
  );
}

// Copy files to MFS
async function copyToMfs(ipfs, cid) {
  console.log(
    chalk.yellow(`Copying to MFS: /ipfs/${cid} -> ${MFS_ROOT_DIR}/files`)
  );
  const cpStart = performance.now();

  await ipfs.files.mkdir(MFS_ROOT_DIR, { parents: true });
  await ipfs.files.cp(`/ipfs/${cid}`, `${MFS_ROOT_DIR}/files`);

  const cpEnd = performance.now();
  const cpTime = (cpEnd - cpStart) / 1000;
  console.log(chalk.green(`Copied to MFS in ${cpTime.toFixed(2)} seconds`));
}

// Run the in-memory approach
async function runInMemoryApproach(ipfs) {
  console.log(
    chalk.yellow(
      `Creating ${TOTAL_FILES} files and adding to IPFS (in-memory)...`
    )
  );

  // Create a progress bar
  const bar = new ProgressBar(
    "[:bar] :current/:total files (:percent) - ETA: :etas",
    {
      complete: "=",
      incomplete: " ",
      width: 30,
      total: TOTAL_FILES,
    }
  );

  // Add generated files to IPFS with pre-generated content
  const files = await addGeneratedFilesToIpfs(ipfs, bar);

  // Copy to MFS
  const rootDir = files[files.length - 1];
  await copyToMfs(ipfs, rootDir.cid);
}

// Add generated files to IPFS with pre-generated content
async function addGeneratedFilesToIpfs(ipfs, progressBar) {
  // Pre-generate all file objects upfront
  console.log(chalk.yellow("Pre-generating all file objects in memory..."));

  const fileObjects = [];
  for (let i = 0; i < TOTAL_FILES; i++) {
    const depth = Math.floor(Math.random() * MAX_DEPTH) + 1;
    const filePath = generateRandomFilePath("", depth).substring(1);
    const fileContent = generateFile(1024); // 1KB files

    fileObjects.push({
      path: filePath,
      content: fileContent,
    });

    // Update progress bar for generation phase
    progressBar.tick();
  }

  console.log(
    chalk.yellow(`${TOTAL_FILES} files generated, now adding to IPFS...`)
  );

  // Create a new progress bar for the IjPFS add phase
  const addProgressBar = new ProgressBar(
    "Adding to IPFS: [:bar] :current/:total files (:percent) - ETA: :etas",
    {
      complete: "=",
      incomplete: " ",
      width: 30,
      total: TOTAL_FILES,
    }
  );

  // Define a custom async iterable that doesn't use a generator
  const fileIterable = {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < fileObjects.length) {
            const value = fileObjects[index++];
            addProgressBar.tick();
            return { done: false, value };
          }
          return { done: true };
        },
      };
    },
  };

  // Use addAll with our pre-generated objects
  return await all(
    ipfs.addAll(fileIterable, {
      wrapWithDirectory: true,
      pin: false,
    })
  );
}

setupMfsDirectory();
