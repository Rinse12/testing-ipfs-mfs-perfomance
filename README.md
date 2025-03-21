# IPFS MFS Performance Test

This repository tests the performance of different methods for modifying MFS (Mutable File System) folders in IPFS with a large number of files.

## Prerequisites

- Node.js (v14 or later)
- An IPFS Kubo node running at `localhost:15001/api/v0`

## Installation

```bash
git clone https://github.com/yourusername/ipfs-mfs-performance-test.git
cd ipfs-mfs-performance-test
npm install
```

## Usage

1. First, set up the initial MFS structure with 20,000 files:

```bash
npm run setup
```

This will create a nested directory structure in your IPFS MFS with 20,000 files randomly distributed across directories up to 100 levels deep.

2. Run the performance tests:

```bash
npm start
```

This will test two methods of adding 100 new files to the existing structure:

- Method 1: Using `ipfs.addAll()` with `globSource()` and then copying to MFS with `ipfs.files.cp()`
- Method 2: Using `ipfs.files.write()` for each individual file

## Test Methodology

1. The setup creates a directory with 20,000 files in a nested structure up to 100 levels deep
2. Each test adds 100 new files at random depths
3. Each method is tested multiple times to get an average performance measurement
4. Results show the time taken for each method and the performance difference

## How It Works

- **Method 1 (addAll + cp)**:

  - Creates files in a temporary directory
  - Adds the entire directory to IPFS with `addAll()`
  - Removes the existing MFS directory
  - Copies the new directory to MFS with `files.cp()`

- **Method 2 (Individual writes)**:
  - Creates each file individually in MFS with `files.write()`
  - Ensures parent directories exist before writing

The tests measure how DAG recalculation time scales with the size of the directory structure.
