export interface FolderSnapOptions {
  encoding?: BufferEncoding;
  gitignoreFile?: string;
  includeHidden?: boolean;
}

export interface FileItem {
  type: 'file';
  path: string;
  name: string;
  content?: string; // Legacy format
  encoding?: 'utf8' | 'base64'; // Legacy format
  contentFile?: string; // v3 format - reference to separate content file
  contentIndex?: number; // Internal index for content file generation
  size: number;
}

export interface DirectoryItem {
  type: 'directory';
  path: string;
  name: string;
}

export type StructureItem = FileItem | DirectoryItem;

export interface SnapMetadata {
  timestamp: string;
  sourceFolder: string;
  totalFiles: number;
  totalDirectories: number;
  version?: string;
}

export interface SnapData {
  metadata: SnapMetadata;
  structure: StructureItem[];
}

export interface FolderStats {
  files: number;
  directories: number;
  totalSize: number;
  totalSizeFormatted: string;
}

export interface SnapResult {
  success: boolean;
  outputPath?: string;
  outputFolder?: string;
  stats?: SnapMetadata;
  error?: string;
}