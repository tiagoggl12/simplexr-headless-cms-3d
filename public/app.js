// Base URL for API calls
const API_BASE = '';

// Store saved IDs for easier testing
const savedIds = {
  assets: new Set(),
  lighting: new Set(),
  render: new Set()
};

// Load saved IDs from localStorage
function loadSavedIds() {
  const stored = localStorage.getItem('simplexr_test_ids');
  if (stored) {
    const parsed = JSON.parse(stored);
    savedIds.assets = new Set(parsed.assets || []);
    savedIds.lighting = new Set(parsed.lighting || []);
    savedIds.render = new Set(parsed.render || []);
  }
  updateSavedIdsDisplay();
}

// Save IDs to localStorage
function saveIds() {
  const data = {
    assets: Array.from(savedIds.assets),
    lighting: Array.from(savedIds.lighting),
    render: Array.from(savedIds.render)
  };
  localStorage.setItem('simplexr_test_ids', JSON.stringify(data));
}

// Update saved IDs display in UI
function updateSavedIdsDisplay() {
  // Assets
  const assetList = document.getElementById('savedAssetIds');
  assetList.innerHTML = Array.from(savedIds.assets).map(id =>
    `<li><code>${id}</code> <button class="btn-small btn-copy" data-id="${id}">Copy</button></li>`
  ).join('') || '<li><em>No saved IDs</em></li>';

  // Lighting
  const lightingList = document.getElementById('savedLightingIds');
  lightingList.innerHTML = Array.from(savedIds.lighting).map(id =>
    `<li><code>${id}</code> <button class="btn-small btn-copy" data-id="${id}">Copy</button></li>`
  ).join('') || '<li><em>No saved IDs</em></li>';

  // Render
  const renderList = document.getElementById('savedRenderIds');
  renderList.innerHTML = Array.from(savedIds.render).map(id =>
    `<li><code>${id}</code> <button class="btn-small btn-copy" data-id="${id}">Copy</button></li>`
  ).join('') || '<li><em>No saved IDs</em></li>';

  // Add copy handlers
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.id);
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    });
  });
}

// Display API response
function displayResponse(data, status) {
  const statusEl = document.getElementById('responseStatus');
  const bodyEl = document.getElementById('responseBody');

  statusEl.textContent = `Status: ${status}`;
  statusEl.className = status >= 200 && status < 300 ? 'success' : 'error';
  bodyEl.textContent = JSON.stringify(data, null, 2);
}

// Parse position string to tuple
function parsePosition(str) {
  return str.split(',').map(s => parseFloat(s.trim()));
}

// API Calls
async function createAsset(name, masterUrl) {
  const response = await fetch(`${API_BASE}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, masterUrl })
  });
  const data = await response.json();
  displayResponse(data, response.status);

  if (response.status === 201 && data.id) {
    savedIds.assets.add(data.id);
    saveIds();
    updateSavedIdsDisplay();
  }
  return data;
}

async function getAsset(id) {
  const response = await fetch(`${API_BASE}/assets/${id}`);
  const data = await response.json();
  displayResponse(data, response.status);
  return data;
}

async function presignUpload(path) {
  const response = await fetch(`${API_BASE}/uploads/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  const data = await response.json();
  displayResponse(data, response.status);
  return data;
}

async function createLightingPreset(name, hdriUrl, exposure, intensity, tags) {
  const response = await fetch(`${API_BASE}/presets/lighting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, hdriUrl, exposure, intensity, tags })
  });
  const data = await response.json();
  displayResponse(data, response.status);

  if (response.status === 201 && data.id) {
    savedIds.lighting.add(data.id);
    saveIds();
    updateSavedIdsDisplay();
  }
  return data;
}

async function listLightingPresets(tag) {
  const url = tag
    ? `${API_BASE}/viewer/presets?tag=${encodeURIComponent(tag)}`
    : `${API_BASE}/viewer/presets`;
  const response = await fetch(url);
  const data = await response.json();
  displayResponse(data, response.status);
  return data;
}

async function createRenderPreset(assetId, lightingPresetId, camera) {
  const response = await fetch(`${API_BASE}/presets/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId, lightingPresetId, camera })
  });
  const data = await response.json();
  displayResponse(data, response.status);

  if (response.status === 201 && data.id) {
    savedIds.render.add(data.id);
    saveIds();
    updateSavedIdsDisplay();
  }
  return data;
}

async function getViewerAsset(assetId) {
  const response = await fetch(`${API_BASE}/viewer/assets/${assetId}`);
  const data = await response.json();
  displayResponse(data, response.status);
  return data;
}

async function getRenderManifest(assetId, presetId, device) {
  const params = new URLSearchParams({ preset: presetId });
  if (device) params.set('device', device);
  const response = await fetch(`${API_BASE}/viewer/assets/${assetId}/render?${params}`);
  const data = await response.json();
  displayResponse(data, response.status);
  return data;
}

// Tab navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active class from all
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // Add active class to clicked
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Form handlers
document.getElementById('createAssetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('assetName').value;
  const masterUrl = document.getElementById('assetMasterUrl').value;
  await createAsset(name, masterUrl);
});

document.getElementById('getAssetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('getAssetId').value;
  await getAsset(id);
});

document.getElementById('presignForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const path = document.getElementById('uploadPath').value;
  await presignUpload(path);
});

document.getElementById('createLightingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('lightingName').value;
  const hdriUrl = document.getElementById('lightingHdriUrl').value;
  const exposure = parseFloat(document.getElementById('lightingExposure').value);
  const intensity = parseFloat(document.getElementById('lightingIntensity').value);
  const tagsInput = document.getElementById('lightingTags').value;
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : [];
  await createLightingPreset(name, hdriUrl, exposure, intensity, tags);
});

document.getElementById('listPresetsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tag = document.getElementById('filterTag').value;
  await listLightingPresets(tag || undefined);
});

document.getElementById('createRenderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const assetId = document.getElementById('renderAssetId').value;
  const lightingPresetId = document.getElementById('renderLightingId').value;
  const fov = parseFloat(document.getElementById('cameraFov').value);
  const position = parsePosition(document.getElementById('cameraPos').value);
  const target = parsePosition(document.getElementById('cameraTarget').value);

  await createRenderPreset(assetId, lightingPresetId, { fov, position, target });
});

document.getElementById('viewerAssetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const assetId = document.getElementById('viewerAssetId').value;
  await getViewerAsset(assetId);
});

document.getElementById('renderManifestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const assetId = document.getElementById('manifestAssetId').value;
  const presetId = document.getElementById('manifestPresetId').value;
  const device = document.getElementById('manifestDevice').value || undefined;
  await getRenderManifest(assetId, presetId, device);
});

// Clear response
document.getElementById('clearResponse').addEventListener('click', () => {
  document.getElementById('responseStatus').textContent = '';
  document.getElementById('responseBody').textContent = '';
});

// Initialize
loadSavedIds();
