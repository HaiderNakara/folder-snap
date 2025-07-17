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
        const content = fs.readFileSync(itemPath, this.options.encoding);
        structure.push({
          type: 'file',
          path: relativePath,
          name: item,
          content: content,
          size: stats.size
        });
      }
    }

    return structure;
  }

  /**
   * Convert folder to text file
   */
  public folderToText(folderPath: string, outputPath: string): SnapResult {
    try {
      this.loadGitignore(folderPath);

      const structure = this.readFolderStructure(folderPath);
      const metadata: SnapMetadata = {
        timestamp: new Date().toISOString(),
        sourceFolder: path.basename(folderPath),
        totalFiles: structure.filter(item => item.type === 'file').length,
        totalDirectories: structure.filter(item => item.type === 'directory').length
      };

      const output: SnapData = {
        metadata,
        structure
      };

      let textContent = `# Folder Snap Export\n`;
      textContent += `# Generated on: ${metadata.timestamp}\n`;
      textContent += `# Source: ${metadata.sourceFolder}\n`;
      textContent += `# Files: ${metadata.totalFiles}, Directories: ${metadata.totalDirectories}\n\n`;

      textContent += `<FOLDER_SNAP_START>\n`;
      textContent += JSON.stringify(output, null, 2);
      textContent += `\n<FOLDER_SNAP_END>\n`;

      fs.writeFileSync(outputPath, textContent, this.options.encoding);

      console.log(`✅ Folder snapped to file: ${outputPath}`);
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
      const textContent = fs.readFileSync(snapFilePath, this.options.encoding);

      // Extract JSON data between markers
      const startMarker = '<FOLDER_SNAP_START>';
      const endMarker = '<FOLDER_SNAP_END>';

      const startIndex = textContent.indexOf(startMarker);
      const endIndex = textContent.indexOf(endMarker);

      if (startIndex === -1 || endIndex === -1) {
        throw new Error('Invalid snap file format. Missing structure markers.');
      }

      const jsonContent = textContent.substring(startIndex + startMarker.length, endIndex).trim();
      const data: SnapData = JSON.parse(jsonContent);

      // Create output folder if it doesn't exist
      if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
      }

      // Create directories first
      const directories = data.structure.filter(item => item.type === 'directory');
      for (const dir of directories) {
        const dirPath = path.join(outputFolder, dir.path);
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Create files
      const files = data.structure.filter(item => item.type === 'file');
      for (const file of files) {
        const filePath = path.join(outputFolder, file.path);
        const fileDir = path.dirname(filePath);

        // Ensure directory exists
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        fs.writeFileSync(filePath, file.content, this.options.encoding);
      }

      console.log(`✅ Snap file restored to folder: ${outputFolder}`);
      console.log(`📁 Restored ${files.length} files and ${directories.length} directories`);
      console.log(`📅 Original snap date: ${data.metadata.timestamp}`);

      return {
        success: true,
        outputFolder,
        stats: data.metadata
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
   * Get folder statistics
   */
  public getFolderStats(folderPath: string): FolderStats {
    this.loadGitignore(folderPath);
    const structure = this.readFolderStructure(folderPath);

    const files = structure.filter(item => item.type === 'file');
    const directories = structure.filter(item => item.type === 'directory');
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

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
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
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
📁 Folder Snap - Snap your folders into portable text files

Usage:
  node folder-snap.js pack <folder-path> [output-file]
  node folder-snap.js unpack <snap-file> <output-folder>
  node folder-snap.js stats <folder-path>

Examples:
  node folder-snap.js pack ./my-project
  node folder-snap.js pack ./my-project ./my-project.snap
  node folder-snap.js unpack ./my-project.snap ./restored-project
  node folder-snap.js stats ./my-project
        `);
    return;
  }

  const command = args[0];

  switch (command) {
    case 'pack':
      if (args.length < 2) {
        console.error('Usage: pack <folder-path> [output-file]');
        return;
      }
      const outputFile = args[2] || `${path.basename(args[1])}.snap`;
      converter.folderToText(args[1], outputFile);
      break;

    case 'unpack':
      if (args.length !== 3) {
        console.error('Usage: unpack <snap-file> <output-folder>');
        return;
      }
      converter.textToFolder(args[1], args[2]);
      break;

    case 'stats':
      if (args.length !== 2) {
        console.error('Usage: stats <folder-path>');
        return;
      }
      const stats = converter.getFolderStats(args[1]);
      console.log(`📊 Folder Statistics:`);
      console.log(`   Files: ${stats.files}`);
      console.log(`   Directories: ${stats.directories}`);
      console.log(`   Total Size: ${stats.totalSizeFormatted}`);
      break;

    default:
      console.error('Unknown command:', command);
      console.log('Available commands: pack, unpack, stats');
      break;
  }
}

// Export for use as library
export default FolderSnap;

// Run CLI if executed directly
if (require.main === module) {
  cli();
} 