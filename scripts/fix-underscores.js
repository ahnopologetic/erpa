#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Build directories to check
const buildDirs = [
  'build/chrome-mv3-dev',
  'build/chrome-mv3-prod'
];

function findAndRenameUnderscoreFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Directory ${dir} does not exist, skipping...`);
    return;
  }

  const files = fs.readdirSync(dir);
  const renames = [];

  // Find files starting with underscore
  for (const file of files) {
    if (file.startsWith('_')) {
      const oldPath = path.join(dir, file);
      const newFileName = file.replace(/^_/, 'plasmo-');
      const newPath = path.join(dir, newFileName);
      
      try {
        fs.renameSync(oldPath, newPath);
        renames.push({ old: file, new: newFileName });
        console.log(`✓ Renamed: ${file} → ${newFileName}`);
      } catch (err) {
        console.error(`✗ Failed to rename ${file}:`, err.message);
      }
    }
  }

  // Update references in manifest.json
  if (renames.length > 0) {
    const manifestPath = path.join(dir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        let manifestContent = fs.readFileSync(manifestPath, 'utf8');
        let updated = false;

        for (const { old, new: newName } of renames) {
          const regex = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          if (manifestContent.includes(old)) {
            manifestContent = manifestContent.replace(regex, newName);
            updated = true;
          }
        }

        if (updated) {
          fs.writeFileSync(manifestPath, manifestContent, 'utf8');
          console.log(`✓ Updated manifest.json with new file names`);
        }
      } catch (err) {
        console.error(`✗ Failed to update manifest.json:`, err.message);
      }
    }

    // Update references in HTML files
    const htmlFiles = files.filter(f => f.endsWith('.html'));
    for (const htmlFile of htmlFiles) {
      const htmlPath = path.join(dir, htmlFile);
      try {
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        let updated = false;

        for (const { old, new: newName } of renames) {
          const regex = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          if (htmlContent.includes(old)) {
            htmlContent = htmlContent.replace(regex, newName);
            updated = true;
          }
        }

        if (updated) {
          fs.writeFileSync(htmlPath, htmlContent, 'utf8');
          console.log(`✓ Updated ${htmlFile} with new file names`);
        }
      } catch (err) {
        console.error(`✗ Failed to update ${htmlFile}:`, err.message);
      }
    }

    // Update references in JS files (including subdirectories)
    function updateJSFiles(directory) {
      const items = fs.readdirSync(directory);
      
      for (const item of items) {
        const fullPath = path.join(directory, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Recurse into subdirectories
          updateJSFiles(fullPath);
        } else if (item.endsWith('.js') && !item.startsWith('plasmo-empty')) {
          // Update JS files (skip the renamed file itself)
          try {
            let jsContent = fs.readFileSync(fullPath, 'utf8');
            let updated = false;

            for (const { old, new: newName } of renames) {
              const regex = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
              if (jsContent.includes(old)) {
                jsContent = jsContent.replace(regex, newName);
                updated = true;
              }
            }

            if (updated) {
              fs.writeFileSync(fullPath, jsContent, 'utf8');
              console.log(`✓ Updated ${path.relative(dir, fullPath)} with new file names`);
            }
          } catch (err) {
            console.error(`✗ Failed to update ${path.relative(dir, fullPath)}:`, err.message);
          }
        }
      }
    }

    if (renames.length > 0) {
      updateJSFiles(dir);
    }
  }

  return renames.length;
}

// Main execution
console.log('🔧 Fixing underscore-prefixed files for Chrome extension compatibility...\n');

let totalRenamed = 0;
for (const dir of buildDirs) {
  const count = findAndRenameUnderscoreFiles(dir);
  totalRenamed += count;
}

if (totalRenamed > 0) {
  console.log(`\n✅ Fixed ${totalRenamed} file(s) with underscore prefixes`);
} else {
  console.log('\n✓ No files with underscore prefixes found');
}

