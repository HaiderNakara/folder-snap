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
      '.git/',
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
   * Check if a file is likely binary
   */
  // private isBinaryFile(buffer: Buffer): boolean {
  //   // Check for null bytes in the first 8000 bytes
  //   const chunk = buffer.slice(0, Math.min(8000, buffer.length));
  //   return chunk.includes(0);
  // }

  /**
   * Generate a safe filename for content storage
   */
  private generateContentFilename(filePath: string, index: number): string {
    const safePath = filePath.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `content_${index}_${safePath}.bin`;
  }

  /**
   * Recursively read folder structure with separate content files
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
   * Convert folder to snap format with separate content files
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

      // Create snap directory
      const snapDir = outputPath.replace(/\.snap$/, '_snap');
      if (fs.existsSync(snapDir)) {
        fs.rmSync(snapDir, { recursive: true, force: true });
      }
      fs.mkdirSync(snapDir, { recursive: true });

      // Create content directory
      const contentDir = path.join(snapDir, 'content');
      fs.mkdirSync(contentDir, { recursive: true });

      // Write file contents separately
      const files = structure.filter(item => item.type === 'file') as any[];
      for (const file of files) {
        const filePath = path.join(folderPath, file.path);
        const contentFilename = this.generateContentFilename(file.path, file.contentIndex);
        const contentPath = path.join(contentDir, contentFilename);

        try {
          const buffer = fs.readFileSync(filePath);
          fs.writeFileSync(contentPath, buffer);
          file.contentFile = contentFilename;
        } catch (error) {
          console.warn(`⚠️  Warning: Could not read file ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Create empty content file
          fs.writeFileSync(contentPath, '');
          file.contentFile = contentFilename;
        }
      }

      // Create metadata file
      const metadataData: SnapData = {
        metadata,
        structure: structure.map(item => {
          if (item.type === 'file') {
            const { contentIndex, contentFile, ...fileItem } = item as any;
            return {
              ...fileItem,
              contentFile
            };
          }
          return item;
        })
      };

      const metadataPath = path.join(snapDir, 'metadata.json');
      fs.writeFileSync(metadataPath, JSON.stringify(metadataData, null, 2), this.options.encoding);

      // Create the main snap file (just a reference to the snap directory)
      const snapReference = {
        type: 'folder-snap-v3',
        snapDirectory: path.basename(snapDir),
        metadata: {
          timestamp: metadata.timestamp,
          sourceFolder: metadata.sourceFolder,
          totalFiles: metadata.totalFiles,
          totalDirectories: metadata.totalDirectories,
          version: metadata.version
        }
      };

      fs.writeFileSync(outputPath, JSON.stringify(snapReference, null, 2), this.options.encoding);

      console.log(`✅ Folder snapped to: ${outputPath}`);
      console.log(`📁 Snap directory: ${snapDir}`);
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
      let snapData: any;

      try {
        snapData = JSON.parse(snapContent);
      } catch (error) {
        throw new Error(`Invalid snap file format: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Handle different snap formats
      if (snapData.type === 'folder-snap-v3') {
        return this.unpackV3Snap(snapFilePath, outputFolder, snapData);
      } else {
        // Try to handle legacy formats
        return this.unpackLegacySnap(snapFilePath, outputFolder);
      }
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
   * Unpack v3 snap format
   */
  private unpackV3Snap(snapFilePath: string, outputFolder: string, snapData: any): SnapResult {
    try {
      const snapDir = path.join(path.dirname(snapFilePath), snapData.snapDirectory);
      if (!fs.existsSync(snapDir)) {
        throw new Error(`Snap directory not found: ${snapDir}`);
      }

      const metadataPath = path.join(snapDir, 'metadata.json');
      if (!fs.existsSync(metadataPath)) {
        throw new Error(`Metadata file not found: ${metadataPath}`);
      }

      const metadataContent = fs.readFileSync(metadataPath, this.options.encoding);
      const data: SnapData = JSON.parse(metadataContent);

      // Create output folder if it doesn't exist
      if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
      }

      // Create directories first
      const directories = data.structure.filter(item => item.type === 'directory');
      for (const dir of directories) {
        const dirPath = path.join(outputFolder, dir.path);
        try {
          fs.mkdirSync(dirPath, { recursive: true });
        } catch (error) {
          console.warn(`⚠️  Warning: Could not create directory ${dir.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Create files
      const files = data.structure.filter(item => item.type === 'file');
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

          // Read content from separate file
          if (file.contentFile) {
            const contentPath = path.join(snapDir, 'content', file.contentFile);
            if (fs.existsSync(contentPath)) {
              const buffer = fs.readFileSync(contentPath);
              fs.writeFileSync(filePath, buffer);
            } else {
              // Create empty file if content file is missing
              fs.writeFileSync(filePath, '');
            }
          } else {
            // Create empty file
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
      console.log(`📅 Original snap date: ${data.metadata.timestamp}`);

      return {
        success: true,
        outputFolder,
        stats: data.metadata
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error unpacking v3 snap:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Unpack legacy snap format (for backward compatibility)
   */
  private unpackLegacySnap(snapFilePath: string, outputFolder: string): SnapResult {
    try {
      const textContent = fs.readFileSync(snapFilePath, this.options.encoding);

      // Extract JSON data between markers
      const startMarker = '<FOLDER_SNAP_START>';
      const endMarker = '<FOLDER_SNAP_END>';

      const startIndex = textContent.indexOf(startMarker);
      const endIndex = textContent.indexOf(endMarker);

      if (startIndex === -1 || endIndex === -1) {
        throw new Error('Invalid legacy snap file format. Missing structure markers.');
      }

      const jsonContent = textContent.substring(startIndex + startMarker.length, endIndex).trim();

      if (!jsonContent) {
        throw new Error('Legacy snap file contains no JSON data.');
      }

      // Try to parse JSON with better error handling
      let data: SnapData;
      try {
        data = JSON.parse(jsonContent);
      } catch (parseError) {
        console.error('❌ Legacy JSON Parse Error Details:');
        console.error('   Error:', parseError);
        console.error('   JSON Content Length:', jsonContent.length);
        console.error('   JSON Content Preview:', jsonContent.substring(0, 200) + '...');

        throw new Error(`Failed to parse legacy JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }

      // Validate data structure
      if (!data.metadata || !data.structure) {
        throw new Error('Invalid legacy snap file structure. Missing metadata or structure.');
      }

      // Create output folder if it doesn't exist
      if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
      }

      // Create directories first
      const directories = data.structure.filter(item => item.type === 'directory');
      for (const dir of directories) {
        const dirPath = path.join(outputFolder, dir.path);
        try {
          fs.mkdirSync(dirPath, { recursive: true });
        } catch (error) {
          console.warn(`⚠️  Warning: Could not create directory ${dir.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Create files
      const files = data.structure.filter(item => item.type === 'file');
      let successCount = 0;
      let errorCount = 0;

      for (const file of files as any) {
        const filePath = path.join(outputFolder, file.path);
        const fileDir = path.dirname(filePath);

        try {
          // Ensure directory exists
          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }

          // Handle legacy content
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
            // Empty file
            fs.writeFileSync(filePath, '');
          }

          successCount++;
        } catch (error) {
          errorCount++;
          console.warn(`⚠️  Warning: Could not create file ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log(`✅ Legacy snap file restored to folder: ${outputFolder}`);
      console.log(`📁 Restored ${successCount} files and ${directories.length} directories`);
      if (errorCount > 0) {
        console.log(`⚠️  ${errorCount} files could not be restored`);
      }
      console.log(`📅 Original snap date: ${data.metadata.timestamp}`);

      return {
        success: true,
        outputFolder,
        stats: data.metadata
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error unpacking legacy snap:', errorMessage);
      return {
        success: false,
        error: errorMessage
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

  /**
   * Validate snap file without unpacking
   */
  public validateSnapFile(snapFilePath: string): { valid: boolean; error?: string; metadata?: SnapMetadata } {
    try {
      if (!fs.existsSync(snapFilePath)) {
        return { valid: false, error: 'Snap file does not exist' };
      }

      const snapContent = fs.readFileSync(snapFilePath, this.options.encoding);
      let snapData: any;

      try {
        snapData = JSON.parse(snapContent);
      } catch (error) {
        return { valid: false, error: 'Invalid JSON format' };
      }

      // Check for v3 format
      if (snapData.type === 'folder-snap-v3') {
        const snapDir = path.join(path.dirname(snapFilePath), snapData.snapDirectory);
        const metadataPath = path.join(snapDir, 'metadata.json');

        if (!fs.existsSync(snapDir) || !fs.existsSync(metadataPath)) {
          return { valid: false, error: 'Snap directory or metadata file not found' };
        }

        const metadataContent = fs.readFileSync(metadataPath, this.options.encoding);
        const data: SnapData = JSON.parse(metadataContent);

        return { valid: true, metadata: data.metadata };
      }

      // Check for legacy format
      const startMarker = '<FOLDER_SNAP_START>';
      const endMarker = '<FOLDER_SNAP_END>';

      const startIndex = snapContent.indexOf(startMarker);
      const endIndex = snapContent.indexOf(endMarker);

      if (startIndex === -1 || endIndex === -1) {
        return { valid: false, error: 'Invalid snap file format. Missing structure markers.' };
      }

      const jsonContent = snapContent.substring(startIndex + startMarker.length, endIndex).trim();
      const data: SnapData = JSON.parse(jsonContent);

      if (!data.metadata || !data.structure) {
        return { valid: false, error: 'Invalid snap file structure. Missing metadata or structure.' };
      }

      return { valid: true, metadata: data.metadata };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Convert legacy snap to v3 format
   */
  public upgradeLegacySnap(legacySnapPath: string, outputPath?: string): SnapResult {
    try {
      console.log('🔄 Upgrading legacy snap file to v3 format...');

      const textContent = fs.readFileSync(legacySnapPath, this.options.encoding);
      const startMarker = '<FOLDER_SNAP_START>';
      const endMarker = '<FOLDER_SNAP_END>';

      const startIndex = textContent.indexOf(startMarker);
      const endIndex = textContent.indexOf(endMarker);

      if (startIndex === -1 || endIndex === -1) {
        throw new Error('Invalid legacy snap file format. Missing structure markers.');
      }

      const jsonContent = textContent.substring(startIndex + startMarker.length, endIndex).trim();
      const data: SnapData = JSON.parse(jsonContent);

      // Create temporary folder to restore files
      const tempDir = path.join(path.dirname(legacySnapPath), '.temp_upgrade_' + Date.now());
      fs.mkdirSync(tempDir, { recursive: true });

      try {
        // Restore files to temp directory
        const files = data.structure.filter(item => item.type === 'file') as any[];
        for (const file of files) {
          const filePath = path.join(tempDir, file.path);
          const fileDir = path.dirname(filePath);

          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }

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
            fs.writeFileSync(filePath, '');
          }
        }

        // Create v3 snap from temp directory
        const v3OutputPath = outputPath || legacySnapPath.replace(/\.snap$/, '_v3.snap');
        const result = this.folderToText(tempDir, v3OutputPath);

        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });

        if (result.success) {
          console.log(`✅ Successfully upgraded legacy snap to v3 format: ${v3OutputPath}`);
        }

        return result;
      } catch (error) {
        // Clean up temp directory on error
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error upgrading legacy snap:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
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
  node folder-snap.js upgrade <legacy-snap-file> [output-file]
  node folder-snap.js stats <folder-path>
  node folder-snap.js validate <snap-file>

Examples:
  node folder-snap.js pack ./my-project
  node folder-snap.js pack ./my-project ./my-project.snap
  node folder-snap.js unpack ./my-project.snap ./restored-project
  node folder-snap.js upgrade ./legacy.snap ./upgraded.snap
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

    case 'upgrade':
      if (args.length < 2) {
        console.error('❌ Usage: upgrade <legacy-snap-file> [output-file]');
        return;
      }
      const upgradedFile = args[2] || args[1].replace(/\.snap$/, '_v3.snap');
      converter.upgradeLegacySnap(args[1], upgradedFile);
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
      console.log('Available commands: pack, unpack, upgrade, stats, validate');
      break;
  }
}

// Export for use as library
export default FolderSnap;

// Run CLI if executed directly
if (require.main === module) {
  cli();
}