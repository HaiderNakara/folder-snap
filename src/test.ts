import FolderSnap from './index';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Test the library
async function testFolderSnap(): Promise<void> {
  console.log('📸 Testing Folder Snap with Open Source Repository\n');

  // Test folders and files
  const testFolder = './test-folder';
  const snapFile = './test-folder.snap';
  const restoredFolder = './restored-folder';
  const clonedRepo = './cloned-repo';

  // Clean up previous test files
  const foldersToClean = [testFolder, restoredFolder, clonedRepo];
  const filesToClean = [snapFile];

  console.log('🧹 Cleaning up previous test files...');
  foldersToClean.forEach(folder => {
    if (fs.existsSync(folder)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
  filesToClean.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });

  // Test 1: Clone a small open source repository
  console.log('📥 Cloning open source repository...');
  try {
    // Clone a small, popular open source project (axios - a popular HTTP client)
    execSync(`git clone --depth 1 https://github.com/axios/axios.git ${clonedRepo}`, {
      stdio: 'inherit',
      timeout: 30000 // 30 second timeout
    });
    console.log('✅ Repository cloned successfully');
  } catch (error) {
    console.log('⚠️  Could not clone axios, trying a smaller repo...');
    try {
      // Fallback to a smaller repository
      execSync(`git clone --depth 1 https://github.com/typicode/json-server.git ${clonedRepo}`, {
        stdio: 'inherit',
        timeout: 30000
      });
      console.log('✅ Repository cloned successfully');
    } catch (fallbackError) {
      console.log('⚠️  Could not clone repository, using mock data instead...');
      // Create test folder structure as fallback
      fs.mkdirSync(clonedRepo, { recursive: true });
      fs.mkdirSync(path.join(clonedRepo, 'src'), { recursive: true });
      fs.mkdirSync(path.join(clonedRepo, 'docs'), { recursive: true });
      fs.mkdirSync(path.join(clonedRepo, 'node_modules'), { recursive: true }); // Should be ignored

      // Create test files
      fs.writeFileSync(path.join(clonedRepo, 'README.md'), '# Test Project\n\nThis is a test project for folder-snap.');
      fs.writeFileSync(path.join(clonedRepo, 'package.json'), JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        description: 'Test project for folder-snap'
      }, null, 2));
      fs.writeFileSync(path.join(clonedRepo, 'src', 'index.js'), 'console.log("Hello from folder-snap!");');
      fs.writeFileSync(path.join(clonedRepo, 'docs', 'guide.md'), '# User Guide\n\nThis is the user guide for folder-snap.');
      fs.writeFileSync(path.join(clonedRepo, 'node_modules', 'ignored.js'), 'This should be ignored by folder-snap');

      // Create gitignore
      fs.writeFileSync(path.join(clonedRepo, '.gitignore'), `
node_modules/
*.log
.env
dist/
      `.trim());
    }
  }

  // Initialize folder snap
  const snap = new FolderSnap();

  // Test 2: Get folder stats of cloned repository
  console.log('\n📊 Getting folder statistics of cloned repository...');
  const stats = snap.getFolderStats(clonedRepo);
  console.log('Repository Stats:', stats);

  // Test 3: Snap cloned repository to file
  console.log('\n📸 Snapping cloned repository...');
  const snapResult = snap.folderToText(clonedRepo, snapFile);
  console.log('Snap result:', snapResult);

  if (!snapResult.success) {
    console.error('❌ Failed to snap repository');
    return;
  }

  // Test 4: Restore from snap file
  console.log('\n🔄 Restoring from snap file...');
  const restoreResult = snap.textToFolder(snapFile, restoredFolder);
  console.log('Restore result:', restoreResult);

  if (!restoreResult.success) {
    console.error('❌ Failed to restore repository');
    return;
  }

  // Test 5: Verify restoration
  console.log('\n✅ Verifying restoration...');
  const originalStats = snap.getFolderStats(clonedRepo);
  const restoredStats = snap.getFolderStats(restoredFolder);

  console.log('Original repository stats:', originalStats);
  console.log('Restored repository stats:', restoredStats);

  const isIdentical = originalStats.files === restoredStats.files &&
    originalStats.directories === restoredStats.directories;

  console.log(isIdentical ? '✅ Test PASSED: Repository restored correctly!' : '❌ Test FAILED: Repository not restored correctly!');

  // Test 6: Validate snap file
  console.log('\n🔍 Validating snap file...');
  const validation = snap.validateSnapFile(snapFile);
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

  // Test 7: Compare file contents (sample check)
  console.log('\n🔍 Comparing sample file contents...');
  try {
    const sampleFiles = ['README.md', 'package.json'];
    let contentMatch = true;

    for (const sampleFile of sampleFiles) {
      const originalPath = path.join(clonedRepo, sampleFile);
      const restoredPath = path.join(restoredFolder, sampleFile);

      if (fs.existsSync(originalPath) && fs.existsSync(restoredPath)) {
        const originalContent = fs.readFileSync(originalPath, 'utf8');
        const restoredContent = fs.readFileSync(restoredPath, 'utf8');

        if (originalContent !== restoredContent) {
          console.log(`⚠️  Content mismatch in ${sampleFile}`);
          contentMatch = false;
        } else {
          console.log(`✅ ${sampleFile} content matches`);
        }
      }
    }

    console.log(contentMatch ? '✅ All sample file contents match!' : '⚠️  Some file contents do not match');
  } catch (error) {
    console.log('⚠️  Could not compare file contents:', error instanceof Error ? error.message : 'Unknown error');
  }

  // Clean up
  console.log('\n🧹 Cleaning up test files...');
  foldersToClean.forEach(folder => {
    if (fs.existsSync(folder)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
  filesToClean.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });

  console.log('✅ Folder Snap test with open source repository completed!');
}

// Run test if executed directly
if (require.main === module) {
  testFolderSnap().catch(console.error);
}

export default testFolderSnap; 