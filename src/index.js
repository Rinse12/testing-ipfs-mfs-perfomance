import { create } from "kubo-rpc-client";
import { performance } from "perf_hooks";
import chalk from "chalk";
import { runAddAllTest, runWriteIndividualTest } from "./methods.js";
import { generateRandomFilePath } from "./utils.js";

const IPFS_API_URL = "http://localhost:15001/api/v0";
const MFS_ROOT_DIR = "/mfs-test";
const NUM_FILES_TO_ADD = 50;
const ITERATIONS = 3; // Run each test multiple times to get an average

async function main() {
  try {
    const ipfs = create({ url: IPFS_API_URL });

    console.log(chalk.blue("Checking if the test directory exists..."));
    try {
      await ipfs.files.stat(MFS_ROOT_DIR);
      console.log(
        chalk.green(
          `Test directory ${MFS_ROOT_DIR} exists. Ready to run tests.`
        )
      );
    } catch (error) {
      console.error(
        chalk.red(
          `Test directory ${MFS_ROOT_DIR} doesn't exist. Please run 'npm run setup' first.`
        )
      );
      process.exit(1);
    }

    // Generate random file paths for adding to the MFS
    const filePaths = [];
    for (let i = 0; i < NUM_FILES_TO_ADD; i++) {
      const depth = Math.floor(Math.random() * 100) + 1; // Random depth between 1-100
      filePaths.push(generateRandomFilePath(MFS_ROOT_DIR, depth));
    }

    // Run Method 1: addAll + cp test
    console.log(chalk.cyan("\n=== Testing Method 1: addAll + cp ==="));
    const method1Times = [];
    for (let i = 0; i < ITERATIONS; i++) {
      console.log(chalk.yellow(`Iteration ${i + 1}/${ITERATIONS}`));
      const start = performance.now();
      await runAddAllTest(ipfs, MFS_ROOT_DIR, filePaths);
      const end = performance.now();
      const duration = (end - start) / 1000; // Convert to seconds
      method1Times.push(duration);
      console.log(chalk.green(`Completed in ${duration.toFixed(2)} seconds`));
    }

    // Run Method 2: Individual write test
    console.log(chalk.cyan("\n=== Testing Method 2: Individual writes ==="));
    const method2Times = [];
    for (let i = 0; i < ITERATIONS; i++) {
      console.log(chalk.yellow(`Iteration ${i + 1}/${ITERATIONS}`));
      const start = performance.now();
      await runWriteIndividualTest(ipfs, filePaths);
      const end = performance.now();
      const duration = (end - start) / 1000; // Convert to seconds
      method2Times.push(duration);
      console.log(chalk.green(`Completed in ${duration.toFixed(2)} seconds`));
    }

    // Calculate and display results
    const method1Avg =
      method1Times.reduce((a, b) => a + b, 0) / method1Times.length;
    const method2Avg =
      method2Times.reduce((a, b) => a + b, 0) / method2Times.length;

    console.log(chalk.magenta("\n=== Results ==="));
    console.log(
      chalk.white(
        `Method 1 (addAll + cp): ${method1Avg.toFixed(2)} seconds average`
      )
    );
    console.log(
      chalk.white(
        `Method 2 (Individual writes): ${method2Avg.toFixed(2)} seconds average`
      )
    );
    console.log(
      chalk.white(
        `Difference: ${Math.abs(method1Avg - method2Avg).toFixed(2)} seconds`
      )
    );
    console.log(
      chalk.white(
        `Method ${method1Avg < method2Avg ? "1" : "2"} is faster by ${(
          (Math.abs(method1Avg - method2Avg) /
            Math.max(method1Avg, method2Avg)) *
          100
        ).toFixed(2)}%`
      )
    );
  } catch (error) {
    console.error(chalk.red("Error running tests:"), error);
  }
}

main();
