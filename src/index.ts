#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import {
  FolderSnapOptions,
  StructureItem,
  SnapData,
  SnapMetadata,
  FolderStats,
  SnapResult
} from './types';

export class FolderSnap {
  private options: Required<FolderSnapOptions>;
  private ig: ReturnType<typeof ignore>;

  constructor(options: FolderSnapOptions = {}) {
    this.options = {
      encoding: 'utf8',
      gitignoreFile: '.gitignore',
      includeHidden: false,
      ...options
    };
    this.ig = ignore();
  }

  /**
   * Load gitignore rules
   */
  private loadGitignore(folderPath: string): void {
    const gitignorePath = path.join(folderPath, this.options.gitignoreFile);

    // Add default ignores
    this.ig.add([
      'node_modules/',
      'venv/',
      '*.log',
      '.DS_Store',
      'Thumbs.db'
    ]);

    // Load custom gitignore if exists
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, this.options.encoding);
      this.ig.add(gitignoreContent);
    }
  }

  /**
   * Check if a file/folder should be ignored
   */
  private shouldIgnore(relativePath: string): boolean {
    // Ignore hidden files/folders unless specified
    if (!this.options.includeHidden && path.basename(relativePath).startsWith('.')) {
      return true;
    }

    return this.ig.ignores(relativePath);
  }

  /**
   * Recursively read folder structure
   */
  private readFolderStructure(folderPath: string, basePath: string = folderPath): StructureItem[] {
    const structure: StructureItem[] = [];
    const items = fs.readdirSync(folderPath);

    for (const item of items) {
      const itemPath = path.join(folderPath, item);
      const relativePath = path.relative(basePath, itemPath);

      if (this.shouldIgnore(relativePath)) {
        continue;
      }

      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        structure.push({
          type: 'directory',
          path: relativePath,
          name: item
        });

        // Recursively read subdirectories
        const subStructure = this.readFolderStructure(itemPath, basePath);
        structure.push(...subStructure);
      } else {
        structure.push({
          type: 'file',
          path: relativePath,
          name: item,
          size: stats.size,
          contentIndex: structure.filter(i => i.type === 'file').length
        });
      }
    }

    return structure;
  }

  /**
   * Convert folder to snap format with embedded content
   */
  public folderToText(folderPath: string, outputPath: string): SnapResult {
    try {
      if (!fs.existsSync(folderPath)) {
        throw new Error(`Source folder does not exist: ${folderPath}`);
      }

      if (!fs.statSync(folderPath).isDirectory()) {
        throw new Error(`Source path is not a directory: ${folderPath}`);
      }

      this.loadGitignore(folderPath);

      const structure = this.readFolderStructure(folderPath);
      const metadata: SnapMetadata = {
        timestamp: new Date().toISOString(),
        sourceFolder: path.basename(folderPath),
        totalFiles: structure.filter(item => item.type === 'file').length,
        totalDirectories: structure.filter(item => item.type === 'directory').length,
        version: '3.0'
      };

      // Create output directory if it doesn't exist
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Read file contents and prepare structure
      const files = structure.filter(item => item.type === 'file') as any[];
      for (const file of files) {
        const filePath = path.join(folderPath, file.path);
        try {
          const buffer = fs.readFileSync(filePath);
          // Check if file is binary by looking for null bytes
          const isBinary = buffer.includes(0);

          if (isBinary) {
            // Store binary files as base64
            file.content = buffer.toString('base64');
            file.encoding = 'base64';
          } else {
            // Store text files as UTF-8
            file.content = buffer.toString('utf8');
            file.encoding = 'utf8';
          }

          // Remove internal properties
          delete file.contentIndex;
        } catch (error) {
          console.warn(`⚠️  Warning: Could not read file ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          file.content = '';
          file.encoding = 'utf8';
          delete file.contentIndex;
        }
      }

      // Create the snap data
      const snapData: SnapData = {
        metadata,
        structure: structure.map(item => {
          if (item.type === 'file') {
            const { contentIndex, contentFile, ...fileItem } = item as any;
            return fileItem;
          }
          return item;
        })
      };

      // Create the snap file with embedded content
      const snapContent = JSON.stringify(snapData, null, 2);
      fs.writeFileSync(outputPath, snapContent, this.options.encoding);

      console.log(`✅ Folder snapped to: ${outputPath}`);
      console.log(`📁 Processed ${metadata.totalFiles} files and ${metadata.totalDirectories} directories`);

      return {
        success: true,
        outputPath,
        stats: metadata
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error snapping folder:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Convert snap file back to folder structure
   */
  public textToFolder(snapFilePath: string, outputFolder: string): SnapResult {
    try {
      if (!fs.existsSync(snapFilePath)) {
        throw new Error(`Snap file does not exist: ${snapFilePath}`);
      }

      const snapContent = fs.readFileSync(snapFilePath, this.options.encoding);
      let snapData: SnapData;

      try {
        snapData = JSON.parse(snapContent);
      } catch (error) {
        throw new Error(`Invalid snap file format: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Validate data structure
      if (!snapData.metadata || !snapData.structure) {
        throw new Error('Invalid snap file structure. Missing metadata or structure.');
      }

      // Create output folder if it doesn't exist
      if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
      }

      // Create directories first
      const directories = snapData.structure.filter(item => item.type === 'directory');
      for (const dir of directories) {
        const dirPath = path.join(outputFolder, dir.path);
        try {
          fs.mkdirSync(dirPath, { recursive: true });
        } catch (error) {
          console.warn(`⚠️  Warning: Could not create directory ${dir.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Create files
      const files = snapData.structure.filter(item => item.type === 'file');
      let successCount = 0;
      let errorCount = 0;

      for (const file of files as any[]) {
        const filePath = path.join(outputFolder, file.path);
        const fileDir = path.dirname(filePath);

        try {
          // Ensure directory exists
          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }

          // Handle embedded content
          if (file.content && file.content.length > 0) {
            const encoding = file.encoding || 'utf8';
            let buffer: Buffer;

            if (encoding === 'base64') {
              buffer = Buffer.from(file.content, 'base64');
            } else {
              buffer = Buffer.from(file.content, 'utf8');
            }

            fs.writeFileSync(filePath, buffer);
          } else {
            // Create empty file if content is missing
            fs.writeFileSync(filePath, '');
          }

          successCount++;
        } catch (error) {
          errorCount++;
          console.warn(`⚠️  Warning: Could not create file ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log(`✅ Snap file restored to folder: ${outputFolder}`);
      console.log(`📁 Restored ${successCount} files and ${directories.length} directories`);
      if (errorCount > 0) {
        console.log(`⚠️  ${errorCount} files could not be restored`);
      }
      console.log(`📅 Original snap date: ${snapData.metadata.timestamp}`);

      return {
        success: true,
        outputFolder,
        stats: snapData.metadata
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error restoring snap file:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Validate snap file without unpacking
   */
  public validateSnapFile(snapFilePath: string): { valid: boolean; error?: string; metadata?: SnapMetadata } {
    try {
      if (!fs.existsSync(snapFilePath)) {
        return { valid: false, error: 'Snap file does not exist' };
      }

      const snapContent = fs.readFileSync(snapFilePath, this.options.encoding);
      let snapData: SnapData;

      try {
        snapData = JSON.parse(snapContent);
      } catch (error) {
        return { valid: false, error: 'Invalid JSON format' };
      }

      // Validate data structure
      if (!snapData.metadata || !snapData.structure) {
        return { valid: false, error: 'Invalid snap file structure. Missing metadata or structure.' };
      }

      return { valid: true, metadata: snapData.metadata };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get folder statistics
   */
  public getFolderStats(folderPath: string): FolderStats {
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Folder does not exist: ${folderPath}`);
    }

    this.loadGitignore(folderPath);
    const structure = this.readFolderStructure(folderPath);

    const files = structure.filter(item => item.type === 'file');
    const directories = structure.filter(item => item.type === 'directory');
    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

    return {
      files: files.length,
      directories: directories.length,
      totalSize,
      totalSizeFormatted: this.formatBytes(totalSize)
    };
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// CLI usage
function cli(): void {
  const args = process.argv.slice(2);
  const converter = new FolderSnap();

  if (args.length === 0) {
    console.log(`
📁 Folder Snap v3.0 - Snap your folders into portable text files

Usage:
  node folder-snap.js pack <folder-path> [output-file]
  node folder-snap.js unpack <snap-file> <output-folder>
  node folder-snap.js stats <folder-path>
  node folder-snap.js validate <snap-file>

Examples:
  node folder-snap.js pack ./my-project
  node folder-snap.js pack ./my-project ./my-project.snap
  node folder-snap.js unpack ./my-project.snap ./restored-project
  node folder-snap.js stats ./my-project
  node folder-snap.js validate ./my-project.snap
        `);
    return;
  }

  const command = args[0];

  switch (command) {
    case 'pack':
      if (args.length < 2) {
        console.error('❌ Usage: pack <folder-path> [output-file]');
        return;
      }
      const outputFile = args[2] || `${path.basename(args[1])}.snap`;
      converter.folderToText(args[1], outputFile);
      break;

    case 'unpack':
      if (args.length !== 3) {
        console.error('❌ Usage: unpack <snap-file> <output-folder>');
        return;
      }
      converter.textToFolder(args[1], args[2]);
      break;

    case 'stats':
      if (args.length !== 2) {
        console.error('❌ Usage: stats <folder-path>');
        return;
      }
      try {
        const stats = converter.getFolderStats(args[1]);
        console.log(`📊 Folder Statistics:`);
        console.log(`   Files: ${stats.files}`);
        console.log(`   Directories: ${stats.directories}`);
        console.log(`   Total Size: ${stats.totalSizeFormatted}`);
      } catch (error) {
        console.error('❌ Error getting folder stats:', error instanceof Error ? error.message : 'Unknown error');
      }
      break;

    case 'validate':
      if (args.length !== 2) {
        console.error('❌ Usage: validate <snap-file>');
        return;
      }
      const validation = converter.validateSnapFile(args[1]);
      if (validation.valid) {
        console.log('✅ Snap file is valid');
        if (validation.metadata) {
          console.log(`📁 Source: ${validation.metadata.sourceFolder}`);
          console.log(`📅 Created: ${validation.metadata.timestamp}`);
          console.log(`📊 Files: ${validation.metadata.totalFiles}, Directories: ${validation.metadata.totalDirectories}`);
          console.log(`🔢 Version: ${validation.metadata.version || 'legacy'}`);
        }
      } else {
        console.error('❌ Snap file is invalid:', validation.error);
      }
      break;

    default:
      console.error('❌ Unknown command:', command);
      console.log('Available commands: pack, unpack, stats, validate');
      break;
  }
}

// Export for use as library
export default FolderSnap;

// Run CLI if executed directly
if (require.main === module) {
  cli();
}