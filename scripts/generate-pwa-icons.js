#!/usr/bin/env node
/**
 * Generate PWA PNG icons from SVG templates
 * 
 * Usage:
 *   node scripts/generate-pwa-icons.js
 * 
 * Prerequisites:
 *   npm install sharp --save-dev
 * 
 * This script converts SVG icons to PNG format for better PWA compatibility.
 * The manifest.json currently uses SVG icons which work in modern browsers,
 * but PNG icons provide better compatibility with older browsers and platforms.
 */

const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
const sizes = [192, 512];

async function generateIcons() {
  console.log('PWA Icon Generator');
  console.log('==================\n');
  
  // Check if sharp is available
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.log('❌ sharp is not installed.\n');
    console.log('To generate PNG icons, install sharp:');
    console.log('  npm install sharp --save-dev\n');
    console.log('Then re-run this script:');
    console.log('  node scripts/generate-pwa-icons.js\n');
    console.log('Note: The current SVG icons work in modern browsers.');
    console.log('PNG icons are only needed for legacy browser support.');
    process.exit(0);
  }

  console.log('✓ sharp is available\n');
  console.log('Generating PNG icons from SVG sources...\n');

  // Ensure icons directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  let generated = 0;

  // Generate regular icons
  for (const size of sizes) {
    const svgPath = path.join(iconsDir, `icon-${size}.svg`);
    const pngPath = path.join(iconsDir, `icon-${size}.png`);
    
    if (fs.existsSync(svgPath)) {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(pngPath);
      console.log(`  ✓ Created icon-${size}.png`);
      generated++;
    } else {
      console.log(`  ⚠ Skipped icon-${size}.png (SVG source not found)`);
    }
  }

  // Generate maskable icons
  for (const size of sizes) {
    const svgPath = path.join(iconsDir, `icon-maskable-${size}.svg`);
    const pngPath = path.join(iconsDir, `icon-maskable-${size}.png`);
    
    if (fs.existsSync(svgPath)) {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(pngPath);
      console.log(`  ✓ Created icon-maskable-${size}.png`);
      generated++;
    } else {
      console.log(`  ⚠ Skipped icon-maskable-${size}.png (SVG source not found)`);
    }
  }

  console.log(`\n✓ Generated ${generated} PNG icons\n`);
  
  if (generated > 0) {
    console.log('To use PNG icons, update manifest.json to include:');
    console.log('  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" }');
    console.log('  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }');
    console.log('  { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" }');
    console.log('  { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }');
  }
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
