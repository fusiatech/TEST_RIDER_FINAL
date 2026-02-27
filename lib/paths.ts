import os from 'os'
import path from 'path'
import fs from 'fs'

/**
 * Get a cross-platform temp directory for swarm-ui.
 * Creates the directory if it doesn't exist.
 * 
 * @param subdir - Optional subdirectory within the swarm-ui temp folder
 * @returns Absolute path to the temp directory
 */
export function getTempDir(subdir?: string): string {
  const base = path.join(os.tmpdir(), 'swarm-ui')
  const dir = subdir ? path.join(base, subdir) : base
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Get a cross-platform path for a temp file.
 * Ensures the parent directory exists.
 * 
 * @param filename - The filename (without directory path)
 * @returns Absolute path to the temp file
 */
export function getTempFile(filename: string): string {
  return path.join(getTempDir(), filename)
}
