'use strict';
// Optional BodyParts3D 4.0 anatomy pack builder for EDBODY.
// The build pipeline is adapted from Cognition Lab's MIT-licensed Open Anatomy Atlas.
// Atlas mesh data itself is downloaded from DBCLS and is CC BY 4.0.

const fs = require('node:fs');
const path = require('node:path');
const { buildDataset, LIST_FILES, ATTRIBUTION } = require('./bp3d');
const { download } = require('./pipeline-download');

const BASE_URL = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/';
const ARCHIVES = ['partof_BP3D_4.0_obj_99.zip', 'isa_BP3D_4.0_obj_99.zip'];

function pathsFor(dataDir) {
  return {
    raw: path.join(dataDir, 'raw'),
    build: path.join(dataDir, 'build'),
    index: path.join(dataDir, 'build', 'index.json'),
    meshes: path.join(dataDir, 'build', 'meshes.bin'),
  };
}

function status(dataDir) {
  const p = pathsFor(dataDir);
  try {
    const index = JSON.parse(fs.readFileSync(p.index, 'utf8'));
    const meshStat = fs.statSync(p.meshes);
    if (index.format !== 'open-anatomy-atlas/1' || meshStat.size < 1) {
      return { ready: false, dataDir, message: 'Anatomy atlas files are incomplete. Download or rebuild the atlas.' };
    }
    return {
      ready: true,
      dataDir,
      name: index.name || 'BodyParts3D',
      version: index.version || '4.0',
      counts: index.counts || null,
      attribution: index.attribution || ATTRIBUTION,
      license: index.license || 'CC BY 4.0',
      licenseUrl: index.licenseUrl || 'https://creativecommons.org/licenses/by/4.0/',
      bytes: meshStat.size,
    };
  } catch (error) {
    return { ready: false, dataDir, message: 'Detailed anatomy atlas is not installed yet.' };
  }
}

async function prepareAtlas({ dataDir, onProgress = () => {} }) {
  const p = pathsFor(dataDir);
  fs.mkdirSync(p.raw, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const downloadOptions = { onProgress };
  for (const filename of Object.values(LIST_FILES)) {
    await download(BASE_URL + filename, path.join(p.raw, filename), { ...downloadOptions, label: filename });
  }

  const sources = [];
  for (const filename of ARCHIVES) {
    sources.push(await download(BASE_URL + filename, path.join(p.raw, filename), { ...downloadOptions, label: filename }));
  }

  onProgress({ phase: 'build', message: 'Building the detailed 3D anatomy pack. This can use substantial memory.' });
  const counts = await buildDataset({
    sources,
    listDirs: [p.raw],
    outDir: p.build,
    onProgress,
    mirror: { categories: ['muscle'] },
  });
  const ready = status(dataDir);
  if (!ready.ready) throw new Error('Atlas build finished but the output failed verification.');
  onProgress({
    phase: 'ready',
    ready: true,
    message: 'Detailed reference atlas is ready: ' + counts.elements.toLocaleString() + ' meshes and ' + counts.concepts.toLocaleString() + ' named structures.',
  });
  return { ...ready, counts };
}

module.exports = { pathsFor, status, prepareAtlas, ATTRIBUTION, BASE_URL };
