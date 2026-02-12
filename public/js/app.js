// =====================
// State
// =====================
let allPhotos = [];
let selectedPhotos = new Map(); // id -> photo object
let collections = loadCollections();
let nextPageToken = null;
let currentDetailCollection = null;

// Slideshow state
let slideshowPhotos = [];
let slideshowIndex = 0;
let slideshowTimer = null;
let slideshowPlaying = false;
let overlayTimeout = null;

// =====================
// Init
// =====================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

// =====================
// Auth
// =====================
async function checkAuth() {
  try {
    const res = await fetch('/auth/status');
    const data = await res.json();
    if (data.authenticated) {
      showScreen('screen-main');
      document.getElementById('user-name').textContent = data.user.name;
      loadPhotos();
    } else {
      showScreen('screen-login');
    }
  } catch (err) {
    showScreen('screen-login');
  }
}

function loginWithGoogle() {
  window.location.href = '/auth/google';
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  showScreen('screen-login');
}

// =====================
// Screen Management
// =====================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');

  if (tabName === 'collections') renderCollections();
  if (tabName === 'slideshow') renderSlideshowPicker();
}

// =====================
// Photos Loading
// =====================
async function loadPhotos() {
  const grid = document.getElementById('photos-grid');
  const loading = document.getElementById('photos-loading');
  loading.style.display = 'block';
  loading.textContent = 'Loading photos...';

  try {
    const res = await fetch('/api/photos');
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    loading.style.display = 'none';

    if (data.mediaItems && data.mediaItems.length > 0) {
      allPhotos = data.mediaItems.filter(item => item.mimeType && item.mimeType.startsWith('image/'));
      nextPageToken = data.nextPageToken || null;
      renderPhotos();

      if (nextPageToken) {
        document.getElementById('btn-load-more').style.display = 'block';
      }
    } else {
      loading.style.display = 'block';
      loading.textContent = 'No photos found in your Google Photos.';
    }
  } catch (err) {
    loading.style.display = 'block';
    loading.textContent = 'Error loading photos: ' + err.message;
  }
}

async function loadMorePhotos() {
  if (!nextPageToken) return;

  const btn = document.getElementById('btn-load-more');
  btn.textContent = 'Loading...';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/photos?pageToken=${encodeURIComponent(nextPageToken)}`);
    const data = await res.json();

    if (data.mediaItems) {
      const newPhotos = data.mediaItems.filter(item => item.mimeType && item.mimeType.startsWith('image/'));
      allPhotos = [...allPhotos, ...newPhotos];
      nextPageToken = data.nextPageToken || null;
      renderPhotos();
    }

    if (nextPageToken) {
      btn.textContent = 'Load More Photos';
      btn.disabled = false;
    } else {
      btn.style.display = 'none';
    }
  } catch (err) {
    btn.textContent = 'Retry Loading';
    btn.disabled = false;
    showToast('Error loading more photos');
  }
}

// =====================
// Photos Rendering
// =====================
function renderPhotos() {
  const grid = document.getElementById('photos-grid');
  grid.innerHTML = '';

  allPhotos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'photo-card' + (selectedPhotos.has(photo.id) ? ' selected' : '');
    card.onclick = () => togglePhotoSelection(photo);

    const img = document.createElement('img');
    img.src = photo.baseUrl + '=w300-h300-c';
    img.alt = photo.filename || 'Photo';
    img.loading = 'lazy';

    const check = document.createElement('div');
    check.className = 'check-mark';
    check.textContent = selectedPhotos.has(photo.id) ? '✓' : '';

    card.appendChild(img);
    card.appendChild(check);
    grid.appendChild(card);
  });
}

function togglePhotoSelection(photo) {
  if (selectedPhotos.has(photo.id)) {
    selectedPhotos.delete(photo.id);
  } else {
    selectedPhotos.set(photo.id, photo);
  }
  renderPhotos();
  updateSelectionUI();
}

function updateSelectionUI() {
  const count = selectedPhotos.size;
  document.getElementById('selection-count').textContent = `${count} selected`;
  document.getElementById('btn-add-to-collection').disabled = count === 0;
}

function toggleSelectAll() {
  if (selectedPhotos.size === allPhotos.length) {
    clearSelection();
  } else {
    allPhotos.forEach(p => selectedPhotos.set(p.id, p));
    renderPhotos();
    updateSelectionUI();
  }
}

function clearSelection() {
  selectedPhotos.clear();
  renderPhotos();
  updateSelectionUI();
}

// =====================
// Collections (localStorage)
// =====================
function loadCollections() {
  try {
    const data = localStorage.getItem('portal_photo_collections');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveCollections() {
  localStorage.setItem('portal_photo_collections', JSON.stringify(collections));
}

function showAddToCollectionModal() {
  if (selectedPhotos.size === 0) return;

  const existing = document.getElementById('existing-collections');
  existing.innerHTML = '';

  collections.forEach((col, idx) => {
    const btn = document.createElement('button');
    btn.className = 'existing-collection-btn';
    btn.textContent = `${col.name} (${col.photos.length} photos)`;
    btn.onclick = () => addToExistingCollection(idx);
    existing.appendChild(btn);
  });

  document.getElementById('new-collection-name').value = '';
  document.getElementById('modal-collection').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-collection').classList.remove('active');
}

function addToNewCollection() {
  const nameInput = document.getElementById('new-collection-name');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }

  const photos = Array.from(selectedPhotos.values()).map(p => ({
    id: p.id,
    baseUrl: p.baseUrl,
    filename: p.filename,
    mimeType: p.mimeType,
    mediaMetadata: p.mediaMetadata
  }));

  collections.push({ name, photos, createdAt: Date.now() });
  saveCollections();
  closeModal();
  clearSelection();
  showToast(`Created "${name}" with ${photos.length} photos`);
}

function addToExistingCollection(index) {
  const col = collections[index];
  const existingIds = new Set(col.photos.map(p => p.id));
  let addedCount = 0;

  selectedPhotos.forEach((photo) => {
    if (!existingIds.has(photo.id)) {
      col.photos.push({
        id: photo.id,
        baseUrl: photo.baseUrl,
        filename: photo.filename,
        mimeType: photo.mimeType,
        mediaMetadata: photo.mediaMetadata
      });
      addedCount++;
    }
  });

  saveCollections();
  closeModal();
  clearSelection();
  showToast(`Added ${addedCount} photos to "${col.name}"`);
}

// =====================
// Collections Tab Rendering
// =====================
function renderCollections() {
  const container = document.getElementById('collections-list');

  if (collections.length === 0) {
    container.innerHTML = '<p class="empty-state">No collections yet. Browse photos and add them to a collection.</p>';
    return;
  }

  container.innerHTML = '';
  collections.forEach((col, idx) => {
    const card = document.createElement('div');
    card.className = 'collection-card';
    card.onclick = () => showCollectionDetail(idx);

    const title = document.createElement('h4');
    title.textContent = col.name;

    const count = document.createElement('div');
    count.className = 'photo-count';
    count.textContent = `${col.photos.length} photo${col.photos.length !== 1 ? 's' : ''}`;

    const preview = document.createElement('div');
    preview.className = 'preview-strip';
    col.photos.slice(0, 4).forEach(p => {
      const img = document.createElement('img');
      img.src = p.baseUrl + '=w100-h100-c';
      img.alt = '';
      img.loading = 'lazy';
      preview.appendChild(img);
    });

    card.appendChild(title);
    card.appendChild(count);
    card.appendChild(preview);
    container.appendChild(card);
  });
}

// =====================
// Collection Detail Modal
// =====================
function showCollectionDetail(index) {
  currentDetailCollection = index;
  const col = collections[index];

  document.getElementById('detail-collection-name').textContent = col.name;

  const grid = document.getElementById('detail-photos-grid');
  grid.innerHTML = '';

  col.photos.forEach((photo, photoIdx) => {
    const card = document.createElement('div');
    card.className = 'photo-card';

    const img = document.createElement('img');
    img.src = photo.baseUrl + '=w300-h300-c';
    img.alt = photo.filename || 'Photo';
    img.loading = 'lazy';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removePhotoFromCollection(index, photoIdx);
    };

    card.appendChild(img);
    card.appendChild(removeBtn);
    grid.appendChild(card);
  });

  document.getElementById('modal-collection-detail').classList.add('active');
}

function closeDetailModal() {
  document.getElementById('modal-collection-detail').classList.remove('active');
  currentDetailCollection = null;
}

function removePhotoFromCollection(collectionIdx, photoIdx) {
  collections[collectionIdx].photos.splice(photoIdx, 1);
  saveCollections();
  showCollectionDetail(collectionIdx);
  showToast('Photo removed');
}

function deleteCollection() {
  if (currentDetailCollection === null) return;
  const name = collections[currentDetailCollection].name;
  collections.splice(currentDetailCollection, 1);
  saveCollections();
  closeDetailModal();
  renderCollections();
  showToast(`Deleted collection "${name}"`);
}

function startSlideshowFromDetail() {
  if (currentDetailCollection === null) return;
  const col = collections[currentDetailCollection];
  if (col.photos.length === 0) {
    showToast('No photos in this collection');
    return;
  }
  closeDetailModal();
  slideshowPhotos = [...col.photos];
  const speed = parseInt(document.getElementById('slide-speed').value);
  launchSlideshow(col.name, speed, false);
}

// =====================
// Slideshow Picker
// =====================
function renderSlideshowPicker() {
  const picker = document.getElementById('slideshow-collection-picker');
  const startBtn = document.getElementById('btn-start-slideshow');

  if (collections.length === 0) {
    picker.innerHTML = '<p class="empty-state">No collections available. Create a collection first.</p>';
    startBtn.disabled = true;
    return;
  }

  picker.innerHTML = '';
  collections.forEach((col, idx) => {
    const card = document.createElement('div');
    card.className = 'picker-card';
    card.dataset.index = idx;
    card.onclick = () => togglePickerSelection(card);

    const check = document.createElement('div');
    check.className = 'picker-check';

    const info = document.createElement('div');
    info.className = 'picker-info';
    info.innerHTML = `<h4>${escapeHtml(col.name)}</h4><span>${col.photos.length} photos</span>`;

    card.appendChild(check);
    card.appendChild(info);
    picker.appendChild(card);
  });

  updateSlideshowStartBtn();
}

function togglePickerSelection(card) {
  card.classList.toggle('selected');
  const check = card.querySelector('.picker-check');
  check.textContent = card.classList.contains('selected') ? '✓' : '';
  updateSlideshowStartBtn();
}

function updateSlideshowStartBtn() {
  const selected = document.querySelectorAll('.picker-card.selected');
  document.getElementById('btn-start-slideshow').disabled = selected.length === 0;
}

// =====================
// Slideshow
// =====================
function startSlideshow() {
  const selectedCards = document.querySelectorAll('.picker-card.selected');
  if (selectedCards.length === 0) return;

  slideshowPhotos = [];
  let names = [];
  selectedCards.forEach(card => {
    const idx = parseInt(card.dataset.index);
    const col = collections[idx];
    slideshowPhotos.push(...col.photos);
    names.push(col.name);
  });

  if (slideshowPhotos.length === 0) {
    showToast('Selected collections are empty');
    return;
  }

  const speed = parseInt(document.getElementById('slide-speed').value);
  const shuffle = document.getElementById('slide-shuffle').checked;
  const name = names.join(', ');

  if (shuffle) {
    shuffleArray(slideshowPhotos);
  }

  launchSlideshow(name, speed, shuffle);
}

function launchSlideshow(name, speed, shuffle) {
  slideshowIndex = 0;
  slideshowPlaying = true;

  document.getElementById('slideshow-collection-name').textContent = name;
  showScreen('screen-slideshow');
  showSlide();
  startAutoAdvance(speed);
  showOverlay();

  // Tap to toggle overlay
  document.getElementById('slideshow-image').onclick = () => {
    toggleOverlay();
  };
}

function showSlide() {
  const photo = slideshowPhotos[slideshowIndex];
  const img = document.getElementById('slideshow-image');

  // Use high-res version for slideshow
  img.style.opacity = 0;
  const highRes = photo.baseUrl + '=w1920-h1080';
  const tempImg = new Image();
  tempImg.onload = () => {
    img.src = highRes;
    img.style.opacity = 1;
  };
  tempImg.onerror = () => {
    img.src = photo.baseUrl + '=w1280-h720';
    img.style.opacity = 1;
  };
  tempImg.src = highRes;

  document.getElementById('slideshow-counter').textContent =
    `${slideshowIndex + 1} / ${slideshowPhotos.length}`;
}

function nextSlide() {
  slideshowIndex = (slideshowIndex + 1) % slideshowPhotos.length;
  showSlide();
  if (slideshowPlaying) restartAutoAdvance();
}

function prevSlide() {
  slideshowIndex = (slideshowIndex - 1 + slideshowPhotos.length) % slideshowPhotos.length;
  showSlide();
  if (slideshowPlaying) restartAutoAdvance();
}

function togglePlayPause() {
  const btn = document.getElementById('btn-play-pause');
  if (slideshowPlaying) {
    clearInterval(slideshowTimer);
    slideshowPlaying = false;
    btn.innerHTML = '&#9654; Play';
  } else {
    slideshowPlaying = true;
    btn.innerHTML = '&#9646;&#9646; Pause';
    restartAutoAdvance();
  }
}

function startAutoAdvance(speed) {
  clearInterval(slideshowTimer);
  slideshowTimer = setInterval(nextSlide, speed);
}

function restartAutoAdvance() {
  const speed = parseInt(document.getElementById('slide-speed').value);
  startAutoAdvance(speed);
}

function exitSlideshow() {
  clearInterval(slideshowTimer);
  slideshowPlaying = false;

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  showScreen('screen-main');
}

// Overlay visibility
function showOverlay() {
  const overlay = document.getElementById('slideshow-overlay');
  overlay.classList.remove('hidden');
  clearTimeout(overlayTimeout);
  overlayTimeout = setTimeout(() => {
    overlay.classList.add('hidden');
  }, 4000);
}

function toggleOverlay() {
  const overlay = document.getElementById('slideshow-overlay');
  if (overlay.classList.contains('hidden')) {
    showOverlay();
  } else {
    overlay.classList.add('hidden');
    clearTimeout(overlayTimeout);
  }
}

// =====================
// Fullscreen
// =====================
function toggleFullscreen() {
  const elem = document.documentElement;
  if (!document.fullscreenElement) {
    elem.requestFullscreen().catch(err => {
      showToast('Fullscreen not available');
    });
  } else {
    document.exitFullscreen();
  }
}

// =====================
// Utility
// =====================
function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
