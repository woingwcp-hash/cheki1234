window.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'IMG' || e.target.closest('#cropperModal') || e.target.closest('#deskCanvas') || e.target.closest('#inspectModal')) {
    e.preventDefault();
    return false;
  }
}, { passive: false });

const DB_NAME = 'ChekiPocketDB';
const DB_VERSION = 1;
let db;
let cards = [];
let albums = ['預設相簿', '遠藤まりん', '現場活動'];
let currentTab = 'desk';
let selectedAlbumFilter = 'ALL';
let selectedMemberFilter = 'ALL';
let favOnlyFilter = false;
let editingCardId = null;
let editingSelectedAlbums = new Set();
let uncroppedOriginalDataUrl = '';
let rawUploadDataUrl = '';
let currentUploadDataUrl = '';
let selectedBackColor = '#60A5FA';
let inspectingCardId = null;
let selectedDeskCardId = null;
let deskThemes = ['desk-dots-brown', 'desk-blue-pastel', 'desk-pink-grid', 'desk-wood-light'];
let currentDeskThemeIdx = 0;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

const BACK_COLOR_NAMES = {
  '#38BDF8': '水色 (淺藍)', '#60A5FA': '天空藍', '#2563EB': '皇家深藍', '#2DD4BF': '薄荷綠 (ミント)',
  '#34D399': '翠綠色', '#A3E635': '青檸蘋果綠', '#F9A8D4': '櫻花粉', '#F472B6': '蜜桃粉紅',
  '#EC4899': '濃桃紅', '#EF4444': '熱情紅', '#FB923C': '活力橙', '#FDE047': '檸檬黃',
  '#C084FC': '薰衣草紫', '#7C3AED': '皇家深紫', '#FFFDF9': '經典純白', '#272228': '曜石酷黑'
};

function getContrastTextColor(hexColor) {
  if (!hexColor || typeof hexColor !== 'string') return '#FFFFFF';
  const clean = hexColor.replace('#', '').trim();
  if (clean.length !== 6) return '#FFFFFF';
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 175 ? '#272228' : '#FFFFFF';
}

let filterHistoryStack = [];
const CHEKI_SHORT_SIDE_PX = 145;
const CHEKI_LONG_SIDE_PX = 215;

function getDeskCardBaseWidth(card) { return card && card.isLandscape ? CHEKI_LONG_SIDE_PX : CHEKI_SHORT_SIDE_PX; }
function getDeskCardBaseHeight(card) { return card && card.isLandscape ? CHEKI_SHORT_SIDE_PX : CHEKI_LONG_SIDE_PX; }

let deskBgConfig = { mode: 'preset', themeIdx: 0, customImage: '', zoom: 100, panX: 0, panY: 0, dim: 0, defaultCardScale: 100 };
let editingLat = null, editingLng = null, editMapInstance = null, editMapMarker = null, statsMapInstance = null, statsMapMarkersLayer = null;

const PRESET_VENUES = [
  { name: 'KANDA SQUARE HALL (東京)', lat: 35.6925, lng: 139.7623 },
  { name: 'ららぽーと豊洲 (東京)', lat: 35.6554, lng: 139.7924 },
  { name: 'お台場・TIF会場 (東京)', lat: 35.6247, lng: 139.7755 },
  { name: '日本武道館 (東京)', lat: 35.6933, lng: 139.7499 },
  { name: '原宿 AF GALLERY (東京)', lat: 35.6702, lng: 139.7065 },
  { name: '所沢さくらタウン (埼玉)', lat: 35.7975, lng: 139.5074 },
  { name: 'ららぽーと横浜 (神奈川)', lat: 35.5162, lng: 139.5663 },
  { name: '福岡 (Fukuoka)', lat: 33.5902, lng: 130.4017 },
  { name: '門司港レトロ (北九州)', lat: 33.9467, lng: 130.9631 },
  { name: 'あなぶきアリーナ香川', lat: 34.3519, lng: 134.0485 },
  { name: '香港 (Hong Kong)', lat: 22.3193, lng: 114.1694 }
];

let batchTargetAlbum = '', batchSelectedCardIds = new Set();
let cameraStream = null, useFrontCamera = false, liveGlareInterval = null, currentCameraZoom = 1, hardwareZoomSupported = false, dualShotEnabled = false, dualShotFirstCanvas = null;
let cropCorners = { nw: { x: 14, y: 10 }, ne: { x: 86, y: 10 }, se: { x: 86, y: 90 }, sw: { x: 14, y: 90 } };
let cropFineRotDeg = 0, cropBaseUnrotatedImg = null;

function getCardAlbums(card) {
  if (Array.isArray(card.albums) && card.albums.length > 0) return card.albums;
  if (card.album && typeof card.album === 'string') return [card.album];
  return [albums[0] || '預設相簿'];
}
function cardBelongsToAlbum(card, albumName) {
  if (albumName === 'ALL') return true;
  return getCardAlbums(card).includes(albumName);
}
function setCardAlbums(card, albumArray) {
  const clean = [...new Set((albumArray || []).filter(Boolean))];
  card.albums = clean.length > 0 ? clean : [albums[0] || '預設相簿'];
  card.album = card.albums[0];
}

function getCurrentFilterConfig() {
  return {
    sharpen: Number(document.getElementById('sharpenSlider')?.value || 0),
    deglare: Number(document.getElementById('deglareSlider')?.value || 0),
    brightness: Number(document.getElementById('brightnessSlider')?.value || 100),
    contrast: Number(document.getElementById('contrastSlider')?.value || 100)
  };
}

function setFilterSlidersUI(cfg) {
  const s = cfg?.sharpen ?? 0, d = cfg?.deglare ?? 0, b = cfg?.brightness ?? 100, c = cfg?.contrast ?? 100;
  if (document.getElementById('sharpenSlider')) document.getElementById('sharpenSlider').value = s;
  if (document.getElementById('deglareSlider')) document.getElementById('deglareSlider').value = d;
  if (document.getElementById('brightnessSlider')) document.getElementById('brightnessSlider').value = b;
  if (document.getElementById('contrastSlider')) document.getElementById('contrastSlider').value = c;
  updateFilterValueLabels();
}

function updateFilterValueLabels() {
  const cfg = getCurrentFilterConfig();
  if (document.getElementById('sharpenValLabel')) document.getElementById('sharpenValLabel').textContent = `${cfg.sharpen}%`;
  if (document.getElementById('deglareValLabel')) document.getElementById('deglareValLabel').textContent = `${cfg.deglare}%`;
  if (document.getElementById('brightnessValLabel')) document.getElementById('brightnessValLabel').textContent = `${cfg.brightness}%`;
  if (document.getElementById('contrastValLabel')) document.getElementById('contrastValLabel').textContent = `${cfg.contrast}%`;
}

function initFilterHistory(initialCfg) {
  const startCfg = initialCfg || { sharpen: 0, deglare: 0, brightness: 100, contrast: 100 };
  setFilterSlidersUI(startCfg);
  filterHistoryStack = [{ ...startCfg }];
  updateUndoButtonUI();
}

function commitFilterHistory() {
  const cur = getCurrentFilterConfig();
  const last = filterHistoryStack[filterHistoryStack.length - 1];
  if (!last || last.sharpen !== cur.sharpen || last.deglare !== cur.deglare || last.brightness !== cur.brightness || last.contrast !== cur.contrast) {
    filterHistoryStack.push({ ...cur });
    if (filterHistoryStack.length > 25) filterHistoryStack.shift();
  }
  updateUndoButtonUI();
}

function updateUndoButtonUI() {
  const btn = document.getElementById('undoFilterBtn');
  if (!btn) return;
  if (filterHistoryStack.length > 1) {
    btn.disabled = false;
    btn.className = 'px-2 py-0.5 rounded-lg bg-amber-300 text-zinc-950 border border-amber-200 text-[10px] font-black transition active:scale-95';
  } else {
    btn.disabled = true;
    btn.className = 'px-2 py-0.5 rounded-lg bg-zinc-700 text-zinc-400 border border-zinc-600 text-[10px] font-black transition opacity-60';
  }
}

function undoFilterStep() {
  if (filterHistoryStack.length <= 1) return;
  filterHistoryStack.pop();
  const prev = filterHistoryStack[filterHistoryStack.length - 1];
  setFilterSlidersUI(prev);
  updateUndoButtonUI();
  applyImageFilterPreview();
}

function resetAllFiltersToZero() {
  const zeroCfg = { sharpen: 0, deglare: 0, brightness: 100, contrast: 100 };
  setFilterSlidersUI(zeroCfg);
  commitFilterHistory();
  applyImageFilterPreview();
}

function stepFilterValue(sliderId, delta) {
  const el = document.getElementById(sliderId);
  if (!el) return;
  const next = Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value) + delta));
  el.value = next;
  updateFilterValueLabels();
  commitFilterHistory();
  applyImageFilterPreview();
}

function onFilterSliderInput() {
  updateFilterValueLabels();
  applyImageFilterPreview();
}

function normalizeSearchStr(str) { return (str || '').toString().toLowerCase().replace(/\s+/g, ''); }

function cardMatchesSearchQuery(card, rawQuery) {
  if (!rawQuery || !rawQuery.trim()) return true;
  const q = normalizeSearchStr(rawQuery);
  if (!q) return true;
  const member = normalizeSearchStr(card.member), note = normalizeSearchStr(card.note), loc = normalizeSearchStr(card.locationName), date = normalizeSearchStr(card.date), albs = getCardAlbums(card).map(a => normalizeSearchStr(a));
  if (member.includes(q) || note.includes(q) || loc.includes(q) || date.includes(q) || albs.some(a => a.includes(q))) return true;
  if (member.length >= 2 && q.includes(member)) return true;
  const tokens = rawQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const combined = `${member} ${note}${loc} ${date}${albs.join(' ')}`;
    return tokens.every(t => combined.includes(t));
  }
  return false;
}

function toggleSearchBar() {
  const sb = document.getElementById('searchBar'), compactBar = document.getElementById('activeSearchCompactBar'), btn = document.getElementById('topSearchBtn');
  const isCurrentlyOpen = !sb.classList.contains('hidden');
  if (isCurrentlyOpen) {
    collapseSearchPanelOnly();
  } else {
    sb.classList.remove('hidden');
    if (compactBar) compactBar.classList.add('hidden');
    if (btn) { btn.classList.add('bg-pink-200'); btn.classList.remove('bg-white'); }
    renderSearchQuickTags();
    document.getElementById('searchInput').focus();
    executeSearch(false);
  }
}

function expandSearchPanel() {
  const sb = document.getElementById('searchBar'), compactBar = document.getElementById('activeSearchCompactBar');
  if (compactBar) compactBar.classList.add('hidden');
  if (sb) { sb.classList.remove('hidden'); renderSearchQuickTags(); executeSearch(false); }
}

function collapseSearchPanelOnly() {
  const sb = document.getElementById('searchBar'), compactBar = document.getElementById('activeSearchCompactBar'), compactText = document.getElementById('compactSearchText');
  const q = (document.getElementById('searchInput')?.value || '').trim();
  if (sb) sb.classList.add('hidden');
  try { document.getElementById('searchInput')?.blur(); } catch (_) {}
  if (q) {
    const matchedCount = cards.filter(c => cardMatchesSearchQuery(c, q)).length;
    if (compactText) compactText.textContent = `篩選中：「${q}」（共 ${matchedCount} 張）`;
    if (compactBar) compactBar.classList.remove('hidden');
  } else {
    if (compactBar) compactBar.classList.add('hidden');
    const btn = document.getElementById('topSearchBtn');
    if (btn) { btn.classList.remove('bg-pink-200'); btn.classList.add('bg-white'); }
  }
}

function confirmAndCollapseSearch() {
  executeSearch(true);
  if (currentTab === 'desk') neatArrangeDeskCards();
}

function autoCollapseSearchOnDeskTouch() {
  const sb = document.getElementById('searchBar');
  if (sb && !sb.classList.contains('hidden')) collapseSearchPanelOnly();
}

function renderSearchQuickTags() {
  const box = document.getElementById('searchQuickTags');
  if (!box) return;
  const idolList = getIdolCounts().map(i => i.member), locList = [...new Set(cards.map(c => (c.locationName || '').trim()).filter(Boolean))].slice(0, 4);
  const tags = [...new Set([...idolList, ...locList])];
  if (tags.length === 0) { box.innerHTML = ''; return; }
  box.innerHTML = `<span class="text-[10px] font-black text-zinc-500 shrink-0">快速點選:</span>` + tags.map(t => `
    <button type="button" onclick="setQuickSearchQuery('${t.replace(/'/g, "\\'")}')" class="px-2.5 py-0.5 rounded-full bg-white border border-cheki-dark text-[10px] font-black text-zinc-700 shrink-0 active:scale-95">🔍 ${t}</button>
  `).join('');
}

function setQuickSearchQuery(q) {
  const input = document.getElementById('searchInput');
  if (!input) return;
  input.value = q;
  executeSearch(currentTab === 'desk');
  if (currentTab === 'desk') neatArrangeDeskCards();
}

function executeSearch(autoCollapse = false) {
  const q = (document.getElementById('searchInput')?.value || '').trim();
  const feedbackBox = document.getElementById('searchResultFeedback'), countText = document.getElementById('searchResultCountText'), strip = document.getElementById('searchResultQuickStrip');
  if (q) {
    const matchedAll = cards.filter(c => cardMatchesSearchQuery(c, q));
    if (feedbackBox) {
      feedbackBox.classList.remove('hidden');
      countText.textContent = `🎯 搜尋「${q}」：共 ${matchedAll.length} 張`;
      strip.innerHTML = matchedAll.length === 0 ? `<p class="text-[11px] text-zinc-400 font-bold py-1 px-1">沒有找到符合相片</p>` : matchedAll.map(c => `
        <div onclick="openInspectModal(${c.id})" class="shrink-0 w-12 flex flex-col items-center cursor-pointer group">
          <div class="w-12 h-14 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center overflow-hidden p-0.5">
            <img src="${c.image}" draggable="false" class="max-h-full max-w-full object-contain rounded pointer-events-none">
          </div>
          <span class="text-[9px] font-black truncate w-full text-center mt-0.5">${c.member || ''}</span>
        </div>
      `).join('');
    }
  } else if (feedbackBox) {
    feedbackBox.classList.add('hidden');
  }
  if (autoCollapse && q) collapseSearchPanelOnly();
  renderCurrentTab();
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  if (document.getElementById('searchResultFeedback')) document.getElementById('searchResultFeedback').classList.add('hidden');
  if (document.getElementById('activeSearchCompactBar')) document.getElementById('activeSearchCompactBar').classList.add('hidden');
  if (document.getElementById('searchBar')) document.getElementById('searchBar').classList.add('hidden');
  const btn = document.getElementById('topSearchBtn');
  if (btn) { btn.classList.remove('bg-pink-200'); btn.classList.add('bg-white'); }
  renderCurrentTab();
}

function onAllDeskCardsScaleChange(pctVal) {
  const pct = Math.min(200, Math.max(12, Number(pctVal) || 100));
  deskBgConfig.defaultCardScale = pct;
  const scaleNum = Math.round((pct / 100) * 100) / 100;
  if (document.getElementById('deskAllCardsScaleSlider')) document.getElementById('deskAllCardsScaleSlider').value = pct;
  if (document.getElementById('deskAllCardsScaleText')) document.getElementById('deskAllCardsScaleText').textContent = `${pct}%`;
  cards.forEach(c => {
    c.deskScale = scaleNum;
    const node = document.querySelector(`#deskCardsLayer > div[data-id="${c.id}"]`);
    if (node) node.style.transform = `rotate(${c.deskRot \vert{}\vert{} 0}deg) scale(${scaleNum})`;
  });
  if (document.getElementById('deskSelectedScaleBadge')) document.getElementById('deskSelectedScaleBadge').textContent = `${pct}%`;
  saveDeskBgConfigToDB();
  if (saveAllCardsTimeout) clearTimeout(saveAllCardsTimeout);
  saveAllCardsTimeout = setTimeout(async () => { for (const c of cards) await saveCardToDB(c); }, 350);
}

function stepAllDeskCardsScale(deltaPct) { onAllDeskCardsScaleChange((deskBgConfig.defaultCardScale || 100) + deltaPct); }

function stepSelectedDeskCardScale(deltaScale) {
  if (!selectedDeskCardId && cards.length > 0) selectedDeskCardId = cards[0].id;
  const card = cards.find(c => c.id === selectedDeskCardId);
  if (!card) return;
  const nextScale = Math.min(2.5, Math.max(0.12, Math.round(((card.deskScale || 1) + deltaScale) * 100) / 100));
  card.deskScale = nextScale;
  const node = document.querySelector(`#deskCardsLayer > div[data-id="${card.id}"]`);
  if (node) node.style.transform = `rotate(${card.deskRot \vert{}\vert{} 0}deg) scale(${nextScale})`;
  if (document.getElementById('deskSelectedScaleBadge')) document.getElementById('deskSelectedScaleBadge').textContent = `${Math.round(nextScale * 100)}%`;
  saveCardToDB(card);
}

function applyDeskBgVisuals() {
  const canvas = document.getElementById('deskCanvas'), customLayer = document.getElementById('deskCustomBgLayer'), customImg = document.getElementById('deskCustomBgImg'), dimmer = document.getElementById('deskCustomBgDimmer');
  if (!canvas) return;
  deskThemes.forEach(t => canvas.classList.remove(t));
  currentDeskThemeIdx = deskBgConfig.themeIdx || 0;
  canvas.classList.add(deskThemes[currentDeskThemeIdx]);
  const zoomRatio = (deskBgConfig.zoom || 100) / 100;
  if (deskBgConfig.mode === 'custom' && deskBgConfig.customImage) {
    customLayer.classList.remove('hidden');
    customImg.src = deskBgConfig.customImage;
    customImg.style.transform = `translate(${deskBgConfig.panX || 0}px, ${deskBgConfig.panY \vert{}\vert{} 0}px) scale(${zoomRatio})`;
    dimmer.style.backgroundColor = `rgba(0, 0, 0, ${(deskBgConfig.dim || 0) / 100})`;
    canvas.style.backgroundSize = ''; canvas.style.backgroundPosition = '';
  } else {
    customLayer.classList.add('hidden');
    const basePx = currentDeskThemeIdx === 2 ? 28 : 32, scaledPx = Math.max(8, Math.round(basePx * zoomRatio));
    if (currentDeskThemeIdx !== 3) {
      canvas.style.backgroundSize = `${scaledPx}px${scaledPx}px`;
      canvas.style.backgroundPosition = `${deskBgConfig.panX \vert{}\vert{} 0}px${deskBgConfig.panY || 0}px`;
    } else {
      canvas.style.backgroundSize = ''; canvas.style.backgroundPosition = '';
    }
  }
  const zVal = Math.round(deskBgConfig.zoom || 100), cardScalePct = Math.round(deskBgConfig.defaultCardScale || 100);
  if (document.getElementById('deskAllCardsScaleSlider')) document.getElementById('deskAllCardsScaleSlider').value = cardScalePct;
  if (document.getElementById('deskAllCardsScaleText')) document.getElementById('deskAllCardsScaleText').textContent = `${cardScalePct}%`;
  if (document.getElementById('deskBgQuickSlider')) document.getElementById('deskBgQuickSlider').value = zVal;
  if (document.getElementById('deskBgZoomValueText')) document.getElementById('deskBgZoomValueText').textContent = `${zVal}%`;
  if (document.getElementById('modalBgZoomSlider')) document.getElementById('modalBgZoomSlider').value = zVal;
  if (document.getElementById('modalBgZoomLabel')) document.getElementById('modalBgZoomLabel').textContent = `${zVal}%`;
  if (document.getElementById('modalBgPanXSlider')) document.getElementById('modalBgPanXSlider').value = deskBgConfig.panX || 0;
  if (document.getElementById('modalBgPanYSlider')) document.getElementById('modalBgPanYSlider').value = deskBgConfig.panY || 0;
  if (document.getElementById('modalBgDimSlider')) document.getElementById('modalBgDimSlider').value = deskBgConfig.dim || 0;
  if (document.getElementById('modalBgDimLabel')) document.getElementById('modalBgDimLabel').textContent = `${deskBgConfig.dim || 0}%`;
}

function onDeskBgZoomChange(val) { deskBgConfig.zoom = Math.min(300, Math.max(20, Number(val) || 100)); applyDeskBgVisuals(); saveDeskBgConfigToDB(); }
function stepDeskBgZoom(delta) { onDeskBgZoomChange((deskBgConfig.zoom || 100) + delta); }
function onDeskBgPanChange() {
  deskBgConfig.panX = Number(document.getElementById('modalBgPanXSlider')?.value || 0);
  deskBgConfig.panY = Number(document.getElementById('modalBgPanYSlider')?.value || 0);
  applyDeskBgVisuals(); saveDeskBgConfigToDB();
}
function onDeskBgDimChange(val) { deskBgConfig.dim = Number(val) || 0; applyDeskBgVisuals(); saveDeskBgConfigToDB(); }
function resetDeskBgTransform() { deskBgConfig.zoom = 100; deskBgConfig.panX = 0; deskBgConfig.panY = 0; applyDeskBgVisuals(); saveDeskBgConfigToDB(); }

function handleDeskCustomBgUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 2000;
      let w = img.width, h = img.height;
      if (w > maxSide || h > maxSide) { if (w > h) { h = Math.round(h * (maxSide / w)); w = maxSide; } else { w = Math.round(w * (maxSide / h)); h = maxSide; } }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
      deskBgConfig.customImage = c.toDataURL('image/jpeg', 0.92); deskBgConfig.mode = 'custom'; deskBgConfig.zoom = 100; deskBgConfig.panX = 0; deskBgConfig.panY = 0;
      applyDeskBgVisuals(); saveDeskBgConfigToDB();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file); e.target.value = '';
}

function openDeskBgModal() { applyDeskBgVisuals(); document.getElementById('pickChekiAsBgBox').classList.add('hidden'); document.getElementById('deskBgModal').classList.remove('hidden'); }
function closeDeskBgModal() { document.getElementById('deskBgModal').classList.add('hidden'); }
function togglePickChekiAsBgList() {
  const box = document.getElementById('pickChekiAsBgBox');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    box.innerHTML = cards.length === 0 ? `<div class="col-span-4 text-center py-4 text-xs text-zinc-400 font-bold">尚無 Cheki</div>` : cards.map(c => `
      <div onclick="setExistingChekiAsDeskBg(${c.id})" class="cursor-pointer rounded-lg border-2 border-transparent hover:border-cheki-accent bg-white p-1 flex items-center justify-center aspect-[3/4]">
        <img src="${c.image}" draggable="false" class="max-h-full max-w-full object-contain pointer-events-none">
      </div>
    `).join('');
  }
}
function setExistingChekiAsDeskBg(cardId) {
  const card = cards.find(c => c.id === cardId);
  if (!card) return;
  deskBgConfig.customImage = card.image; deskBgConfig.mode = 'custom'; deskBgConfig.zoom = 115; deskBgConfig.panX = 0; deskBgConfig.panY = 0;
  applyDeskBgVisuals(); saveDeskBgConfigToDB();
}
function selectPresetDeskTheme(idx) { deskBgConfig.mode = 'preset'; deskBgConfig.themeIdx = idx; currentDeskThemeIdx = idx; applyDeskBgVisuals(); saveDeskBgConfigToDB(); }
function cycleDeskTheme() { deskBgConfig.mode = 'preset'; currentDeskThemeIdx = ((deskBgConfig.themeIdx || 0) + 1) % deskThemes.length; deskBgConfig.themeIdx = currentDeskThemeIdx; applyDeskBgVisuals(); saveDeskBgConfigToDB(); }

function renderQuickVenuePills() {
  const box = document.getElementById('quickVenuePills');
  if (!box) return;
  const customVenues = [];
  cards.forEach(c => {
    if (c.locationName && typeof c.lat === 'number' && typeof c.lng === 'number') {
      if (!PRESET_VENUES.some(p => p.name === c.locationName) && !customVenues.some(v => v.name === c.locationName)) {
        customVenues.push({ name: c.locationName, lat: c.lat, lng: c.lng });
      }
    }
  });
  const allVenues = [...customVenues, ...PRESET_VENUES];
  box.innerHTML = allVenues.map((v, idx) => `
    <button type="button" onclick="selectPresetVenue(${idx})" data-lat="${v.lat}" data-lng="${v.lng}" data-name="${v.name}" class="venue-pill-btn px-2.5 py-0.5 rounded-full bg-white border border-blue-300 text-[10px] font-black text-blue-900 shrink-0 hover:bg-blue-100">📍 ${v.name}</button>
  `).join('');
}
function selectPresetVenue(idx) {
  const btn = document.querySelectorAll('.venue-pill-btn')[idx];
  if (!btn) return;
  document.getElementById('cardLocationInput').value = btn.dataset.name;
  setEditLocationPin(parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lng), true);
}
function toggleEditMapPicker(forceShow) {
  const wrapper = document.getElementById('editMapWrapper'), btn = document.getElementById('toggleMapBtn'), willShow = typeof forceShow === 'boolean' ? forceShow : wrapper.classList.contains('hidden');
  wrapper.classList.toggle('hidden', !willShow); btn.textContent = willShow ? '🗺️ 收起地圖' : '🗺️ 地圖';
  if (willShow) setTimeout(initOrUpdateEditMap, 80);
}
function initOrUpdateEditMap() {
  const defaultLat = typeof editingLat === 'number' ? editingLat : 35.6812, defaultLng = typeof editingLng === 'number' ? editingLng : 139.7671;
  if (!editMapInstance) {
    editMapInstance = L.map('editPickerMap').setView([defaultLat, defaultLng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(editMapInstance);
    editMapInstance.on('click', (e) => setEditLocationPin(e.latlng.lat, e.latlng.lng, false));
  } else {
    editMapInstance.invalidateSize(); editMapInstance.setView([defaultLat, defaultLng], typeof editingLat === 'number' ? 15 : 11);
  }
  if (typeof editingLat === 'number' && typeof editingLng === 'number') setEditLocationPin(editingLat, editingLng, false);
}
function setEditLocationPin(lat, lng, openMapIfNeeded = true) {
  editingLat = Math.round(lat * 100000) / 100000; editingLng = Math.round(lng * 100000) / 100000;
  if (openMapIfNeeded) toggleEditMapPicker(true);
  setTimeout(() => {
    if (editMapInstance) {
      editMapInstance.invalidateSize();
      if (editMapMarker) editMapMarker.setLatLng([editingLat, editingLng]); else editMapMarker = L.marker([editingLat, editingLng]).addTo(editMapInstance);
      editMapInstance.setView([editingLat, editingLng], 15);
    }
    if (document.getElementById('editCoordsText')) document.getElementById('editCoordsText').textContent = `✅ 已標示：${editingLat},${editingLng}`;
  }, 100);
}
function clearEditLocationPin() {
  editingLat = null; editingLng = null;
  if (editMapInstance && editMapMarker) { editMapInstance.removeLayer(editMapMarker); editMapMarker = null; }
  if (document.getElementById('editCoordsText')) document.getElementById('editCoordsText').textContent = '👆 點擊地圖放置標記';
}
async function searchPlaceOnMap() {
  const q = (document.getElementById('cardLocationInput').value || '').trim();
  if (!q) { alert('請輸入場地或城市名稱！'); return; }
  const preset = PRESET_VENUES.find(v => v.name.toLowerCase().includes(q.toLowerCase()));
  if (preset) { setEditLocationPin(preset.lat, preset.lng, true); return; }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) setEditLocationPin(parseFloat(data[0].lat), parseFloat(data[0].lon), true);
    else { toggleEditMapPicker(true); alert('找不到地名，請直接在地圖上點擊！'); }
  } catch (_) { toggleEditMapPicker(true); }
}
function locateCurrentGPS() {
  if (!navigator.geolocation) { alert('不支援 GPS 定位'); return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    setEditLocationPin(pos.coords.latitude, pos.coords.longitude, true);
    if (!document.getElementById('cardLocationInput').value.trim()) document.getElementById('cardLocationInput').value = '目前位置';
  }, () => alert('無法取得 GPS 位置'));
}

function classifyChekiDimension(widthPx, heightPx) {
  if (!widthPx || !heightPx) return '自訂尺寸';
  const ratio = widthPx / heightPx;
  if (ratio >= 0.52 && ratio <= 0.75) return `標準直向 Cheki (${Math.round(widthPx)}×${Math.round(heightPx)}px)`;
  if (ratio >= 1.32 && ratio <= 1.85) return `標準橫向 Cheki (${Math.round(widthPx)}×${Math.round(heightPx)}px)`;
  return `超清自訂尺寸 (${Math.round(widthPx)}×${Math.round(heightPx)}px)`;
}

function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('cards')) d.createObjectStore('cards', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = (e) => { db = e.target.result; loadDataFromDB().then(resolve); };
    req.onerror = reject;
  });
}

async function loadDataFromDB() {
  return new Promise((resolve) => {
    const tx = db.transaction(['cards', 'meta'], 'readonly');
    const cardReq = tx.objectStore('cards').getAll(), albumReq = tx.objectStore('meta').get('albums'), deskBgReq = tx.objectStore('meta').get('deskBgConfig');
    tx.oncomplete = () => {
      cards = (cardReq.result || []).sort((a, b) => b.createdAt - a.createdAt);
      if (albumReq.result && Array.isArray(albumReq.result.value) && albumReq.result.value.length > 0) albums = albumReq.result.value;
      if (deskBgReq.result && deskBgReq.result.value) deskBgConfig = { ...deskBgConfig, ...deskBgReq.result.value };
      cards.forEach(c => { getCardAlbums(c).forEach(a => { if (a && !albums.includes(a)) albums.push(a); }); });
      applyDeskBgVisuals(); updateHeaderStats(); renderCurrentTab(); resolve();
    };
  });
}

function saveCardToDB(card) { return new Promise((resolve) => { const tx = db.transaction('cards', 'readwrite'); tx.objectStore('cards').put(card); tx.oncomplete = resolve; }); }
function deleteCardFromDB(id) { return new Promise((resolve) => { const tx = db.transaction('cards', 'readwrite'); tx.objectStore('cards').delete(id); tx.oncomplete = resolve; }); }
function saveAlbumsToDB() { return new Promise((resolve) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key: 'albums', value: albums }); tx.oncomplete = resolve; }); }
function saveDeskBgConfigToDB() { return new Promise((resolve) => { if (!db) return resolve(); const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key: 'deskBgConfig', value: deskBgConfig }); tx.oncomplete = resolve; }); }

function getIdolCounts() {
  const map = {};
  cards.forEach(c => {
    const name = (c.member || '未命名').trim() || '未命名';
    if (!map[name]) map[name] = { member: name, count: 0, favCount: 0, cover: c.image || '', latestDate: c.date || '' };
    map[name].count += 1;
    if (c.fav) map[name].favCount += 1;
    if (!map[name].cover && c.image) map[name].cover = c.image;
    if (c.date && c.date > map[name].latestDate) map[name].latestDate = c.date;
  });
  return Object.values(map).map(item => ({ ...item, percent: cards.length ? Math.round((item.count / cards.length) * 100) : 0 })).sort((a, b) => b.count - a.count);
}

function getMonthlyCounts() {
  const monthMap = {};
  cards.forEach(c => { const m = (c.date || '').slice(0, 7) || '未知'; monthMap[m] = (monthMap[m] || 0) + 1; });
  return Object.entries(monthMap).map(([month, count]) => ({ month, count })).sort((a, b) => b.month.localeCompare(a.month));
}

function updateHeaderStats() {
  const favCount = cards.filter(c => c.fav).length, idolList = getIdolCounts(), topText = idolList.length > 0 ? ` · 👑 ${idolList[0].member} (${idolList[0].count}張)` : '';
  if (document.getElementById('headerStats')) document.getElementById('headerStats').textContent = `總計 ${cards.length} 張 · ★ ${favCount} 最愛${topText}`;
  if (document.getElementById('backupCountText')) document.getElementById('backupCountText').textContent = cards.length;
}

function switchTab(tab) {
  currentTab = tab;
  ['albums', 'binder', 'calendar', 'stats', 'desk'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    const navBtn = document.getElementById(`nav-${t}`);
    if (t === tab) { navBtn.classList.remove('text-zinc-400'); navBtn.classList.add('text-cheki-accent', 'font-black'); }
    else { navBtn.classList.add('text-zinc-400'); navBtn.classList.remove('text-cheki-accent', 'font-black'); }
  });
  renderCurrentTab();
}

function renderCurrentTab() {
  if (currentTab === 'albums') renderAlbums();
  else if (currentTab === 'binder') renderBinder();
  else if (currentTab === 'calendar') renderCalendar();
  else if (currentTab === 'stats') renderStats();
  else if (currentTab === 'desk') renderDesk();
}

function getFilteredCards() {
  const q = (document.getElementById('searchInput')?.value || '').trim();
  return cards.filter(c => {
    if (!cardBelongsToAlbum(c, selectedAlbumFilter)) return false;
    if (selectedMemberFilter !== 'ALL' && (c.member || '未命名').trim() !== selectedMemberFilter) return false;
    if (favOnlyFilter && !c.fav) return false;
    if (q && !cardMatchesSearchQuery(c, q)) return false;
    return true;
  });
}

function renderAlbums() {
  const quickStatsBox = document.getElementById('albumsQuickIdolStats'), idolCounts = getIdolCounts();
  if (quickStatsBox) {
    quickStatsBox.innerHTML = idolCounts.length === 0 ? `<p class="text-xs text-zinc-400 font-bold py-1">尚無紀錄</p>` : idolCounts.slice(0, 5).map((item, idx) => `
      <div onclick="filterByMemberInBinder('${item.member.replace(/'/g, "\\'")}')" class="cursor-pointer space-y-1 p-1.5 rounded-xl hover:bg-pink-50 transition">
        <div class="flex justify-between items-center text-xs font-black">
          <span>${idx === 0 ? '🥇' : idx === 1 ? '🥈' : '💙'} ${item.member}</span>
          <span class="text-cheki-accent">${item.count} 張 (${item.percent}%)</span>
        </div>
        <div class="w-full h-2 rounded-full bg-pink-100 overflow-hidden border border-pink-200"><div class="h-full bg-cheki-accent rounded-full" style="width: ${item.percent}%"></div></div>
      </div>
    `).join('');
  }
  const grid = document.getElementById('albumsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const q = (document.getElementById('searchInput')?.value || '').trim();
  albums.forEach(alb => {
    const albCards = cards.filter(c => cardBelongsToAlbum(c, alb) && (!q || cardMatchesSearchQuery(c, q))), cover = albCards[0]?.image || '', safeAlb = alb.replace(/'/g, "\\'");
    const div = document.createElement('div');
    div.className = 'neo-box bg-white rounded-2xl p-2.5 flex flex-col justify-between space-y-2';
    div.innerHTML = `
      <div onclick="openAlbumInBinder('${safeAlb}')" class="cursor-pointer">
        <div class="h-32 rounded-xl bg-pink-50 flex items-center justify-center overflow-hidden mb-2 relative">
          ${cover ? `<img src="${cover}" draggable="false" class="max-h-full max-w-full object-contain pointer-events-none">` : `<span class="text-3xl">📁</span>`}
          <span class="absolute bottom-1.5 right-1.5 text-[10px] font-black px-2 py-0.5 rounded-full bg-white/90 border border-cheki-dark">${albCards.length} 張</span>
        </div>
        <div class="flex justify-between items-center gap-1 px-0.5">
          <span class="font-black text-sm truncate">${alb}</span>
          <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
            <button onclick="renameAlbum('${safeAlb}')" class="text-xs px-1.5 py-0.5 rounded bg-zinc-100">✏️</button>
            ${albums.length > 1 ? `<button onclick="deleteAlbum('${safeAlb}')" class="text-xs px-1.5 py-0.5 rounded bg-rose-50">🗑️</button>` : ''}
          </div>
        </div>
      </div>
      <button onclick="openBatchAlbumPicker('${safeAlb}')" class="w-full py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 neo-btn text-[11px] font-black text-cheki-dark flex items-center justify-center gap-1">➕ 加入/調動</button>
    `;
    grid.appendChild(div);
  });
}

function openAlbumInBinder(alb) { selectedAlbumFilter = alb; selectedMemberFilter = 'ALL'; switchTab('binder'); }
function filterByMemberInBinder(memberName) { selectedAlbumFilter = 'ALL'; selectedMemberFilter = memberName; switchTab('binder'); }
function createNewAlbum() {
  const name = prompt('請輸入新相簿名稱：');
  if (name && name.trim()) { const clean = name.trim(); if (!albums.includes(clean)) { albums.push(clean); saveAlbumsToDB(); updateHeaderStats(); renderCurrentTab(); } }
}
async function renameAlbum(oldName) {
  const newName = prompt(`將相簿「${oldName}」重新命名為：`, oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  const clean = newName.trim(), idx = albums.indexOf(oldName);
  if (idx > -1) albums[idx] = clean;
  for (const c of cards) { if (getCardAlbums(c).includes(oldName)) { setCardAlbums(c, getCardAlbums(c).map(a => a === oldName ? clean : a)); await saveCardToDB(c); } }
  if (selectedAlbumFilter === oldName) selectedAlbumFilter = clean;
  await saveAlbumsToDB(); renderCurrentTab();
}
async function deleteAlbum(albName) {
  if (albums.length <= 1) { alert('至少需保留一個相簿！'); return; }
  if (!confirm(`確定刪除相簿「${albName}」？`)) return;
  albums = albums.filter(a => a !== albName);
  for (const c of cards) { if (getCardAlbums(c).includes(albName)) { setCardAlbums(c, getCardAlbums(c).filter(a => a !== albName)); await saveCardToDB(c); } }
  if (selectedAlbumFilter === albName) selectedAlbumFilter = 'ALL';
  await saveAlbumsToDB(); updateHeaderStats(); renderCurrentTab();
}

function openBatchAlbumPicker(albumName) {
  if (!albumName || albumName === 'ALL') return;
  batchTargetAlbum = albumName;
  batchSelectedCardIds = new Set(cards.filter(c => cardBelongsToAlbum(c, albumName)).map(c => c.id));
  if (document.getElementById('batchAlbumModalTitle')) document.getElementById('batchAlbumModalTitle').textContent = `📁 管理「${albumName}」`;
  if (document.getElementById('batchPickerSearch')) document.getElementById('batchPickerSearch').value = '';
  renderBatchPickerGrid();
  document.getElementById('batchAlbumPickerModal').classList.remove('hidden');
}
function closeBatchAlbumPicker() { document.getElementById('batchAlbumPickerModal').classList.add('hidden'); batchTargetAlbum = ''; }
function renderBatchPickerGrid() {
  const grid = document.getElementById('batchPickerGrid'), q = (document.getElementById('batchPickerSearch')?.value || '').trim();
  if (!grid) return;
  grid.innerHTML = '';
  const filtered = cards.filter(c => cardMatchesSearchQuery(c, q));
  filtered.forEach(c => {
    const isSelected = batchSelectedCardIds.has(c.id), item = document.createElement('div');
    item.className = `relative rounded-2xl p-1.5 border-2 cursor-pointer transition flex flex-col items-center ${isSelected ? 'border-cheki-accent bg-pink-100/95 shadow-md' : 'border-zinc-200 bg-white opacity-75'}`;
    item.onclick = () => { if (batchSelectedCardIds.has(c.id)) batchSelectedCardIds.delete(c.id); else batchSelectedCardIds.add(c.id); renderBatchPickerGrid(); };
    item.innerHTML = `
      <div class="w-full aspect-[3/4] flex items-center justify-center overflow-hidden rounded-lg bg-zinc-50"><img src="${c.image}" draggable="false" class="max-h-full max-w-full object-contain pointer-events-none"></div>
      <p class="font-black text-[11px] truncate w-full text-center mt-1">${c.member || '未命名'}</p>
      <div class="absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-cheki-dark flex items-center justify-center text-xs font-black ${isSelected ? 'bg-cheki-accent text-white' : 'bg-white text-transparent'}">✓</div>
    `;
    grid.appendChild(item);
  });
  if (document.getElementById('batchSelectedCountText')) document.getElementById('batchSelectedCountText').textContent = `已選取 ${batchSelectedCardIds.size} 張`;
}
function batchSelectAllVisible(selectAll) {
  const q = (document.getElementById('batchPickerSearch')?.value || '').trim();
  cards.forEach(c => { if (cardMatchesSearchQuery(c, q) && selectAll) batchSelectedCardIds.add(c.id); });
  renderBatchPickerGrid();
}
async function saveBatchAlbumSelection() {
  if (!batchTargetAlbum) return;
  for (const c of cards) {
    const cur = new Set(getCardAlbums(c)), shouldBeIn = batchSelectedCardIds.has(c.id), currentlyIn = cur.has(batchTargetAlbum);
    if (shouldBeIn && !currentlyIn) { cur.add(batchTargetAlbum); setCardAlbums(c, [...cur]); await saveCardToDB(c); }
    else if (!shouldBeIn && currentlyIn) { cur.delete(batchTargetAlbum); setCardAlbums(c, [...cur]); await saveCardToDB(c); }
  }
  closeBatchAlbumPicker(); updateHeaderStats(); renderCurrentTab();
}

function openQuickMoveAlbumsModal() {
  const card = cards.find(c => c.id === inspectingCardId);
  if (!card) return;
  const box = document.getElementById('quickMoveAlbumCheckboxes'), sel = new Set(getCardAlbums(card));
  box.innerHTML = albums.map(alb => `
    <label class="flex items-center justify-between p-2.5 rounded-xl border-2 border-cheki-dark bg-pink-50/50 cursor-pointer">
      <span class="font-black text-xs">📁 ${alb}</span><input type="checkbox" value="${alb}" ${sel.has(alb) ? 'checked' : ''} class="quick-album-cb w-5 h-5 accent-pink-500">
    </label>
  `).join('');
  document.getElementById('quickMoveAlbumsModal').classList.remove('hidden');
}
function closeQuickMoveAlbumsModal() { document.getElementById('quickMoveAlbumsModal').classList.add('hidden'); }
async function saveQuickMoveAlbums() {
  const card = cards.find(c => c.id === inspectingCardId);
  if (!card) return;
  const checked = [...document.querySelectorAll('.quick-album-cb:checked')].map(el => el.value);
  if (checked.length === 0) { alert('請至少保留一個相簿！'); return; }
  setCardAlbums(card, checked); await saveCardToDB(card);
  closeQuickMoveAlbumsModal(); renderInspectAlbumBadges(card); updateHeaderStats(); renderCurrentTab();
}

function promptAddNewAlbumInModal(mode) {
  const name = prompt('請輸入新相簿名稱：');
  if (!name || !name.trim()) return;
  const clean = name.trim();
  if (!albums.includes(clean)) { albums.push(clean); saveAlbumsToDB(); }
  if (mode === 'quick') {
    const checked = [...document.querySelectorAll('.quick-album-cb:checked')].map(el => el.value); checked.push(clean);
    document.getElementById('quickMoveAlbumCheckboxes').innerHTML = albums.map(alb => `
      <label class="flex items-center justify-between p-2.5 rounded-xl border-2 border-cheki-dark bg-pink-50/50 cursor-pointer">
        <span class="font-black text-xs">📁 ${alb}</span><input type="checkbox" value="${alb}" ${checked.includes(alb) ? 'checked' : ''} class="quick-album-cb w-5 h-5 accent-pink-500">
      </label>
    `).join('');
  } else if (mode === 'edit') { editingSelectedAlbums.add(clean); renderEditAlbumPills(); }
  updateHeaderStats();
}

function renderBinder() {
  const pills = document.getElementById('albumFilterPills');
  if (!pills) return;
  pills.innerHTML = '';
  ['ALL', ...albums].forEach(alb => {
    const btn = document.createElement('button'), active = selectedAlbumFilter === alb, count = alb === 'ALL' ? cards.length : cards.filter(c => cardBelongsToAlbum(c, alb)).length;
    btn.className = `px-3 py-1.5 rounded-full text-xs font-black neo-btn shrink-0 ${active ? 'bg-cheki-accent text-white' : 'bg-white'}`;
    btn.textContent = alb === 'ALL' ? `全部 (${count})` : `${alb} (${count})`;
    btn.onclick = () => { selectedAlbumFilter = alb; renderBinder(); };
    pills.appendChild(btn);
  });
  const actionBar = document.getElementById('currentAlbumActionBar');
  if (selectedAlbumFilter !== 'ALL') { actionBar.classList.remove('hidden'); document.getElementById('currentAlbumTitleText').textContent = `📁 相簿：${selectedAlbumFilter}`; }
  else actionBar.classList.add('hidden');

  const memberPills = document.getElementById('memberFilterPills');
  memberPills.innerHTML = '';
  const idolCounts = getIdolCounts();
  if (idolCounts.length > 0) {
    const allBtn = document.createElement('button');
    allBtn.className = `px-2.5 py-1 rounded-full text-[11px] font-black border-2 border-cheki-dark shrink-0 ${selectedMemberFilter === 'ALL' ? 'bg-blue-500 text-white' : 'bg-blue-50 text-zinc-700'}`;
    allBtn.textContent = `👥 全部 (${cards.length}張)`; allBtn.onclick = () => { selectedMemberFilter = 'ALL'; renderBinder(); };
    memberPills.appendChild(allBtn);
    idolCounts.forEach(item => {
      const btn = document.createElement('button');
      btn.className = `px-2.5 py-1 rounded-full text-[11px] font-black border-2 border-cheki-dark shrink-0 ${selectedMemberFilter === item.member ? 'bg-blue-500 text-white' : 'bg-white text-zinc-700'}`;
      btn.textContent = `${item.member} (${item.count})`; btn.onclick = () => { selectedMemberFilter = item.member; renderBinder(); };
      memberPills.appendChild(btn);
    });
  }
  const favBtn = document.getElementById('favFilterBtn');
  if (favBtn) favBtn.className = `px-3 py-1.5 rounded-full text-xs font-black neo-btn shrink-0 ${favOnlyFilter ? 'bg-amber-300' : 'bg-white'}`;

  const grid = document.getElementById('binderGrid');
  grid.innerHTML = '';
  const list = getFilteredCards();
  if (list.length === 0) {
    grid.innerHTML = `<div class="col-span-2 text-center py-10 text-zinc-400 font-bold text-sm">此分類尚無相片</div>`; return;
  }
  list.forEach(card => {
    const item = document.createElement('div');
    item.className = 'cursor-pointer group flex flex-col items-center';
    item.onclick = () => openInspectModal(card.id);
    item.innerHTML = `
      <div class="w-full aspect-[3/4] flex items-center justify-center p-1 relative">
        <img src="${card.image}" draggable="false" class="max-h-full max-w-full object-contain rounded-lg shadow-md group-active:scale-95 transition pointer-events-none">
        ${card.fav ? '<span class="absolute top-2 right-2 text-base">⭐</span>' : ''}
      </div>
      <div class="mt-1 text-center"><p class="font-black text-xs truncate max-w-[140px]">${card.member || '未命名'}</p><p class="text-[10px] text-zinc-500 font-bold">${card.date || ''}</p></div>
    `;
    grid.appendChild(item);
  });
}
function toggleFavFilter() { favOnlyFilter = !favOnlyFilter; renderBinder(); }

function changeMonth(delta) {
  calMonth += delta; if (calMonth < 0) { calMonth = 11; calYear--; } if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
}
function renderCalendar() {
  if (!document.getElementById('calendarTitle')) return;
  document.getElementById('calendarTitle').textContent = `${calYear} 年 ${calMonth + 1} 月`;
  const daysContainer = document.getElementById('calendarDays');
  daysContainer.innerHTML = '';
  const q = (document.getElementById('searchInput')?.value || '').trim(), firstDay = new Date(calYear, calMonth, 1).getDay(), daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) daysContainer.appendChild(document.createElement('div'));
  const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`, dayCards = cards.filter(c => c.date === dateStr && (!q || cardMatchesSearchQuery(c, q)));
    const cell = document.createElement('div');
    cell.className = `h-12 rounded-xl border border-zinc-200 flex flex-col items-center justify-between p-1 cursor-pointer ${dayCards.length ? 'bg-pink-100 border-cheki-accent font-black' : 'bg-zinc-50'}`;
    cell.innerHTML = `<span class="text-[10px]">${d}</span>${dayCards.length ? `<span class="text-[9px] px-1 rounded-full bg-cheki-accent text-white">${dayCards.length}</span>` : ''}`;
    cell.onclick = () => renderCalendarDayCards(dateStr, dayCards);
    daysContainer.appendChild(cell);
  }
  renderCalendarDayCards(`${calYear}年${calMonth + 1}月 全部`, cards.filter(c => (c.date || '').startsWith(monthPrefix) && (!q || cardMatchesSearchQuery(c, q))));
}
function renderCalendarDayCards(title, list) {
  const box = document.getElementById('calendarDayList');
  if (!box) return;
  box.innerHTML = `<h4 class="font-black text-xs text-zinc-600 px-1">${title} (${list.length} 張)</h4>`;
  list.forEach(c => {
    const row = document.createElement('div');
    row.className = 'neo-box bg-white rounded-2xl p-2 flex items-center gap-3 cursor-pointer'; row.onclick = () => openInspectModal(c.id);
    row.innerHTML = `<img src="${c.image}" draggable="false" class="w-12 h-16 object-contain rounded pointer-events-none"><div class="flex-1 min-w-0"><p class="font-black text-sm truncate">${c.member}</p><p class="text-xs text-zinc-500 font-bold">${c.date || ''}</p></div>`;
    box.appendChild(row);
  });
}

function renderStats() {
  const idolCounts = getIdolCounts(), favCount = cards.filter(c => c.fav).length, uniqueLocs = new Set(cards.map(c => (c.locationName || '').trim()).filter(Boolean));
  if (document.getElementById('statTotalCards')) document.getElementById('statTotalCards').textContent = cards.length;
  if (document.getElementById('statTotalIdols')) document.getElementById('statTotalIdols').textContent = idolCounts.length;
  if (document.getElementById('statTotalFavs')) document.getElementById('statTotalFavs').textContent = favCount;
  if (document.getElementById('statTotalLocations')) document.getElementById('statTotalLocations').textContent = uniqueLocs.size;
  const topCard = document.getElementById('topOshiHighlightCard');
  if (topCard) {
    if (idolCounts.length > 0) {
      const top = idolCounts[0]; topCard.classList.remove('hidden');
      topCard.innerHTML = `
        <div onclick="filterByMemberInBinder('${top.member.replace(/'/g, "\\'")}')" class="flex items-center gap-3.5 cursor-pointer">
          <div class="w-20 h-24 rounded-2xl bg-white neo-btn flex items-center justify-center overflow-hidden shrink-0 p-1">${top.cover ? `<img src="${top.cover}" class="max-h-full max-w-full object-contain rounded">` : '👑'}</div>
          <div class="flex-1 min-w-0 space-y-1">
            <div class="inline-block px-2.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-black">💙 主推 No.1</div>
            <h4 class="font-black text-lg truncate">${top.member}</h4>
            <p class="text-xs font-black text-cheki-accent">累積收藏：${top.count} 張 (${top.percent}%)</p>
          </div>
        </div>
      `;
    } else topCard.classList.add('hidden');
  }
  setTimeout(renderStatsFootprintMap, 80);
  const board = document.getElementById('idolStatsLeaderboard');
  if (board) {
    board.innerHTML = idolCounts.length === 0 ? `<p class="text-center py-4 text-xs text-zinc-400 font-bold">尚無資料</p>` : idolCounts.map((item, idx) => `
      <div onclick="filterByMemberInBinder('${item.member.replace(/'/g, "\\'")}')" class="neo-btn bg-pink-50/60 rounded-2xl p-2.5 flex items-center gap-3 cursor-pointer">
        <div class="w-12 h-14 rounded-xl bg-white border border-pink-200 flex items-center justify-center overflow-hidden shrink-0">${item.cover ? `<img src="${item.cover}" class="max-h-full max-w-full object-contain">` : '📸'}</div>
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex justify-between items-center text-xs font-black"><span>${idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} ${item.member}</span><span class="text-cheki-accent">${item.count} 張</span></div>
          <div class="w-full h-2 rounded-full bg-white border border-cheki-dark overflow-hidden"><div class="h-full bg-cheki-accent" style="width: ${item.percent}%"></div></div>
        </div>
      </div>
    `).join('');
  }
  const monthlyBox = document.getElementById('monthlyStatsList');
  if (monthlyBox) {
    const monthlyCounts = getMonthlyCounts(), maxM = Math.max(...monthlyCounts.map(m => m.count), 1);
    monthlyBox.innerHTML = monthlyCounts.length === 0 ? `<p class="text-center text-xs text-zinc-400 font-bold">尚無紀錄</p>` : monthlyCounts.slice(0, 6).map(m => `
      <div class="space-y-1"><div class="flex justify-between text-xs font-black"><span>🗓️ ${m.month}</span><span class="text-blue-600">${m.count} 張</span></div>
      <div class="w-full h-2 rounded-full bg-blue-50 border border-blue-200 overflow-hidden"><div class="h-full bg-blue-400 rounded-full" style="width: ${Math.round((m.count/maxM)*100)}%"></div></div></div>
    `).join('');
  }
  const achievements = [
    { icon: '🌱', title: '初次邂逅', desc: '第 1 張', unlocked: cards.length >= 1 },
    { icon: '💙', title: '十全十美', desc: '達 10 張', unlocked: cards.length >= 10 },
    { icon: '🔥', title: '熱情應援', desc: '單一偶像達 30 張', unlocked: (idolCounts[0]?.count || 0) >= 30 },
    { icon: '🌟', title: '百張紀念', desc: '達 100 張', unlocked: cards.length >= 100 }
  ];
  const achGrid = document.getElementById('achievementsGrid');
  if (achGrid) {
    achGrid.innerHTML = achievements.map(a => `
      <div class="rounded-2xl p-2.5 border-2 border-cheki-dark flex items-center gap-2.5 ${a.unlocked ? 'bg-amber-100' : 'bg-zinc-100 opacity-50'}">
        <span class="text-2xl">${a.icon}</span><div class="min-w-0"><p class="font-black text-xs truncate">${a.title}</p><p class="text-[10px] text-zinc-600 font-bold">${a.desc}</p></div>
      </div>
    `).join('');
  }
}

function renderStatsFootprintMap() {
  const container = document.getElementById('statsFootprintMap');
  if (!container || typeof L === 'undefined') return;
  if (!statsMapInstance) {
    statsMapInstance = L.map('statsFootprintMap').setView([35.6812, 139.7671], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(statsMapInstance);
    statsMapMarkersLayer = L.layerGroup().addTo(statsMapInstance);
  } else { statsMapInstance.invalidateSize(); statsMapMarkersLayer.clearLayers(); }
  const bounds = [];
  cards.forEach(c => {
    if (typeof c.lat === 'number' && typeof c.lng === 'number') {
      bounds.push([c.lat, c.lng]);
      const marker = L.marker([c.lat, c.lng]);
      marker.bindPopup(`<div style="text-align:center; min-width:110px; cursor:pointer;" onclick="openInspectModal(${c.id})"><img src="${c.image}" style="height:75px; width:auto; margin:0 auto 4px; border-radius:6px; object-fit:contain;" /><div style="font-weight:900; font-size:12px;">${c.member}</div><div style="font-size:10px; color:#2563eb;">📍 ${c.locationName}</div></div>`);
      statsMapMarkersLayer.addLayer(marker);
    }
  });
  if (bounds.length > 0) statsMapInstance.fitBounds(bounds, { padding: [25, 25], maxZoom: 14 });
}
function fitAllMarkersOnStatsMap() { renderStatsFootprintMap(); }
function searchByLocationInBinder(locName) { document.getElementById('searchInput').value = locName; selectedAlbumFilter = 'ALL'; selectedMemberFilter = 'ALL'; executeSearch(true); switchTab('binder'); }

function renderDesk() {
  applyDeskBgVisuals();
  const canvas = document.getElementById('deskCanvas'), cardsLayer = document.getElementById('deskCardsLayer');
  if (!canvas || !cardsLayer) return;
  cardsLayer.innerHTML = '';
  const rect = canvas.getBoundingClientRect(), cw = rect.width || 360, ch = rect.height || 480, defaultScale = (deskBgConfig.defaultCardScale || 100) / 100;
  const q = (document.getElementById('searchInput')?.value || '').trim(), deskCards = q ? cards.filter(c => cardMatchesSearchQuery(c, q)) : cards;
  let maxBottomY = ch;
  deskCards.forEach((card, idx) => {
    if (typeof card.deskX !== 'number') {
      card.deskX = 20 + ((idx * 45) % Math.max(80, cw - 150));
      card.deskY = 20 + ((idx * 55) % Math.max(100, ch - 190));
      card.deskRot = (idx % 2 === 0 ? 1 : -1) * (4 + (idx * 3) % 10);
      card.deskScale = defaultScale; card.deskZ = idx + 1;
    }
    if (typeof card.deskFlipped !== 'boolean') card.deskFlipped = false;
    const curScale = card.deskScale || defaultScale, baseW = getDeskCardBaseWidth(card), baseH = getDeskCardBaseHeight(card);
    if (card.deskY + Math.round(baseH * curScale) + 20 > maxBottomY) maxBottomY = card.deskY + Math.round(baseH * curScale) + 20;

    const el = document.createElement('div');
    el.dataset.id = card.id;
    el.className = `desk-card-node absolute perspective-1000 select-none touch-none cursor-grab origin-top-left ${selectedDeskCardId === card.id ? 'desk-card-selected' : ''}`;
    el.style.width = `${baseW}px`; el.style.left = `${card.deskX}px`; el.style.top = `${card.deskY}px`; el.style.zIndex = card.deskZ || 1;
    el.style.transform = `rotate(${card.deskRot \vert{}\vert{} 0}deg) scale(${curScale})`;

    const backColor = card.backColor || '#60A5FA', textColor = getContrastTextColor(backColor), backText = (card.note && card.note.trim()) ? card.note : `${card.member || 'Cheki'}`;
    el.innerHTML = `
      <div class="desk-flip-inner transform-style-3d relative w-full ${card.deskFlipped ? 'rotate-y-180' : ''}">
        <div class="backface-hidden w-full"><img src="${card.image}" draggable="false" class="desk-card-img w-full h-auto block rounded-lg shadow-xl pointer-events-none"></div>
        <div class="backface-hidden rotate-y-180 absolute inset-0 rounded-xl shadow-xl p-3 flex flex-col justify-between items-center text-center pointer-events-none border border-white/40" style="background-color: ${backColor}; color:${textColor};">
          <div class="text-[9px] font-bold opacity-85 w-full flex justify-between gap-1"><span>${card.date || ''}</span><span class="truncate">${card.locationName ? '📍' + card.locationName : ''}</span></div>
          <div class="font-marker font-bold text-sm leading-snug line-clamp-4 break-words my-auto px-1">${backText}</div>
          <div class="text-[10px] font-black opacity-90 w-full text-right">${card.member || ''}</div>
        </div>
      </div>
    `;
    const imgEl = el.querySelector('.desk-card-img');
    imgEl.onload = () => {
      const isLand = imgEl.naturalWidth > imgEl.naturalHeight * 1.05;
      if (card.isLandscape !== isLand) { card.isLandscape = isLand; el.style.width = `${getDeskCardBaseWidth(card)}px`; saveCardToDB(card); }
    };
    attachDeskCardInteractions(el, card);
    cardsLayer.appendChild(el);
  });
  cardsLayer.style.height = `${Math.max(ch, maxBottomY + 60)}px`;
}

function attachDeskCardInteractions(el, card) {
  let isDragging = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0, movedDistance = 0;
  let isPinching = false, startDist = 0, startAngle = 0, initScale = 1, initRot = 0;
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); autoCollapseSearchOnDeskTouch(); bringCardToFront(card, el);
    isDragging = true; movedDistance = 0; startX = e.clientX; startY = e.clientY; initialLeft = card.deskX; initialTop = card.deskY;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!isDragging || isPinching) return;
    const dx = e.clientX - startX, dy = e.clientY - startY; movedDistance = Math.hypot(dx, dy);
    if (movedDistance > 3) { card.deskX = initialLeft + dx; card.deskY = initialTop + dy; el.style.left = `${card.deskX}px`; el.style.top = `${card.deskY}px`; }
  });
  el.addEventListener('pointerup', (e) => {
    if (!isDragging) return; isDragging = false; try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    if (movedDistance < 6 && !isPinching) {
      card.deskFlipped = !card.deskFlipped;
      const inner = el.querySelector('.desk-flip-inner'); if (inner) inner.classList.toggle('rotate-y-180', card.deskFlipped);
    }
    saveCardToDB(card);
  });
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      isPinching = true; isDragging = false;
      const t1 = e.touches[0], t2 = e.touches[1];
      startDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      startAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
      initScale = card.deskScale || 1; initRot = card.deskRot || 0;
    }
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (isPinching && e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1], dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY), angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
      card.deskScale = Math.min(2.5, Math.max(0.12, initScale * (dist / startDist))); card.deskRot = initRot + (angle - startAngle);
      el.style.transform = `rotate(${card.deskRot}deg) scale(${card.deskScale})`;
      if (document.getElementById('deskSelectedScaleBadge')) document.getElementById('deskSelectedScaleBadge').textContent = `${Math.round(card.deskScale * 100)}%`;
    }
  }, { passive: true });
  el.addEventListener('touchend', (e) => { if (e.touches.length < 2 && isPinching) { setTimeout(() => { isPinching = false; }, 100); saveCardToDB(card); } });
}

function bringCardToFront(card, el) {
  selectedDeskCardId = card.id;
  const maxZ = cards.reduce((m, c) => Math.max(m, c.deskZ || 1), 1);
  card.deskZ = maxZ + 1; el.style.zIndex = card.deskZ;
  document.querySelectorAll('#deskCardsLayer > .desk-card-node').forEach(node => node.classList.toggle('desk-card-selected', Number(node.dataset.id) === card.id));
  if (document.getElementById('deskSelectedName')) document.getElementById('deskSelectedName').textContent = card.member || '未命名';
  if (document.getElementById('deskSelectedScaleBadge')) document.getElementById('deskSelectedScaleBadge').textContent = `${Math.round((card.deskScale || 1) * 100)}%`;
}
function flipSelectedDeskCard() {
  if (!selectedDeskCardId) return;
  const card = cards.find(c => c.id === selectedDeskCardId);
  if (!card) return; card.deskFlipped = !card.deskFlipped;
  const el = document.querySelector(`#deskCardsLayer > div[data-id="${card.id}"] .desk-flip-inner`);
  if (el) el.classList.toggle('rotate-y-180', card.deskFlipped); saveCardToDB(card);
}
function scatterDeskCards() {
  const canvas = document.getElementById('deskCanvas'), rect = canvas.getBoundingClientRect(), q = (document.getElementById('searchInput')?.value || '').trim(), targetList = q ? cards.filter(c => cardMatchesSearchQuery(c, q)) : cards;
  targetList.forEach((c, i) => {
    const sc = c.deskScale || 1, cardW = Math.round(getDeskCardBaseWidth(c) * sc), cardH = Math.round(getDeskCardBaseHeight(c) * sc);
    c.deskX = Math.floor(8 + Math.random() * Math.max(15, rect.width - cardW - 12));
    c.deskY = Math.floor(8 + Math.random() * Math.max(30, rect.height - cardH - 12));
    c.deskRot = Math.floor(Math.random() * 34) - 17; c.deskZ = i + 1; saveCardToDB(c);
  });
  renderDesk();
}
function neatArrangeDeskCards() {
  const q = (document.getElementById('searchInput')?.value || '').trim(), targetList = q ? cards.filter(c => cardMatchesSearchQuery(c, q)) : cards;
  if (targetList.length === 0) return;
  const canvas = document.getElementById('deskCanvas'), cw = canvas.getBoundingClientRect().width || 360, targetScale = (deskBgConfig.defaultCardScale || 100) / 100;
  const gap = Math.max(6, Math.round(10 * targetScale)), padX = 10;
  let curX = padX, curY = 12, rowMaxH = 0;
  targetList.forEach((c, i) => {
    c.deskScale = targetScale;
    const cardW = Math.round(getDeskCardBaseWidth(c) * targetScale), cardH = Math.round(getDeskCardBaseHeight(c) * targetScale);
    if (curX > padX && curX + cardW > cw - padX) { curX = padX; curY += rowMaxH + gap; rowMaxH = 0; }
    c.deskX = curX; c.deskY = curY; c.deskRot = 0; c.deskZ = i + 1;
    curX += cardW + gap; if (cardH > rowMaxH) rowMaxH = cardH; saveCardToDB(c);
  });
  renderDesk();
}

async function openLiveCameraScanner() {
  document.getElementById('liveCameraModal').classList.remove('hidden');
  dualShotFirstCanvas = null; document.getElementById('dualShotGhostImg').classList.add('hidden');
  if (document.getElementById('dualShotStepHint')) document.getElementById('dualShotStepHint').textContent = dualShotEnabled ? '第 1 步：微傾拍第 1 張' : '';
  await startCameraStream();
}
async function startCameraStream() {
  stopCameraStream();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: useFrontCamera ? 'user' : { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 }, advanced: [{ focusMode: 'continuous' }] }, audio: false });
    const video = document.getElementById('cameraVideo');
    video.srcObject = cameraStream;
    video.onloadedmetadata = () => { setCameraZoom(currentCameraZoom); startLiveGlareCheckLoop(); };
  } catch (_) { closeLiveCameraScanner(); document.getElementById('cameraDirectInput').click(); }
}
async function setCameraZoom(z) {
  currentCameraZoom = z;
  [1, 1.5, 2].forEach(lvl => {
    const btn = document.getElementById(lvl === 1.5 ? 'camZoomBtn15' : `camZoomBtn${lvl}`);
    if (btn) btn.className = lvl === z ? 'px-2.5 py-1 rounded-lg text-[11px] font-black bg-emerald-400 text-zinc-950' : 'px-2.5 py-1 rounded-lg text-[11px] font-black text-white';
  });
  const video = document.getElementById('cameraVideo');
  hardwareZoomSupported = false;
  if (cameraStream) {
    const track = cameraStream.getVideoTracks()[0];
    if (track && typeof track.getCapabilities === 'function') {
      try {
        const caps = track.getCapabilities();
        if (caps.zoom) { await track.applyConstraints({ advanced: [{ zoom: Math.min(caps.zoom.max, Math.max(caps.zoom.min, z)) }] }); hardwareZoomSupported = true; if (video) video.style.transform = 'scale(1)'; return; }
      } catch (_) {}
    }
  }
  if (video) video.style.transform = `scale(${z})`;
}
function toggleDualShotAntiGlare() {
  dualShotEnabled = !dualShotEnabled; dualShotFirstCanvas = null;
  document.getElementById('dualShotGhostImg').classList.add('hidden');
  const btn = document.getElementById('dualShotToggleBtn'), hint = document.getElementById('dualShotStepHint');
  if (dualShotEnabled) { btn.textContent = '✨ 雙拍消反光: 開'; btn.className = 'px-3 py-1.5 rounded-xl bg-amber-400 text-zinc-950 text-[11px] font-black'; if (hint) hint.textContent = '第 1 步：微傾拍第 1 張'; }
  else { btn.textContent = '✨ 雙拍消反光: 關'; btn.className = 'px-3 py-1.5 rounded-xl bg-zinc-800 text-white text-[11px] font-black'; if (hint) hint.textContent = ''; }
}
function captureZoomedVideoFrame(video) {
  const vw = video.videoWidth, vh = video.videoHeight, z = hardwareZoomSupported ? 1 : (currentCameraZoom || 1);
  const cropW = Math.round(vw / z), cropH = Math.round(vh / z), sx = Math.round((vw - cropW) / 2), sy = Math.round((vh - cropH) / 2);
  const canvas = document.createElement('canvas'); canvas.width = cropW; canvas.height = cropH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH); return canvas;
}
function startLiveGlareCheckLoop() {
  if (liveGlareInterval) clearInterval(liveGlareInterval);
  const video = document.getElementById('cameraVideo'), glareBadge = document.getElementById('glareWarningBadge');
  liveGlareInterval = setInterval(() => {
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const c = document.createElement('canvas'); c.width = 120; c.height = 120;
    c.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, 120, 120);
    const data = c.getContext('2d').getImageData(30, 25, 60, 70).data;
    let glareCount = 0; const total = data.length / 4;
    for (let i = 0; i < data.length; i += 4) { if ((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) > 246) glareCount++; }
    const hasGlare = (glareCount / total) > 0.05;
    if (glareBadge) {
      if (hasGlare) { glareBadge.textContent = '⚠️ 偵測到反光亮斑！請微傾手機 15°'; glareBadge.className = 'w-full py-1 px-3 rounded-xl bg-amber-500 text-zinc-950 text-[11px] font-black text-center animate-pulse'; }
      else { glareBadge.textContent = '✨ 光線理想'; glareBadge.className = 'w-full py-1 px-3 rounded-xl bg-zinc-800/90 text-emerald-300 text-[11px] font-black text-center'; }
    }
  }, 300);
}
function stopCameraStream() { if (liveGlareInterval) { clearInterval(liveGlareInterval); liveGlareInterval = null; } if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; } }
function closeLiveCameraScanner() { stopCameraStream(); dualShotFirstCanvas = null; document.getElementById('liveCameraModal').classList.add('hidden'); }
function switchCameraFacing() { useFrontCamera = !useFrontCamera; startCameraStream(); }
function blendDualShotAntiGlare(c1, c2) {
  const w = c1.width, h = c1.height, out = document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d'), d1 = c1.getContext('2d').getImageData(0, 0, w, h).data, d2 = c2.getContext('2d').getImageData(0, 0, w, h).data;
  const outImg = ctx.createImageData(w, h), dst = outImg.data;
  for (let i = 0; i < d1.length; i += 4) {
    const l1 = 0.299 * d1[i] + 0.587 * d1[i + 1] + 0.114 * d1[i + 2], l2 = 0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2];
    if (Math.abs(l1 - l2) > 22 && Math.max(l1, l2) > 205) {
      if (l1 < l2) { dst[i] = d1[i]; dst[i + 1] = d1[i + 1]; dst[i + 2] = d1[i + 2]; }
      else { dst[i] = d2[i]; dst[i + 1] = d2[i + 1]; dst[i + 2] = d2[i + 2]; }
    } else { dst[i] = Math.round((d1[i] + d2[i]) * 0.5); dst[i + 1] = Math.round((d1[i + 1] + d2[i + 1]) * 0.5); dst[i + 2] = Math.round((d1[i + 2] + d2[i + 2]) * 0.5); }
    dst[i + 3] = 255;
  }
  ctx.putImageData(outImg, 0, 0); return out;
}
function captureLivePhoto() {
  const video = document.getElementById('cameraVideo'); if (!video.videoWidth) return;
  const frameCanvas = captureZoomedVideoFrame(video);
  if (dualShotEnabled) {
    if (!dualShotFirstCanvas) {
      dualShotFirstCanvas = frameCanvas; const ghost = document.getElementById('dualShotGhostImg');
      ghost.src = frameCanvas.toDataURL('image/jpeg', 0.85); ghost.classList.remove('hidden');
      if (document.getElementById('dualShotStepHint')) document.getElementById('dualShotStepHint').textContent = '📸 已拍第1張！再按快門合成'; return;
    } else {
      const blended = blendDualShotAntiGlare(dualShotFirstCanvas, frameCanvas);
      dualShotFirstCanvas = null; document.getElementById('dualShotGhostImg').classList.add('hidden');
      closeLiveCameraScanner(); compressAndSetImage(blended.toDataURL('image/jpeg', 0.96), true); return;
    }
  }
  closeLiveCameraScanner(); compressAndSetImage(frameCanvas.toDataURL('image/jpeg', 0.96), true);
}

function setRectToQuadCorners(left, top, right, bottom) { cropCorners = { nw: { x: left, y: top }, ne: { x: right, y: top }, se: { x: right, y: bottom }, sw: { x: left, y: bottom } }; }
function openCropperModal() {
  const baseSrc = uncroppedOriginalDataUrl || rawUploadDataUrl || currentUploadDataUrl; if (!baseSrc) return;
  document.getElementById('cropperModal').classList.remove('hidden');
  cropFineRotDeg = 0; if (document.getElementById('cropFineRotSlider')) document.getElementById('cropFineRotSlider').value = 0;
  if (document.getElementById('fineRotLabel')) document.getElementById('fineRotLabel').textContent = '0°';
  const baseImg = new Image();
  baseImg.onload = () => {
    cropBaseUnrotatedImg = baseImg;
    const img = document.getElementById('cropTargetImg');
    img.onload = () => setCropPresetRatio(54, 86);
    img.src = baseSrc;
  };
  baseImg.src = baseSrc;
}
function onCropFineRotateChange(degVal) {
  cropFineRotDeg = Number(degVal) || 0;
  if (document.getElementById('fineRotLabel')) document.getElementById('fineRotLabel').textContent = `${cropFineRotDeg > 0 ? '+' : ''}${cropFineRotDeg}°`;
  if (!cropBaseUnrotatedImg) return;
  if (cropFineRotDeg === 0) { document.getElementById('cropTargetImg').src = cropBaseUnrotatedImg.src; return; }
  const w = cropBaseUnrotatedImg.naturalWidth, h = cropBaseUnrotatedImg.naturalHeight, canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.fillStyle = '#18181b'; ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2); ctx.rotate((cropFineRotDeg * Math.PI) / 180); ctx.drawImage(cropBaseUnrotatedImg, -w / 2, -h / 2);
  const img = document.getElementById('cropTargetImg'); img.onload = null; img.src = canvas.toDataURL('image/jpeg', 0.96);
}
function setCropPresetRatio(wRatio, hRatio) {
  const img = document.getElementById('cropTargetImg'); if (!img || !img.naturalWidth) return;
  const targetAspect = wRatio / hRatio, imgAspect = img.naturalWidth / img.naturalHeight;
  let boxWPercent, boxHPercent;
  if (imgAspect > targetAspect) { boxHPercent = 80; boxWPercent = (boxHPercent * targetAspect) / imgAspect; }
  else { boxWPercent = 80; boxHPercent = (boxWPercent * imgAspect) / targetAspect; }
  boxWPercent = Math.min(92, Math.max(25, boxWPercent)); boxHPercent = Math.min(92, Math.max(25, boxHPercent));
  setRectToQuadCorners(Math.round((50 - boxWPercent / 2) * 10) / 10, Math.round((50 - boxHPercent / 2) * 10) / 10, Math.round((50 + boxWPercent / 2) * 10) / 10, Math.round((50 + boxHPercent / 2) * 10) / 10);
  updateCropBoxUI(`📏 標準 ${wRatio}×${hRatio}mm 比例`);
}
function setCropFullImage() { setRectToQuadCorners(0.5, 0.5, 99.5, 99.5); updateCropBoxUI('🔲 原圖 100%'); }
function closeCropperModal() { document.getElementById('cropperModal').classList.add('hidden'); document.getElementById('cropLoupe').classList.add('hidden'); }
function lerpPoint(pA, pB, t) { return { x: pA.x + (pB.x - pA.x) * t, y: pA.y + (pB.y - pA.y) * t }; }
function bilerpQuad(nw, ne, se, sw, u, v) { return lerpPoint(lerpPoint(nw, ne, u), lerpPoint(sw, se, u), v); }

function updateCropBoxUI(customLabel) {
  const { nw, ne, se, sw } = cropCorners;
  const maskPath = document.getElementById('cropMaskPath'), outerPoly = document.getElementById('cropOuterPoly'), innerPoly = document.getElementById('cropInnerGuidePoly');
  if (maskPath) maskPath.setAttribute('d', `M0,0 L100,0 L100,100 L0,100 Z M${nw.x},${nw.y} L${ne.x},${ne.y} L${se.x},${se.y} L${sw.x},${sw.y} Z`);
  if (outerPoly) outerPoly.setAttribute('points', `${nw.x},${nw.y} ${ne.x},${ne.y} ${se.x},${se.y} ${sw.x},${sw.y}`);
  if (innerPoly) {
    const inNW = bilerpQuad(nw, ne, se, sw, 0.075, 0.08), inNE = bilerpQuad(nw, ne, se, sw, 0.925, 0.08), inSE = bilerpQuad(nw, ne, se, sw, 0.925, 0.79), inSW = bilerpQuad(nw, ne, se, sw, 0.075, 0.79);
    innerPoly.setAttribute('points', `${inNW.x.toFixed(1)},${inNW.y.toFixed(1)} ${inNE.x.toFixed(1)},${inNE.y.toFixed(1)} ${inSE.x.toFixed(1)},${inSE.y.toFixed(1)} ${inSW.x.toFixed(1)},${inSW.y.toFixed(1)}`);
  }
  const setPos = (id, pt) => { const el = document.getElementById(id); if (el) { el.style.left = `${pt.x}%`; el.style.top = `${pt.y}%`; } };
  setPos('handleNW', nw); setPos('handleNE', ne); setPos('handleSE', se); setPos('handleSW', sw);
  setPos('handleN', lerpPoint(nw, ne, 0.5)); setPos('handleS', lerpPoint(sw, se, 0.5)); setPos('handleW', lerpPoint(nw, sw, 0.5)); setPos('handleE', lerpPoint(ne, se, 0.5));
  const centerHandle = document.getElementById('cropCenterMoveHandle');
  if (centerHandle) {
    const minX = Math.max(nw.x, sw.x) + 6, maxX = Math.min(ne.x, se.x) - 6, minY = Math.max(nw.y, ne.y) + 6, maxY = Math.min(sw.y, se.y) - 6;
    if (maxX > minX && maxY > minY) { centerHandle.style.left = `${minX}%`; centerHandle.style.top = `${minY}%`; centerHandle.style.width = `${maxX - minX}%`; centerHandle.style.height = `${maxY - minY}%`; }
  }
  const img = document.getElementById('cropTargetImg'), indicator = document.getElementById('cropSizeIndicator');
  if (img && img.naturalWidth && indicator) {
    const topW = Math.hypot((ne.x - nw.x) * img.naturalWidth, (ne.y - nw.y) * img.naturalHeight) / 100;
    const leftH = Math.hypot((sw.x - nw.x) * img.naturalWidth, (sw.y - nw.y) * img.naturalHeight) / 100;
    indicator.textContent = customLabel || `💎 輸出畫質：${classifyChekiDimension(topW, leftH)}`;
  }
}

function updateMagnifierLoupe(pctX, pctY, labelText) {
  const loupe = document.getElementById('cropLoupe'), canvas = document.getElementById('cropLoupeCanvas'), img = document.getElementById('cropTargetImg');
  if (!loupe || !canvas || !img || !img.naturalWidth) return;
  loupe.classList.remove('hidden');
  if (pctX < 45 && pctY < 45) { loupe.style.left = 'auto'; loupe.style.right = '8px'; } else { loupe.style.right = 'auto'; loupe.style.left = '8px'; }
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 112, 112);
  const srcX = (pctX / 100) * img.naturalWidth, srcY = (pctY / 100) * img.naturalHeight, radius = Math.max(28, Math.round(Math.min(img.naturalWidth, img.naturalHeight) * 0.06));
  ctx.drawImage(img, srcX - radius, srcY - radius, radius * 2, radius * 2, 0, 0, 112, 112);
  if (document.getElementById('cropLoupeCornerTag')) document.getElementById('cropLoupeCornerTag').textContent = labelText || '';
}

(function initCropHandles() {
  let activeHandle = null, startMouseX = 0, startMouseY = 0, startCorners = null;
  const workspace = document.getElementById('cropWorkspace');
  if (workspace) workspace.addEventListener('touchstart', (e) => { if (e.target.closest('.crop-handle')) e.preventDefault(); }, { passive: false });
  window.addEventListener('pointerdown', (e) => {
    const handleEl = e.target.closest('.crop-handle'); if (!handleEl) return;
    e.preventDefault(); e.stopPropagation();
    activeHandle = handleEl.dataset.handle; startMouseX = e.clientX; startMouseY = e.clientY; startCorners = JSON.parse(JSON.stringify(cropCorners));
    try { handleEl.setPointerCapture(e.pointerId); } catch (_) {}
  }, { passive: false });
  window.addEventListener('pointermove', (e) => {
    if (!activeHandle) return; e.preventDefault();
    const wrapper = document.getElementById('cropImgWrapper'), rect = wrapper.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = Math.max(0.5, Math.min(99.5, ((e.clientX - rect.left) / rect.width) * 100)), py = Math.max(0.5, Math.min(99.5, ((e.clientY - rect.top) / rect.height) * 100));
    const dxPct = ((e.clientX - startMouseX) / rect.width) * 100, dyPct = ((e.clientY - startMouseY) / rect.height) * 100;
    if (activeHandle === 'nw' || activeHandle === 'ne' || activeHandle === 'se' || activeHandle === 'sw') {
      cropCorners[activeHandle] = { x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10 }; updateMagnifierLoupe(px, py, activeHandle.toUpperCase());
    } else if (activeHandle === 'n') {
      cropCorners.nw.y = Math.max(0.5, Math.min(95, startCorners.nw.y + dyPct)); cropCorners.ne.y = Math.max(0.5, Math.min(95, startCorners.ne.y + dyPct)); updateMagnifierLoupe((cropCorners.nw.x + cropCorners.ne.x)/2, cropCorners.nw.y, 'TOP');
    } else if (activeHandle === 's') {
      cropCorners.sw.y = Math.max(5, Math.min(99.5, startCorners.sw.y + dyPct)); cropCorners.se.y = Math.max(5, Math.min(99.5, startCorners.se.y + dyPct)); updateMagnifierLoupe((cropCorners.sw.x + cropCorners.se.x)/2, cropCorners.sw.y, 'BOT');
    } else if (activeHandle === 'w') {
      cropCorners.nw.x = Math.max(0.5, Math.min(95, startCorners.nw.x + dxPct)); cropCorners.sw.x = Math.max(0.5, Math.min(95, startCorners.sw.x + dxPct)); updateMagnifierLoupe(cropCorners.nw.x, (cropCorners.nw.y + cropCorners.sw.y)/2, 'LEFT');
    } else if (activeHandle === 'e') {
      cropCorners.ne.x = Math.max(5, Math.min(99.5, startCorners.ne.x + dxPct)); cropCorners.se.x = Math.max(5, Math.min(99.5, startCorners.se.x + dxPct)); updateMagnifierLoupe(cropCorners.ne.x, (cropCorners.ne.y + cropCorners.se.y)/2, 'RIGHT');
    } else if (activeHandle === 'move') {
      ['nw', 'ne', 'se', 'sw'].forEach(k => { cropCorners[k].x = Math.max(0.5, Math.min(99.5, startCorners[k].x + dxPct)); cropCorners[k].y = Math.max(0.5, Math.min(99.5, startCorners[k].y + dyPct)); });
    }
    updateCropBoxUI();
  }, { passive: false });
  const endDrag = () => { activeHandle = null; if (document.getElementById('cropLoupe')) document.getElementById('cropLoupe').classList.add('hidden'); };
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
})();

function applyFreeCrop() {
  const targetImgEl = document.getElementById('cropTargetImg'); if (!targetImgEl || !targetImgEl.src) return;
  const img = new Image();
  img.onload = () => {
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const pNW = { x: (cropCorners.nw.x / 100) * sw, y: (cropCorners.nw.y / 100) * sh };
    const pNE = { x: (cropCorners.ne.x / 100) * sw, y: (cropCorners.ne.y / 100) * sh };
    const pSE = { x: (cropCorners.se.x / 100) * sw, y: (cropCorners.se.y / 100) * sh };
    const pSW = { x: (cropCorners.sw.x / 100) * sw, y: (cropCorners.sw.y / 100) * sh };
    const topW = Math.hypot(pNE.x - pNW.x, pNE.y - pNW.y), botW = Math.hypot(pSE.x - pSW.x, pSE.y - pSW.y), leftH = Math.hypot(pSW.x - pNW.x, pSW.y - pNW.y), rightH = Math.hypot(pSE.x - pNE.x, pSE.y - pNE.y);
    let outW = Math.max(80, Math.round((topW + botW) / 2)), outH = Math.max(80, Math.round((leftH + rightH) / 2));
    const maxOutSide = 2200; if (outW > maxOutSide || outH > maxOutSide) { if (outW > outH) { outH = Math.round(outH * (maxOutSide / outW)); outW = maxOutSide; } else { outW = Math.round(outW * (maxOutSide / outH)); outH = maxOutSide; } }
    const dstCanvas = document.createElement('canvas'); dstCanvas.width = outW; dstCanvas.height = outH;
    const dCtx = dstCanvas.getContext('2d', { willReadFrequently: true });
    const isAxisAlignedRect = Math.abs(cropCorners.nw.y - cropCorners.ne.y) < 0.3 && Math.abs(cropCorners.sw.y - cropCorners.se.y) < 0.3 && Math.abs(cropCorners.nw.x - cropCorners.sw.x) < 0.3 && Math.abs(cropCorners.ne.x - cropCorners.se.x) < 0.3;
    if (isAxisAlignedRect) {
      dCtx.imageSmoothingEnabled = true; dCtx.imageSmoothingQuality = 'high';
      dCtx.drawImage(img, pNW.x, pNW.y, Math.max(1, pNE.x - pNW.x), Math.max(1, pSW.y - pNW.y), 0, 0, outW, outH);
    } else {
      const srcCanvas = document.createElement('canvas'); srcCanvas.width = sw; srcCanvas.height = sh;
      const sCtx = srcCanvas.getContext('2d', { willReadFrequently: true }); sCtx.drawImage(img, 0, 0);
      const srcData = sCtx.getImageData(0, 0, sw, sh).data, dstImgData = dCtx.createImageData(outW, outH), dstData = dstImgData.data;
      for (let y = 0; y < outH; y++) {
        const v = y / (outH - 1 || 1), leftX = pNW.x + (pSW.x - pNW.x) * v, leftY = pNW.y + (pSW.y - pNW.y) * v, rightX = pNE.x + (pSE.x - pNE.x) * v, rightY = pNE.y + (pSE.y - pNE.y) * v;
        for (let x = 0; x < outW; x++) {
          const u = x / (outW - 1 || 1), fx = Math.min(sw - 1.001, Math.max(0, leftX + (rightX - leftX) * u)), fy = Math.min(sh - 1.001, Math.max(0, leftY + (rightY - leftY) * u));
          const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1), dx = fx - x0, dy = fy - y0;
          const w00 = (1 - dx) * (1 - dy), w10 = dx * (1 - dy), w01 = (1 - dx) * dy, w11 = dx * dy;
          const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4, dIdx = (y * outW + x) * 4;
          dstData[dIdx]     = srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
          dstData[dIdx + 1] = srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11;
          dstData[dIdx + 2] = srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11;
          dstData[dIdx + 3] = 255;
        }
      }
      dCtx.putImageData(dstImgData, 0, 0);
    }
    rawUploadDataUrl = dstCanvas.toDataURL('image/jpeg', 0.96); currentUploadDataUrl = rawUploadDataUrl;
    initFilterHistory({ sharpen: 0, deglare: 0, brightness: 100, contrast: 100 });
    document.getElementById('editPreviewImg').src = currentUploadDataUrl;
    closeCropperModal();
  };
  img.src = targetImgEl.src;
}

function applySharpenFilter(ctx, w, h, amount) {
  if (amount <= 0) return;
  const srcImg = ctx.getImageData(0, 0, w, h), src = srcImg.data, dstImg = ctx.createImageData(w, h), dst = dstImg.data, a = (amount / 100) * 0.65;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4, up = ((y - 1) * w + x) * 4, dn = ((y + 1) * w + x) * 4, lf = (y * w + (x - 1)) * 4, rt = (y * w + (x + 1)) * 4;
      for (let c = 0; c < 3; c++) {
        const center = src[idx + c], lap = center * 4 - src[up + c] - src[dn + c] - src[lf + c] - src[rt + c];
        dst[idx + c] = Math.max(0, Math.min(255, Math.round(center + lap * a)));
      }
      dst[idx + 3] = 255;
    }
  }
  ctx.putImageData(dstImg, 0, 0);
}

let filterDebounceTimer = null;
function applyImageFilterPreview() {
  if (!rawUploadDataUrl) return;
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => {
    const cfg = getCurrentFilterConfig(), { sharpen, deglare, brightness: b, contrast: c } = cfg;
    if (sharpen === 0 && deglare === 0 && b === 100 && c === 100) { currentUploadDataUrl = rawUploadDataUrl; document.getElementById('editPreviewImg').src = currentUploadDataUrl; return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.filter = `brightness(${b}\%) contrast(${c}%)`; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); ctx.filter = 'none';
      if (deglare > 0) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height), d = imgData.data, strength = deglare / 100;
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (lum > 175) {
            const pull = (lum - 175) * 0.52 * strength, factor = (lum - pull) / (lum || 1);
            d[i] = Math.max(0, Math.min(255, Math.round(d[i] * factor))); d[i + 1] = Math.max(0, Math.min(255, Math.round(d[i + 1] * factor))); d[i + 2] = Math.max(0, Math.min(255, Math.round(d[i + 2] * factor)));
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }
      if (sharpen > 0) applySharpenFilter(ctx, canvas.width, canvas.height, sharpen);
      currentUploadDataUrl = canvas.toDataURL('image/jpeg', 0.95); document.getElementById('editPreviewImg').src = currentUploadDataUrl;
    };
    img.src = rawUploadDataUrl;
  }, 45);
}

function openInspectModal(id) {
  const card = cards.find(c => c.id === id); if (!card) return;
  inspectingCardId = id; document.getElementById('inspectMemberTitle').textContent = card.member || '未命名';
  document.getElementById('inspectImg').src = card.image; document.getElementById('inspectBackDate').textContent = card.date || '';
  document.getElementById('inspectBackLocation').textContent = card.locationName ? `📍 ${card.locationName}` : '';
  document.getElementById('inspectBackNote').textContent = card.note || '（尚無背面筆記）'; document.getElementById('inspectBackMember').textContent = card.member || '';
  const backCard = document.getElementById('inspectBackCard'), bg = card.backColor || '#60A5FA';
  backCard.style.backgroundColor = bg; backCard.style.color = getContrastTextColor(bg);
  renderInspectAlbumBadges(card);
  const locBox = document.getElementById('inspectLocationBadgeBox');
  if (card.locationName || (typeof card.lat === 'number' && typeof card.lng === 'number')) {
    const query = (typeof card.lat === 'number' && typeof card.lng === 'number') ? `${card.lat},${card.lng}` : encodeURIComponent(card.locationName);
    locBox.innerHTML = `<a href="https://www.google.com/maps/search/?api=1&query=${query}" target="_blank" class="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-blue-500/80 text-white border border-blue-300 text-[11px] font-black">📍 ${card.locationName || '地圖'} (點此開啟)</a>`;
  } else locBox.innerHTML = '';
  document.getElementById('inspectFlipInner').classList.remove('rotate-y-180');
  document.getElementById('inspectFavBtn').style.opacity = card.fav ? '1' : '0.4';
  document.getElementById('inspectModal').classList.remove('hidden');
}

function renderInspectAlbumBadges(card) {
  const box = document.getElementById('inspectAlbumsBadges'); if (!box) return;
  box.innerHTML = getCardAlbums(card).map(a => `<span onclick="openQuickMoveAlbumsModal()" class="cursor-pointer px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/40 text-[11px] font-bold">📁 ${a}</span>`).join('');
}
function closeInspectModal() { document.getElementById('inspectModal').classList.add('hidden'); inspectingCardId = null; }
function toggleInspectFlip() { document.getElementById('inspectFlipInner').classList.toggle('rotate-y-180'); }
async function toggleInspectFav() {
  const card = cards.find(c => c.id === inspectingCardId); if (!card) return;
  card.fav = !card.fav; document.getElementById('inspectFavBtn').style.opacity = card.fav ? '1' : '0.4';
  await saveCardToDB(card); updateHeaderStats(); renderCurrentTab();
}
async function deleteInspectCard() {
  if (!confirm('確定刪除？')) return;
  await deleteCardFromDB(inspectingCardId); cards = cards.filter(c => c.id !== inspectingCardId);
  closeInspectModal(); updateHeaderStats(); renderCurrentTab();
}
function exportInspectImage() {
  const card = cards.find(c => c.id === inspectingCardId); if (!card) return;
  const a = document.createElement('a'); a.href = card.image; a.download = `${card.member \vert{}\vert{} 'cheki'}_${card.date || ''}.jpg`; a.click();
}

function renderEditAlbumPills() {
  const container = document.getElementById('editAlbumPillsContainer'); if (!container) return;
  container.innerHTML = '';
  albums.forEach(alb => {
    const active = editingSelectedAlbums.has(alb), btn = document.createElement('button');
    btn.type = 'button'; btn.className = `px-3 py-1 rounded-full text-xs font-black border-2 border-cheki-dark transition ${active ? 'bg-cheki-accent text-white' : 'bg-zinc-100 text-zinc-600'}`;
    btn.textContent = `${active ? '✓ ' : ''}${alb}`;
    btn.onclick = () => { if (editingSelectedAlbums.has(alb)) { if (editingSelectedAlbums.size > 1) editingSelectedAlbums.delete(alb); } else editingSelectedAlbums.add(alb); renderEditAlbumPills(); };
    container.appendChild(btn);
  });
}

function populateMemberSuggestions() {
  const sugBox = document.getElementById('quickMemberSuggestions'); if (!sugBox) return;
  const existingNames = [...new Set(['遠藤まりん', ...cards.map(c => (c.member || '').trim()).filter(Boolean)])];
  sugBox.innerHTML = existingNames.map(name => `<button type="button" onclick="document.getElementById('cardMemberInput').value='${name.replace(/'/g, "\\'")}'" class="px-2.5 py-0.5 rounded-full bg-pink-100 border border-pink-300 text-[11px] font-bold shrink-0">${name}</button>`).join('');
}

function openAddModal() {
  editingCardId = null; uncroppedOriginalDataUrl = ''; rawUploadDataUrl = ''; currentUploadDataUrl = '';
  editingSelectedAlbums = new Set([(selectedAlbumFilter !== 'ALL' && albums.includes(selectedAlbumFilter)) ? selectedAlbumFilter : (albums[0] || '預設相簿')]);
  renderEditAlbumPills(); populateMemberSuggestions(); renderQuickVenuePills();
  document.getElementById('modalTitle').textContent = '✨ 新增拍立得';
  document.getElementById('cardMemberInput').value = '遠藤まりん';
  document.getElementById('cardDateInput').value = new Date().toISOString().split('T')[0];
  document.getElementById('cardLocationInput').value = ''; clearEditLocationPin(); toggleEditMapPicker(false);
  document.getElementById('cardNoteInput').value = ''; initFilterHistory({ sharpen: 0, deglare: 0, brightness: 100, contrast: 100 });
  document.getElementById('previewContainer').classList.add('hidden'); selectBackColor('#60A5FA');
  document.getElementById('editCardModal').classList.remove('hidden');
}

function openEditFromInspect() {
  const card = cards.find(c => c.id === inspectingCardId); if (!card) return;
  editingCardId = card.id; rawUploadDataUrl = card.baseImage || card.image; uncroppedOriginalDataUrl = card.uncroppedImage || rawUploadDataUrl; currentUploadDataUrl = card.image;
  editingSelectedAlbums = new Set(getCardAlbums(card)); renderEditAlbumPills(); populateMemberSuggestions(); renderQuickVenuePills();
  document.getElementById('modalTitle').textContent = '✏️ 編輯拍立得與地點';
  document.getElementById('cardMemberInput').value = card.member || '';
  document.getElementById('cardDateInput').value = card.date || '';
  document.getElementById('cardLocationInput').value = card.locationName || '';
  if (typeof card.lat === 'number' && typeof card.lng === 'number') setEditLocationPin(card.lat, card.lng, true); else { clearEditLocationPin(); toggleEditMapPicker(false); }
  document.getElementById('cardNoteInput').value = card.note || '';
  initFilterHistory(card.filterConfig || { sharpen: 0, deglare: 0, brightness: 100, contrast: 100 });
  document.getElementById('editPreviewImg').src = card.image; document.getElementById('previewContainer').classList.remove('hidden');
  selectBackColor(card.backColor || '#60A5FA'); document.getElementById('editCardModal').classList.remove('hidden');
}
function closeEditModal() { document.getElementById('editCardModal').classList.add('hidden'); }

function selectBackColor(color, customLabel) {
  const upperColor = (color || '#60A5FA').toUpperCase(); selectedBackColor = upperColor;
  document.querySelectorAll('#backColorPicker button').forEach(btn => {
    const isMatch = (btn.dataset.color || '').toUpperCase() === upperColor;
    btn.style.transform = isMatch ? 'scale(1.22)' : 'scale(1)'; btn.style.boxShadow = isMatch ? '0 0 0 2.5px #FF5C8A' : 'none';
  });
  const customInput = document.getElementById('customBackColorInput');
  if (customInput && /^#[0-9A-F]{6}$/i.test(upperColor)) customInput.value = upperColor;
  const badge = document.getElementById('selectedColorNameBadge');
  if (badge) {
    const name = customLabel || BACK_COLOR_NAMES[upperColor] || `自訂 (${upperColor})`;
    badge.textContent = `🎨 ${name}`; badge.style.backgroundColor = upperColor; badge.style.color = getContrastTextColor(upperColor);
  }
}

function handlePhotoUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader(); reader.onload = (ev) => compressAndSetImage(ev.target.result, true); reader.readAsDataURL(file); e.target.value = '';
}

function compressAndSetImage(dataUrl, autoOpenCropper = false) {
  const img = new Image();
  img.onload = () => {
    const maxSide = 3200; let w = img.width, h = img.height;
    if (w > maxSide || h > maxSide) { if (w > h) { h = Math.round(h * (maxSide / w)); w = maxSide; } else { w = Math.round(w * (maxSide / h)); h = maxSide; } }
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
    const fullHighRes = canvas.toDataURL('image/jpeg', 0.96);
    uncroppedOriginalDataUrl = fullHighRes; rawUploadDataUrl = fullHighRes; currentUploadDataUrl = fullHighRes;
    initFilterHistory({ sharpen: 0, deglare: 0, brightness: 100, contrast: 100 });
    document.getElementById('editPreviewImg').src = currentUploadDataUrl; document.getElementById('previewContainer').classList.remove('hidden');
    if (autoOpenCropper) openCropperModal();
  };
  img.src = dataUrl;
}

function rotateUploadImage(deg) {
  if (!rawUploadDataUrl) return;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas'); canvas.width = img.height; canvas.height = img.width;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate((deg * Math.PI) / 180); ctx.drawImage(img, -img.width / 2, -img.height / 2);
    rawUploadDataUrl = canvas.toDataURL('image/jpeg', 0.96); uncroppedOriginalDataUrl = rawUploadDataUrl; currentUploadDataUrl = rawUploadDataUrl;
    document.getElementById('editPreviewImg').src = currentUploadDataUrl; applyImageFilterPreview();
  };
  img.src = rawUploadDataUrl;
}

function checkImageIsLandscape(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image(); img.onload = () => resolve(img.naturalWidth > img.naturalHeight * 1.05); img.onerror = () => resolve(false); img.src = dataUrl;
  });
}

async function saveCard() {
  if (!currentUploadDataUrl) { alert('請先拍攝或選擇一張相片！'); return; }
  const member = document.getElementById('cardMemberInput').value.trim() || '遠藤まりん', date = document.getElementById('cardDateInput').value, locationName = document.getElementById('cardLocationInput').value.trim(), chosenAlbums = [...editingSelectedAlbums], note = document.getElementById('cardNoteInput').value;
  const isLandscape = await checkImageIsLandscape(currentUploadDataUrl), filterConfig = getCurrentFilterConfig();
  if (locationName && typeof editingLat !== 'number') {
    const match = PRESET_VENUES.find(v => v.name.toLowerCase().includes(locationName.toLowerCase()));
    if (match) { editingLat = match.lat; editingLng = match.lng; }
  }
  if (editingCardId) {
    const idx = cards.findIndex(c => c.id === editingCardId);
    if (idx > -1) {
      cards[idx] = { ...cards[idx], member, date, note, locationName, lat: editingLat, lng: editingLng, image: currentUploadDataUrl, baseImage: rawUploadDataUrl || currentUploadDataUrl, filterConfig, isLandscape, backColor: selectedBackColor };
      setCardAlbums(cards[idx], chosenAlbums); await saveCardToDB(cards[idx]);
    }
  } else {
    const defaultScale = (deskBgConfig.defaultCardScale || 100) / 100;
    const newCard = { id: Date.now(), createdAt: Date.now(), member, date, note, locationName, lat: editingLat, lng: editingLng, image: currentUploadDataUrl, baseImage: rawUploadDataUrl || currentUploadDataUrl, filterConfig, isLandscape, backColor: selectedBackColor, fav: false, deskX: 30 + (cards.length * 35) % 160, deskY: 30 + (cards.length * 45) % 180, deskRot: (cards.length % 2 === 0 ? 1 : -1) * 6, deskScale: defaultScale, deskZ: cards.length + 1, deskFlipped: false };
    setCardAlbums(newCard, chosenAlbums); cards.unshift(newCard); await saveCardToDB(newCard);
  }
  closeEditModal(); updateHeaderStats(); renderSearchQuickTags(); renderCurrentTab();
}

function openBackupModal() { updateHeaderStats(); document.getElementById('backupModal').classList.remove('hidden'); }
function closeBackupModal() { document.getElementById('backupModal').classList.add('hidden'); }
function exportAllData() {
  const data = JSON.stringify({ cards, albums, deskBgConfig, exportedAt: new Date().toISOString() });
  const blob = new Blob([data], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `ChekiPocket_Backup_${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importAllData(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result), importedCards = Array.isArray(parsed) ? parsed : (parsed.cards || parsed.chekis || []), importedAlbums = Array.isArray(parsed.albums) ? parsed.albums : [];
      if (parsed.deskBgConfig && typeof parsed.deskBgConfig === 'object') { deskBgConfig = { ...deskBgConfig, ...parsed.deskBgConfig }; await saveDeskBgConfigToDB(); }
      for (const alb of importedAlbums) { if (alb && !albums.includes(alb)) albums.push(alb); }
      let count = 0;
      for (const raw of importedCards) {
        const rawAlbs = Array.isArray(raw.albums) && raw.albums.length > 0 ? raw.albums : [raw.album || albums[0] || '預設相簿'];
        const imgStr = raw.image || raw.img || raw.dataUrl || '';
        const normalized = {
          id: raw.id || (Date.now() + Math.floor(Math.random() * 100000)), createdAt: raw.createdAt || Date.now(),
          member: raw.member || raw.idol || raw.name || '遠藤まりん', date: raw.date || new Date().toISOString().split('T')[0],
          locationName: raw.locationName || raw.location || '', lat: typeof raw.lat === 'number' ? raw.lat : null, lng: typeof raw.lng === 'number' ? raw.lng : null,
          note: raw.note || raw.memo || '', image: imgStr, baseImage: raw.baseImage || imgStr, filterConfig: raw.filterConfig || { sharpen: 0, deglare: 0, brightness: 100, contrast: 100 },
          isLandscape: Boolean(raw.isLandscape), backColor: raw.backColor || '#60A5FA', fav: Boolean(raw.fav || raw.favorite),
          deskX: typeof raw.deskX === 'number' ? raw.deskX : 45 + (count * 35) % 150, deskY: typeof raw.deskY === 'number' ? raw.deskY : 45 + (count * 45) % 170,
          deskRot: typeof raw.deskRot === 'number' ? raw.deskRot : 5, deskScale: raw.deskScale || 1, deskZ: raw.deskZ || (count + 1), deskFlipped: Boolean(raw.deskFlipped)
        };
        setCardAlbums(normalized, rawAlbs); getCardAlbums(normalized).forEach(a => { if (a && !albums.includes(a)) albums.push(a); });
        if (normalized.image) { await saveCardToDB(normalized); count++; }
      }
      await saveAlbumsToDB(); await loadDataFromDB(); closeBackupModal(); e.target.value = ''; alert(`✅ 成功還原 ${count} 張！`);
    } catch (_) { alert('❌ 備份檔格式不正確！'); }
  };
  reader.readAsText(file);
}

window.addEventListener('DOMContentLoaded', () => { initDB(); });
