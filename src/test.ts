import FolderSnap from './index';
import * as fs from 'fs';
import * as path from 'path';

// Test the library
async function testFolderSnap(): Promise<void> {
  console.log('📸 Testing Folder Snap\n');

  // Create test folder structure
  const testFolder = './test-folder';
  const snapFile = './test-folder.snap';
  const restoredFolder = './restored-folder';

  // Clean up previous test files
  if (fs.existsSync(testFolder)) {
    fs.rmSync(testFolder, { recursive: true, force: true });
  }
  if (fs.existsSync(snapFile)) {
    fs.unlinkSync(snapFile);
  }
  if (fs.existsSync(restoredFolder)) {
    fs.rmSync(restoredFolder, { recursive: true, force: true });
  }

  // Create test folder structure
  console.log('📁 Creating test folder structure...');
  fs.mkdirSync(testFolder, { recursive: true });
  fs.mkdirSync(path.join(testFolder, 'src'), { recursive: true });
  fs.mkdirSync(path.join(testFolder, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(testFolder, 'node_modules'), { recursive: true }); // Should be ignored

  // Create test files
  fs.writeFileSync(path.join(testFolder, 'README.md'), '# Test Project\n\nThis is a test project for folder-snap.');
  fs.writeFileSync(path.join(testFolder, 'package.json'), JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    description: 'Test project for folder-snap'
  }, null, 2));
  fs.writeFileSync(path.join(testFolder, 'src', 'index.js'), 'console.log("Hello from folder-snap!");');
  fs.writeFileSync(path.join(testFolder, 'docs', 'guide.md'), '# User Guide\n\nThis is the user guide for folder-snap.');
  fs.writeFileSync(path.join(testFolder, 'node_modules', 'ignored.js'), 'This should be ignored by folder-snap');

  // Create gitignore
  fs.writeFileSync(path.join(testFolder, '.gitignore'), `
node_modules/
*.log
.env
dist/
    `.trim());

  // Initialize folder snap
  const snap = new FolderSnap();

  // Test 1: Get folder stats
  console.log('📊 Getting folder statistics...');
  const stats = snap.getFolderStats(testFolder);
  console.log('Stats:', stats);

  // Test 2: Snap folder to file
  console.log('\n📸 Snapping folder...');
  const snapResult = snap.folderToText(testFolder, snapFile);
  console.log('Snap result:', snapResult);

  // Test 3: Restore from snap file
  console.log('\n🔄 Restoring from snap file...');
  const restoreResult = snap.textToFolder(snapFile, restoredFolder);
  console.log('Restore result:', restoreResult);

  // Test 4: Verify restoration
  console.log('\n✅ Verifying restoration...');
  const originalStats = snap.getFolderStats(testFolder);
  const restoredStats = snap.getFolderStats(restoredFolder);

  console.log('Original stats:', originalStats);
  console.log('Restored stats:', restoredStats);

  const isIdentical = originalStats.files === restoredStats.files &&
    originalStats.directories === restoredStats.directories;

  console.log(isIdentical ? '✅ Test PASSED: Folder restored correctly!' : '❌ Test FAILED: Folder not restored correctly!');

  // Clean up
  console.log('\n🧹 Cleaning up test files...');
  fs.rmSync(testFolder, { recursive: true, force: true });
  fs.rmSync(restoredFolder, { recursive: true, force: true });
  fs.unlinkSync(snapFile);

  console.log('✅ Folder Snap test completed!');
}

// Run test if executed directly
if (require.main === module) {
  testFolderSnap().catch(console.error);
}

export default testFolderSnap; 