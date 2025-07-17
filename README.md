# Folder Snap

Snap your folders into portable text files and restore them anywhere! Perfect for backing up, sharing, or archiving project structures while respecting `.gitignore` rules.

## ✨ Features

- 📸 **Snap Folders**: Convert entire folder structures into portable text files
- 🔄 **Restore Anywhere**: Recreate folders from snap files with perfect fidelity
- 🚫 **Smart Ignoring**: Automatically ignores `node_modules`, `venv`, and respects `.gitignore`
- 📊 **Detailed Stats**: Get comprehensive information about folder contents
- 🎯 **Selective Processing**: Choose to include/exclude hidden files
- 💾 **Perfect Restoration**: Maintains exact folder hierarchy and file contents
- 🖥️ **CLI & Library**: Use from command line or integrate into your projects

## 🚀 Installation

```bash
npm install folder-snap
```

Or install globally for CLI usage:

```bash
npm install -g folder-snap
```

## 📖 Usage

### CLI Usage

```bash
# Snap a folder to a .snap file
folder-snap pack ./my-project

# Snap with custom output name
folder-snap pack ./my-project ./backup.snap

# Restore from snap file
folder-snap unpack ./my-project.snap ./restored-project

# Get folder statistics
folder-snap stats ./my-project
```

### Library Usage

```javascript
const FolderSnap = require("folder-snap");

const snap = new FolderSnap({
  encoding: "utf8",
  gitignoreFile: ".gitignore",
  includeHidden: false,
});

// Snap folder to text file
const result = snap.folderToText("./my-project", "./my-project.snap");
console.log(result);

// Restore from snap file
const restored = snap.textToFolder("./my-project.snap", "./restored-project");
console.log(restored);

// Get folder statistics
const stats = snap.getFolderStats("./my-project");
console.log(stats);
```

## 🔧 API Reference

### Constructor Options

```javascript
const snap = new FolderSnap({
  encoding: "utf8", // File encoding (default: 'utf8')
  gitignoreFile: ".gitignore", // Gitignore file name (default: '.gitignore')
  includeHidden: false, // Include hidden files/folders (default: false)
});
```

### Methods

#### `folderToText(folderPath, outputPath)`

Snaps a folder structure to a text file.

**Parameters:**

- `folderPath` (string): Path to the source folder
- `outputPath` (string): Path for the output snap file

**Returns:** Object with success status, output path, and statistics

#### `textToFolder(snapFilePath, outputFolder)`

Restores a folder structure from a snap file.

**Parameters:**

- `snapFilePath` (string): Path to the snap file
- `outputFolder` (string): Path for the restored folder

**Returns:** Object with success status, output folder, and statistics

#### `getFolderStats(folderPath)`

Gets statistics about a folder.

**Parameters:**

- `folderPath` (string): Path to the folder

**Returns:** Object with file count, directory count, and total size

## 🚫 Default Ignored Patterns

The library automatically ignores these patterns:

- `node_modules/`
- `venv/`
- `.git/`
- `*.log`
- `.DS_Store`
- `Thumbs.db`
- Custom patterns from `.gitignore`

## 📄 Snap File Format

The generated snap file contains:

```
# Folder Snap Export
# Generated on: 2024-01-01T12:00:00.000Z
# Source: my-project
# Files: 25, Directories: 8

<FOLDER_SNAP_START>
{
  "metadata": {
    "timestamp": "2024-01-01T12:00:00.000Z",
    "sourceFolder": "my-project",
    "totalFiles": 25,
    "totalDirectories": 8
  },
  "structure": [
    {
      "type": "directory",
      "path": "src",
      "name": "src"
    },
    {
      "type": "file",
      "path": "src/index.js",
      "name": "index.js",
      "content": "console.log('Hello World!');",
      "size": 26
    }
  ]
}
<FOLDER_SNAP_END>
```

## 💡 Examples

### Basic Usage

```javascript
const FolderSnap = require("folder-snap");

const snap = new FolderSnap();

// Snap React project
snap.folderToText("./my-react-app", "./backup.snap");

// Later, restore from snap
snap.textToFolder("./backup.snap", "./restored-react-app");
```

### With Custom Options

```javascript
const snap = new FolderSnap({
  includeHidden: true, // Include hidden files
  gitignoreFile: ".myignore", // Custom ignore file
});

const stats = snap.getFolderStats("./my-project");
console.log(`Project has ${stats.files} files (${stats.totalSizeFormatted})`);
```

### Error Handling

```javascript
const result = snap.folderToText("./nonexistent", "./output.snap");

if (!result.success) {
  console.error("Error:", result.error);
} else {
  console.log("Success!", result.stats);
}
```

### CLI Examples

```bash
# Snap current directory
folder-snap pack ./

# Snap with custom name
folder-snap pack ./my-project ./project-backup.snap

# Restore to specific location
folder-snap unpack ./project-backup.snap ./restored

# Check folder stats before snapping
folder-snap stats ./my-project
```

## 🎯 Use Cases

- **📦 Project Backup**: Create lightweight backups of your projects
- **🤝 Code Sharing**: Share entire project structures in a single file
- **📚 Documentation**: Archive project snapshots for documentation
- **🚀 Migration**: Move projects between different environments
- **📝 Version Control**: Store project states outside of git
- **🔄 Quick Deploy**: Package projects for quick deployment
- **💾 Space Saving**: Human-readable alternative to zip files

## 🧪 Testing

Run the included test:

```bash
npm test
```

Or run the example:

```bash
node test.js
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## 📈 Changelog

### v1.0.0

- 🎉 Initial release with folder-snap branding
- 📸 Snap folders to portable text files
- 🔄 Restore folders from snap files
- 🚫 Smart gitignore support
- 🖥️ CLI interface with intuitive commands
- 📊 Comprehensive folder statistics
- 🎯 Selective file processing options
