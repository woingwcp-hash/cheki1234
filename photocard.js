// ============================================================================
// 🃏 ChekiPocket - Photocard Dex v2.0 (Clean Refactored Edition)
// [A 段]：核心資料庫、原生防破版樣式、圖鑑主介面、3D 閃卡檢視、系列與單卡編輯器
// ============================================================================
window.PCApp = {
  db: null,

  CARD_RATIOS: {
    '63x88':  { label: '🃏 日系 63×88', css: '63 / 88',  w: 630, h: 880, preW: 315, preH: 440 },
    '55x85':  { label: '💳 韓系 55×85', css: '55 / 85',  w: 550, h: 850, preW: 330, preH: 510 },
    '89x127': { label: '🖼️ 生寫 89×127', css: '89 / 127', w: 560, h: 800, preW: 315, preH: 450 }
  },

  state: {
    mode: 'cheki', // 'cheki' | 'pc'
    seriesList: [],
    activeSeriesId: localStorage.getItem('pc_active_series_id') || '',
    filter: 'ALL', // 'ALL' | 'OWNED' | 'MISSING' | 'TRADE'
    justUnlockedIdx: -1,
    autoFlipSlotOnce: -1
  },

  // --------------------------------------------------------------------------
  // 通用工具函式
  // --------------------------------------------------------------------------
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  safeFileName(str) {
    return String(str || 'Photocard').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 48);
  },

  getSeriesRatioKey(s) {
    const k = s?.cardRatio;
    return (k && this.CARD_RATIOS[k]) ? k : '63x88';
  },

  getSeriesRatioSpec(s) {
    return this.CARD_RATIOS[this.getSeriesRatioKey(s)] || this.CARD_RATIOS['63x88'];
  },

  getSlotCssRadius(radiusPct, seriesObj) {
    const r = typeof radiusPct === 'number' ? Math.max(0, Math.min(15, radiusPct)) : 6;
    if (r === 0) return '0px';
    const spec = this.getSeriesRatioSpec(seriesObj);
    return `${r}% / ${(r * (spec.w / spec.h)).toFixed(2)}%`;
  },

  pcRoundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  },

  loadImgAsync(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
  },

  triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 20000);
  },

  async dataUrlToPngBlob(dataUrl) {
    const im = await this.loadImgAsync(dataUrl);
    if (!im) return null;
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    c.getContext('2d').drawImage(im, 0, 0);
    return new Promise(res => c.toBlob(res, 'image/png'));
  },

  // --------------------------------------------------------------------------
  // IndexedDB 讀寫層（與 v1 100% 兼容）
  // --------------------------------------------------------------------------
  initDB() {
    return new Promise((resolve) => {
      const req = indexedDB.open('ChekiPocket_PhotocardDB', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('series')) db.createObjectStore('series', { keyPath: 'id' });
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = () => resolve();
    });
  },

  async loadSeriesList() {
    if (!this.db) await this.initDB();
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db.transaction('series', 'readonly');
      const req = tx.objectStore('series').getAll();
      req.onsuccess = () => {
        this.state.seriesList = (req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (!this.state.seriesList.some(s => s.id === this.state.activeSeriesId)) {
          this.state.activeSeriesId = this.state.seriesList[0]?.id || '';
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  },

  async saveSeries(seriesObj) {
    if (!this.db) await this.initDB();
    const idx = this.state.seriesList.findIndex(s => s.id === seriesObj.id);
    if (idx >= 0) this.state.seriesList[idx] = seriesObj;
    else this.state.seriesList.unshift(seriesObj);
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db.transaction('series', 'readwrite');
      tx.objectStore('series').put(seriesObj);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },

  async deleteActiveSeries() {
    const s = this.getActiveSeries();
    if (!s || !confirm(`確定要刪除「${s.title}」整套小卡圖鑑嗎？`)) return;
    this.state.seriesList = this.state.seriesList.filter(x => x.id !== s.id);
    this.state.activeSeriesId = this.state.seriesList[0]?.id || '';
    localStorage.setItem('pc_active_series_id', this.state.activeSeriesId);
    if (this.db) {
      await new Promise(res => {
        const tx = this.db.transaction('series', 'readwrite');
        tx.objectStore('series').delete(s.id);
        tx.oncomplete = res; tx.onerror = res;
      });
    }
    this.renderDex();
  },

  getActiveSeries() {
    return this.state.seriesList.find(s => s.id === this.state.activeSeriesId) || null;
  },

  // --------------------------------------------------------------------------
  // 統一樣式與基礎視窗掛載（只執行一次）
  // --------------------------------------------------------------------------
  mountCoreUI() {
    if (document.getElementById('pcDexCleanStyle')) return;

    const st = document.createElement('style');
    st.id = 'pcDexCleanStyle';
    st.textContent = `
      html, body { max-width: 100vw; overflow-x: hidden; }
      #pcDexRoot {
        width: 100%; max-width: min(100vw, 28rem);
        box-sizing: border-box; overflow-x: hidden;
        padding-left: 10px; padding-right: 10px;
      }
      #pcDexRoot > *, #pcDexRoot .neo-box { width: 100%; max-width: 100%; box-sizing: border-box; }
      #pcDexRoot select.pc-series-select { width: 0; flex: 1 1 0%; min-width: 0; max-width: 100%; text-overflow: ellipsis; }

      @keyframes pcUnlockFlash {
        0% { transform: scale(0.88); filter: brightness(2.5) saturate(1.8); }
        60% { transform: scale(1.04); filter: brightness(1.25); }
        100% { transform: scale(1); filter: brightness(1); }
      }
      .pc-unlock-anim { animation: pcUnlockFlash 0.55s cubic-bezier(0.22, 1, 0.36, 1); }
      .pc-holo-border { background: linear-gradient(135deg, #38bdf8, #f472b6, #facc15, #4ade80); padding: 2.5px; }
      .pc-sign-border { background: linear-gradient(135deg, #fde047, #f59e0b, #fef08a, #d97706); padding: 2.5px; }

      .pc-3d-wrap { perspective: 950px; touch-action: none; user-select: none; }
      .pc-3d-card { transform-style: preserve-3d; transition: transform 0.32s cubic-bezier(0.22,1,0.36,1); will-change: transform; }
      .pc-3d-card.is-tilting { transition: none; }
      .pc-3d-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
      .pc-3d-front { transform: rotateY(0deg) translateZ(1px); }
      .pc-3d-back  { transform: rotateY(180deg) translateZ(1px); }
      .pc-holo-glare {
        position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
        background: radial-gradient(circle at var(--px, 50%) var(--py, 50%), rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 62%);
        mix-blend-mode: overlay; opacity: 0.45;
      }
      .pc-holo-foil {
        position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
        background: linear-gradient(115deg, transparent 15%, rgba(56,189,248,0.42) 32%, rgba(244,114,182,0.45) 50%, rgba(250,204,21,0.42) 68%, transparent 85%);
        background-size: 220% 220%; background-position: var(--px, 50%) var(--py, 50%);
        mix-blend-mode: color-dodge; opacity: 0.55;
      }
      .pc-sign-foil {
        position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
        background: linear-gradient(125deg, transparent 18%, rgba(253,224,71,0.52) 45%, rgba(255,255,255,0.65) 52%, rgba(245,158,11,0.48) 62%, transparent 82%);
        background-size: 230% 230%; background-position: var(--px, 50%) var(--py, 50%);
        mix-blend-mode: color-dodge; opacity: 0.65;
      }

      @media (max-width: 480px) {
        header button#topPcModeSwitchBtn { height: 32px !important; padding: 0 8px !important; font-size: 11px !important; border-radius: 12px !important; }
        header button#topSearchBtn, header button#topMoreToolsBtn { width: 32px !important; height: 32px !important; border-radius: 12px !important; font-size: 14px !important; }
        header .shrink-0.gap-1\\.5 { gap: 4px !important; }
      }
    `;
    document.head.appendChild(st);

    const mainEl = document.querySelector('main');
    if (mainEl && !document.getElementById('pcDexRoot')) {
      const root = document.createElement('div');
      root.id = 'pcDexRoot';
      root.className = 'hidden mx-auto pt-2.5 pb-28 space-y-3';
      mainEl.parentElement.insertBefore(root, mainEl);
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <!-- 建立新系列視窗 -->
      <div id="pcCreateModal" class="hidden fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-3">
        <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-4 space-y-3 text-zinc-900 max-h-[90vh] overflow-y-auto">
          <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
            <h3 class="font-black text-base">🃏 建立新小卡圖鑑系列</h3>
            <button type="button" onclick="PCApp.closeCreateModal()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm">✕</button>
          </div>
          <div class="space-y-2.5 text-xs">
            <div>
              <label class="font-black block mb-1">✨ 系列名稱</label>
              <input id="pcNewTitle" type="text" placeholder="例：MORE STAR 2026 和服小卡" class="w-full px-3 py-2 rounded-xl border-2 border-cheki-dark font-bold bg-white">
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="font-black block mb-1">👥 成員組數</label>
                <input id="pcNewGroups" type="number" min="1" max="60" value="9" class="w-full px-2.5 py-2 rounded-xl border-2 border-cheki-dark font-black bg-white">
              </div>
              <div>
                <label class="font-black block mb-1">🎴 每排款數</label>
                <input id="pcNewCols" type="number" min="1" max="6" value="3" class="w-full px-2.5 py-2 rounded-xl border-2 border-cheki-dark font-black bg-white">
              </div>
              <div>
                <label class="font-black block mb-1">📏 卡片比例</label>
                <select id="pcNewRatio" class="w-full px-2 py-2 rounded-xl border-2 border-cheki-dark font-black bg-white">
                  <option value="63x88">日系 63×88</option>
                  <option value="55x85">韓系 55×85</option>
                  <option value="89x127">生寫 89×127</option>
                </select>
              </div>
            </div>
            <div>
              <label class="font-black block mb-1">👑 成員名單（選填，用逗號或換行分隔）</label>
              <textarea id="pcNewMembers" rows="3" placeholder="例：遠藤まりん, 成員B, 成員C...（留空可之後改）" class="w-full px-3 py-2 rounded-xl border-2 border-cheki-dark font-bold bg-white"></textarea>
            </div>
          </div>
          <button type="button" onclick="PCApp.confirmCreateSeries()" class="w-full py-3 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs active:scale-95">🚀 建立圖鑑格</button>
        </div>
      </div>

      <!-- 編輯系列設定視窗 -->
      <div id="pcEditSeriesModal" class="hidden fixed inset-0 z-[139] bg-black/82 flex items-center justify-center p-3 overflow-y-auto">
        <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-4 space-y-3 text-zinc-900 max-h-[92vh] overflow-y-auto">
          <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
            <div>
              <h3 class="font-black text-base leading-tight">✏️ 編輯小卡系列設定</h3>
              <p class="text-[10px] font-bold text-zinc-500">修改標題、卡片尺寸比例、成員名單或增減卡格</p>
            </div>
            <button type="button" onclick="PCApp.closeEditSeriesModal()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm shrink-0">✕</button>
          </div>
          <div class="space-y-2.5 text-xs">
            <div>
              <label class="font-black block mb-1">✨ 系列名稱</label>
              <input id="pcEditSeriesTitle" type="text" class="w-full px-3 py-2 rounded-xl border-2 border-cheki-dark font-bold bg-white">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="font-black block mb-1">📏 小卡比例</label>
                <select id="pcEditSeriesRatio" class="w-full px-2.5 py-2 rounded-xl border-2 border-cheki-dark font-black bg-white">
                  <option value="63x88">🃏 日系 63×88</option>
                  <option value="55x85">💳 韓系 55×85</option>
                  <option value="89x127">🖼️ 生寫 89×127</option>
                </select>
              </div>
              <div>
                <label class="font-black block mb-1">🎴 每排款式數</label>
                <input id="pcEditSeriesCols" type="number" min="1" max="6" class="w-full px-3 py-2 rounded-xl border-2 border-cheki-dark font-black bg-white">
              </div>
            </div>
            <div>
              <label class="font-black block mb-1">👑 各橫排成員名單（每行一位）</label>
              <textarea id="pcEditSeriesMembers" rows="5" class="w-full px-3 py-2 rounded-xl border-2 border-cheki-dark font-bold bg-white leading-relaxed"></textarea>
            </div>
            <div class="rounded-2xl border-2 border-cheki-dark bg-sky-50/70 p-2.5 space-y-2">
              <span class="font-black text-[11px] block">🧩 增減卡格（目前共 <strong id="pcEditSeriesSlotCount" class="text-indigo-700">0</strong> 格）</span>
              <div class="grid grid-cols-2 gap-1.5">
                <button type="button" onclick="PCApp.editSeriesModifySlots('addRow')" class="py-1.5 rounded-xl bg-emerald-200 border-2 border-cheki-dark font-black text-[11px] active:scale-95">＋ 新增一整排</button>
                <button type="button" onclick="PCApp.editSeriesModifySlots('addOne')" class="py-1.5 rounded-xl bg-white border-2 border-cheki-dark font-black text-[11px] active:scale-95">＋ 尾部加 1 格</button>
                <button type="button" onclick="PCApp.editSeriesModifySlots('remOne')" class="py-1.5 rounded-xl bg-amber-100 border-2 border-cheki-dark font-black text-[11px] active:scale-95">－ 刪除尾部 1 格</button>
                <button type="button" onclick="PCApp.editSeriesModifySlots('remRow')" class="py-1.5 rounded-xl bg-rose-100 border-2 border-cheki-dark font-black text-[11px] text-rose-800 active:scale-95">－ 刪除最後一排</button>
              </div>
            </div>
          </div>
          <button type="button" onclick="PCApp.saveEditSeriesModal()" class="w-full py-3 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs active:scale-95">💾 儲存系列變更</button>
        </div>
      </div>

      <!-- 單張小卡 3D 檢視與編輯視窗 -->
      <div id="pcSlotModal" class="hidden fixed inset-0 z-[132] bg-black/85 flex items-center justify-center p-3 overflow-y-auto">
        <div id="pcSlotModalBody" class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-4 space-y-3 text-zinc-900 max-h-[92vh] overflow-y-auto"></div>
      </div>
    `;
    document.body.appendChild(wrap);
  },

  mountHeaderSwitchBtn() {
    const searchBtn = document.getElementById('topSearchBtn') || document.querySelector('header button');
    const rightBox = searchBtn?.parentElement;
    if (!rightBox || document.getElementById('topPcModeSwitchBtn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'topPcModeSwitchBtn';
    btn.onclick = () => this.toggleMode();
    btn.className = 'px-2.5 h-9 rounded-2xl bg-gradient-to-r from-indigo-500 to-pink-500 text-white neo-btn font-black text-[11px] flex items-center gap-1 shrink-0 active:scale-95 transition';
    btn.innerHTML = '🃏 小卡';
    rightBox.insertBefore(btn, rightBox.firstElementChild);

    const origSwitch = window.switchTab;
    if (typeof origSwitch === 'function' && !origSwitch._wrappedPcSwitch) {
      window.switchTab = (...args) => {
        if (this.state.mode === 'pc') this.toggleMode('cheki');
        return origSwitch.apply(window, args);
      };
      window.switchTab._wrappedPcSwitch = true;
    }
  },

  toggleMode(forceMode) {
    this.state.mode = forceMode || (this.state.mode === 'cheki' ? 'pc' : 'cheki');
    const isPc = this.state.mode === 'pc';
    const mainEl = document.querySelector('main');
    const pcRoot = document.getElementById('pcDexRoot');
    const topBtn = document.getElementById('topPcModeSwitchBtn');
    const floatNav = document.getElementById('floatingBinderNavWrap');
    const batchDock = document.getElementById('binderBatchFloatingDock');

    if (mainEl) mainEl.classList.toggle('hidden', isPc);
    if (pcRoot) pcRoot.classList.toggle('hidden', !isPc);
    if (floatNav) floatNav.style.display = isPc ? 'none' : '';
    if (batchDock && isPc) batchDock.classList.add('hidden');

    if (topBtn) {
      topBtn.innerHTML = isPc ? '📸 拍立得' : '🃏 小卡';
      topBtn.className = isPc
        ? 'px-2.5 h-9 rounded-2xl bg-amber-300 text-zinc-950 neo-btn font-black text-[11px] flex items-center gap-1 shrink-0 active:scale-95 transition'
        : 'px-2.5 h-9 rounded-2xl bg-gradient-to-r from-indigo-500 to-pink-500 text-white neo-btn font-black text-[11px] flex items-center gap-1 shrink-0 active:scale-95 transition';
    }
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic(10);
    if (isPc) this.renderDex();
  },

  // --------------------------------------------------------------------------
  // 系列建立與設定編輯
  // --------------------------------------------------------------------------
  openCreateModal() { document.getElementById('pcCreateModal')?.classList.remove('hidden'); },
  closeCreateModal() { document.getElementById('pcCreateModal')?.classList.add('hidden'); },

  async confirmCreateSeries() {
    const title = (document.getElementById('pcNewTitle')?.value || '').trim() || '全新小卡系列';
    const cols = Math.max(1, Math.min(6, Number(document.getElementById('pcNewCols')?.value) || 3));
    const cardRatio = document.getElementById('pcNewRatio')?.value || '63x88';
    const rawMembers = (document.getElementById('pcNewMembers')?.value || '').split(/[,，\n]+/).map(s => s.trim()).filter(Boolean);
    const groups = rawMembers.length > 0 ? rawMembers.length : Math.max(1, Math.min(60, Number(document.getElementById('pcNewGroups')?.value) || 9));

    const variants = ['A', 'B', 'C', 'D', 'E', 'F'];
    const slots = [];
    for (let g = 0; g < groups; g++) {
      const mName = rawMembers[g] || `成員 ${g + 1}`;
      for (let c = 0; c < cols; c++) {
        slots.push({
          idx: slots.length + 1, groupIdx: g, member: mName,
          variant: variants[c] || String(c + 1),
          sampleImg: '', realImg: '', realBackImg: '',
          qty: 0, wish: false, rarity: 'N', note: ''
        });
      }
    }

    const newSeries = { id: 'pcs_' + Date.now(), title, groupCols: cols, cardRatio, backImage: '', createdAt: Date.now(), slots };
    await this.saveSeries(newSeries);
    this.state.activeSeriesId = newSeries.id;
    localStorage.setItem('pc_active_series_id', newSeries.id);
    this.closeCreateModal();
    this.renderDex();
    if (typeof window.showChekiToast === 'function') window.showChekiToast(`🃏 已建立「${title}」（共 ${slots.length} 格）！`);
  },

  openEditSeriesModal() {
    const s = this.getActiveSeries();
    if (!s) return;
    const cols = s.groupCols || 3;
    const groupNames = [];
    const seen = new Set();
    s.slots.forEach(sl => {
      const g = sl.groupIdx ?? Math.floor((sl.idx - 1) / cols);
      if (!seen.has(g)) { seen.add(g); groupNames.push(sl.member || `成員 ${g + 1}`); }
    });

    document.getElementById('pcEditSeriesTitle').value = s.title || '';
    document.getElementById('pcEditSeriesRatio').value = this.getSeriesRatioKey(s);
    document.getElementById('pcEditSeriesCols').value = String(cols);
    document.getElementById('pcEditSeriesMembers').value = groupNames.join('\n');
    document.getElementById('pcEditSeriesSlotCount').textContent = String(s.slots.length);
    document.getElementById('pcEditSeriesModal')?.classList.remove('hidden');
  },

  closeEditSeriesModal() { document.getElementById('pcEditSeriesModal')?.classList.add('hidden'); },

  async editSeriesModifySlots(action) {
    const s = this.getActiveSeries();
    if (!s) return;
    const cols = Math.max(1, Math.min(6, Number(document.getElementById('pcEditSeriesCols')?.value) || s.groupCols || 3));
    const variants = ['A', 'B', 'C', 'D', 'E', 'F'];

    if (action === 'addRow' || action === 'addOne') {
      const addCount = action === 'addRow' ? cols : 1;
      const nextGroup = Math.floor(s.slots.length / cols);
      for (let k = 0; k < addCount; k++) {
        const newIdx = s.slots.length + 1;
        const gIdx = Math.floor((newIdx - 1) / cols);
        const posInRow = (newIdx - 1) % cols;
        const existingRowSlot = s.slots.find(x => (x.groupIdx ?? Math.floor((x.idx - 1) / cols)) === gIdx);
        s.slots.push({
          idx: newIdx, groupIdx: gIdx, member: existingRowSlot?.member || `成員 ${nextGroup + 1}`,
          variant: variants[posInRow] || String(posInRow + 1),
          sampleImg: '', realImg: '', realBackImg: '', qty: 0, wish: false, rarity: 'N', note: ''
        });
      }
    } else {
      const remCount = action === 'remRow' ? Math.min(cols, Math.max(0, s.slots.length - 1)) : (s.slots.length > 1 ? 1 : 0);
      if (remCount === 0) return alert('系列至少需保留 1 個卡格！');
      const tail = s.slots.slice(-remCount);
      if (tail.some(x => x.realImg || x.qty > 0) && !confirm(`最後 ${remCount} 格包含已掃描或點亮的真卡，確定刪除嗎？`)) return;
      s.slots.splice(s.slots.length - remCount, remCount);
    }
    await this.saveSeries(s);
    this.openEditSeriesModal();
    this.renderDex();
  },

  async saveEditSeriesModal() {
    const s = this.getActiveSeries();
    if (!s) return;
    const nextTitle = (document.getElementById('pcEditSeriesTitle')?.value || '').trim();
    const nextRatio = document.getElementById('pcEditSeriesRatio')?.value || '63x88';
    const nextCols = Math.max(1, Math.min(6, Number(document.getElementById('pcEditSeriesCols')?.value) || s.groupCols || 3));
    const memberLines = (document.getElementById('pcEditSeriesMembers')?.value || '').split(/\r?\n/).map(x => x.trim());

    if (nextTitle) s.title = nextTitle;
    s.cardRatio = nextRatio;
    s.groupCols = nextCols;
    s.slots.forEach((sl, i) => {
      sl.idx = i + 1;
      sl.groupIdx = Math.floor(i / nextCols);
      if (memberLines[sl.groupIdx]) sl.member = memberLines[sl.groupIdx];
    });

    await this.saveSeries(s);
    this.closeEditSeriesModal();
    this.renderDex();
    if (typeof window.showChekiToast === 'function') window.showChekiToast('✅ 已更新系列設定！');
  },

  selectSeries(id) {
    this.state.activeSeriesId = id;
    localStorage.setItem('pc_active_series_id', id);
    this.renderDex();
  },

  setFilter(f) { this.state.filter = f; this.renderDex(); },

  async renameGroupMember(groupIdx) {
    const s = this.getActiveSeries();
    if (!s) return;
    const sampleSlot = s.slots.find(x => x.groupIdx === groupIdx);
    const nextName = prompt('輸入此橫排成員名稱：', sampleSlot?.member || '');
    if (nextName === null) return;
    s.slots.forEach(x => { if (x.groupIdx === groupIdx) x.member = nextName.trim() || `成員 ${groupIdx + 1}`; });
    await this.saveSeries(s);
    this.renderDex();
  },

  // --------------------------------------------------------------------------
  // 主圖鑑與卡格原生單次渲染（零後置覆蓋）
  // --------------------------------------------------------------------------
  renderDex() {
    const root = document.getElementById('pcDexRoot');
    if (!root) return;

    // 緊湊化頂部倒數按鈕以保護左上角標題
    document.querySelectorAll('header button').forEach(b => {
      if ((b.textContent || '').includes('⏳')) {
        b.style.height = '32px'; b.style.paddingLeft = '7px'; b.style.paddingRight = '7px'; b.style.fontSize = '11px';
      }
    });

    const s = this.getActiveSeries();
    if (!s) {
      root.innerHTML = `
        <div class="neo-box bg-white rounded-3xl p-6 text-center space-y-3">
          <div class="text-4xl">🃏</div>
          <h2 class="font-black text-base text-zinc-900">小卡收集圖鑑 (Photocard Dex)</h2>
          <p class="text-xs font-bold text-zinc-500">支援官方預覽圖一鍵切格墊底，再掃描實物真卡點亮覆蓋 ✨</p>
          <button type="button" onclick="PCApp.openCreateModal()" class="px-5 py-3 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs">＋ 建立第一套小卡圖鑑</button>
        </div>
      `;
      return;
    }

    const total = s.slots.length || 1;
    const owned = s.slots.filter(x => x.qty > 0).length;
    const realScanned = s.slots.filter(x => Boolean(x.realImg)).length;
    const pct = Math.round((owned / total) * 100);
    const cols = s.groupCols || 3;

    const groupMap = new Map();
    s.slots.forEach(sl => {
      const g = sl.groupIdx ?? Math.floor((sl.idx - 1) / cols);
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g).push(sl);
    });
    let compGroups = 0;
    groupMap.forEach(arr => { if (arr.every(x => x.qty > 0)) compGroups++; });

    root.innerHTML = `
      <div class="neo-box bg-gradient-to-br from-indigo-50 via-white to-pink-50 rounded-2xl p-3 space-y-2.5">
        <div class="flex items-center gap-1.5 w-full min-w-0">
          <select onchange="PCApp.selectSeries(this.value)" class="pc-series-select px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark bg-white font-black text-xs text-zinc-900">
            ${this.state.seriesList.map(it => `<option value="${it.id}" ${it.id === s.id ? 'selected' : ''}>🃏 ${this.esc(it.title)} (${it.slots.filter(x => x.qty > 0).length}/${it.slots.length})</option>`).join('')}
          </select>
          <button type="button" onclick="PCApp.openCreateModal()" class="px-2.5 py-1.5 rounded-xl bg-cheki-accent text-white neo-btn font-black text-xs shrink-0 active:scale-95">＋新系列</button>
          <button type="button" onclick="PCApp.openEditSeriesModal()" class="px-2 py-1.5 rounded-xl bg-amber-100 border-2 border-cheki-dark font-black text-xs text-zinc-900 shrink-0 active:scale-95" title="編輯系列">✏️</button>
          <button type="button" onclick="PCApp.deleteActiveSeries()" class="px-2 py-1.5 rounded-xl bg-zinc-100 border-2 border-cheki-dark font-black text-xs text-rose-600 shrink-0 active:scale-95" title="刪除系列">🗑️</button>
        </div>

        <div class="w-full space-y-1.5">
          <div class="grid grid-cols-2 gap-1.5 w-full">
            <button type="button" onclick="PCApp.openSlicerModal()" class="py-1.5 px-2 rounded-xl bg-sky-200 hover:bg-sky-300 neo-btn font-black text-[11px] text-zinc-900 truncate active:scale-95">✂️ 預覽圖切格墊底</button>
            <button type="button" onclick="PCApp.triggerSeriesBackUpload()" class="py-1.5 px-2 rounded-xl ${s.backImage ? 'bg-emerald-200' : 'bg-amber-200'} neo-btn font-black text-[11px] text-zinc-900 truncate active:scale-95">${s.backImage ? '✅ 更換共用卡背' : '🎴 設定共用卡背'}</button>
          </div>
          <div class="grid grid-cols-3 gap-1.5 w-full">
            <button type="button" onclick="PCApp.openDownloadCenter()" class="py-1.5 px-1.5 rounded-xl bg-indigo-200 hover:bg-indigo-300 neo-btn font-black text-[11px] text-zinc-900 truncate active:scale-95">⬇️ 下載圖鑑</button>
            <button type="button" onclick="PCApp.openTradeSheetModal()" class="py-1.5 px-1.5 rounded-xl bg-pink-200 hover:bg-pink-300 neo-btn font-black text-[11px] text-zinc-900 truncate active:scale-95">🔁 譲/求換卡</button>
            <button type="button" onclick="PCApp.openPcBackupModal()" class="py-1.5 px-1.5 rounded-xl bg-white hover:bg-zinc-100 neo-btn font-black text-[11px] text-zinc-900 truncate active:scale-95">💾 備份同步</button>
          </div>
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between gap-1 text-[10.5px] font-black text-zinc-800">
            <span class="truncate min-w-0">✨ 已點亮 ${owned}/${s.slots.length} (${pct}%) · 📸 真卡 ${realScanned} 張</span>
            <span class="text-amber-600 shrink-0 whitespace-nowrap">👑 齊套 ${compGroups}/${groupMap.size} 組</span>
          </div>
          <div class="w-full h-2.5 rounded-full bg-white border-2 border-cheki-dark overflow-hidden">
            <div class="h-full bg-gradient-to-r from-indigo-500 via-pink-500 to-amber-400 transition-all duration-300" style="width:${pct}%"></div>
          </div>
        </div>

        <div class="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
          ${[['ALL', '🗂️ 全部'], ['OWNED', '✨ 已擁有'], ['MISSING', '🔒 未點亮'], ['TRADE', '🔁 複數/求換']].map(([k, lab]) => `
            <button type="button" onclick="PCApp.setFilter('${k}')" class="px-2.5 py-1 rounded-full border-2 border-cheki-dark text-[10px] font-black shrink-0 ${this.state.filter === k ? 'bg-indigo-600 text-white' : 'bg-white text-zinc-700'}">${lab}</button>
          `).join('')}
        </div>
      </div>

      <div class="space-y-2.5">
        ${[...groupMap.entries()].map(([gIdx, arr]) => {
          const visibleArr = arr.filter(x => {
            if (this.state.filter === 'OWNED') return x.qty > 0;
            if (this.state.filter === 'MISSING') return x.qty === 0;
            if (this.state.filter === 'TRADE') return x.qty > 1 || x.wish;
            return true;
          });
          if (visibleArr.length === 0) return '';
          const isComp = arr.every(x => x.qty > 0);
          return `
            <div class="neo-box rounded-2xl p-2.5 space-y-2 ${isComp ? 'bg-gradient-to-r from-amber-50/90 via-white to-pink-50/90' : 'bg-white'}">
              <div class="flex items-center justify-between px-0.5">
                <button type="button" onclick="PCApp.renameGroupMember(${gIdx})" class="font-black text-xs text-zinc-900 flex items-center gap-1 truncate">
                  <span>👤 ${this.esc(arr[0]?.member || '')}</span>
                  <span class="text-[10px] text-zinc-400">✎</span>
                </button>
                ${isComp
                  ? `<span class="px-2 py-0.5 rounded-full bg-amber-300 border border-cheki-dark text-[10px] font-black text-zinc-950 shrink-0">👑 コンプ齊套!</span>`
                  : `<span class="text-[10px] font-bold text-zinc-400 shrink-0">${arr.filter(x => x.qty > 0).length}/${arr.length}</span>`}
              </div>
              <div class="grid gap-2" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr));">
                ${visibleArr.map(sl => this.renderSlotCardHtml(sl, s)).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    this.state.justUnlockedIdx = -1;
  },

  renderSlotCardHtml(sl, seriesObj) {
    const s = seriesObj || this.getActiveSeries();
    const spec = this.getSeriesRatioSpec(s);
    const cssRad = this.getSlotCssRadius(sl.radiusPct, s);
    const unlocked = sl.qty > 0;
    const imgSrc = sl.realImg || sl.sampleImg;
    const numStr = '#' + String(sl.idx).padStart(3, '0');
    const borderCls = unlocked
      ? (sl.rarity === 'SIGN' ? 'pc-sign-border' : sl.rarity === 'HOLO' ? 'pc-holo-border' : 'bg-zinc-900 p-[2px]')
      : 'bg-zinc-300 p-[2px]';
    const animCls = this.state.justUnlockedIdx === sl.idx ? 'pc-unlock-anim' : '';

    return `
      <div onclick="PCApp.onSlotClick(${sl.idx})" class="min-w-0 ${borderCls} ${animCls} cursor-pointer active:scale-95 transition shadow-sm" style="border-radius:${cssRad};">
        <div class="w-full bg-zinc-900 overflow-hidden relative flex flex-col items-center justify-center" style="aspect-ratio:${spec.css}; border-radius:${cssRad};">
          ${imgSrc
            ? `<img src="${imgSrc}" loading="lazy" class="w-full h-full object-cover ${unlocked ? '' : 'grayscale contrast-75 brightness-50 opacity-65'} pointer-events-none">`
            : `<div class="text-center px-1 space-y-1 pointer-events-none">
                 <span class="block text-sm opacity-75">${sl.wish ? '💖' : '🔒'}</span>
                 <span class="block text-[11px] font-black text-zinc-300 leading-none">${numStr}</span>
                 <span class="block text-[10px] font-bold text-zinc-500 leading-none">款式 ${this.esc(sl.variant)}</span>
               </div>`}
          <span class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-black leading-none">${numStr}</span>
          ${(imgSrc && !unlocked) ? `<span class="absolute inset-0 flex items-center justify-center text-lg pointer-events-none drop-shadow">${sl.wish ? '💖' : '🔒'}</span>` : ''}
          ${sl.realImg ? `<span class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-emerald-400/95 text-zinc-950 text-[8px] font-black leading-none">真卡</span>` : ''}
          ${sl.qty > 1 ? `<span class="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-amber-300 border border-zinc-900 text-zinc-950 text-[9px] font-black leading-none">×${sl.qty}</span>` : ''}
          ${(sl.wish && !unlocked) ? `<span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-pink-500 text-white text-[8px] font-black leading-none">求</span>` : ''}
        </div>
      </div>
    `;
  },

  // --------------------------------------------------------------------------
  // 單張小卡 3D 檢視、操作與資料筆記編輯（原生單次組裝）
  // --------------------------------------------------------------------------
  onSlotClick(slotIdx) {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!s || !slot) return;

    const spec = this.getSeriesRatioSpec(s);
    const frontRad = this.getSlotCssRadius(slot.radiusPct, s);
    const backRad = this.getSlotCssRadius(typeof slot.backRadiusPct === 'number' ? slot.backRadiusPct : s.backRadiusPct, s);
    const imgSrc = slot.realImg || slot.sampleImg;
    const backSrc = slot.realBackImg || s.backImage;
    const numStr = '#' + String(slot.idx).padStart(3, '0');
    const isLocked = slot.qty === 0 && !slot.realImg;

    const borderCls = slot.qty > 0
      ? (slot.rarity === 'SIGN' ? 'pc-sign-border' : slot.rarity === 'HOLO' ? 'pc-holo-border' : 'bg-zinc-900 p-[2.5px]')
      : 'bg-zinc-400 p-[2.5px]';
    const foilHtml = slot.rarity === 'SIGN' ? '<div class="pc-sign-foil"></div>' : (slot.rarity === 'HOLO' ? '<div class="pc-holo-foil"></div>' : '');

    const body = document.getElementById('pcSlotModalBody');
    body.innerHTML = `
      <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
        <div>
          <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">${numStr} · 款式 ${this.esc(slot.variant)}</span>
          <h4 class="font-black text-base mt-0.5">${this.esc(slot.member)}</h4>
        </div>
        <button type="button" onclick="document.getElementById('pcSlotModal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm">✕</button>
      </div>

      <!-- 3D 全息傾斜與翻面舞台 -->
      <div id="pc3DTiltWrap" class="pc-3d-wrap py-1 flex flex-col items-center">
        <div id="pc3DCardInner" class="pc-3d-card relative w-48 cursor-grab active:cursor-grabbing" style="aspect-ratio:${spec.css};">
          <div class="pc-3d-face pc-3d-front absolute inset-0 ${borderCls} shadow-2xl" style="border-radius:${frontRad};">
            <div class="w-full h-full overflow-hidden bg-zinc-900 relative flex items-center justify-center" style="border-radius:${frontRad};">
              ${imgSrc
                ? `<img src="${imgSrc}" draggable="false" class="w-full h-full object-cover pointer-events-none ${isLocked ? 'grayscale brightness-75 opacity-60' : ''}">`
                : `<span class="text-zinc-500 font-black text-sm">${numStr} 尚未墊底</span>`}
              ${foilHtml}
              <div class="pc-holo-glare"></div>
              ${slot.realImg ? `<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-400 text-zinc-950 font-black text-[10px] shadow">✨ 實物真卡</span>` : ''}
            </div>
          </div>
          <div class="pc-3d-face pc-3d-back absolute inset-0 ${borderCls} shadow-2xl" style="border-radius:${backRad}; opacity:0;">
            <div class="w-full h-full overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-zinc-950 relative flex flex-col items-center justify-center p-3 text-center" style="border-radius:${backRad};">
              ${backSrc
                ? `<img src="${backSrc}" draggable="false" class="w-full h-full object-cover pointer-events-none"><div class="pc-holo-glare"></div>`
                : `<div class="text-3xl mb-1">🃏</div><p class="font-black text-xs text-sky-300">${this.esc(s.title)}</p><p class="text-[11px] font-bold text-zinc-400 mt-1">${numStr} · ${this.esc(slot.member)}</p><p class="text-[10px] text-zinc-500 mt-2">可於下方掃描獨立卡背<br>或設定系列共用卡背</p>`}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 mt-2.5">
          <span class="text-[10px] font-bold text-zinc-500">👆 手指拖曳 3D 傾斜賞閃膜</span>
          <button type="button" id="pc3DFlipBtn" class="px-2.5 py-1 rounded-full bg-indigo-100 border-2 border-cheki-dark text-[11px] font-black text-indigo-900 active:scale-95">🔄 3D 翻面</button>
        </div>
      </div>

      <!-- 掃描、圖片重編、AI 高清與下載操作區 -->
      <div class="space-y-1.5">
        <button type="button" onclick="PCApp.openCardScanner(${slot.idx}, 'front')" class="w-full py-2.5 rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 text-zinc-950 neo-btn font-black text-xs flex items-center justify-center gap-1.5 active:scale-95">
          📸 ${slot.realImg ? '重新掃描 / 替換高清真卡' : '掃描實體真卡覆蓋底圖並點亮'}
        </button>

        <div class="grid ${slot.realImg ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5">
          <button type="button" onclick="PCApp.openCardScanner(${slot.idx}, 'back')" class="py-2 rounded-xl bg-amber-100 border-2 border-cheki-dark font-black text-[11px] text-zinc-900 active:scale-95">
            ✍️ ${slot.realBackImg ? '更換獨立簽名卡背' : '掃描此卡獨立卡背'}
          </button>
          ${slot.realImg ? `
            <button type="button" onclick="PCApp.clearSlotRealImg(${slot.idx})" class="py-2 rounded-xl bg-zinc-100 border-2 border-cheki-dark font-black text-[11px] text-rose-700 active:scale-95">
              ↩️ 恢復預覽底圖
            </button>
          ` : ''}
        </div>

        ${(!slot.realImg && slot.realBackImg) ? `
          <button type="button" onclick="PCApp.moveBackImgToFront(${slot.idx})" class="w-full py-2 rounded-xl bg-indigo-100 border-2 border-cheki-dark font-black text-[11px] text-indigo-900 active:scale-95">
            🔄 將剛拍的背面相片直接移作正面真卡
          </button>
        ` : ''}

        ${imgSrc ? `
          <div class="grid ${slot.realBackImg ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5 pt-0.5">
            <button type="button" onclick="PCApp.editSavedSlotImage(${slot.idx}, 'front')" class="py-2 px-2 rounded-xl bg-amber-200 hover:bg-amber-300 border-2 border-cheki-dark font-black text-[11px] text-zinc-950 active:scale-95">
              🎨 編輯正面圖片（調光/圓角/重裁）
            </button>
            ${slot.realBackImg ? `
              <button type="button" onclick="PCApp.editSavedSlotImage(${slot.idx}, 'back')" class="py-2 px-2 rounded-xl bg-amber-100 hover:bg-amber-200 border-2 border-cheki-dark font-black text-[11px] text-zinc-900 active:scale-95">
                🎨 編輯背面圖片
              </button>
            ` : ''}
          </div>

          <button type="button" onclick="PCApp.openAiRemasterModal(${slot.idx}, 'front')" class="w-full py-2.5 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white neo-btn font-black text-xs flex items-center justify-center gap-1.5 active:scale-95">
            <span>✨</span><span>${slot.isAiHD ? 'Gemini AI 重新高清化 / 換模式' : 'Gemini AI 超高清化（去反光・保真五官）'}</span>
          </button>

          ${slot.preAiRealImg ? `
            <button type="button" onclick="PCApp.undoSlotAiRemaster(${slot.idx})" class="w-full py-1.5 rounded-xl bg-amber-50 border-2 border-cheki-dark text-amber-900 font-black text-[11px] active:scale-95">
              ↩️ 還原 AI 高清化前的原始掃描圖
            </button>
          ` : ''}

          <div class="pt-1 border-t border-zinc-200 grid ${backSrc ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5">
            <button type="button" onclick="PCApp.downloadSingleSlotImage(${slot.idx}, 'front')" class="py-2 px-1.5 rounded-xl bg-sky-100 hover:bg-sky-200 border-2 border-cheki-dark font-black text-[11px] text-blue-950 active:scale-95">
              ⬇️ ${slot.realImg ? '下載真卡' : '下載底圖'}
            </button>
            ${backSrc ? `
              <button type="button" onclick="PCApp.downloadSingleSlotImage(${slot.idx}, 'back')" class="py-2 px-1.5 rounded-xl bg-white hover:bg-zinc-100 border-2 border-cheki-dark font-black text-[11px] text-zinc-800 active:scale-95">
                ⬇️ 下載背面
              </button>
            ` : ''}
            <button type="button" onclick="PCApp.downloadSlotShowcaseCard(${slot.idx})" class="py-2 px-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 border-2 border-cheki-dark font-black text-[11px] text-pink-950 active:scale-95">
              🖼️ ${backSrc ? '雙面紀念卡' : '收藏展示卡'}
            </button>
          </div>
        ` : ''}
      </div>

      <!-- 持有數量、稀有度與求換標記 -->
      <div class="rounded-2xl border-2 border-cheki-dark bg-white p-3 space-y-2.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-black">📦 持有張數（0 為未點亮鎖定）</span>
          <div class="flex items-center gap-2">
            <button type="button" onclick="PCApp.adjustSlotQty(${slot.idx}, -1)" class="w-8 h-8 rounded-xl bg-zinc-100 neo-btn font-black text-sm">－</button>
            <span class="font-black text-base w-8 text-center text-cheki-accent">×${slot.qty}</span>
            <button type="button" onclick="PCApp.adjustSlotQty(${slot.idx}, 1)" class="w-8 h-8 rounded-xl bg-amber-200 neo-btn font-black text-sm">＋</button>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-1.5 pt-1">
          ${[['N', '🤍 普通卡'], ['HOLO', '🌈 全息閃'], ['SIGN', '✍️ 親簽金卡']].map(([rKey, rLab]) => `
            <button type="button" onclick="PCApp.setSlotMeta(${slot.idx}, 'rarity', '${rKey}')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] ${slot.rarity === rKey ? 'bg-indigo-500 text-white' : 'bg-zinc-50'}">${rLab}</button>
          `).join('')}
        </div>
        <button type="button" onclick="PCApp.setSlotMeta(${slot.idx}, 'wish', ${!slot.wish})" class="w-full py-2 rounded-xl border-2 border-cheki-dark font-black ${slot.wish ? 'bg-pink-500 text-white' : 'bg-pink-50 text-pink-800'}">
          ${slot.wish ? '💖 已標記為「優先求換 (求)」' : '🤍 標記為「優先求換 (求)」'}
        </button>
      </div>

      <!-- 小卡資料與筆記編輯區 -->
      <div class="rounded-2xl border-2 border-cheki-dark bg-white p-3 space-y-2 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-black text-zinc-900">📝 編輯小卡資料與筆記</span>
          ${slot.note ? `<span class="text-[10px] font-bold text-emerald-700">✓ 已有筆記</span>` : ''}
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <div>
            <label class="text-[10px] font-black text-zinc-500 block mb-0.5">👤 成員名稱</label>
            <input id="pcEditSlotMember" type="text" value="${this.esc(slot.member || '')}" class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark bg-zinc-50 font-bold text-xs">
          </div>
          <div>
            <label class="text-[10px] font-black text-zinc-500 block mb-0.5">🏷️ 款式名稱</label>
            <input id="pcEditSlotVariant" type="text" value="${this.esc(slot.variant || '')}" placeholder="例：A / 和服 / 親簽" class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark bg-zinc-50 font-bold text-xs">
          </div>
        </div>
        <label class="flex items-center gap-1.5 text-[10px] font-bold text-zinc-600 cursor-pointer">
          <input id="pcEditSlotApplyRowCb" type="checkbox" class="w-3.5 h-3.5 accent-indigo-600 rounded">
          <span>同時將此成員名稱套用至同排全部款式</span>
        </label>
        <div>
          <label class="text-[10px] font-black text-zinc-500 block mb-0.5">📅 入手日期（選填）</label>
          <input id="pcEditSlotDate" type="date" value="${this.esc(slot.acquiredDate || '')}" class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark bg-zinc-50 font-black text-xs">
        </div>
        <div>
          <label class="text-[10px] font-black text-zinc-500 block mb-0.5">💬 小卡筆記（抽中經過 / 換卡對象 / 價格等）</label>
          <textarea id="pcEditSlotNote" rows="2" placeholder="寫低呢張小卡嘅回憶或購入紀錄..." class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark bg-zinc-50 font-bold text-xs">${this.esc(slot.note || '')}</textarea>
        </div>
        <button type="button" onclick="PCApp.saveSlotMetaEdit(${slot.idx})" class="w-full py-2 rounded-xl bg-indigo-600 text-white neo-btn font-black text-xs active:scale-95">💾 儲存小卡資料與筆記</button>
      </div>
    `;

    document.getElementById('pcSlotModal')?.classList.remove('hidden');
    this.bind3DTiltCard(slot.idx);
  },

  bind3DTiltCard(slotIdx) {
    const card = document.getElementById('pc3DCardInner');
    const flipBtn = document.getElementById('pc3DFlipBtn');
    if (!card) return;

    const faces = card.querySelectorAll('.pc-3d-face');
    let flipped = false;
    let active = false;

    const applyTransform = (rx, ry, px, py) => {
      card.style.transform = `rotateX(${rx.toFixed(1)}deg) rotateY(${((flipped ? 180 : 0) + ry).toFixed(1)}deg)`;
      card.style.setProperty('--px', `${px}%`);
      card.style.setProperty('--py', `${py}%`);
    };

    if (flipBtn) {
      flipBtn.onclick = () => {
        flipped = !flipped;
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(8);
        card.classList.remove('is-tilting');
        applyTransform(0, 0, 50, 50);
        flipBtn.textContent = flipped ? '🔄 翻回正面' : '🔄 3D 翻面';
        setTimeout(() => {
          if (faces[0]) faces[0].style.opacity = flipped ? '0' : '1';
          if (faces[1]) faces[1].style.opacity = flipped ? '1' : '0';
        }, 130);
      };
      if (this.state.autoFlipSlotOnce === slotIdx) {
        this.state.autoFlipSlotOnce = -1;
        setTimeout(() => flipBtn.click(), 160);
      }
    }

    const onMove = (e) => {
      if (!active) return;
      const rect = card.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
      applyTransform(-ny * 18, nx * 22, Math.round((nx + 1) * 50), Math.round((ny + 1) * 50));
    };

    card.onpointerdown = (e) => { active = true; card.classList.add('is-tilting'); card.setPointerCapture?.(e.pointerId); onMove(e); };
    card.onpointermove = onMove;
    const endTilt = () => { if (!active) return; active = false; card.classList.remove('is-tilting'); applyTransform(0, 0, 50, 50); };
    card.onpointerup = endTilt;
    card.onpointercancel = endTilt;
  },

  async adjustSlotQty(slotIdx, delta) {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!slot) return;
    const prev = slot.qty || 0;
    slot.qty = Math.max(0, prev + delta);
    if (prev === 0 && slot.qty > 0) {
      slot.wish = false;
      this.state.justUnlockedIdx = slot.idx;
      if (typeof window.fireCheerConfetti === 'function') window.fireCheerConfetti();
    }
    await this.saveSeries(s);
    this.onSlotClick(slotIdx);
    this.renderDex();
  },

  async setSlotMeta(slotIdx, key, val) {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!slot) return;
    slot[key] = val;
    await this.saveSeries(s);
    this.onSlotClick(slotIdx);
    this.renderDex();
  },

  async saveSlotMetaEdit(slotIdx) {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!s || !slot) return;
    const memberVal = (document.getElementById('pcEditSlotMember')?.value || '').trim();
    const variantVal = (document.getElementById('pcEditSlotVariant')?.value || '').trim();
    const applyRow = Boolean(document.getElementById('pcEditSlotApplyRowCb')?.checked);

    if (memberVal) {
      if (applyRow) {
        const cols = s.groupCols || 3;
        const gIdx = slot.groupIdx ?? Math.floor((slot.idx - 1) / cols);
        s.slots.forEach(x => { if ((x.groupIdx ?? Math.floor((x.idx - 1) / cols)) === gIdx) x.member = memberVal; });
      } else {
        slot.member = memberVal;
      }
    }
    if (variantVal) slot.variant = variantVal;
    slot.acquiredDate = (document.getElementById('pcEditSlotDate')?.value || '').trim();
    slot.note = (document.getElementById('pcEditSlotNote')?.value || '').trim();

    await this.saveSeries(s);
    if (typeof window.showChekiToast === 'function') window.showChekiToast('✅ 已更新小卡資料與筆記！');
    this.onSlotClick(slotIdx);
    this.renderDex();
  },

  async clearSlotRealImg(slotIdx) {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!s || !slot || !confirm('確定移除此格實物真卡並恢復顯示預覽底圖嗎？')) return;
    slot.realImg = '';
    delete slot.rawRectImg;
    delete slot.preAiRealImg;
    slot.isAiHD = false;
    await this.saveSeries(s);
    this.onSlotClick(slotIdx);
    this.renderDex();
  },

  async moveBackImgToFront(slotIdx) {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!s || !slot || !slot.realBackImg) return;
    slot.realImg = slot.realBackImg;
    slot.realBackImg = '';
    if (slot.rawRectBackImg) { slot.rawRectImg = slot.rawRectBackImg; delete slot.rawRectBackImg; }
    if (typeof slot.backRadiusPct === 'number') { slot.radiusPct = slot.backRadiusPct; delete slot.backRadiusPct; }
    if ((slot.qty || 0) === 0) {
      slot.qty = 1; slot.wish = false; this.state.justUnlockedIdx = slot.idx;
      if (typeof window.fireCheerConfetti === 'function') window.fireCheerConfetti();
    }
    await this.saveSeries(s);
    this.onSlotClick(slotIdx);
    this.renderDex();
    if (typeof window.showChekiToast === 'function') window.showChekiToast('✨ 已移至正面真卡並點亮圖鑑！');
  },

  async undoSlotAiRemaster(slotIdx) {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!s || !slot || !slot.preAiRealImg || !confirm('確定還原至 AI 高清化之前的原始掃描圖嗎？')) return;
    slot.realImg = slot.preAiRealImg;
    delete slot.preAiRealImg;
    delete slot.rawRectImg;
    slot.isAiHD = false;
    await this.saveSeries(s);
    this.onSlotClick(slotIdx);
    this.renderDex();
    if (typeof window.showChekiToast === 'function') window.showChekiToast('↩️ 已還原至 AI 修圖前的原始真卡！');
  },

  async start() {
    this.mountCoreUI();
    this.mountSlicerAndScannerUI?.();
    this.mountAiAndExportUI?.();
    await this.loadSeriesList();
    setTimeout(() => this.mountHeaderSwitchBtn(), 820);
  }
};
// === [重構版 B 段貼在此行正下方] ===
// ============================================================================
// [B 段]：官方預覽圖防黏切格／手拉橙框網格 ＋ 即時鏡頭／四角透視掃描器（無損圓角）
// ============================================================================
Object.assign(PCApp, {
  liveCamStream: null,
  _scanRaf: null,
  _scanEnhanceTimer: null,

  slicer: {
    img: null,
    mode: 'auto', // 'auto' | 'grid'
    thresh: 212,
    trimPct: 1,
    boxes: [],
    gridBox: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 },
    gapX: 1.5,
    gapY: 1.5,
    excludedKeys: new Set(),
    drag: { handle: null, startX: 0, startY: 0, moved: false }
  },

  scanner: {
    slotIdx: -1,
    targetSide: 'front', // 'front' | 'back' | 'seriesBack'
    ratioKey: '63x88',
    cropMode: 'quad',    // 'quad' | 'adjust'
    img: null,
    rawHiResImg: null,
    rawPreviewImg: null,
    hiResImg: null,
    previewImg: null,
    quadPts: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }],
    quadRect: null,
    activeCorner: -1,
    scale: 1,
    ox: 0,
    oy: 0,
    rot: 0,
    fineRot: 0,
    deglare: 15,
    sharpen: 20,
    bright: 100,
    contrast: 104,
    radiusPct: 6
  },

  // --------------------------------------------------------------------------
  // 單次掛載切格器與掃描器 DOM（零重複覆寫）
  // --------------------------------------------------------------------------
  mountSlicerAndScannerUI() {
    if (document.getElementById('pcSlicerModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <input id="pcSheetFileInput" type="file" accept="image/*" class="hidden" onchange="PCApp.handleSheetFile(event)">
      <input id="pcScanFileInput" type="file" accept="image/*" class="hidden" onchange="PCApp.handleScanFile(event)">
      <input id="pcScanCamInput" type="file" accept="image/*" capture="environment" class="hidden" onchange="PCApp.handleScanFile(event)">

      <!-- ✂️ 官方預覽圖精準切格器 -->
      <div id="pcSlicerModal" class="hidden fixed inset-0 z-[134] bg-black/85 flex items-center justify-center p-2.5 overflow-y-auto">
        <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-3.5 space-y-2.5 text-zinc-900 max-h-[94vh] overflow-y-auto">
          <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
            <div>
              <h3 class="font-black text-base leading-tight">✂️ 官方預覽圖精準切格墊底</h3>
              <p class="text-[10px] font-bold text-zinc-500">自動防黏排拆格 · 網格模式可手拉橙框對齊並點擊剔除空白格</p>
            </div>
            <button type="button" onclick="PCApp.closeSlicerModal()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm shrink-0">✕</button>
          </div>

          <div class="bg-zinc-900 rounded-2xl p-2 border-2 border-cheki-dark flex flex-col items-center">
            <div class="w-full max-h-[42vh] flex items-center justify-center overflow-hidden rounded-xl bg-zinc-950 relative">
              <canvas id="pcSlicerCanvas" class="max-h-[42vh] max-w-full w-auto h-auto object-contain cursor-pointer" style="touch-action:none;"></canvas>
              <div id="pcSlicerEmptyHint" class="py-10 text-center space-y-2">
                <p class="text-xs font-black text-zinc-300">尚未載入官方一覽圖</p>
                <button type="button" onclick="document.getElementById('pcSheetFileInput').click()" class="px-4 py-2 rounded-xl bg-sky-400 text-zinc-950 neo-btn text-xs font-black">🖼️ 選擇官方預覽圖</button>
              </div>
            </div>
            <div class="w-full flex items-center justify-between mt-1.5 px-1 text-[11px] font-black gap-2">
              <span id="pcSlicerCountText" class="text-emerald-400 truncate">待選擇圖片...</span>
              <button type="button" onclick="document.getElementById('pcSheetFileInput').click()" class="text-sky-300 underline shrink-0">換另一張圖</button>
            </div>
          </div>

          <div class="rounded-2xl border-2 border-cheki-dark bg-white p-2.5 space-y-2 text-xs">
            <div class="grid grid-cols-2 gap-1.5">
              <button type="button" id="pcSliceModeAuto" onclick="PCApp.setSlicerMode('auto')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black">✨ 智能防黏偵測</button>
              <button type="button" id="pcSliceModeGrid" onclick="PCApp.setSlicerMode('grid')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black">📐 手拉橙框網格</button>
            </div>

            <div id="pcSliceAutoInputs" class="space-y-1.5 pt-0.5">
              <div class="flex items-center justify-between text-[11px] font-black">
                <span>🎯 去白底/水印靈敏度</span>
                <span id="pcSliceThreshVal" class="text-indigo-600">212</span>
              </div>
              <input id="pcSliceThreshSlider" type="range" min="170" max="242" value="212" oninput="PCApp.onSlicerParamChange()" class="w-full accent-indigo-600">
            </div>

            <div id="pcSliceGridInputs" class="hidden space-y-2 pt-0.5">
              <div class="grid grid-cols-3 gap-1.5 items-end">
                <label class="font-black text-[11px]">橫排 (Rows)
                  <input id="pcSliceRowsInp" type="number" min="1" max="20" value="3" onchange="PCApp.buildGridBoxesFromRect(false)" class="mt-0.5 w-full px-2 py-1 rounded-lg border-2 border-cheki-dark bg-zinc-50 font-black">
                </label>
                <label class="font-black text-[11px]">直欄 (Cols)
                  <input id="pcSliceColsInp" type="number" min="1" max="20" value="9" onchange="PCApp.buildGridBoxesFromRect(false)" class="mt-0.5 w-full px-2 py-1 rounded-lg border-2 border-cheki-dark bg-zinc-50 font-black">
                </label>
                <button type="button" onclick="PCApp.autoFitGridOuterBox()" class="py-1.5 rounded-lg bg-amber-100 border-2 border-cheki-dark font-black text-[10px]">🎯 自動套框</button>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <label class="font-black text-[10px]">
                  <div class="flex justify-between"><span>↔️ 左右格距</span><span id="pcSliceGapXVal" class="text-amber-600">1.5%</span></div>
                  <input id="pcSliceGapXSlider" type="range" min="0" max="14" step="0.5" value="1.5" oninput="PCApp.onGridGapChange()" class="w-full accent-amber-500">
                </label>
                <label class="font-black text-[10px]">
                  <div class="flex justify-between"><span>↕️ 上下格距</span><span id="pcSliceGapYVal" class="text-amber-600">1.5%</span></div>
                  <input id="pcSliceGapYSlider" type="range" min="0" max="14" step="0.5" value="1.5" oninput="PCApp.onGridGapChange()" class="w-full accent-amber-500">
                </label>
              </div>
              <p class="text-[10px] font-bold text-amber-700">💡 拖拉「🟠 橙色邊點」框住全部小卡，點綠格可剔除/恢復空白位</p>
            </div>

            <div class="space-y-1 pt-0.5 border-t border-zinc-100">
              <div class="flex items-center justify-between text-[11px] font-black">
                <span>✂️ 四邊內縮修邊（去掉細白/藍邊）</span>
                <span id="pcSliceTrimVal" class="text-pink-600">1%</span>
              </div>
              <input id="pcSliceTrimSlider" type="range" min="0" max="6" step="0.5" value="1" oninput="PCApp.onSlicerParamChange()" class="w-full accent-pink-500">
            </div>
          </div>

          <div class="grid grid-cols-3 gap-1.5">
            <button type="button" onclick="PCApp.resetSlicerCurrentMode()" class="py-2.5 rounded-2xl bg-zinc-100 neo-btn font-black text-xs">🔄 重測</button>
            <button type="button" id="pcApplySliceBtn" onclick="PCApp.applySlicedSamplesToSeries()" class="col-span-2 py-2.5 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs">✅ 裁切並填入圖鑑格</button>
          </div>
        </div>
      </div>

      <!-- 📸 實體小卡四角透視掃描與無損圓角編輯器 -->
      <div id="pcScanModal" class="hidden fixed inset-0 z-[136] bg-black/88 flex items-center justify-center p-2.5 overflow-y-auto">
        <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-3.5 space-y-2 text-zinc-900 max-h-[94vh] overflow-y-auto">
          <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
            <div>
              <h3 id="pcScanTitle" class="font-black text-base leading-tight">📸 掃描高清實物正面真卡</h3>
              <p class="text-[10px] font-bold text-zinc-500">手機鏡頭直拍 · 四角透視拉直 · 無損圓角與去反光</p>
            </div>
            <button type="button" onclick="PCApp.closeCardScanner()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm shrink-0">✕</button>
          </div>

          <!-- 正面 / 背面目標切換 -->
          <div id="pcScanSideSwitchBar" class="grid grid-cols-2 gap-1.5">
            <button type="button" id="pcSideBtnFront" onclick="PCApp.setScanTargetSide('front')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs transition">📸 存為正面真卡</button>
            <button type="button" id="pcSideBtnBack" onclick="PCApp.setScanTargetSide('back')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs transition">✍️ 存為獨立背面</button>
          </div>

          <!-- 比例與裁切模式切換 -->
          <div class="space-y-1.5">
            <div class="grid grid-cols-3 gap-1">
              ${Object.entries(this.CARD_RATIOS).map(([k, info]) => `
                <button type="button" id="pcRatioBtn_${k}" onclick="PCApp.setScanCardRatio('${k}')" class="py-1 rounded-xl border-2 border-cheki-dark font-black text-[10px] transition">${info.label}</button>
              `).join('')}
            </div>
            <div class="grid grid-cols-2 gap-1.5">
              <button type="button" id="pcModeBtnQuad" onclick="PCApp.setScanCropMode('quad')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] transition">📐 四角拉點裁切</button>
              <button type="button" id="pcModeBtnAdjust" onclick="PCApp.setScanCropMode('adjust')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] transition">🔎 拖曳縮放預覽</button>
            </div>
          </div>

          <!-- 鏡頭與畫布舞台（取消固定圓角遮罩，真實呈現 0%~15% 圓角） -->
          <div class="bg-zinc-950 rounded-2xl p-2.5 border-2 border-cheki-dark flex flex-col items-center space-y-2">
            <div id="pcLiveCamWrap" class="hidden relative w-52 rounded-xl overflow-hidden border-2 border-emerald-400 shadow-2xl bg-black" style="aspect-ratio:63/88;">
              <video id="pcLiveCamVideo" autoplay playsinline muted class="w-full h-full object-cover"></video>
              <div class="absolute inset-1.5 border-2 border-dashed border-emerald-300/90 rounded-xl pointer-events-none"></div>
              <span class="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/65 text-emerald-300 text-[10px] font-black whitespace-nowrap">將小卡放進綠框內拍攝</span>
              <div class="absolute bottom-2 inset-x-0 flex items-center justify-center gap-2">
                <button type="button" onclick="PCApp.captureLiveCameraFrame()" class="px-4 py-1.5 rounded-full bg-rose-500 text-white border-2 border-white font-black text-xs shadow-lg active:scale-95">🔴 拍攝</button>
                <button type="button" onclick="PCApp.stopLiveCamera()" class="px-2.5 py-1.5 rounded-full bg-zinc-900/80 text-white border border-white/40 font-black text-[11px]">✕</button>
              </div>
            </div>

            <canvas id="pcScanCanvas" width="315" height="440" class="w-48 cursor-grab active:cursor-grabbing shadow-2xl" style="touch-action:none; background:transparent; border-radius:0px;"></canvas>

            <div id="pcQuadActionRow" class="hidden w-full space-y-1">
              <p class="text-[10px] font-bold text-emerald-300 text-center">👆 拖拉 4 隻綠點對準小卡四角（自動顯示局部放大鏡）</p>
              <button type="button" onclick="PCApp.confirmQuadPerspectiveCrop()" class="w-full py-2 rounded-xl bg-emerald-400 text-zinc-950 font-black text-xs shadow active:scale-95">
                ✂️ 確認四角拉直並檢視圓角效果
              </button>
            </div>

            <div class="grid grid-cols-3 gap-1.5 w-full">
              <button type="button" onclick="PCApp.startLiveCamera()" class="py-1.5 px-1.5 rounded-xl bg-emerald-400 text-zinc-950 font-black text-[11px] active:scale-95">📷 鏡頭直拍</button>
              <button type="button" onclick="document.getElementById('pcScanCamInput').click()" class="py-1.5 px-1.5 rounded-xl bg-amber-300 text-zinc-950 font-black text-[11px] active:scale-95">📱 系統相機</button>
              <button type="button" onclick="document.getElementById('pcScanFileInput').click()" class="py-1.5 px-1.5 rounded-xl bg-sky-400 text-zinc-950 font-black text-[11px] active:scale-95">🖼️ 相簿選相</button>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap justify-center">
              <button type="button" onclick="PCApp.rotateScanImg()" class="px-2.5 py-1 rounded-xl bg-white/15 text-white font-black text-[11px]">🔄 旋轉 90°</button>
              <button type="button" onclick="PCApp.resetScanTransform()" class="px-2.5 py-1 rounded-xl bg-white/15 text-white font-black text-[11px]">🎯 重置對位</button>
              <button type="button" id="pcFixOldCornerBtn" onclick="PCApp.nudgeZoomToRemoveOldCorners()" class="hidden px-2.5 py-1 rounded-xl bg-amber-300 text-zinc-950 font-black text-[11px] active:scale-95">🩹 清舊黑角</button>
            </div>
          </div>

          <!-- 濾鏡、微調與無損圓角滑桿 -->
          <div class="rounded-2xl border-2 border-cheki-dark bg-white p-2.5 space-y-1.5 text-[11px] font-black">
            <label id="pcScanZoomWrap" class="block">
              <div class="flex justify-between"><span>🔎 縮放比例（支援雙指縮放）</span><span id="pcScanZoomVal" class="text-indigo-600">100%</span></div>
              <input id="pcScanZoom" type="range" min="50" max="260" value="100" oninput="PCApp.onScanSlider()" class="w-full accent-indigo-600">
            </label>
            <label id="pcScanFineRotWrap" class="block">
              <div class="flex justify-between"><span>📐 微角度水平校正</span><span id="pcScanFineRotVal" class="text-teal-600">0°</span></div>
              <input id="pcScanFineRot" type="range" min="-15" max="15" step="0.5" value="0" oninput="PCApp.onScanSlider()" class="w-full accent-teal-500">
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="block">
                <div class="flex justify-between"><span>✨ 去反光</span><span id="pcScanDeglareVal" class="text-sky-600">15</span></div>
                <input id="pcScanDeglare" type="range" min="0" max="100" value="15" oninput="PCApp.onScanSlider()" class="w-full accent-sky-500">
              </label>
              <label class="block">
                <div class="flex justify-between"><span>🔪 清晰銳化</span><span id="pcScanSharpenVal" class="text-pink-600">20</span></div>
                <input id="pcScanSharpen" type="range" min="0" max="100" value="20" oninput="PCApp.onScanSlider()" class="w-full accent-pink-500">
              </label>
              <label class="block">
                <div class="flex justify-between"><span>☀️ 亮度</span><span id="pcScanBrightVal" class="text-amber-600">100%</span></div>
                <input id="pcScanBright" type="range" min="75" max="130" value="100" oninput="PCApp.onScanSlider()" class="w-full accent-amber-500">
              </label>
              <label class="block">
                <div class="flex justify-between"><span>⭕ 圓角弧度</span><span id="pcScanRadiusVal" class="text-emerald-600">6%</span></div>
                <input id="pcScanRadius" type="range" min="0" max="15" step="1" value="6" oninput="PCApp.onScanSlider()" class="w-full accent-emerald-500">
              </label>
            </div>
          </div>

          <button type="button" id="pcScanSaveSubmitBtn" onclick="PCApp.saveScannedCard()" class="w-full py-3 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs active:scale-95">
            ✨ 儲存正面真卡並點亮圖鑑
          </button>
          <button type="button" onclick="PCApp.downloadCurrentScannerPreview()" class="w-full py-2 rounded-2xl bg-sky-100 border-2 border-cheki-dark text-blue-950 font-black text-xs active:scale-95">
            ⬇️ 直接下載目前裁切圖至手機相簿 (.png)
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    this.bindSlicerCanvasEvents();
    this.bindScannerCanvasEvents();
    this.updateSlicerModeButtons();
  },

  // --------------------------------------------------------------------------
  // 1. 官方預覽大圖切格引擎（智能防黏排 ＋ 手拉 8 點橙框網格）
  // --------------------------------------------------------------------------
  openSlicerModal() {
    this.updateSlicerModeButtons();
    document.getElementById('pcSlicerModal')?.classList.remove('hidden');
    if (!this.slicer.img) document.getElementById('pcSheetFileInput')?.click();
  },

  closeSlicerModal() { document.getElementById('pcSlicerModal')?.classList.add('hidden'); },

  setSlicerMode(m) {
    this.slicer.mode = m;
    this.updateSlicerModeButtons();
    if (this.slicer.img) this.recomputeSlicerBoxes();
  },

  updateSlicerModeButtons() {
    const isAuto = this.slicer.mode === 'auto';
    const bA = document.getElementById('pcSliceModeAuto');
    const bG = document.getElementById('pcSliceModeGrid');
    if (bA) bA.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black ${isAuto ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700'}`;
    if (bG) bG.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black ${!isAuto ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-100 text-zinc-700'}`;
    document.getElementById('pcSliceAutoInputs')?.classList.toggle('hidden', !isAuto);
    document.getElementById('pcSliceGridInputs')?.classList.toggle('hidden', isAuto);
  },

  onSlicerParamChange() {
    this.slicer.thresh = Number(document.getElementById('pcSliceThreshSlider')?.value || 212);
    this.slicer.trimPct = Number(document.getElementById('pcSliceTrimSlider')?.value ?? 1);
    const tv = document.getElementById('pcSliceThreshVal');
    const trv = document.getElementById('pcSliceTrimVal');
    if (tv) tv.textContent = String(this.slicer.thresh);
    if (trv) trv.textContent = `${this.slicer.trimPct}%`;
    if (this.slicer.img) {
      if (this.slicer.mode === 'grid') this.drawSlicerPreview();
      else this.recomputeSlicerBoxes();
    }
  },

  onGridGapChange() {
    this.slicer.gapX = Number(document.getElementById('pcSliceGapXSlider')?.value ?? 1.5);
    this.slicer.gapY = Number(document.getElementById('pcSliceGapYSlider')?.value ?? 1.5);
    const vx = document.getElementById('pcSliceGapXVal');
    const vy = document.getElementById('pcSliceGapYVal');
    if (vx) vx.textContent = `${this.slicer.gapX}%`;
    if (vy) vy.textContent = `${this.slicer.gapY}%`;
    if (this.slicer.img) this.buildGridBoxesFromRect(false);
  },

  resetSlicerCurrentMode() {
    this.slicer.excludedKeys.clear();
    if (this.slicer.mode === 'grid') this.autoFitGridOuterBox();
    else this.recomputeSlicerBoxes();
  },

  handleSheetFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      const s = Math.min(1, 2000 / Math.max(im.width, im.height));
      c.width = Math.round(im.width * s);
      c.height = Math.round(im.height * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(objUrl);
      this.slicer.img = c;
      this.slicer.excludedKeys.clear();
      document.getElementById('pcSlicerEmptyHint')?.classList.add('hidden');
      this.recomputeSlicerBoxes();
    };
    im.onerror = () => URL.revokeObjectURL(objUrl);
    im.src = objUrl;
  },

  computeSlicerMask(img, thresh) {
    const maxDim = 680;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const satThresh = Math.max(16, Math.round((255 - thresh) * 0.55));
    const mask = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = (r + g + b) / 3;
      if (sat <= 14 && lum >= Math.min(thresh, 168)) continue; // 過濾中性淺灰 SAMPLE 浮水印
      if (lum < thresh || sat > satThresh) mask[p] = 1;
    }
    return { w, h, mask };
  },

  autoFitGridOuterBox() {
    const img = this.slicer.img;
    if (!img) return;
    const { w, h, mask } = this.computeSlicerMask(img, this.slicer.thresh || 212);
    const rowProj = new Float32Array(h), colProj = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      let rc = 0, off = y * w;
      for (let x = 0; x < w; x++) if (mask[off + x]) { rc++; colProj[x]++; }
      rowProj[y] = rc / w;
    }
    for (let x = 0; x < w; x++) colProj[x] /= h;

    let minY = 0, maxY = h - 1, minX = 0, maxX = w - 1;
    while (minY < h - 1 && rowProj[minY] < 0.03) minY++;
    while (maxY > minY && rowProj[maxY] < 0.03) maxY--;
    while (minX < w - 1 && colProj[minX] < 0.03) minX++;
    while (maxX > minX && colProj[maxX] < 0.03) maxX--;

    this.slicer.gridBox = (maxX - minX < w * 0.1 || maxY - minY < h * 0.1)
      ? { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 }
      : { x0: minX / w, y0: minY / h, x1: (maxX + 1) / w, y1: (maxY + 1) / h };
    this.buildGridBoxesFromRect(true);
  },

  buildGridBoxesFromRect(autoSkipEmpty = false) {
    const img = this.slicer.img;
    if (!img) return;
    const rows = Math.max(1, Math.min(20, Number(document.getElementById('pcSliceRowsInp')?.value) || 3));
    const cols = Math.max(1, Math.min(20, Number(document.getElementById('pcSliceColsInp')?.value) || 9));
    const gb = this.slicer.gridBox;
    const cellW = Math.max(0.05, gb.x1 - gb.x0) / cols;
    const cellH = Math.max(0.05, gb.y1 - gb.y0) / rows;
    const gx = cellW * (this.slicer.gapX / 100);
    const gy = cellH * (this.slicer.gapY / 100);

    let maskInfo = null;
    if (autoSkipEmpty) {
      maskInfo = this.computeSlicerMask(img, this.slicer.thresh || 212);
      this.slicer.excludedKeys.clear();
    }

    const boxes = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rx = gb.x0 + c * cellW + gx / 2;
        const ry = gb.y0 + r * cellH + gy / 2;
        const rw = Math.max(0.01, cellW - gx);
        const rh = Math.max(0.01, cellH - gy);
        const key = `${r}_${c}`;
        if (autoSkipEmpty && maskInfo) {
          const x0 = Math.max(0, Math.floor(rx * maskInfo.w)), y0 = Math.max(0, Math.floor(ry * maskInfo.h));
          const x1 = Math.min(maskInfo.w, Math.ceil((rx + rw) * maskInfo.w)), y1 = Math.min(maskInfo.h, Math.ceil((ry + rh) * maskInfo.h));
          let fg = 0, area = Math.max(1, (x1 - x0) * (y1 - y0));
          for (let y = y0; y < y1; y++) {
            const off = y * maskInfo.w;
            for (let x = x0; x < x1; x++) if (maskInfo.mask[off + x]) fg++;
          }
          if (fg / area < 0.14) this.slicer.excludedKeys.add(key);
        }
        boxes.push({ rx, ry, rw, rh, gridKey: key, excluded: this.slicer.excludedKeys.has(key) });
      }
    }
    this.slicer.boxes = boxes;
    this.drawSlicerPreview();
  },

  recomputeSlicerBoxes() {
    const img = this.slicer.img;
    if (!img) return;
    if (this.slicer.mode === 'grid') return this.autoFitGridOuterBox();

    const { w, h, mask } = this.computeSlicerMask(img, this.slicer.thresh || 212);
    const getDensity = (x0, y0, x1, y1) => {
      let c = 0, tot = Math.max(1, (x1 - x0) * (y1 - y0));
      for (let y = y0; y < y1; y++) {
        const off = y * w;
        for (let x = x0; x < x1; x++) if (mask[off + x]) c++;
      }
      return c / tot;
    };

    const rowProj = new Float32Array(h);
    let peakRow = 0;
    for (let y = 0; y < h; y++) {
      let cnt = 0, off = y * w;
      for (let x = 0; x < w; x++) if (mask[off + x]) cnt++;
      rowProj[y] = cnt / w;
      if (rowProj[y] > peakRow) peakRow = rowProj[y];
    }

    const rowCut = Math.max(0.028, peakRow * 0.15);
    const rawBands = [];
    let inB = false, bStart = 0;
    for (let y = 0; y < h; y++) {
      if (rowProj[y] > rowCut) { if (!inB) { inB = true; bStart = y; } }
      else if (inB) { if (y - bStart >= h * 0.05) rawBands.push([bStart, y]); inB = false; }
    }
    if (inB && h - bStart >= h * 0.05) rawBands.push([bStart, h]);

    const rowBands = [];
    const minBandH = rawBands.length > 0 ? Math.min(...rawBands.map(b => b[1] - b[0])) : 0;
    rawBands.forEach(([y0, y1]) => {
      const bh = y1 - y0;
      if (minBandH > 0 && bh > minBandH * 1.65) {
        const nSplit = Math.max(2, Math.round(bh / minBandH));
        const cuts = [y0];
        for (let k = 1; k < nSplit; k++) {
          const target = Math.round(y0 + (bh * k) / nSplit);
          const win = Math.max(4, Math.round(bh * 0.08));
          let bestY = target, bestVal = Infinity;
          for (let yy = Math.max(y0 + 4, target - win); yy <= Math.min(y1 - 4, target + win); yy++) {
            if (rowProj[yy] < bestVal) { bestVal = rowProj[yy]; bestY = yy; }
          }
          cuts.push(bestY);
        }
        cuts.push(y1);
        for (let k = 0; k < cuts.length - 1; k++) {
          if (cuts[k + 1] - cuts[k] >= h * 0.04) rowBands.push([cuts[k], cuts[k + 1]]);
        }
      } else {
        rowBands.push([y0, y1]);
      }
    });

    const finalBoxes = [];
    rowBands.forEach(([y0, y1]) => {
      const bh = y1 - y0;
      const colProj = new Float32Array(w);
      let peakCol = 0;
      for (let x = 0; x < w; x++) {
        let cnt = 0;
        for (let y = y0; y < y1; y++) if (mask[y * w + x]) cnt++;
        colProj[x] = cnt / Math.max(1, bh);
        if (colProj[x] > peakCol) peakCol = colProj[x];
      }
      const colCut = Math.max(0.08, peakCol * 0.14);
      const segs = [];
      let inS = false, sStart = 0;
      for (let x = 0; x < w; x++) {
        if (colProj[x] > colCut) { if (!inS) { inS = true; sStart = x; } }
        else if (inS) { if (x - sStart >= Math.max(10, bh * 0.22)) segs.push([sStart, x]); inS = false; }
      }
      if (inS && w - sStart >= Math.max(10, bh * 0.22)) segs.push([sStart, w]);

      const rowCells = [];
      segs.forEach(([x0, x1]) => {
        const sw = x1 - x0;
        if (getDensity(x0, y0, x1, y1) < 0.18) return;
        const vSplits = (bh / sw > 2.25) ? Math.max(2, Math.round((bh / sw) / 1.54)) : 1;
        const effBh = bh / vSplits;
        const hSplits = (sw / effBh > 1.06) ? Math.max(2, Math.round((sw / effBh) / 0.65)) : 1;

        for (let vr = 0; vr < vSplits; vr++) {
          const sy0 = Math.round(y0 + vr * effBh), sy1 = Math.round(y0 + (vr + 1) * effBh);
          const subW = sw / hSplits;
          for (let hc = 0; hc < hSplits; hc++) {
            let sx0 = Math.round(x0 + hc * subW), sx1 = Math.round(x0 + (hc + 1) * subW);
            if (hSplits > 1 && hc > 0) {
              const win = Math.max(2, Math.round(subW * 0.08));
              let bestX = sx0, bestV = Infinity;
              for (let xx = Math.max(x0, sx0 - win); xx <= Math.min(x1, sx0 + win); xx++) {
                if (colProj[xx] < bestV) { bestV = colProj[xx]; bestX = xx; }
              }
              sx0 = bestX;
            }
            if (getDensity(sx0, sy0, sx1, sy1) >= 0.16) {
              rowCells.push({ vr, rx: sx0 / w, ry: sy0 / h, rw: (sx1 - sx0) / w, rh: (sy1 - sy0) / h, excluded: false });
            }
          }
        }
      });
      rowCells.sort((a, b) => (a.vr - b.vr) || (a.rx - b.rx));
      rowCells.forEach(c => finalBoxes.push(c));
    });

    this.slicer.boxes = finalBoxes;
    this.drawSlicerPreview();
  },

  drawSlicerPreview() {
    const img = this.slicer.img;
    const canvas = document.getElementById('pcSlicerCanvas');
    if (!img || !canvas) return;

    const scale = Math.min(1, 720 / img.width);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const trim = this.slicer.trimPct / 100;
    let activeNum = 0;

    this.slicer.boxes.forEach((b) => {
      const x = (b.rx + b.rw * trim) * canvas.width;
      const y = (b.ry + b.rh * trim) * canvas.height;
      const bw = b.rw * (1 - trim * 2) * canvas.width;
      const bh = b.rh * (1 - trim * 2) * canvas.height;

      if (b.excluded) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = '#F43F5E'; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, bh);
        ctx.fillStyle = '#FFFFFF'; ctx.font = '900 16px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✕', x + bw / 2, y + bh / 2);
        ctx.textAlign = 'left';
        return;
      }

      activeNum++;
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = Math.max(2, Math.round(canvas.width / 260));
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
      ctx.fillRect(x, y, 28, 17);
      ctx.fillStyle = '#09090B'; ctx.font = '900 11px sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText(`#${activeNum}`, x + 3, y + 9);
    });

    if (this.slicer.mode === 'grid') {
      const gb = this.slicer.gridBox;
      const gx = gb.x0 * canvas.width, gy = gb.y0 * canvas.height;
      const gw = (gb.x1 - gb.x0) * canvas.width, gh = (gb.y1 - gb.y0) * canvas.height;
      ctx.save();
      ctx.strokeStyle = '#F97316'; ctx.lineWidth = 3; ctx.setLineDash([8, 5]);
      ctx.strokeRect(gx, gy, gw, gh);
      ctx.setLineDash([]);
      [
        [gx, gy], [gx + gw, gy], [gx, gy + gh], [gx + gw, gy + gh],
        [gx + gw / 2, gy], [gx + gw / 2, gy + gh], [gx, gy + gh / 2], [gx + gw, gy + gh / 2]
      ].forEach(([px, py]) => {
        ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#F97316'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
      });
      ctx.restore();
    }

    const cntEl = document.getElementById('pcSlicerCountText');
    const applyBtn = document.getElementById('pcApplySliceBtn');
    if (cntEl) cntEl.textContent = activeNum > 0
      ? `✅ 已鎖定 ${activeNum} 張小卡（點格仔可剔除/恢復）`
      : '⚠️ 尚未鎖定卡片，請切換「手拉橙框網格」或調高靈敏度';
    if (applyBtn) applyBtn.textContent = `✅ 裁切並填入圖鑑 (${activeNum} 張)`;
  },

  bindSlicerCanvasEvents() {
    const cv = document.getElementById('pcSlicerCanvas');
    if (!cv) return;
    const getRel = (e) => {
      const r = cv.getBoundingClientRect();
      return {
        rx: Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))),
        ry: Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height)))
      };
    };

    cv.addEventListener('pointerdown', (e) => {
      if (!this.slicer.img) return;
      const { rx, ry } = getRel(e);
      this.slicer.drag = { handle: null, startX: e.clientX, startY: e.clientY, moved: false };
      if (this.slicer.mode === 'grid') {
        const gb = this.slicer.gridBox;
        const mx = (gb.x0 + gb.x1) / 2, my = (gb.y0 + gb.y1) / 2;
        let best = null, bestD = 0.068;
        [
          ['tl', gb.x0, gb.y0], ['tr', gb.x1, gb.y0], ['bl', gb.x0, gb.y1], ['br', gb.x1, gb.y1],
          ['t', mx, gb.y0], ['b', mx, gb.y1], ['l', gb.x0, my], ['r', gb.x1, my]
        ].forEach(([name, hx, hy]) => {
          const d = Math.hypot(rx - hx, ry - hy);
          if (d < bestD) { bestD = d; best = name; }
        });
        if (best) { this.slicer.drag.handle = best; cv.setPointerCapture?.(e.pointerId); e.preventDefault(); }
      }
    });

    cv.addEventListener('pointermove', (e) => {
      const dr = this.slicer.drag;
      if (!dr.handle) return;
      if (Math.hypot(e.clientX - dr.startX, e.clientY - dr.startY) > 4) dr.moved = true;
      const { rx, ry } = getRel(e);
      const gb = this.slicer.gridBox, h = dr.handle, minS = 0.08;
      if (h.includes('l')) gb.x0 = Math.min(gb.x1 - minS, rx);
      if (h.includes('r')) gb.x1 = Math.max(gb.x0 + minS, rx);
      if (h.includes('t')) gb.y0 = Math.min(gb.y1 - minS, ry);
      if (h.includes('b')) gb.y1 = Math.max(gb.y0 + minS, ry);
      this.buildGridBoxesFromRect(false);
      e.preventDefault();
    });

    cv.addEventListener('pointerup', (e) => {
      const wasDrag = this.slicer.drag.handle && this.slicer.drag.moved;
      this.slicer.drag.handle = null;
      if (wasDrag || !this.slicer.img) return;
      const { rx, ry } = getRel(e);
      const hit = this.slicer.boxes.find(b => rx >= b.rx && rx <= b.rx + b.rw && ry >= b.ry && ry <= b.ry + b.rh);
      if (hit) {
        hit.excluded = !hit.excluded;
        if (hit.gridKey) {
          if (hit.excluded) this.slicer.excludedKeys.add(hit.gridKey);
          else this.slicer.excludedKeys.delete(hit.gridKey);
        }
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(8);
        this.drawSlicerPreview();
      }
    });
  },

  async applySlicedSamplesToSeries() {
    const s = this.getActiveSeries();
    const img = this.slicer.img;
    const activeBoxes = this.slicer.boxes.filter(b => !b.excluded);
    if (!s || !img || activeBoxes.length === 0) return;

    const trim = this.slicer.trimPct / 100;
    const cols = s.groupCols || 3;
    const variants = ['A', 'B', 'C', 'D', 'E', 'F'];
    const cutCanvas = document.createElement('canvas');
    const cutCtx = cutCanvas.getContext('2d');

    activeBoxes.forEach((b, i) => {
      const sx = Math.max(0, Math.round((b.rx + b.rw * trim) * img.width));
      const sy = Math.max(0, Math.round((b.ry + b.rh * trim) * img.height));
      const sw = Math.max(10, Math.round(b.rw * (1 - trim * 2) * img.width));
      const sh = Math.max(10, Math.round(b.rh * (1 - trim * 2) * img.height));

      const outW = Math.min(360, sw);
      const outH = Math.round(outW * (sh / sw));
      cutCanvas.width = outW; cutCanvas.height = outH;
      cutCtx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      const dataUrl = cutCanvas.toDataURL('image/jpeg', 0.85);

      if (!s.slots[i]) {
        const gIdx = Math.floor(i / cols);
        s.slots.push({
          idx: i + 1, groupIdx: gIdx, member: `成員 ${gIdx + 1}`,
          variant: variants[i % cols] || String((i % cols) + 1),
          sampleImg: dataUrl, realImg: '', realBackImg: '', qty: 0, wish: false, rarity: 'N', note: ''
        });
      } else {
        s.slots[i].sampleImg = dataUrl;
      }
    });

    await this.saveSeries(s);
    this.closeSlicerModal();
    this.renderDex();
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
    if (typeof window.showChekiToast === 'function') window.showChekiToast(`✂️ 已精準切割並墊底 ${activeBoxes.length} 張預覽圖！`, 3500);
  },

 // --------------------------------------------------------------------------
  // 2. 四角透視真卡掃描器 ＋ 自動貼邊水平校正 ＋ 真・無損參數重編
  // --------------------------------------------------------------------------
  triggerSeriesBackUpload() {
    const s = this.getActiveSeries();
    if (s?.backImage) return this.editSeriesBackImage();
    this.openCardScanner(-1, 'seriesBack');
  },

  openCardScanner(slotIdx, side = 'front') {
    this.stopLiveCamera();
    const s = this.getActiveSeries();
    const sc = this.scanner;

    sc.slotIdx = slotIdx;
    sc.targetSide = side;
    sc.ratioKey = this.getSeriesRatioKey(s);
    sc.cropMode = 'quad';
    sc.quadDirty = false;
    sc.img = null; sc.rawHiResImg = null; sc.rawPreviewImg = null; sc.hiResImg = null; sc.previewImg = null;
    sc.quadPts = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    sc.activeCorner = -1; sc.quadRect = null;
    sc.rot = 0; sc.fineRot = 0; sc.scale = 1; sc.ox = 0; sc.oy = 0;
    sc.deglare = 15; sc.sharpen = 20; sc.bright = 100; sc.radiusPct = 6;

    this.syncScannerSlidersDOM();
    document.getElementById('pcFixOldCornerBtn')?.classList.add('hidden');
    this.updateScannerControlsUI();
    this.applyCanvasBoxForCurrentMode();

    const cv = document.getElementById('pcScanCanvas');
    if (cv) {
      cv.classList.remove('hidden');
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#18181B';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '900 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('請按下方「📷 鏡頭直拍」', cv.width / 2, cv.height / 2 - 12);
      ctx.fillText('或「🖼️ 相簿選相」開始', cv.width / 2, cv.height / 2 + 16);
      ctx.textAlign = 'left';
    }
    document.getElementById('pcScanModal')?.classList.remove('hidden');
  },

  closeCardScanner() {
    this.stopLiveCamera();
    document.getElementById('pcScanModal')?.classList.add('hidden');
  },

  syncScannerSlidersDOM() {
    const sc = this.scanner;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    setVal('pcScanZoom', Math.round((sc.scale || 1) * 100));
    setVal('pcScanFineRot', sc.fineRot || 0);
    setVal('pcScanDeglare', sc.deglare ?? 0);
    setVal('pcScanSharpen', sc.sharpen ?? 0);
    setVal('pcScanBright', sc.bright ?? 100);
    setVal('pcScanRadius', sc.radiusPct ?? 6);
    this.updateScanLabels();
  },

  makeScaledCanvas(imgObj, maxEdge) {
    const s = Math.min(1, maxEdge / Math.max(imgObj.width, imgObj.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(imgObj.width * s));
    c.height = Math.max(1, Math.round(imgObj.height * s));
    c.getContext('2d').drawImage(imgObj, 0, 0, c.width, c.height);
    return c;
  },

  // 載入已保存的無損原圖與完整參數（支援重調水平角度、濾鏡與返回四角重裁）
  restoreLosslessSession(im, params, fallbackRadius = 6) {
    const sc = this.scanner;
    if (params?.ratioKey && this.CARD_RATIOS[params.ratioKey]) sc.ratioKey = params.ratioKey;
    const spec = this.CARD_RATIOS[sc.ratioKey || '63x88'] || this.CARD_RATIOS['63x88'];

    sc.rawHiResImg = this.makeScaledCanvas(im, 1500);
    sc.rawPreviewImg = this.makeScaledCanvas(im, 720);

    if (params && Array.isArray(params.quadPts) && params.quadPts.length === 4) {
      sc.quadPts = params.quadPts.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
      sc.hiResImg = this.warpQuadToCanvas(sc.rawHiResImg, sc.quadPts, spec.w, spec.h);
      sc.previewImg = this.warpQuadToCanvas(sc.rawPreviewImg, sc.quadPts, spec.preW, spec.preH);
      sc.img = sc.hiResImg;
      sc.scale = params.scale ?? 1;
      sc.ox = params.ox ?? 0;
      sc.oy = params.oy ?? 0;
      sc.rot = params.rot ?? 0;
      sc.fineRot = params.fineRot ?? 0;
      sc.deglare = params.deglare ?? 0;
      sc.sharpen = params.sharpen ?? 0;
      sc.bright = params.bright ?? 100;
      sc.radiusPct = typeof params.radiusPct === 'number' ? params.radiusPct : fallbackRadius;
    } else {
      // 兼容舊版已存圖或 AI 高清圖：將去反光與銳化歸零，避免二次疊加劣化
      sc.quadPts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
      sc.hiResImg = sc.rawHiResImg;
      sc.previewImg = sc.rawPreviewImg;
      sc.img = sc.rawHiResImg;
      sc.scale = 1; sc.ox = 0; sc.oy = 0; sc.rot = 0; sc.fineRot = 0;
      sc.deglare = 0; sc.sharpen = 0; sc.bright = 100;
      sc.radiusPct = fallbackRadius;
    }

    sc.quadDirty = false;
    sc.cropMode = 'adjust';
    this.syncScannerSlidersDOM();
    this.updateScannerControlsUI();
    this.applyCanvasBoxForCurrentMode();
    this.scheduleScanRender(true);
  },

  async editSeriesBackImage() {
    const s = this.getActiveSeries();
    if (!s?.backImage) return this.openCardScanner(-1, 'seriesBack');
    const hasLossless = Boolean(s.backScanSrcImg && s.backScanParams);
    const src = hasLossless ? s.backScanSrcImg : (s.backRawRectImg || s.backImage);
    const im = await this.loadImgAsync(src);
    if (!im) return this.openCardScanner(-1, 'seriesBack');

    this.openCardScanner(-1, 'seriesBack');
    this.restoreLosslessSession(im, hasLossless ? s.backScanParams : null, typeof s.backRadiusPct === 'number' ? s.backRadiusPct : 6);
  },

  async editSavedSlotImage(slotIdx, side = 'front') {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!s || !slot) return;

    const isBack = side === 'back';
    const hasLossless = isBack
      ? Boolean(slot.scanSrcBackImg && slot.scanBackParams && (!slot.scanBackSyncedLen || slot.scanBackSyncedLen === (slot.rawRectBackImg || '').length))
      : Boolean(slot.scanSrcImg && slot.scanParams && !slot.isAiHD && (!slot.scanSyncedLen || slot.scanSyncedLen === (slot.rawRectImg || '').length));

    const src = hasLossless
      ? (isBack ? slot.scanSrcBackImg : slot.scanSrcImg)
      : (isBack ? (slot.rawRectBackImg || slot.realBackImg || s.backImage) : (slot.rawRectImg || slot.realImg || slot.sampleImg));

    if (!src) return this.openCardScanner(slotIdx, side);
    const im = await this.loadImgAsync(src);
    if (!im) return alert('無法讀取已儲存的圖片，請重新選相！');

    const savedRad = isBack
      ? (typeof slot.backRadiusPct === 'number' ? slot.backRadiusPct : 6)
      : (typeof slot.radiusPct === 'number' ? slot.radiusPct : 6);

    this.openCardScanner(slotIdx, side);
    this.restoreLosslessSession(im, hasLossless ? (isBack ? slot.scanBackParams : slot.scanParams) : null, savedRad);
    document.getElementById('pcFixOldCornerBtn')?.classList.toggle('hidden', hasLossless);

    if (typeof window.showChekiToast === 'function') {
      window.showChekiToast(
        hasLossless
          ? '🎨 已還原無損原圖與上次角度設定，可隨時重調水平或切回四角重裁！'
          : '🎨 如舊存圖已有黑邊，可按「🩹 清舊黑角」放大推走或重選原相一次！',
        3000
      );
    }
  },

  nudgeZoomToRemoveOldCorners() {
    const sc = this.scanner;
    if (!sc.img) return;
    sc.scale = Math.min(2.6, Number(((sc.scale || 1) + 0.08).toFixed(2)));
    this.syncScannerSlidersDOM();
    this.scheduleScanRender(true);
    if (typeof window.showChekiToast === 'function') window.showChekiToast(`✨ 已放大至 ${Math.round(sc.scale * 100)}% 推走舊黑邊！`, 2200);
  },

  setScanTargetSide(side) {
    if (this.scanner.targetSide === 'seriesBack') return;
    this.scanner.targetSide = side;
    this.updateScannerControlsUI();
  },

  async setScanCardRatio(ratioKey) {
    if (!this.CARD_RATIOS[ratioKey]) return;
    this.scanner.ratioKey = ratioKey;
    const s = this.getActiveSeries();
    if (s) { s.cardRatio = ratioKey; await this.saveSeries(s); this.renderDex(); }
    this.updateScannerControlsUI();
    this.applyCanvasBoxForCurrentMode();
    if (this.scanner.rawHiResImg) {
      if (this.scanner.cropMode === 'quad') this.renderQuadEditorCanvas();
      else this.confirmQuadPerspectiveCrop(true, true);
    }
  },

  setScanCropMode(mode) {
    const sc = this.scanner;
    if (mode === 'adjust' && sc.cropMode === 'quad' && sc.rawHiResImg) {
      // 若在四角模式未動過角點且已有拉直圖，保留原有水平角度與微調設定
      if (!sc.quadDirty && sc.hiResImg && sc.hiResImg !== sc.rawHiResImg) {
        sc.cropMode = 'adjust';
        this.updateScannerControlsUI();
        this.applyCanvasBoxForCurrentMode();
        this.scheduleScanRender(true);
        return;
      }
      return this.confirmQuadPerspectiveCrop(false, false);
    }
    sc.cropMode = mode;
    this.updateScannerControlsUI();
    this.applyCanvasBoxForCurrentMode();
    if (sc.rawPreviewImg && mode === 'quad') this.renderQuadEditorCanvas();
    else if (sc.img && mode === 'adjust') this.scheduleScanRender(true);
  },

  updateScannerControlsUI() {
    const sc = this.scanner;
    const side = sc.targetSide;
    const rKey = sc.ratioKey || '63x88';
    const spec = this.CARD_RATIOS[rKey] || this.CARD_RATIOS['63x88'];
    const isQuad = sc.cropMode === 'quad';

    document.getElementById('pcScanSideSwitchBar')?.classList.toggle('hidden', side === 'seriesBack');
    const bF = document.getElementById('pcSideBtnFront');
    const bB = document.getElementById('pcSideBtnBack');
    if (bF) bF.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs transition ${side === 'front' ? 'bg-emerald-400 text-zinc-950 shadow' : 'bg-zinc-100 text-zinc-500'}`;
    if (bB) bB.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs transition ${side === 'back' ? 'bg-amber-300 text-zinc-950 shadow' : 'bg-zinc-100 text-zinc-500'}`;

    const titleEl = document.getElementById('pcScanTitle');
    if (titleEl) {
      titleEl.textContent = side === 'seriesBack' ? '🎴 拍攝 / 設定系列共用卡背' : (side === 'back' ? '✍️ 掃描小卡獨立背面' : '📸 掃描高清實物正面真卡');
    }
    const saveBtn = document.getElementById('pcScanSaveSubmitBtn');
    if (saveBtn) {
      saveBtn.textContent = side === 'seriesBack' ? '✨ 儲存為系列共用卡背' : (side === 'back' ? '✨ 儲存至獨立背面（存後自動翻面）' : '✨ 儲存正面真卡並點亮圖鑑');
    }

    Object.keys(this.CARD_RATIOS).forEach(k => {
      const btn = document.getElementById(`pcRatioBtn_${k}`);
      if (btn) btn.className = `py-1 rounded-xl border-2 border-cheki-dark font-black text-[10px] transition ${k === rKey ? 'bg-indigo-600 text-white shadow' : 'bg-white text-zinc-700'}`;
    });

    const bQ = document.getElementById('pcModeBtnQuad');
    const bA = document.getElementById('pcModeBtnAdjust');
    if (bQ) bQ.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] transition ${isQuad ? 'bg-emerald-400 text-zinc-950 shadow' : 'bg-zinc-100 text-zinc-600'}`;
    if (bA) bA.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] transition ${!isQuad ? 'bg-sky-400 text-zinc-950 shadow' : 'bg-zinc-100 text-zinc-600'}`;

    document.getElementById('pcQuadActionRow')?.classList.toggle('hidden', !isQuad || !sc.rawPreviewImg);
    document.getElementById('pcScanZoomWrap')?.classList.toggle('hidden', isQuad);
    document.getElementById('pcScanFineRotWrap')?.classList.toggle('hidden', isQuad);

    const camWrap = document.getElementById('pcLiveCamWrap');
    if (camWrap) camWrap.style.aspectRatio = spec.css;
  },

  applyCanvasBoxForCurrentMode() {
    const cv = document.getElementById('pcScanCanvas');
    if (!cv) return;
    const sc = this.scanner;
    const spec = this.CARD_RATIOS[sc.ratioKey || '63x88'] || this.CARD_RATIOS['63x88'];

    if (sc.cropMode === 'quad' && sc.rawPreviewImg) {
      const im = sc.rawPreviewImg, pad = 22;
      const fit = Math.min((360 - pad * 2) / im.width, (440 - pad * 2) / im.height);
      const dw = Math.round(im.width * fit), dh = Math.round(im.height * fit);
      cv.width = dw + pad * 2; cv.height = dh + pad * 2;
      sc.quadRect = { x: pad, y: pad, w: dw, h: dh };
      cv.classList.remove('w-48');
      cv.style.width = '100%'; cv.style.maxWidth = '290px'; cv.style.maxHeight = '42vh';
      cv.style.aspectRatio = `${cv.width} / ${cv.height}`;
    } else {
      cv.width = spec.preW; cv.height = spec.preH;
      cv.classList.add('w-48');
      cv.style.width = ''; cv.style.maxWidth = ''; cv.style.maxHeight = '';
      cv.style.aspectRatio = spec.css;
    }
  },

  loadSourceImageToScanner(imgObj, defaultMode = 'quad') {
    const sc = this.scanner;
    sc.rawHiResImg = this.makeScaledCanvas(imgObj, 1500);
    sc.rawPreviewImg = this.makeScaledCanvas(imgObj, 720);
    sc.hiResImg = sc.rawHiResImg;
    sc.previewImg = sc.rawPreviewImg;
    sc.img = sc.rawHiResImg;
    sc.rot = 0; sc.fineRot = 0; sc.scale = 1; sc.ox = 0; sc.oy = 0;
    sc.deglare = 15; sc.sharpen = 20; sc.bright = 100;
    sc.quadPts = defaultMode === 'adjust'
      ? [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
      : [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    sc.quadDirty = defaultMode === 'quad';
    sc.cropMode = defaultMode;

    document.getElementById('pcFixOldCornerBtn')?.classList.add('hidden');
    this.syncScannerSlidersDOM();
    this.updateScannerControlsUI();
    this.applyCanvasBoxForCurrentMode();
    if (defaultMode === 'quad') this.renderQuadEditorCanvas();
    else this.scheduleScanRender(true);
  },

  handleScanFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      try {
        this.loadSourceImageToScanner(im, 'quad');
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(10);
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    };
    im.onerror = () => { URL.revokeObjectURL(objUrl); alert('❌ 無法讀取此相片格式，請再試一次！'); };
    im.src = objUrl;
  },

  async startLiveCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return document.getElementById('pcScanCamInput')?.click();
    this.stopLiveCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      this.liveCamStream = stream;
      const vid = document.getElementById('pcLiveCamVideo');
      if (vid) {
        vid.srcObject = stream;
        await vid.play();
        document.getElementById('pcLiveCamWrap')?.classList.remove('hidden');
        document.getElementById('pcScanCanvas')?.classList.add('hidden');
      }
    } catch (_) {
      document.getElementById('pcScanCamInput')?.click();
    }
  },

  stopLiveCamera() {
    if (this.liveCamStream) {
      this.liveCamStream.getTracks().forEach(t => t.stop());
      this.liveCamStream = null;
    }
    const vid = document.getElementById('pcLiveCamVideo');
    if (vid) vid.srcObject = null;
    document.getElementById('pcLiveCamWrap')?.classList.add('hidden');
    document.getElementById('pcScanCanvas')?.classList.remove('hidden');
  },

  captureLiveCameraFrame() {
    const vid = document.getElementById('pcLiveCamVideo');
    if (!vid || !vid.videoWidth) return;
    const snap = document.createElement('canvas');
    const s = Math.min(1, 1400 / Math.max(vid.videoWidth, vid.videoHeight));
    snap.width = Math.round(vid.videoWidth * s);
    snap.height = Math.round(vid.videoHeight * s);
    snap.getContext('2d').drawImage(vid, 0, 0, snap.width, snap.height);

    this.stopLiveCamera();
    this.loadSourceImageToScanner(snap, 'quad');
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic(14);
  },

  rotateScanImg() {
    const sc = this.scanner;
    if (sc.cropMode === 'quad' && sc.rawHiResImg) {
      const rot90 = (src) => {
        const c = document.createElement('canvas');
        c.width = src.height; c.height = src.width;
        const ctx = c.getContext('2d');
        ctx.translate(c.width / 2, c.height / 2); ctx.rotate(Math.PI / 2);
        ctx.drawImage(src, -src.width / 2, -src.height / 2);
        return c;
      };
      sc.rawHiResImg = rot90(sc.rawHiResImg);
      sc.rawPreviewImg = rot90(sc.rawPreviewImg);
      sc.img = sc.rawHiResImg;
      sc.quadPts = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
      sc.quadDirty = true;
      this.applyCanvasBoxForCurrentMode();
      this.renderQuadEditorCanvas();
      return;
    }
    sc.rot = (sc.rot + 90) % 360;
    sc.ox = 0; sc.oy = 0;
    this.scheduleScanRender(true);
  },

  resetScanTransform() {
    const sc = this.scanner;
    if (sc.cropMode === 'quad' && sc.rawPreviewImg) {
      sc.quadPts = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
      sc.quadDirty = true;
      return this.renderQuadEditorCanvas();
    }
    sc.scale = 1; sc.ox = 0; sc.oy = 0; sc.rot = 0; sc.fineRot = 0;
    this.syncScannerSlidersDOM();
    this.scheduleScanRender(true);
  },

  updateScanLabels() {
    const sc = this.scanner;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('pcScanZoomVal', `${Math.round((sc.scale || 1) * 100)}%`);
    set('pcScanFineRotVal', `${sc.fineRot || 0}°`);
    set('pcScanDeglareVal', String(sc.deglare ?? 0));
    set('pcScanSharpenVal', String(sc.sharpen ?? 0));
    set('pcScanBrightVal', `${sc.bright ?? 100}%`);
    set('pcScanRadiusVal', `${sc.radiusPct ?? 6}%`);
  },

  onScanSlider() {
    const sc = this.scanner;
    sc.scale = Number(document.getElementById('pcScanZoom')?.value || 100) / 100;
    sc.fineRot = Number(document.getElementById('pcScanFineRot')?.value || 0);
    sc.deglare = Number(document.getElementById('pcScanDeglare')?.value || 0);
    sc.sharpen = Number(document.getElementById('pcScanSharpen')?.value || 0);
    sc.bright = Number(document.getElementById('pcScanBright')?.value || 100);
    sc.radiusPct = Number(document.getElementById('pcScanRadius')?.value ?? 6);
    this.updateScanLabels();
    if (sc.cropMode === 'adjust') this.scheduleScanRender(true);
  },

  renderQuadEditorCanvas() {
    const cv = document.getElementById('pcScanCanvas');
    const sc = this.scanner, im = sc.rawPreviewImg, r = sc.quadRect;
    if (!cv || !im || !r) return;

    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(im, r.x, r.y, r.w, r.h);

    const pts = sc.quadPts.map(p => ({ x: r.x + p.x * r.w, y: r.y + p.y * r.h }));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cv.width, cv.height);
    ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[3].x, pts[3].y);
    ctx.lineTo(pts[2].x, pts[2].y); ctx.lineTo(pts[1].x, pts[1].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fill('evenodd');

    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    [1 / 3, 2 / 3].forEach(t => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x + (pts[3].x - pts[0].x) * t, pts[0].y + (pts[3].y - pts[0].y) * t);
      ctx.lineTo(pts[1].x + (pts[2].x - pts[1].x) * t, pts[1].y + (pts[2].y - pts[1].y) * t);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pts[0].x + (pts[1].x - pts[0].x) * t, pts[0].y + (pts[1].y - pts[0].y) * t);
      ctx.lineTo(pts[3].x + (pts[2].x - pts[3].x) * t, pts[3].y + (pts[2].y - pts[3].y) * t);
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.strokeStyle = '#34D399'; ctx.lineWidth = 2.5; ctx.stroke();

    pts.forEach((p, idx) => {
      const act = sc.activeCorner === idx;
      ctx.beginPath(); ctx.arc(p.x, p.y, act ? 13 : 10, 0, Math.PI * 2);
      ctx.fillStyle = act ? '#F43F5E' : '#10B981'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    });

    if (sc.activeCorner >= 0 && sc.activeCorner < 4) {
      const ap = sc.quadPts[sc.activeCorner], lRad = 44, zoom = 2.2;
      const lx = ap.x < 0.5 ? (cv.width - lRad - 10) : (lRad + 10), ly = lRad + 10;
      const srcW = (lRad * 2) / zoom * (im.width / r.w), srcH = (lRad * 2) / zoom * (im.height / r.h);
      ctx.save();
      ctx.beginPath(); ctx.arc(lx, ly, lRad, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#09090B'; ctx.fillRect(lx - lRad, ly - lRad, lRad * 2, lRad * 2);
      ctx.drawImage(im, ap.x * im.width - srcW / 2, ap.y * im.height - srcH / 2, srcW, srcH, lx - lRad, ly - lRad, lRad * 2, lRad * 2);
      ctx.strokeStyle = '#34D399'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(lx - 14, ly); ctx.lineTo(lx + 14, ly); ctx.moveTo(lx, ly - 14); ctx.lineTo(lx, ly + 14); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(lx, ly, lRad, 0, Math.PI * 2); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore();
  },

  warpQuadToCanvas(srcCanvas, quadPts, outW, outH) {
    const sw = srcCanvas.width, sh = srcCanvas.height;
    const sData = srcCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const x0 = quadPts[0].x * (sw - 1), y0 = quadPts[0].y * (sh - 1);
    const x1 = quadPts[1].x * (sw - 1), y1 = quadPts[1].y * (sh - 1);
    const x2 = quadPts[2].x * (sw - 1), y2 = quadPts[2].y * (sh - 1);
    const x3 = quadPts[3].x * (sw - 1), y3 = quadPts[3].y * (sh - 1);

    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const det = dx1 * dy2 - dx2 * dy1;
    let g = 0, h = 0;
    if (Math.abs(det) > 1e-6) { g = (dx3 * dy2 - dx2 * dy3) / det; h = (dx1 * dy3 - dx3 * dy1) / det; }
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
    const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;

    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const oCtx = out.getContext('2d');
    const oImg = oCtx.createImageData(outW, outH), oData = oImg.data;
    const invW = 1 / Math.max(1, outW - 1), invH = 1 / Math.max(1, outH - 1);
    const maxX = sw - 1.001, maxY = sh - 1.001;

    let p = 0;
    for (let oy = 0; oy < outH; oy++) {
      const v = oy * invH, bv_c = b * v + c, ev_f = e * v + f, hv_1 = h * v + 1;
      for (let ox = 0; ox < outW; ox++, p += 4) {
        const u = ox * invW, denom = g * u + hv_1;
        let sx = (a * u + bv_c) / denom, sy = (d * u + ev_f) / denom;
        if (sx < 0) sx = 0; else if (sx > maxX) sx = maxX;
        if (sy < 0) sy = 0; else if (sy > maxY) sy = maxY;
        const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, ifx = 1 - fx, ify = 1 - fy;
        const i00 = (iy * sw + ix) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        const w00 = ifx * ify, w10 = fx * ify, w01 = ifx * fy, w11 = fx * fy;
        oData[p]     = sData[i00] * w00 + sData[i10] * w10 + sData[i01] * w01 + sData[i11] * w11;
        oData[p + 1] = sData[i00 + 1] * w00 + sData[i10 + 1] * w10 + sData[i01 + 1] * w01 + sData[i11 + 1] * w11;
        oData[p + 2] = sData[i00 + 2] * w00 + sData[i10 + 2] * w10 + sData[i01 + 2] * w01 + sData[i11 + 2] * w11;
        oData[p + 3] = 255;
      }
    }
    oCtx.putImageData(oImg, 0, 0);
    return out;
  },

  confirmQuadPerspectiveCrop(silent = false, keepAdjustments = false) {
    const sc = this.scanner;
    if (!sc.rawHiResImg) return;
    const spec = this.CARD_RATIOS[sc.ratioKey || '63x88'] || this.CARD_RATIOS['63x88'];
    sc.hiResImg = this.warpQuadToCanvas(sc.rawHiResImg, sc.quadPts, spec.w, spec.h);
    sc.previewImg = this.warpQuadToCanvas(sc.rawPreviewImg, sc.quadPts, spec.preW, spec.preH);
    sc.img = sc.hiResImg;
    sc.quadDirty = false;
    sc.cropMode = 'adjust';
    if (!keepAdjustments) {
      sc.scale = 1; sc.ox = 0; sc.oy = 0; sc.rot = 0; sc.fineRot = 0;
      this.syncScannerSlidersDOM();
    }
    this.updateScannerControlsUI();
    this.applyCanvasBoxForCurrentMode();
    this.scheduleScanRender(true);
    if (!silent && typeof window.triggerHaptic === 'function') window.triggerHaptic(12);
  },

  applyCardPixelEnhance(ctx, w, h, deglare, sharpen) {
    if (deglare <= 0 && sharpen <= 0) return;
    const imgData = ctx.getImageData(0, 0, w, h), d = imgData.data;
    if (deglare > 0) {
      const k = deglare / 100, cBoost = 1 + k * 0.16, hazeCut = k * 8;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        let r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const hiPull = lum > 160 ? k * 24 * Math.pow((lum - 160) / 95, 1.5) : 0;
        r = (r - 128) * cBoost + 128 - hiPull - hazeCut;
        g = (g - 128) * cBoost + 128 - hiPull - hazeCut;
        b = (b - 128) * cBoost + 128 - hiPull - hazeCut;
        d[i] = r < 0 ? 0 : (r > 255 ? 255 : r);
        d[i + 1] = g < 0 ? 0 : (g > 255 ? 255 : g);
        d[i + 2] = b < 0 ? 0 : (b > 255 ? 255 : b);
      }
    }
    if (sharpen > 0) {
      const src = new Uint8ClampedArray(d), s = (sharpen / 100) * 0.55, centerW = 1 + 4 * s, rowB = w * 4;
      for (let y = 1; y < h - 1; y++) {
        let idx = y * rowB + 4;
        for (let x = 1; x < w - 1; x++, idx += 4) {
          if (src[idx + 3] === 0) continue;
          for (let c = 0; c < 3; c++) {
            const p = idx + c;
            const val = src[p] * centerW - s * (src[p - 4] + src[p + 4] + src[p - rowB] + src[p + rowB]);
            d[p] = val < 0 ? 0 : (val > 255 ? 255 : val);
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  },

  // 自動計算水平旋轉斜邊貼齊倍率與防露黑邊位移限制
  computeClampedTransform(width, height, iw, ih, isExport) {
    const sc = this.scanner;
    const spec = this.CARD_RATIOS[sc.ratioKey || '63x88'] || this.CARD_RATIOS['63x88'];
    const scaleFactor = isExport ? (width / spec.preW) : 1;

    const baseCover = Math.max(width / iw, height / ih);
    const w0 = iw * baseCover, h0 = ih * baseCover;

    const fineRad = ((sc.fineRot || 0) * Math.PI) / 180;
    const absC = Math.abs(Math.cos(fineRad)), absS = Math.abs(Math.sin(fineRad));
    const needW = width * absC + height * absS;
    const needH = width * absS + height * absC;

    // 當有微角度水平旋轉時，自動補償放大倍率以消除四角黑三角形
    const tiltAutoScale = Math.abs(sc.fineRot || 0) > 0.01 ? Math.max(1, needW / w0, needH / h0) : 1;
    const userScale = sc.scale || 1;
    const finalScale = baseCover * tiltAutoScale * userScale;

    let ox = (sc.ox || 0) * scaleFactor;
    let oy = (sc.oy || 0) * scaleFactor;

    // 縮放 >= 100% 時自動鎖定拖曳邊界，防止拉出黑邊
    if (userScale >= 0.999) {
      const cosP = Math.cos(fineRad), sinP = Math.sin(fineRad);
      const uMax = Math.max(0, (iw * finalScale - needW) / 2);
      const vMax = Math.max(0, (ih * finalScale - needH) / 2);
      let uOff = ox * cosP + oy * sinP;
      let vOff = -ox * sinP + oy * cosP;
      uOff = Math.max(-uMax, Math.min(uMax, uOff));
      vOff = Math.max(-vMax, Math.min(vMax, vOff));
      ox = uOff * cosP - vOff * sinP;
      oy = uOff * sinP + vOff * cosP;
      if (!isExport) {
        sc.ox = ox;
        sc.oy = oy;
      }
    }

    return { finalScale, ox, oy, fineRad, coarseRad: ((sc.rot || 0) * Math.PI) / 180 };
  },

  renderUnclippedRectCanvas(width, height, isExport = false, applyEnhance = false) {
    const sc = this.scanner;
    const srcImg = isExport ? (sc.hiResImg || sc.img) : (sc.previewImg || sc.img);
    const tmp = document.createElement('canvas');
    tmp.width = width; tmp.height = height;
    if (!srcImg) return tmp;

    const tCtx = tmp.getContext('2d', { willReadFrequently: applyEnhance });
    tCtx.fillStyle = '#111113';
    tCtx.fillRect(0, 0, width, height);

    const isSwapped = sc.rot === 90 || sc.rot === 270;
    const iw = isSwapped ? srcImg.height : srcImg.width;
    const ih = isSwapped ? srcImg.width : srcImg.height;
    const tf = this.computeClampedTransform(width, height, iw, ih, isExport);

    tCtx.save();
    if (sc.bright !== 100 || sc.contrast !== 100) tCtx.filter = `brightness(${sc.bright}%) contrast(${sc.contrast}%)`;
    tCtx.translate(width / 2 + tf.ox, height / 2 + tf.oy);
    tCtx.rotate(tf.fineRad);
    tCtx.scale(tf.finalScale, tf.finalScale);
    tCtx.rotate(tf.coarseRad);
    tCtx.drawImage(srcImg, -srcImg.width / 2, -srcImg.height / 2);
    tCtx.restore();

    if (applyEnhance && (sc.deglare > 0 || sc.sharpen > 0)) {
      this.applyCardPixelEnhance(tCtx, width, height, sc.deglare, sc.sharpen);
    }
    return tmp;
  },

  renderScanCanvasFast(canvas, isExport = false, applyEnhance = false) {
    const sc = this.scanner;
    if (!canvas || !sc.img) return;
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const rPx = w * ((sc.radiusPct ?? 0) / 100);

    const rectCanvas = this.renderUnclippedRectCanvas(w, h, isExport, applyEnhance);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (rPx > 0.5) { this.pcRoundRectPath(ctx, 0, 0, w, h, rPx); ctx.clip(); }
    ctx.drawImage(rectCanvas, 0, 0);
    ctx.restore();

    if (!isExport) {
      ctx.save();
      this.pcRoundRectPath(ctx, 1, 1, w - 2, h - 2, Math.max(0, rPx - 1));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  },

  scheduleScanRender(withDelayedEnhance = true) {
    if (this._scanEnhanceTimer) { clearTimeout(this._scanEnhanceTimer); this._scanEnhanceTimer = null; }
    if (!this._scanRaf) {
      this._scanRaf = requestAnimationFrame(() => {
        this._scanRaf = null;
        const cv = document.getElementById('pcScanCanvas');
        if (cv && this.scanner.img && this.scanner.cropMode === 'adjust') this.renderScanCanvasFast(cv, false, false);
      });
    }
    if (withDelayedEnhance && (this.scanner.deglare > 0 || this.scanner.sharpen > 0)) {
      this._scanEnhanceTimer = setTimeout(() => {
        const cv = document.getElementById('pcScanCanvas');
        if (cv && this.scanner.img && this.scanner.cropMode === 'adjust') this.renderScanCanvasFast(cv, false, true);
      }, 160);
    }
  },

  bindScannerCanvasEvents() {
    const cv = document.getElementById('pcScanCanvas');
    if (!cv) return;
    const ptrs = new Map();
    let lastCenter = null, lastDist = 0, quadRaf = null;

    const getCanvasPos = (e) => {
      const rect = cv.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (cv.width / Math.max(1, rect.width)),
        y: (e.clientY - rect.top) * (cv.height / Math.max(1, rect.height))
      };
    };
    const getMetrics = () => {
      const arr = [...ptrs.values()];
      if (arr.length === 1) return { cx: arr[0].x, cy: arr[0].y, dist: 0 };
      return { cx: (arr[0].x + arr[1].x) / 2, cy: (arr[0].y + arr[1].y) / 2, dist: Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y) };
    };

    cv.addEventListener('pointerdown', (e) => {
      const sc = this.scanner;
      if (!sc.img) return;
      cv.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      if (sc.cropMode === 'quad' && sc.quadRect) {
        const pos = getCanvasPos(e), r = sc.quadRect;
        let bestIdx = -1, bestD = 54;
        sc.quadPts.forEach((p, idx) => {
          const d = Math.hypot(pos.x - (r.x + p.x * r.w), pos.y - (r.y + p.y * r.h));
          if (d < bestD) { bestD = d; bestIdx = idx; }
        });
        sc.activeCorner = bestIdx;
        if (bestIdx >= 0) this.renderQuadEditorCanvas();
        return;
      }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const m = getMetrics();
      lastCenter = { x: m.cx, y: m.cy }; lastDist = m.dist;
    });

    cv.addEventListener('pointermove', (e) => {
      const sc = this.scanner;
      if (!sc.img) return;
      if (sc.cropMode === 'quad') {
        if (sc.activeCorner < 0 || !sc.quadRect) return;
        e.preventDefault();
        const pos = getCanvasPos(e), r = sc.quadRect;
        sc.quadPts[sc.activeCorner] = {
          x: Math.max(0, Math.min(1, (pos.x - r.x) / Math.max(1, r.w))),
          y: Math.max(0, Math.min(1, (pos.y - r.y) / Math.max(1, r.h)))
        };
        sc.quadDirty = true;
        if (!quadRaf) quadRaf = requestAnimationFrame(() => { quadRaf = null; this.renderQuadEditorCanvas(); });
        return;
      }
      if (!ptrs.has(e.pointerId)) return;
      e.preventDefault();
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const m = getMetrics();
      const ratio = cv.width / Math.max(1, cv.getBoundingClientRect().width);
      if (lastCenter) { sc.ox += (m.cx - lastCenter.x) * ratio; sc.oy += (m.cy - lastCenter.y) * ratio; }
      if (ptrs.size >= 2 && lastDist > 10 && m.dist > 10) {
        sc.scale = Math.max(0.5, Math.min(2.6, sc.scale * (m.dist / lastDist)));
        document.getElementById('pcScanZoom').value = String(Math.round(sc.scale * 100));
        this.updateScanLabels();
      }
      lastCenter = { x: m.cx, y: m.cy }; lastDist = m.dist;
      this.scheduleScanRender(true);
    });

    const onUp = (e) => {
      const sc = this.scanner;
      if (sc.cropMode === 'quad') {
        if (sc.activeCorner >= 0) { sc.activeCorner = -1; this.renderQuadEditorCanvas(); }
        return;
      }
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) { lastCenter = null; lastDist = 0; }
      else { const m = getMetrics(); lastCenter = { x: m.cx, y: m.cy }; lastDist = m.dist; }
    };
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
  },

  async downloadCurrentScannerPreview() {
    const sc = this.scanner;
    const s = this.getActiveSeries();
    if (!sc.img) return alert('請先拍攝或選取實體小卡相片！');

    const spec = this.CARD_RATIOS[sc.ratioKey || '63x88'] || this.CARD_RATIOS['63x88'];
    const backup = { hi: sc.hiResImg, scale: sc.scale, ox: sc.ox, oy: sc.oy, rot: sc.rot, fine: sc.fineRot };
    if (sc.cropMode === 'quad' && sc.rawHiResImg && (sc.quadDirty || sc.hiResImg === sc.rawHiResImg)) {
      sc.hiResImg = this.warpQuadToCanvas(sc.rawHiResImg, sc.quadPts, spec.w, spec.h);
      sc.scale = 1; sc.ox = 0; sc.oy = 0; sc.rot = 0; sc.fineRot = 0;
    }

    const out = document.createElement('canvas');
    out.width = spec.w; out.height = spec.h;
    this.renderScanCanvasFast(out, true, true);
    sc.hiResImg = backup.hi; sc.scale = backup.scale; sc.ox = backup.ox; sc.oy = backup.oy; sc.rot = backup.rot; sc.fineRot = backup.fine;

    out.toBlob((blob) => {
      if (!blob) return;
      const slot = s?.slots.find(x => x.idx === sc.slotIdx);
      const tag = slot ? `#${String(slot.idx).padStart(3, '0')}_${this.safeFileName(slot.member)}` : 'Card';
      this.triggerBlobDownload(blob, `Photocard_${tag}_${Date.now().toString().slice(-4)}.png`);
      if (typeof window.showChekiToast === 'function') window.showChekiToast('⬇️ 已下載高清拉直小卡 (.png)！');
    }, 'image/png');
  },

  async saveScannedCard() {
    const sc = this.scanner;
    const s = this.getActiveSeries();
    if (!s || !sc.img) return alert('請先拍攝或選取實體小卡相片！');

    const saveBtn = document.getElementById('pcScanSaveSubmitBtn');
    const oldTxt = saveBtn?.textContent;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ 正在拉直並合成高清真卡...'; }

    await new Promise(r => setTimeout(r, 30));
    try {
      const spec = this.CARD_RATIOS[sc.ratioKey || '63x88'] || this.CARD_RATIOS['63x88'];
      s.cardRatio = sc.ratioKey || '63x88';

      if (sc.cropMode === 'quad' && sc.rawHiResImg && (sc.quadDirty || sc.hiResImg === sc.rawHiResImg)) {
        sc.hiResImg = this.warpQuadToCanvas(sc.rawHiResImg, sc.quadPts, spec.w, spec.h);
        sc.img = sc.hiResImg;
        sc.scale = 1; sc.ox = 0; sc.oy = 0; sc.rot = 0; sc.fineRot = 0;
      }

      // 1. 留底未裁切原始相片與完整編輯參數（支援日後無限次重調四角、水平角度與濾鏡）
      const srcBaseCv = sc.rawHiResImg ? this.makeScaledCanvas(sc.rawHiResImg, 1280) : null;
      const scanSrcUrl = srcBaseCv ? srcBaseCv.toDataURL('image/jpeg', 0.86) : '';
      const scanParams = {
        ratioKey: sc.ratioKey || '63x88',
        quadPts: sc.quadPts.map(p => ({ x: Number(p.x.toFixed(4)), y: Number(p.y.toFixed(4)) })),
        scale: Number((sc.scale || 1).toFixed(3)),
        ox: Number((sc.ox || 0).toFixed(2)),
        oy: Number((sc.oy || 0).toFixed(2)),
        rot: sc.rot || 0,
        fineRot: Number((sc.fineRot || 0).toFixed(1)),
        deglare: sc.deglare ?? 0,
        sharpen: sc.sharpen ?? 0,
        bright: sc.bright ?? 100,
        radiusPct: sc.radiusPct ?? 6
      };

      // 2. 生成已拉直未切圓角底圖（供 Gemini AI 對齊使用）與最終圓角卡片圖
      const rectOut = this.renderUnclippedRectCanvas(spec.w, spec.h, true, true);
      const rawRectUrl = rectOut.toDataURL('image/jpeg', 0.88);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = spec.w; outCanvas.height = spec.h;
      const oCtx = outCanvas.getContext('2d');
      const rPx = spec.w * ((sc.radiusPct ?? 0) / 100);
      if (rPx > 0.5) { this.pcRoundRectPath(oCtx, 0, 0, spec.w, spec.h, rPx); oCtx.clip(); }
      oCtx.drawImage(rectOut, 0, 0);

      let dataUrl = outCanvas.toDataURL('image/webp', 0.90);
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = rPx > 0.5 ? outCanvas.toDataURL('image/png') : outCanvas.toDataURL('image/jpeg', 0.91);
      }

      if (sc.targetSide === 'seriesBack') {
        s.backImage = dataUrl;
        s.backRawRectImg = rawRectUrl;
        s.backRadiusPct = sc.radiusPct;
        if (scanSrcUrl) { s.backScanSrcImg = scanSrcUrl; s.backScanParams = scanParams; }
        await this.saveSeries(s);
        this.closeCardScanner();
        this.renderDex();
        if (typeof window.showChekiToast === 'function') window.showChekiToast('🎴 已儲存系列共用卡背！');
        return;
      }

      const slot = s.slots.find(x => x.idx === sc.slotIdx);
      if (!slot) return;
      if (sc.targetSide === 'back') {
        slot.realBackImg = dataUrl;
        slot.rawRectBackImg = rawRectUrl;
        slot.backRadiusPct = sc.radiusPct;
        if (scanSrcUrl) {
          slot.scanSrcBackImg = scanSrcUrl;
          slot.scanBackParams = scanParams;
          slot.scanBackSyncedLen = rawRectUrl.length;
        }
        this.state.autoFlipSlotOnce = slot.idx;
      } else {
        slot.realImg = dataUrl;
        slot.rawRectImg = rawRectUrl;
        slot.radiusPct = sc.radiusPct;
        slot.isAiHD = false;
        if (scanSrcUrl) {
          slot.scanSrcImg = scanSrcUrl;
          slot.scanParams = scanParams;
          slot.scanSyncedLen = rawRectUrl.length;
        }
        if ((slot.qty || 0) === 0) {
          slot.qty = 1; slot.wish = false; this.state.justUnlockedIdx = slot.idx;
          if (typeof window.fireCheerConfetti === 'function') window.fireCheerConfetti();
        }
      }
      await this.saveSeries(s);
      this.closeCardScanner();
      this.onSlotClick(slot.idx);
      this.renderDex();
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(16);
      if (typeof window.showChekiToast === 'function') {
        window.showChekiToast(sc.targetSide === 'back' ? '✍️ 已儲存小卡獨立背面（已自動翻面）！' : `✨ #${String(slot.idx).padStart(3, '0')} 無損真卡入庫成功！`, 3200);
      }
    } finally {
      if (saveBtn) { saveBtn.disabled = false; if (oldTxt) saveBtn.textContent = oldTxt; }
    }
  }
});
// === [重構版 C 段貼在此行正下方] ===
// ============================================================================
// [C 段]：手機 Gemini App (Ultra) 高清聯動 ＋ 下載中心 (海報/單卡/ZIP) ＋ 換卡圖 ＋ 雲端備份
// ============================================================================
(function attachPhotocardCleanPartC() {
  // 純前端免外掛 CRC-32 與標準 ZIP 打包器（支援中/日文 UTF-8 檔名）
  const CRC32_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function calcCrc32(u8) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) crc = CRC32_TABLE[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function buildZipBlob(entries) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | ((now.getSeconds() >> 1) & 0x1F);
    const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);

    const localParts = [], centralParts = [];
    let offset = 0;

    entries.forEach(({ name, bytes }) => {
      const nb = enc.encode(name), crc = calcCrc32(bytes), size = bytes.length;
      const lh = new Uint8Array(30 + nb.length), ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034b50, true); ldv.setUint16(4, 20, true); ldv.setUint16(6, 0x0800, true);
      ldv.setUint16(10, dosTime, true); ldv.setUint16(12, dosDate, true);
      ldv.setUint32(14, crc, true); ldv.setUint32(18, size, true); ldv.setUint32(22, size, true);
      ldv.setUint16(26, nb.length, true); lh.set(nb, 30);
      localParts.push(lh, bytes);

      const ch = new Uint8Array(46 + nb.length), cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014b50, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true); cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(12, dosTime, true); cdv.setUint16(14, dosDate, true);
      cdv.setUint32(16, crc, true); cdv.setUint32(20, size, true); cdv.setUint32(24, size, true);
      cdv.setUint16(28, nb.length, true); cdv.setUint32(42, offset, true); ch.set(nb, 46);
      centralParts.push(ch);
      offset += lh.length + size;
    });

    const cdSize = centralParts.reduce((s, p) => s + p.length, 0);
    const eocd = new Uint8Array(22), edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, entries.length, true); edv.setUint16(10, entries.length, true);
    edv.setUint32(12, cdSize, true); edv.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
  }

  const AI_PRESETS = {
    standard: {
      label: '✨ 標準高清去反光（保真首選）',
      appPrompt: [
        '請將這張日本偶像實體小卡進行超高清修復與重製（Ultra-HD Remaster）。',
        '【構圖與座標死鎖（極重要）】：必須保持與原圖 1:1 完全相同的長寬比例、鏡頭距離、人物大小與五官像素座標！嚴禁放大、縮小、平移人物，嚴禁裁切上下左右任何邊緣或自行延伸背景。',
        '【五官嚴格保真】：100% 忠實保留原本人物的五官、眼神、笑容、髮型、手指動作與服裝，絕不可變臉或改變妝容。',
        '【修復重點】：去除卡套反光、燈光白斑、灰塵、雜訊及印刷網點（網紋），恢復清晰眼神光、髮絲與自然真實膚質（勿過度磨皮），維持無白邊滿版輸出。'
      ].join('\n'),
      apiPrompt: 'Ultra-HD photo restoration of this Japanese idol photocard. STRICT GEOMETRY LOCK: Keep 1:1 identical aspect ratio, exact camera framing, exact head/face/hand pixel coordinates, and exact canvas boundaries—DO NOT zoom in, zoom out, crop edges, pan, or re-center. Preserve 100% exact facial identity, expression, hair, hands, and outfit. Remove sleeve glare, hotspots, noise, and print halftone dots. Output full-bleed with NO borders.'
    },
    detail: {
      label: '💎 極致細節強化（眼神光・衣裝）',
      appPrompt: [
        '請將這張日本偶像實體小卡進行棚拍級超高清細節強化（Ultra-HD Detail Remaster）。',
        '【構圖與座標死鎖（極重要）】：必須保持與原圖 1:1 完全相同的長寬比例、人物大小與五官像素座標！嚴禁放大、縮小、平移或裁切上下左右邊緣。',
        '【五官嚴格保真】：100% 鎖定人物原本五官、神情、髮型、手勢與背景，不可變臉。',
        '【強化重點】：清除表面反光、霧感與印刷網點，強化眼神光澤、睫毛、髮絲層次與服裝蕾絲亮片細節，保持自然膚質，維持無白邊滿版輸出。'
      ].join('\n'),
      apiPrompt: 'Studio-grade ultra-HD detail remaster of this Japanese idol photocard. STRICT GEOMETRY LOCK: Keep 1:1 identical aspect ratio, scale, and exact pixel coordinates of face, hands, and borders—DO NOT zoom, crop, or shift framing. Maintain exact facial identity and expression. Remove glare and halftone dots; enhance eye catchlights, hair strands, and costume textures. Full-bleed, NO borders.'
    },
    bright: {
      label: '🌙 暗場提亮降噪（去偏黃發灰）',
      appPrompt: [
        '請將這張日本偶像實體小卡進行超高清暗場提亮與色彩還原（Ultra-HD Lighting Restoration）。',
        '【構圖與座標死鎖（極重要）】：必須保持與原圖 1:1 完全相同的長寬比例、人物大小與五官像素座標！嚴禁放大、縮小、平移或裁切上下左右邊緣。',
        '【修復重點】：100% 保留原本五官、表情與姿勢，去除昏暗雜訊、偏黃偏色與卡面反光，校正為通透明亮的自然膚色，維持無白邊滿版輸出。'
      ].join('\n'),
      apiPrompt: 'Clean ultra-HD lighting restoration of this Japanese idol photocard. STRICT GEOMETRY LOCK: Keep 1:1 identical aspect ratio, scale, and exact pixel coordinates—DO NOT zoom, crop, or shift framing. Keep exact facial features and expression. Remove low-light grain, color cast, and glare; restore luminous natural skin tones. Full-bleed, NO borders.'
    }
  };

  const AI_MODELS = [
    { id: 'gemini-2.5-flash-image', label: '⚡ Gemini 2.5 Flash Image（推薦・快速高質）' },
    { id: 'gemini-3-pro-image-preview', label: '👑 Gemini 3 Pro Image（旗艦精細）' },
    { id: 'gemini-2.0-flash-exp-image-generation', label: '🧩 Gemini 2.0 Flash Image（經典相容）' }
  ];

  Object.assign(PCApp, {
    tradeCfg: { seekMode: 'missing', cols: 6, note: '香港面交 / 郵寄交換歡迎 DM ✨' },
    posterCfg: { cols: 6, dimMissing: true },
    _aiPreviewRaf: null,
    _aiTmpCanvas: null,

    aiState: {
      slotIdx: -1,
      side: 'front',
      preset: 'standard',
      model: localStorage.getItem('pc_gemini_model') || 'gemini-2.5-flash-image',
      beforeDataUrl: '',
      beforeCanvas: null,
      rawAiImg: null,
      align: { zoom: 1, shiftX: 0, shiftY: 0 },
      splitPct: 50,
      busy: false
    },

    // ------------------------------------------------------------------------
    // 單次掛載 AI 聯動彈窗、下載中心、換卡圖彈窗與雲端備份彈窗
    // ------------------------------------------------------------------------
    mountAiAndExportUI() {
      if (document.getElementById('pcAiRemasterModal')) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <input id="pcGeminiAppImportInput" type="file" accept="image/*" class="hidden" onchange="PCApp.importFromGeminiAppFile(event)">
        <input id="pcJsonImportInput" type="file" accept=".json,application/json" class="hidden" onchange="PCApp.importPhotocardJson(event)">

        <!-- ✨ Gemini AI 超高清化（含自動像素級五官對齊 ＋ 60fps 微調滑桿） -->
        <div id="pcAiRemasterModal" class="hidden fixed inset-0 z-[140] bg-black/88 flex items-center justify-center p-2.5 overflow-y-auto">
          <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-3.5 space-y-2.5 text-zinc-900 max-h-[94vh] overflow-y-auto">
            <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
              <div>
                <h3 class="font-black text-base leading-tight">✨ Gemini AI 小卡超高清化</h3>
                <p class="text-[10px] font-bold text-zinc-500">自動鎖定原圖五官座標 · 去反光網點與前後無縫對比</p>
              </div>
              <button type="button" onclick="PCApp.closeAiRemasterModal()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm shrink-0">✕</button>
            </div>

            <div id="pcAiSideBar" class="hidden grid grid-cols-2 gap-1.5">
              <button type="button" id="pcAiSideFront" onclick="PCApp.setAiTargetSide('front')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs">📸 高清化正面</button>
              <button type="button" id="pcAiSideBack" onclick="PCApp.setAiTargetSide('back')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs">✍️ 高清化背面</button>
            </div>

            <div class="bg-zinc-950 rounded-2xl p-2.5 border-2 border-cheki-dark flex flex-col items-center space-y-2">
              <div id="pcAiCompareBox" class="relative w-52 rounded-xl overflow-hidden border border-white/25 shadow-2xl bg-zinc-900 select-none" style="aspect-ratio:63/88;">
                <canvas id="pcAiAfterCanvas" class="hidden absolute inset-0 w-full h-full object-cover pointer-events-none"></canvas>
                <img id="pcAiBeforeImg" class="absolute inset-0 w-full h-full object-cover pointer-events-none">
                <div id="pcAiDividerLine" class="hidden absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.9)] pointer-events-none" style="left:50%;">
                  <div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white text-zinc-900 border-2 border-zinc-900 flex items-center justify-center text-[10px] font-black shadow-lg">↔</div>
                </div>
                <span id="pcAiBeforeTag" class="hidden absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-zinc-200 text-[9px] font-black">修圖前</span>
                <span id="pcAiAfterTag" class="hidden absolute top-2 right-2 px-1.5 py-0.5 rounded bg-emerald-400 text-zinc-950 text-[9px] font-black">✨ AI 高清</span>
                <div id="pcAiLoadingOverlay" class="hidden absolute inset-0 bg-black/72 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 text-center space-y-2">
                  <div class="w-8 h-8 rounded-full border-4 border-pink-400 border-t-transparent animate-spin"></div>
                  <p id="pcAiLoadingMsg" class="text-xs font-black text-white">正在自動對齊五官座標...</p>
                </div>
              </div>

              <div id="pcAiCompareSliderWrap" class="hidden w-full px-1 space-y-2">
                <div class="space-y-0.5">
                  <div class="flex justify-between text-[10px] font-black text-zinc-300">
                    <span>◀ 原本掃描</span>
                    <span>拉動檢視五官與細節對比</span>
                    <span class="text-emerald-300">AI 高清 ▶</span>
                  </div>
                  <input id="pcAiCompareRange" type="range" min="0" max="100" value="50" oninput="PCApp.updateAiCompareSplit(this.value)" class="w-full accent-emerald-400">
                </div>

                <!-- 🎯 五官座標自動對齊與微調面板 -->
                <div class="rounded-xl bg-zinc-900/95 border border-white/15 p-2 space-y-1.5 text-[10px] font-black text-zinc-200">
                  <div class="flex items-center justify-between gap-1">
                    <span class="text-emerald-300">🎯 五官對位微調（修正 AI 縮放/移位）</span>
                    <div class="flex items-center gap-1">
                      <button type="button" onclick="PCApp.runAutoAlignCurrentAi()" class="px-2 py-0.5 rounded bg-emerald-400 text-zinc-950 font-black">⚡ 自動對齊</button>
                      <button type="button" onclick="PCApp.resetAiAlignment()" class="px-1.5 py-0.5 rounded bg-white/15 text-white font-black">↺ 置中</button>
                    </div>
                  </div>
                  <div class="grid grid-cols-3 gap-1.5">
                    <label class="block">
                      <div class="flex justify-between text-[9.5px]"><span>🔎 縮放</span><span id="pcAiAlignZoomVal" class="text-sky-300">100%</span></div>
                      <input id="pcAiAlignZoom" type="range" min="82" max="118" step="0.2" value="100" oninput="PCApp.onAiAlignInput()" class="w-full accent-sky-400">
                    </label>
                    <label class="block">
                      <div class="flex justify-between text-[9.5px]"><span>↔ 左右</span><span id="pcAiAlignXVal" class="text-amber-300">0%</span></div>
                      <input id="pcAiAlignX" type="range" min="-14" max="14" step="0.2" value="0" oninput="PCApp.onAiAlignInput()" class="w-full accent-amber-400">
                    </label>
                    <label class="block">
                      <div class="flex justify-between text-[9.5px]"><span>↕ 上下</span><span id="pcAiAlignYVal" class="text-pink-300">0%</span></div>
                      <input id="pcAiAlignY" type="range" min="-14" max="14" step="0.2" value="0" oninput="PCApp.onAiAlignInput()" class="w-full accent-pink-400">
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border-2 border-cheki-dark bg-white p-2.5 text-xs">
              <label class="text-[11px] font-black text-zinc-700 block mb-1">🎨 高清化模式</label>
              <select id="pcAiPresetSelect" onchange="PCApp.aiState.preset=this.value" class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark bg-zinc-50 font-black text-xs">
                ${Object.entries(AI_PRESETS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('')}
              </select>
            </div>

            <!-- 📱 手機版 Gemini App (Ultra) 零費用聯動專區 -->
            <div class="rounded-2xl border-2 border-cheki-dark bg-gradient-to-br from-indigo-50 via-white to-pink-50 p-3 space-y-2">
              <div class="flex items-center justify-between gap-1">
                <span class="font-black text-[11.5px] text-indigo-950 truncate">📱 手機 Gemini App 直連（Ultra 免 API 費）</span>
                <span class="px-2 py-0.5 rounded-full bg-emerald-200 border border-cheki-dark text-[9px] font-black text-emerald-950 shrink-0">零額外費用</span>
              </div>
              <button type="button" onclick="PCApp.sendCardToGeminiApp()" class="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white neo-btn font-black text-xs flex items-center justify-center gap-1.5 active:scale-95">
                <span>🚀</span><span>步驟 1：複製鎖座標指令 ＋ 傳圖至 Gemini</span>
              </button>
              <div class="grid grid-cols-2 gap-1.5">
                <button type="button" onclick="PCApp.copyPromptAndDownloadCard()" class="py-1.5 px-2 rounded-xl bg-white border-2 border-cheki-dark font-black text-[10.5px] text-zinc-800 active:scale-95">📋 複製指令＋存圖</button>
                <button type="button" onclick="PCApp.openGeminiWebApp()" class="py-1.5 px-2 rounded-xl bg-sky-100 border-2 border-cheki-dark font-black text-[10.5px] text-blue-950 active:scale-95">🌐 直接打開 Gemini</button>
              </div>
              <button type="button" onclick="document.getElementById('pcGeminiAppImportInput').click()" class="w-full py-2.5 px-3 rounded-2xl bg-amber-300 hover:bg-amber-400 text-zinc-950 neo-btn font-black text-xs flex items-center justify-center gap-1.5 active:scale-95">
                <span>📥</span><span>步驟 2：匯入 Gemini 高清圖（自動對齊五官）</span>
              </button>
              <p class="text-[10px] font-bold text-zinc-500 leading-snug">
                💡 匯入後系統會自動計算五官邊緣座標修正 AI 縮放與移位；亦可拉動上方滑桿微調至中線完全無縫！
              </p>
            </div>

            <div id="pcAiResultActions" class="hidden grid grid-cols-2 gap-1.5">
              <button type="button" onclick="PCApp.applyAiRemasterResult()" class="py-2.5 rounded-2xl bg-emerald-400 text-zinc-950 neo-btn font-black text-xs active:scale-95">✅ 套用此高清真卡</button>
              <button type="button" onclick="PCApp.downloadAiPreviewPng()" class="py-2.5 rounded-2xl bg-sky-200 text-zinc-950 neo-btn font-black text-xs active:scale-95">⬇️ 直接下載 (.png)</button>
            </div>

            <details id="pcAiApiAdvancedDetails" class="rounded-2xl border-2 border-zinc-300 bg-zinc-50 p-2.5 text-xs">
              <summary class="font-black text-[11px] text-zinc-600 cursor-pointer select-none flex items-center justify-between">
                <span>⚙️ 進階：改用 Gemini API Key 站內生成（分開計費）</span>
                <span class="text-[10px] underline">展開</span>
              </summary>
              <div class="pt-2.5 space-y-2">
                <select id="pcAiModelSelect" onchange="PCApp.aiState.model=this.value;localStorage.setItem('pc_gemini_model',this.value);" class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark bg-white font-black text-[11px]">
                  ${AI_MODELS.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}
                </select>
                <div class="flex gap-1.5">
                  <input id="pcAiKeyInput" type="password" placeholder="貼上 AIza 開頭的 Gemini API Key" class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-cheki-dark bg-white text-xs font-bold">
                  <button type="button" onclick="PCApp.saveAiKeyFromUI()" class="px-3 py-1.5 rounded-lg bg-amber-300 border border-cheki-dark font-black text-xs shrink-0">儲存</button>
                </div>
                <button type="button" id="pcAiRunBtn" onclick="PCApp.runGeminiPhotocardHD()" class="w-full py-2.5 rounded-xl bg-zinc-900 text-white font-black text-xs active:scale-95">⚡ 用 API Key 站內生成</button>
              </div>
            </details>
          </div>
        </div>

        <!-- ⬇️ 圖鑑下載中心（收藏海報 ＋ 一鍵 ZIP 打包） -->
        <div id="pcDownloadCenterModal" class="hidden fixed inset-0 z-[138] bg-black/85 flex items-center justify-center p-2.5 overflow-y-auto">
          <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-3.5 space-y-3 text-zinc-900 max-h-[93vh] overflow-y-auto">
            <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
              <div>
                <h3 class="font-black text-base leading-tight">⬇️ 小卡圖鑑下載中心</h3>
                <p class="text-[10px] font-bold text-zinc-500">匯出高清圖鑑收藏海報，或一鍵 ZIP 打包全部小卡圖檔</p>
              </div>
              <button type="button" onclick="PCApp.closeDownloadCenter()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm shrink-0">✕</button>
            </div>

            <div class="rounded-2xl border-2 border-cheki-dark bg-white p-2.5 space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-black text-xs">🏆 整套圖鑑收藏海報 (.png)</span>
                <div class="flex items-center gap-1">
                  <button type="button" id="pcPosterCols3" onclick="PCApp.setPosterOption('cols',3)" class="px-2 py-0.5 rounded-lg border border-cheki-dark text-[10px] font-black">3 欄</button>
                  <button type="button" id="pcPosterCols6" onclick="PCApp.setPosterOption('cols',6)" class="px-2 py-0.5 rounded-lg border border-cheki-dark text-[10px] font-black">6 欄</button>
                </div>
              </div>
              <div class="bg-zinc-900 rounded-xl p-1.5 border border-zinc-700 flex justify-center">
                <canvas id="pcShowcasePosterCanvas" class="max-h-[36vh] max-w-full w-auto h-auto object-contain rounded-lg shadow"></canvas>
              </div>
              <label class="flex items-center gap-2 text-[11px] font-bold text-zinc-700 cursor-pointer">
                <input type="checkbox" checked onchange="PCApp.setPosterOption('dimMissing', this.checked)" class="w-4 h-4 accent-indigo-600 rounded">
                <span>未點亮小卡顯示為灰階鎖定狀態</span>
              </label>
              <div class="grid grid-cols-2 gap-1.5">
                <button type="button" onclick="PCApp.exportShowcasePoster(false)" class="py-2 rounded-xl bg-cheki-accent text-white neo-btn font-black text-xs active:scale-95">⬇️ 下載圖鑑海報</button>
                <button type="button" onclick="PCApp.exportShowcasePoster(true)" class="py-2 rounded-xl bg-sky-300 text-zinc-950 neo-btn font-black text-xs active:scale-95">📤 分享至 X / IG</button>
              </div>
            </div>

            <div class="rounded-2xl border-2 border-cheki-dark bg-amber-50/80 p-3 space-y-2">
              <div>
                <span class="font-black text-xs block">📦 批次打包下載小卡原圖 (.zip)</span>
                <p id="pcZipCountHint" class="text-[10px] font-bold text-zinc-600 mt-0.5"></p>
              </div>
              <button type="button" id="pcZipRealBtn" onclick="PCApp.downloadSeriesZip(false)" class="w-full py-2.5 rounded-xl bg-emerald-400 text-zinc-950 neo-btn font-black text-xs active:scale-95">
                📦 打包下載「全部已掃描高清真卡」(.zip)
              </button>
              <button type="button" id="pcZipAllBtn" onclick="PCApp.downloadSeriesZip(true)" class="w-full py-2 rounded-xl bg-white border-2 border-cheki-dark text-zinc-800 font-black text-[11px] active:scale-95">
                🗂️ 打包下載「全套圖鑑（真卡優先＋預覽切圖＋卡背）」(.zip)
              </button>
            </div>
          </div>
        </div>

        <!-- 🔁 【譲／求】換卡一覽圖生成器 -->
        <div id="pcTradeModal" class="hidden fixed inset-0 z-[136] bg-black/85 flex items-center justify-center p-2.5 overflow-y-auto">
          <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-3.5 space-y-2.5 text-zinc-900 max-h-[93vh] overflow-y-auto">
            <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
              <div>
                <h3 class="font-black text-base leading-tight">🔁 【譲／求】換卡一覽圖生成</h3>
                <p class="text-[10px] font-bold text-zinc-500">自動標記多出複數為「譲」・缺卡或許願卡為「求」</p>
              </div>
              <button type="button" onclick="PCApp.closeTradeSheetModal()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm shrink-0">✕</button>
            </div>
            <div class="bg-zinc-900 rounded-2xl p-2 border-2 border-cheki-dark flex justify-center">
              <canvas id="pcTradeCanvas" class="max-h-[42vh] max-w-full w-auto h-auto object-contain rounded-xl shadow-lg"></canvas>
            </div>
            <div class="rounded-2xl border-2 border-cheki-dark bg-white p-2.5 space-y-2 text-xs">
              <div class="grid grid-cols-2 gap-1.5">
                <button type="button" id="pcTradeSeekMissing" onclick="PCApp.setTradeOption('seekMode','missing')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px]">🔴 全部未擁有標「求」</button>
                <button type="button" id="pcTradeSeekWish" onclick="PCApp.setTradeOption('seekMode','wish')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px]">💖 只標 💖許願卡「求」</button>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="font-black text-[11px] shrink-0">排版欄數：</span>
                <button type="button" id="pcTradeCols3" onclick="PCApp.setTradeOption('cols',3)" class="flex-1 py-1 rounded-lg border-2 border-cheki-dark font-black text-[11px]">3 欄大圖</button>
                <button type="button" id="pcTradeCols6" onclick="PCApp.setTradeOption('cols',6)" class="flex-1 py-1 rounded-lg border-2 border-cheki-dark font-black text-[11px]">6 欄全覽</button>
              </div>
              <input type="text" value="香港面交 / 郵寄交換歡迎 DM ✨" oninput="PCApp.onTradeNoteInput(this.value)" placeholder="輸入交換條件備註..." class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark font-bold text-xs bg-zinc-50">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" onclick="PCApp.exportTradeSheet(false)" class="py-2.5 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs">⬇️ 下載換卡圖</button>
              <button type="button" onclick="PCApp.exportTradeSheet(true)" class="py-2.5 rounded-2xl bg-sky-300 text-zinc-950 neo-btn font-black text-xs">📤 分享至 X / IG</button>
            </div>
          </div>
        </div>

        <!-- ☁️ 小卡圖鑑備份與 Google Drive 同步 -->
        <div id="pcBackupModal" class="hidden fixed inset-0 z-[136] bg-black/80 flex items-center justify-center p-3">
          <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-4 space-y-3 text-zinc-900">
            <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
              <div>
                <h3 class="font-black text-base leading-tight">💾 小卡圖鑑備份與雲端同步</h3>
                <p class="text-[10px] font-bold text-zinc-500">獨立保存所有系列、預覽切格與高清掃描真卡</p>
              </div>
              <button type="button" onclick="document.getElementById('pcBackupModal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm">✕</button>
            </div>
            <p id="pcBackupStatusText" class="text-xs font-bold text-zinc-600 bg-sky-50 border border-sky-200 rounded-xl p-2.5"></p>
            <div class="space-y-2">
              <button type="button" onclick="PCApp.syncPhotocardsToDrive()" class="w-full py-2.5 rounded-2xl bg-gradient-to-r from-sky-400 to-blue-500 text-white neo-btn font-black text-xs">☁️ 同步小卡圖鑑至 Google Drive</button>
              <button type="button" onclick="PCApp.restorePhotocardsFromDrive()" class="w-full py-2.5 rounded-2xl bg-emerald-300 text-zinc-950 neo-btn font-black text-xs">⬇️ 從 Google Drive 還原小卡圖鑑</button>
              <div class="grid grid-cols-2 gap-2 pt-1">
                <button type="button" onclick="PCApp.exportPhotocardJson()" class="py-2.5 rounded-2xl bg-amber-200 text-zinc-950 neo-btn font-black text-xs">📥 匯出本機 .json</button>
                <button type="button" onclick="document.getElementById('pcJsonImportInput').click()" class="py-2.5 rounded-2xl bg-white neo-btn font-black text-xs">📤 匯入 .json 還原</button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);
    },

    // ------------------------------------------------------------------------
    // 1. Gemini AI 高清化（標準化原圖比例 ＋ 方向梯度自動對齊五官 ＋ 羽化補底）
    // ------------------------------------------------------------------------
    getStoredGeminiKey() {
      for (const k of ['pc_gemini_api_key', 'cheki_gemini_api_key', 'gemini_api_key', 'geminiApiKey']) {
        const v = (localStorage.getItem(k) || '').trim();
        if (v.startsWith('AIza')) return v;
      }
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const v = (localStorage.getItem(localStorage.key(i)) || '').trim();
          if (/^AIza[0-9A-Za-z\-_]{30,}$/.test(v)) return v;
        }
      } catch (_) {}
      return '';
    },

    saveAiKeyFromUI() {
      const val = (document.getElementById('pcAiKeyInput')?.value || '').trim();
      if (!val.startsWith('AIza')) return alert('請輸入有效的 Gemini API Key（AIza 開頭）！');
      localStorage.setItem('pc_gemini_api_key', val);
      if (typeof window.showChekiToast === 'function') window.showChekiToast('🔑 已儲存 Gemini API Key！');
    },

    // 將修圖前原圖統一標準化為系列精確比例矩形，確保「傳送圖 / 對比左圖 / 對齊基準」100% 一致
    async prepareStandardBeforeCanvas(rawSrc, seriesObj) {
      const im = await this.loadImgAsync(rawSrc);
      if (!im) return null;
      const spec = this.getSeriesRatioSpec(seriesObj);
      const outW = Math.round(spec.w * 1.5), outH = Math.round(spec.h * 1.5);
      const cv = document.createElement('canvas');
      cv.width = outW; cv.height = outH;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#111113';
      ctx.fillRect(0, 0, outW, outH);

      const targetRatio = outW / outH, imgRatio = im.width / im.height;
      let sx = 0, sy = 0, sw = im.width, sh = im.height;
      if (imgRatio > targetRatio) { sw = im.height * targetRatio; sx = (im.width - sw) / 2; }
      else { sh = im.width / targetRatio; sy = (im.height - sh) / 2; }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, sx, sy, sw, sh, 0, 0, outW, outH);
      return cv;
    },

    async openAiRemasterModal(slotIdx, side = 'front') {
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === slotIdx);
      if (!s || !slot) return;

      this.aiState.slotIdx = slotIdx;
      this.aiState.side = side;
      this.aiState.rawAiImg = null;
      this.aiState.align = { zoom: 1, shiftX: 0, shiftY: 0 };
      this.aiState.splitPct = 50;
      this.aiState.busy = false;

      const spec = this.getSeriesRatioSpec(s);
      const radPct = side === 'back' ? (slot.backRadiusPct ?? s.backRadiusPct) : slot.radiusPct;
      const box = document.getElementById('pcAiCompareBox');
      if (box) {
        box.style.aspectRatio = spec.css;
        box.style.borderRadius = this.getSlotCssRadius(radPct, s);
      }
      document.getElementById('pcAiSideBar')?.classList.toggle('hidden', !slot.realBackImg);

      const kInp = document.getElementById('pcAiKeyInput');
      if (kInp) kInp.value = this.getStoredGeminiKey();
      const adv = document.getElementById('pcAiApiAdvancedDetails');
      if (adv) adv.open = false;

      document.getElementById('pcAiRemasterModal')?.classList.remove('hidden');
      await this.loadAiSideSource(s, slot, side);
    },

    async loadAiSideSource(s, slot, side) {
      const isBack = side === 'back';
      const rawSrc = isBack
        ? (slot.rawRectBackImg || slot.realBackImg || s.backImage)
        : (slot.rawRectImg || slot.realImg || slot.sampleImg);

      this.aiState.beforeDataUrl = rawSrc || '';
      this.aiState.beforeCanvas = null;
      this.refreshAiModalPreviewState();

      if (rawSrc) {
        const stdCv = await this.prepareStandardBeforeCanvas(rawSrc, s);
        if (stdCv && this.aiState.slotIdx === slot.idx && this.aiState.side === side) {
          this.aiState.beforeCanvas = stdCv;
          this.aiState.beforeDataUrl = stdCv.toDataURL('image/jpeg', 0.94);
          this.refreshAiModalPreviewState();
        }
      }
    },

    closeAiRemasterModal() {
      if (this.aiState.busy && !confirm('仍在處理中，確定關閉嗎？')) return;
      this.aiState.busy = false;
      document.getElementById('pcAiRemasterModal')?.classList.add('hidden');
    },

    async setAiTargetSide(side) {
      if (this.aiState.busy) return;
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === this.aiState.slotIdx);
      if (!s || !slot) return;
      this.aiState.side = side;
      this.aiState.rawAiImg = null;
      this.aiState.align = { zoom: 1, shiftX: 0, shiftY: 0 };
      await this.loadAiSideSource(s, slot, side);
    },

    // 核心演算法：方向梯度互相關 (Signed-Gradient ZNCC) 自動對齊原圖與 AI 圖五官座標
    computeAutoAlignment(beforeCv, aiImg, spec) {
      if (!beforeCv || !aiImg) return { zoom: 1, shiftX: 0, shiftY: 0 };

      const refW = 96;
      const refH = Math.max(96, Math.round(refW * (spec.h / spec.w)));
      const targetRatio = spec.w / spec.h;
      const imgRatio = aiImg.width / aiImg.height;
      const relW = imgRatio > targetRatio ? (imgRatio / targetRatio) : 1;
      const relH = imgRatio > targetRatio ? 1 : (targetRatio / imgRatio);

      const extractGradients = (src, w, h) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        const lum = new Float32Array(w * h);
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
          lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
        const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) {
          const off = y * w;
          for (let x = 1; x < w - 1; x++) {
            gx[off + x] = lum[off + x + 1] - lum[off + x - 1];
            gy[off + x] = lum[off + w + x] - lum[off - w + x];
          }
        }
        return { gx, gy };
      };

      const refG = extractGradients(beforeCv, refW, refH);
      const sw = Math.max(84, Math.min(144, Math.round(refW * relW)));
      const sh = Math.max(84, Math.round(sw / imgRatio));
      const aiG = extractGradients(aiImg, sw, sh);

      const x0 = Math.round(refW * 0.10), x1 = Math.round(refW * 0.90);
      const y0 = Math.round(refH * 0.08), y1 = Math.round(refH * 0.88);

      const scoreTransform = (zoom, shiftX, shiftY, stride, bilinear) => {
        const invW = 1 / (relW * zoom), invH = 1 / (relH * zoom);
        const offU = 0.5 + shiftX / 100, offV = 0.5 + shiftY / 100;
        let dot = 0, eRef = 0, eAi = 0, valid = 0, total = 0;

        for (let y = y0; y < y1; y += stride) {
          const av = ((y + 0.5) / refH - offV) * invH + 0.5;
          const rOff = y * refW;
          for (let x = x0; x < x1; x += stride) {
            total++;
            if (av <= 0.015 || av >= 0.985) continue;
            const au = ((x + 0.5) / refW - offU) * invW + 0.5;
            if (au <= 0.015 || au >= 0.985) continue;

            const rgx = refG.gx[rOff + x], rgy = refG.gy[rOff + x];
            let agx, agy;
            if (bilinear) {
              const ax = au * sw - 0.5, ay = av * sh - 0.5;
              const ix = ax | 0, iy = ay | 0;
              const fx = ax - ix, fy = ay - iy, ifx = 1 - fx, ify = 1 - fy;
              const p00 = iy * sw + ix, p10 = p00 + 1, p01 = p00 + sw, p11 = p01 + 1;
              const w00 = ifx * ify, w10 = fx * ify, w01 = ifx * fy, w11 = fx * fy;
              agx = aiG.gx[p00] * w00 + aiG.gx[p10] * w10 + aiG.gx[p01] * w01 + aiG.gx[p11] * w11;
              agy = aiG.gy[p00] * w00 + aiG.gy[p10] * w10 + aiG.gy[p01] * w01 + aiG.gy[p11] * w11;
            } else {
              const p = ((av * sh) | 0) * sw + ((au * sw) | 0);
              agx = aiG.gx[p]; agy = aiG.gy[p];
            }
            dot += rgx * agx + rgy * agy;
            eRef += rgx * rgx + rgy * rgy;
            eAi += agx * agx + agy * agy;
            valid++;
          }
        }
        if (valid < total * 0.72 || eRef < 1 || eAi < 1) return -1;
        return dot / Math.sqrt(eRef * eAi);
      };

      const baseScore = scoreTransform(1, 0, 0, 1, true);
      let best = { zoom: 1, shiftX: 0, shiftY: 0, score: baseScore };

      // 第 1 階段：粗搜尋（涵蓋 AI 縮放 84%～116% 與平移 ±12%）
      for (let z = 0.84; z <= 1.1601; z += 0.02) {
        for (let sy = -12; sy <= 12.01; sy += 1.5) {
          for (let sx = -9; sx <= 9.01; sx += 1.5) {
            const sc = scoreTransform(z, sx, sy, 3, false);
            if (sc > best.score) best = { zoom: z, shiftX: sx, shiftY: sy, score: sc };
          }
        }
      }

      // 第 2 階段：雙線性插值中精度搜尋
      let center = { ...best };
      for (let z = center.zoom - 0.025; z <= center.zoom + 0.0251; z += 0.005) {
        if (z < 0.82 || z > 1.18) continue;
        for (let sy = center.shiftY - 2.0; sy <= center.shiftY + 2.01; sy += 0.4) {
          for (let sx = center.shiftX - 2.0; sx <= center.shiftX + 2.01; sx += 0.4) {
            const sc = scoreTransform(z, sx, sy, 2, true);
            if (sc > best.score) best = { zoom: z, shiftX: sx, shiftY: sy, score: sc };
          }
        }
      }

      // 第 3 階段：亞像素級精修 (0.1% 精度)
      for (const [dz, ds] of [[0.002, 0.15], [0.001, 0.05]]) {
        let improved = true;
        while (improved) {
          improved = false;
          for (const sz of [-dz, 0, dz]) {
            for (const sy of [-ds, 0, ds]) {
              for (const sx of [-ds, 0, ds]) {
                if (sz === 0 && sx === 0 && sy === 0) continue;
                const nz = best.zoom + sz, nx = best.shiftX + sx, ny = best.shiftY + sy;
                if (nz < 0.82 || nz > 1.18 || Math.abs(nx) > 14 || Math.abs(ny) > 14) continue;
                const sc = scoreTransform(nz, nx, ny, 1, true);
                if (sc > best.score + 1e-5) {
                  best = { zoom: nz, shiftX: nx, shiftY: ny, score: sc };
                  improved = true;
                }
              }
            }
          }
        }
      }

      if (best.score < 0.20 || best.score < baseScore + 0.005) {
        return { zoom: 1, shiftX: 0, shiftY: 0 };
      }
      return {
        zoom: Number(best.zoom.toFixed(3)),
        shiftX: Number(best.shiftX.toFixed(2)),
        shiftY: Number(best.shiftY.toFixed(2))
      };
    },

    // 將對齊後的 AI 圖片繪製到指定畫布（若極邊緣因 AI 裁切而內縮，自動用原圖柔和羽化補底）
    drawAlignedAiToCtx(ctx, W, H, beforeCv, aiImg, align) {
      ctx.clearRect(0, 0, W, H);
      if (beforeCv) ctx.drawImage(beforeCv, 0, 0, W, H);
      else { ctx.fillStyle = '#111113'; ctx.fillRect(0, 0, W, H); }
      if (!aiImg) return;

      const targetRatio = W / H, imgRatio = aiImg.width / aiImg.height;
      const relW = imgRatio > targetRatio ? (imgRatio / targetRatio) : 1;
      const relH = imgRatio > targetRatio ? 1 : (targetRatio / imgRatio);

      const zoom = align?.zoom || 1;
      const dw = W * relW * zoom, dh = H * relH * zoom;
      const dx = (0.5 + (align?.shiftX || 0) / 100) * W - dw / 2;
      const dy = (0.5 + (align?.shiftY || 0) / 100) * H - dh / 2;

      const needFeather = beforeCv && (dx > 1 || dy > 1 || (dx + dw) < W - 1 || (dy + dh) < H - 1);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

      if (!needFeather) {
        ctx.drawImage(aiImg, dx, dy, dw, dh);
        return;
      }

      const tmp = this._aiTmpCanvas || (this._aiTmpCanvas = document.createElement('canvas'));
      tmp.width = W; tmp.height = H;
      const tCtx = tmp.getContext('2d');
      tCtx.clearRect(0, 0, W, H);
      tCtx.imageSmoothingEnabled = true; tCtx.imageSmoothingQuality = 'high';
      tCtx.drawImage(aiImg, dx, dy, dw, dh);

      const f = Math.max(8, Math.round(W * 0.025));
      tCtx.globalCompositeOperation = 'destination-out';
      const fadeEdge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const g = tCtx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        tCtx.fillStyle = g; tCtx.fillRect(rx, ry, rw, rh);
      };
      if (dx > 1) fadeEdge(dx, 0, dx + f, 0, Math.max(0, dx - 2), 0, f + 2, H);
      if (dx + dw < W - 1) fadeEdge(dx + dw, 0, dx + dw - f, 0, dx + dw - f, 0, f + 2, H);
      if (dy > 1) fadeEdge(0, dy, 0, dy + f, 0, Math.max(0, dy - 2), W, f + 2);
      if (dy + dh < H - 1) fadeEdge(0, dy + dh, 0, dy + dh - f, 0, dy + dh - f, W, f + 2);
      tCtx.globalCompositeOperation = 'source-over';

      ctx.drawImage(tmp, 0, 0);
    },

    renderAiAfterPreviewCanvas() {
      const cv = document.getElementById('pcAiAfterCanvas');
      const s = this.getActiveSeries();
      if (!cv || !s || !this.aiState.rawAiImg) return;
      const spec = this.getSeriesRatioSpec(s);
      const pw = Math.round(spec.preW * 1.6), ph = Math.round(spec.preH * 1.6);
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
      this.drawAlignedAiToCtx(cv.getContext('2d'), pw, ph, this.aiState.beforeCanvas, this.aiState.rawAiImg, this.aiState.align);
    },

    syncAiAlignSlidersUI() {
      const { zoom, shiftX, shiftY } = this.aiState.align;
      const zPct = Number((zoom * 100).toFixed(1));
      const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
      const setT = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
      setV('pcAiAlignZoom', zPct);
      setV('pcAiAlignX', shiftX);
      setV('pcAiAlignY', shiftY);
      setT('pcAiAlignZoomVal', `${zPct}%`);
      setT('pcAiAlignXVal', `${shiftX > 0 ? '+' : ''}${shiftX}%`);
      setT('pcAiAlignYVal', `${shiftY > 0 ? '+' : ''}${shiftY}%`);
    },

    onAiAlignInput() {
      this.aiState.align = {
        zoom: Number(document.getElementById('pcAiAlignZoom')?.value || 100) / 100,
        shiftX: Number(document.getElementById('pcAiAlignX')?.value || 0),
        shiftY: Number(document.getElementById('pcAiAlignY')?.value || 0)
      };
      this.syncAiAlignSlidersUI();
      if (!this._aiPreviewRaf) {
        this._aiPreviewRaf = requestAnimationFrame(() => {
          this._aiPreviewRaf = null;
          this.renderAiAfterPreviewCanvas();
        });
      }
    },

    runAutoAlignCurrentAi() {
      const s = this.getActiveSeries();
      if (!s || !this.aiState.rawAiImg) return;
      this.aiState.align = this.computeAutoAlignment(this.aiState.beforeCanvas, this.aiState.rawAiImg, this.getSeriesRatioSpec(s));
      this.syncAiAlignSlidersUI();
      this.renderAiAfterPreviewCanvas();
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(12);
      if (typeof window.showChekiToast === 'function') window.showChekiToast('🎯 已重新執行自動五官像素對齊！', 2400);
    },

    resetAiAlignment() {
      this.aiState.align = { zoom: 1, shiftX: 0, shiftY: 0 };
      this.syncAiAlignSlidersUI();
      this.renderAiAfterPreviewCanvas();
    },

    refreshAiModalPreviewState() {
      const isBack = this.aiState.side === 'back';
      const bF = document.getElementById('pcAiSideFront');
      const bB = document.getElementById('pcAiSideBack');
      if (bF) bF.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs ${!isBack ? 'bg-emerald-400 text-zinc-950' : 'bg-zinc-100 text-zinc-500'}`;
      if (bB) bB.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs ${isBack ? 'bg-amber-300 text-zinc-950' : 'bg-zinc-100 text-zinc-500'}`;

      const hasAfter = Boolean(this.aiState.rawAiImg);
      const beforeImg = document.getElementById('pcAiBeforeImg');
      const afterCv = document.getElementById('pcAiAfterCanvas');
      const p = this.aiState.splitPct ?? 50;

      if (beforeImg) {
        beforeImg.src = this.aiState.beforeDataUrl || '';
        beforeImg.style.clipPath = hasAfter ? `inset(0 ${100 - p}% 0 0)` : 'none';
      }
      if (afterCv) {
        afterCv.classList.toggle('hidden', !hasAfter);
        if (hasAfter) this.renderAiAfterPreviewCanvas();
      }

      ['pcAiDividerLine', 'pcAiBeforeTag', 'pcAiAfterTag', 'pcAiCompareSliderWrap', 'pcAiResultActions'].forEach(id => {
        document.getElementById(id)?.classList.toggle('hidden', !hasAfter);
      });
      const rng = document.getElementById('pcAiCompareRange');
      if (rng) rng.value = String(p);
      const line = document.getElementById('pcAiDividerLine');
      if (line) line.style.left = `${p}%`;
      if (hasAfter) this.syncAiAlignSlidersUI();
    },

    updateAiCompareSplit(pct) {
      const p = Math.max(0, Math.min(100, Number(pct) || 50));
      this.aiState.splitPct = p;
      const beforeImg = document.getElementById('pcAiBeforeImg');
      const line = document.getElementById('pcAiDividerLine');
      if (beforeImg) beforeImg.style.clipPath = `inset(0 ${100 - p}% 0 0)`;
      if (line) line.style.left = `${p}%`;
    },

    async copyTextReliable(text) {
      try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (_) {}
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        return true;
      } catch (_) { return false; }
    },

    async prepareCleanJpegFile(dataUrl, baseName) {
      const im = await this.loadImgAsync(dataUrl);
      if (!im) throw new Error('無法讀取小卡圖片');
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, 0, 0);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.95));
      return { blob, file: new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }) };
    },

    async sendCardToGeminiApp() {
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === this.aiState.slotIdx);
      if (!s || !this.aiState.beforeDataUrl) return alert('找不到可傳送的小卡圖片！');

      const preset = AI_PRESETS[this.aiState.preset] || AI_PRESETS.standard;
      await this.copyTextReliable(preset.appPrompt);
      const baseName = `${this.safeFileName(s.title)}_${String(slot?.idx || 0).padStart(3, '0')}`;

      try {
        const { blob, file } = await this.prepareCleanJpegFile(this.aiState.beforeDataUrl, baseName);
        if (navigator.share && navigator.canShare) {
          if (navigator.canShare({ files: [file], text: preset.appPrompt })) {
            await navigator.share({ files: [file], text: preset.appPrompt, title: 'Gemini 小卡超高清化' });
            return;
          }
          if (navigator.canShare({ files: [file] })) {
            if (typeof window.showChekiToast === 'function') window.showChekiToast('📋 指令已複製！請點選 Gemini 並貼上指令', 3800);
            await navigator.share({ files: [file] });
            return;
          }
        }
        this.triggerBlobDownload(blob, `${baseName}_for_Gemini.jpg`);
        if (typeof window.showChekiToast === 'function') window.showChekiToast('📋 已複製保真指令並下載原圖！打開 Gemini App 上傳貼上即可', 4200);
      } catch (err) {
        if (err?.name !== 'AbortError') alert('請改按下方「📋 複製指令＋存圖」手動上傳至 Gemini App！');
      }
    },

    async copyPromptAndDownloadCard() {
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === this.aiState.slotIdx);
      if (!s || !this.aiState.beforeDataUrl) return;
      const preset = AI_PRESETS[this.aiState.preset] || AI_PRESETS.standard;
      await this.copyTextReliable(preset.appPrompt);
      const baseName = `${this.safeFileName(s.title)}_${String(slot?.idx || 0).padStart(3, '0')}`;
      const { blob } = await this.prepareCleanJpegFile(this.aiState.beforeDataUrl, baseName);
      this.triggerBlobDownload(blob, `${baseName}_for_Gemini.jpg`);
      if (typeof window.showChekiToast === 'function') window.showChekiToast('✅ 已複製保真指令並下載原圖！', 3600);
    },

    openGeminiWebApp() { window.open('https://gemini.google.com/app', '_blank', 'noopener'); },

    // 匯出最終對齊好的高清雙層圖檔（無損矩形底圖 ＋ 精確圓角展示圖）
    buildFinalAlignedAiCanvases(seriesObj, slotObj, side) {
      const spec = this.getSeriesRatioSpec(seriesObj);
      const outW = Math.round(spec.w * 1.5), outH = Math.round(spec.h * 1.5);

      const rectCv = document.createElement('canvas');
      rectCv.width = outW; rectCv.height = outH;
      this.drawAlignedAiToCtx(rectCv.getContext('2d'), outW, outH, this.aiState.beforeCanvas, this.aiState.rawAiImg, this.aiState.align);

      const radPct = side === 'back'
        ? (typeof slotObj?.backRadiusPct === 'number' ? slotObj.backRadiusPct : 6)
        : (typeof slotObj?.radiusPct === 'number' ? slotObj.radiusPct : 6);
      const rPx = outW * (radPct / 100);

      const cardCv = document.createElement('canvas');
      cardCv.width = outW; cardCv.height = outH;
      const cCtx = cardCv.getContext('2d');
      if (rPx > 0.5) { this.pcRoundRectPath(cCtx, 0, 0, outW, outH, rPx); cCtx.clip(); }
      cCtx.drawImage(rectCv, 0, 0);

      return { rectCv, cardCv, rPx };
    },

    async loadAndAutoAlignAiSource(rawSrc, s) {
      const im = await this.loadImgAsync(rawSrc);
      if (!im) throw new Error('AI 圖片解碼失敗');
      this.aiState.rawAiImg = im;
      this.aiState.align = this.computeAutoAlignment(this.aiState.beforeCanvas, im, this.getSeriesRatioSpec(s));
      this.refreshAiModalPreviewState();
    },

    async importFromGeminiAppFile(e) {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const s = this.getActiveSeries();
      if (!s) return;

      const overlay = document.getElementById('pcAiLoadingOverlay');
      const msgEl = document.getElementById('pcAiLoadingMsg');
      if (overlay) overlay.classList.remove('hidden');
      if (msgEl) msgEl.textContent = '🎯 正在自動計算並對齊五官座標...';

      await new Promise(r => setTimeout(r, 25));
      const objUrl = URL.createObjectURL(file);
      try {
        await this.loadAndAutoAlignAiSource(objUrl, s);
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(16);
        if (typeof window.showChekiToast === 'function') {
          window.showChekiToast('✨ 已匯入並自動對齊五官！可拉動滑桿檢視或微調', 3600);
        }
      } catch (err) {
        alert('❌ 匯入失敗：' + (err.message || err));
      } finally {
        URL.revokeObjectURL(objUrl);
        if (overlay) overlay.classList.add('hidden');
      }
    },

    async runGeminiPhotocardHD() {
      if (this.aiState.busy) return;
      const s = this.getActiveSeries();
      if (!s || !this.aiState.beforeDataUrl) return;

      const apiKey = (document.getElementById('pcAiKeyInput')?.value || '').trim() || this.getStoredGeminiKey();
      if (!apiKey) return alert('請先貼上 AIza 開頭的 Gemini API Key，或直接使用上方「手機 Gemini App 直連」！');
      localStorage.setItem('pc_gemini_api_key', apiKey);

      const overlay = document.getElementById('pcAiLoadingOverlay');
      const msgEl = document.getElementById('pcAiLoadingMsg');
      this.aiState.busy = true;
      if (overlay) overlay.classList.remove('hidden');

      try {
        const im = await this.loadImgAsync(this.aiState.beforeDataUrl);
        const scale = Math.min(1, 1280 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * scale); c.height = Math.round(im.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(im, 0, 0, c.width, c.height);
        const b64 = c.toDataURL('image/jpeg', 0.93).split(',')[1];

        const preset = AI_PRESETS[this.aiState.preset] || AI_PRESETS.standard;
        const tryModels = [this.aiState.model, ...AI_MODELS.map(m => m.id).filter(id => id !== this.aiState.model)];
        let rawOut = '', lastErr = null;

        for (const mId of tryModels) {
          if (msgEl) msgEl.textContent = `✨ Gemini (${mId}) 重繪中...`;
          try {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mId)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: preset.apiPrompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
              })
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) { const e = new Error(json?.error?.message || `HTTP ${resp.status}`); e.status = resp.status; throw e; }
            const inl = (json?.candidates?.[0]?.content?.parts || []).map(p => p.inlineData || p.inline_data).find(x => x?.data);
            if (inl) { rawOut = `data:${inl.mimeType || inl.mime_type || 'image/png'};base64,${inl.data}`; break; }
          } catch (err) {
            lastErr = err;
            if (err.status !== 404 && !String(err.message || '').toLowerCase().includes('not found')) throw err;
          }
        }
        if (!rawOut) throw lastErr || new Error('模型未回傳影像');
        if (msgEl) msgEl.textContent = '🎯 正在自動對齊五官座標...';
        await this.loadAndAutoAlignAiSource(rawOut, s);
      } catch (err) {
        alert('❌ AI 高清化失敗：\n' + (err.message || err));
      } finally {
        this.aiState.busy = false;
        if (overlay) overlay.classList.add('hidden');
      }
    },

    async applyAiRemasterResult() {
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === this.aiState.slotIdx);
      if (!s || !slot || !this.aiState.rawAiImg) return;

      const { rectCv, cardCv, rPx } = this.buildFinalAlignedAiCanvases(s, slot, this.aiState.side);
      const rectUrl = rectCv.toDataURL('image/jpeg', 0.90);
      let cardUrl = cardCv.toDataURL('image/webp', 0.92);
      if (!cardUrl.startsWith('data:image/webp')) {
        cardUrl = rPx > 0.5 ? cardCv.toDataURL('image/png') : cardCv.toDataURL('image/jpeg', 0.92);
      }

      if (this.aiState.side === 'back') {
        if (!slot.preAiBackImg && slot.realBackImg) slot.preAiBackImg = slot.realBackImg;
        slot.realBackImg = cardUrl;
        slot.rawRectBackImg = rectUrl;
        this.state.autoFlipSlotOnce = slot.idx;
      } else {
        if (!slot.preAiRealImg && slot.realImg) slot.preAiRealImg = slot.realImg;
        slot.realImg = cardUrl;
        slot.rawRectImg = rectUrl;
        slot.isAiHD = true;
        if ((slot.qty || 0) === 0) { slot.qty = 1; slot.wish = false; this.state.justUnlockedIdx = slot.idx; }
      }
      await this.saveSeries(s);
      document.getElementById('pcAiRemasterModal')?.classList.add('hidden');
      this.onSlotClick(slot.idx);
      this.renderDex();
      if (typeof window.showChekiToast === 'function') window.showChekiToast('✨ 已套用像素級對齊的 AI 超高清真卡！', 3400);
    },

    downloadAiPreviewPng() {
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === this.aiState.slotIdx);
      if (!s || !this.aiState.rawAiImg) return;
      const { cardCv } = this.buildFinalAlignedAiCanvases(s, slot, this.aiState.side);
      cardCv.toBlob((blob) => {
        if (!blob) return;
        this.triggerBlobDownload(blob, `${this.safeFileName(s.title)}_#${String(slot?.idx || 0).padStart(3, '0')}_AI_HD.png`);
      }, 'image/png');
    },

    // ------------------------------------------------------------------------
    // 2. 單卡與整套下載中心（單張 PNG / 雙面紀念卡 / 收藏海報 / 一鍵 ZIP）
    // ------------------------------------------------------------------------
    async downloadSingleSlotImage(slotIdx, side = 'front') {
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === slotIdx);
      if (!s || !slot) return;
      const src = side === 'back' ? (slot.realBackImg || s.backImage) : (slot.realImg || slot.sampleImg);
      if (!src) return alert('此面尚未有圖片可下載！');
      const blob = await this.dataUrlToPngBlob(src);
      if (!blob) return;
      const num = String(slot.idx).padStart(3, '0');
      const suffix = side === 'back' ? 'back' : (slot.realImg ? 'real' : 'sample');
      this.triggerBlobDownload(blob, `${this.safeFileName(s.title)}_#${num}_${this.safeFileName(slot.member)}_${slot.variant}_${suffix}.png`);
      if (typeof window.showChekiToast === 'function') window.showChekiToast(`⬇️ 已下載 #${num} 高清圖！`);
    },

    async downloadSlotShowcaseCard(slotIdx) {
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === slotIdx);
      if (!s || !slot) return;
      const frontImg = await this.loadImgAsync(slot.realImg || slot.sampleImg);
      const backImg = await this.loadImgAsync(slot.realBackImg || s.backImage);
      if (!frontImg) return;

      const spec = this.getSeriesRatioSpec(s);
      const cardW = 420, cardH = Math.round(cardW * (spec.h / spec.w)), pad = 44, gap = 30;
      const hasBack = Boolean(backImg);
      const W = hasBack ? (pad * 2 + cardW * 2 + gap) : (pad * 2 + cardW + 80), H = 128 + cardH + 92;

      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#FDF2F8'); bg.addColorStop(0.5, '#FFFFFF'); bg.addColorStop(1, '#EFF6FF');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      const numStr = '#' + String(slot.idx).padStart(3, '0');
      const rarityMap = { N: 'NORMAL', HOLO: '🌈 HOLO', SIGN: '✍️ SIGNED' };
      ctx.fillStyle = '#272228'; ctx.font = '900 32px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${slot.member}  ·  ${numStr} (${slot.variant})`, W / 2, 50);
      ctx.fillStyle = '#6366F1'; ctx.font = '800 20px "Zen Maru Gothic", sans-serif';
      ctx.fillText(`🃏 ${s.title}  |  ${rarityMap[slot.rarity] || 'NORMAL'}`, W / 2, 92);

      const drawCard = (im, x, y, label, rPct) => {
        const rad = Math.round(cardW * ((typeof rPct === 'number' ? rPct : 6) / 100));
        ctx.save();
        ctx.shadowColor = 'rgba(24,24,27,0.22)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 10;
        ctx.fillStyle = '#18181B'; this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad); ctx.fill();
        ctx.restore();
        ctx.save(); this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad); ctx.clip(); ctx.drawImage(im, x, y, cardW, cardH); ctx.restore();
        ctx.lineWidth = 4;
        ctx.strokeStyle = slot.rarity === 'SIGN' ? '#F59E0B' : (slot.rarity === 'HOLO' ? '#EC4899' : '#272228');
        this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad); ctx.stroke();
        ctx.fillStyle = '#52525B'; ctx.font = '900 18px "Zen Maru Gothic", sans-serif';
        ctx.fillText(label, x + cardW / 2, y + cardH + 34);
      };

      if (hasBack) {
        drawCard(frontImg, pad, 128, 'FRONT 正面', slot.radiusPct);
        drawCard(backImg, pad + cardW + gap, 128, 'BACK 背面', slot.backRadiusPct ?? s.backRadiusPct);
      } else {
        drawCard(frontImg, (W - cardW) / 2, 128, slot.realImg ? '✨ 實物高清真卡' : 'PREVIEW', slot.radiusPct);
      }
      ctx.fillStyle = '#A1A1AA'; ctx.font = '700 16px sans-serif';
      ctx.fillText(`ChekiPocket Photocard Dex · ${new Date().toISOString().slice(0, 10)}`, W / 2, H - 22);

      cv.toBlob((blob) => {
        if (!blob) return;
        this.triggerBlobDownload(blob, `${this.safeFileName(s.title)}_${numStr}_${this.safeFileName(slot.member)}_紀念卡.png`);
        if (typeof window.showChekiToast === 'function') window.showChekiToast('🖼️ 紀念展示卡已下載！');
      }, 'image/png');
    },

    openDownloadCenter() {
      const s = this.getActiveSeries();
      if (!s) return;
      this.posterCfg.cols = s.slots.length >= 12 ? 6 : (s.groupCols || 3);
      const realCnt = s.slots.filter(x => Boolean(x.realImg)).length;
      const anyCnt = s.slots.filter(x => Boolean(x.realImg || x.sampleImg)).length;
      const hint = document.getElementById('pcZipCountHint');
      if (hint) hint.textContent = `目前系列共 ${s.slots.length} 格：已有 ${realCnt} 張高清真卡、${anyCnt} 張可匯出圖檔`;
      this.updatePosterButtonsUI();
      document.getElementById('pcDownloadCenterModal')?.classList.remove('hidden');
      this.renderDexShowcasePoster();
    },

    closeDownloadCenter() { document.getElementById('pcDownloadCenterModal')?.classList.add('hidden'); },

    setPosterOption(k, v) { this.posterCfg[k] = v; this.updatePosterButtonsUI(); this.renderDexShowcasePoster(); },

    updatePosterButtonsUI() {
      ['3', '6'].forEach(n => {
        const el = document.getElementById('pcPosterCols' + n);
        if (el) el.className = `px-2 py-0.5 rounded-lg border border-cheki-dark text-[10px] font-black ${this.posterCfg.cols === Number(n) ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700'}`;
      });
    },

    async renderDexShowcasePoster() {
      const s = this.getActiveSeries();
      const cv = document.getElementById('pcShowcasePosterCanvas');
      if (!s || !cv) return;

      const spec = this.getSeriesRatioSpec(s);
      const cols = this.posterCfg.cols || 6, rows = Math.max(1, Math.ceil(s.slots.length / cols));
      const W = 1080, pad = 34, gap = cols === 6 ? 14 : 24, headerH = 166, footerH = 62;
      const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols), cardH = Math.round(cardW * (spec.h / spec.w));
      const H = headerH + rows * cardH + (rows - 1) * gap + footerH + pad;

      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#FFF7FB'); bg.addColorStop(1, '#EFF6FF');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#272228'; this.pcRoundRectPath(ctx, pad + 5, 29, W - pad * 2, 114, 24); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; this.pcRoundRectPath(ctx, pad, 24, W - pad * 2, 114, 24); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#272228'; ctx.stroke();

      const owned = s.slots.filter(x => x.qty > 0).length, realCnt = s.slots.filter(x => Boolean(x.realImg)).length;
      const pct = Math.round((owned / Math.max(1, s.slots.length)) * 100);
      ctx.fillStyle = '#272228'; ctx.font = '900 32px "Zen Maru Gothic", sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText(`🃏 ${s.title}`, pad + 24, 58);
      ctx.fillStyle = '#6366F1'; ctx.font = '900 21px "Zen Maru Gothic", sans-serif';
      ctx.fillText(`✨ 已收集 ${owned}/${s.slots.length} (${pct}%)  ·  📸 高清真卡 ${realCnt} 張`, pad + 24, 102);

      const imgs = await Promise.all(s.slots.map(sl => this.loadImgAsync(sl.realImg || sl.sampleImg)));
      s.slots.forEach((sl, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const x = pad + c * (cardW + gap), y = headerH + r * (cardH + gap);
        const unlocked = sl.qty > 0, rad = Math.round(cardW * ((typeof sl.radiusPct === 'number' ? sl.radiusPct : 6) / 100));

        ctx.save(); this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad); ctx.clip();
        if (imgs[i]) {
          if (!unlocked && this.posterCfg.dimMissing) ctx.filter = 'grayscale(100%) brightness(58%) contrast(82%)';
          ctx.drawImage(imgs[i], x, y, cardW, cardH);
          ctx.filter = 'none';
        } else { ctx.fillStyle = '#E4E4E7'; ctx.fillRect(x, y, cardW, cardH); }

        ctx.fillStyle = 'rgba(24,24,27,0.78)'; ctx.fillRect(x, y, Math.max(48, Math.round(cardW * 0.34)), 25);
        ctx.fillStyle = '#FFFFFF'; ctx.font = '900 14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`#${sl.idx}`, x + Math.max(24, Math.round(cardW * 0.17)), y + 13);
        if (!unlocked && this.posterCfg.dimMissing) { ctx.font = `${cols === 6 ? 26 : 38}px sans-serif`; ctx.fillText('🔒', x + cardW / 2, y + cardH / 2); }
        ctx.textAlign = 'left'; ctx.restore();

        ctx.lineWidth = unlocked ? 4 : 2;
        ctx.strokeStyle = unlocked ? (sl.rarity === 'SIGN' ? '#F59E0B' : (sl.rarity === 'HOLO' ? '#EC4899' : '#272228')) : '#CBD5E1';
        this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad); ctx.stroke();
      });

      const nick = (typeof userOshiProfile !== 'undefined' && userOshiProfile?.nickname) ? userOshiProfile.nickname : 'ChekiPocket Photocard Dex';
      ctx.fillStyle = '#52525B'; ctx.font = '900 20px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`✨ ${nick} 收藏圖鑑 · ${new Date().toISOString().slice(0, 10)} ✨`, W / 2, H - 28);
      ctx.textAlign = 'left';
    },

    exportShowcasePoster(shareMode = false) {
      const s = this.getActiveSeries(), cv = document.getElementById('pcShowcasePosterCanvas');
      if (!s || !cv) return;
      cv.toBlob(async (blob) => {
        if (!blob) return;
        const fname = `${this.safeFileName(s.title)}_圖鑑收藏海報_${new Date().toISOString().slice(0, 10)}.png`;
        if (shareMode && navigator.canShare) {
          try {
            const f = new File([blob], fname, { type: 'image/png' });
            if (navigator.canShare({ files: [f] })) return await navigator.share({ title: `${s.title} 收藏圖鑑`, files: [f] });
          } catch (_) {}
        }
        this.triggerBlobDownload(blob, fname);
        if (typeof window.showChekiToast === 'function') window.showChekiToast('🏆 圖鑑收藏海報已下載！');
      }, 'image/png');
    },

    async downloadSeriesZip(includeSamples = false) {
      const s = this.getActiveSeries();
      if (!s) return;
      const btn = document.getElementById(includeSamples ? 'pcZipAllBtn' : 'pcZipRealBtn');
      const oldText = btn?.textContent;
      if (btn) { btn.disabled = true; btn.textContent = '⏳ 正在打包高清圖檔...'; }

      try {
        const entries = [];
        for (const sl of s.slots) {
          const src = includeSamples ? (sl.realImg || sl.sampleImg) : sl.realImg;
          const num = String(sl.idx).padStart(3, '0'), mName = this.safeFileName(sl.member);
          if (src) {
            const b = await this.dataUrlToPngBlob(src);
            if (b) entries.push({ name: `${num}_${mName}_${sl.variant}_${sl.realImg ? 'real' : 'sample'}.png`, bytes: new Uint8Array(await b.arrayBuffer()) });
          }
          if (sl.realBackImg) {
            const bb = await this.dataUrlToPngBlob(sl.realBackImg);
            if (bb) entries.push({ name: `${num}_${mName}_${sl.variant}_back.png`, bytes: new Uint8Array(await bb.arrayBuffer()) });
          }
        }
        if (includeSamples && s.backImage) {
          const sb = await this.dataUrlToPngBlob(s.backImage);
          if (sb) entries.push({ name: '000_共用卡背.png', bytes: new Uint8Array(await sb.arrayBuffer()) });
        }
        if (entries.length === 0) return alert(includeSamples ? '尚未有任何圖片可打包！' : '尚未掃描任何高清實物真卡！');

        this.triggerBlobDownload(buildZipBlob(entries), `${this.safeFileName(s.title)}_${includeSamples ? '全套圖檔' : '高清真卡'}_${entries.length}張.zip`);
        if (typeof window.showChekiToast === 'function') window.showChekiToast(`📦 已打包下載 ${entries.length} 張小卡 (.zip)！`, 3500);
      } finally {
        if (btn) { btn.disabled = false; if (oldText) btn.textContent = oldText; }
      }
    },

    // ------------------------------------------------------------------------
    // 3. 【譲／求】換卡一覽圖生成（自動對應系列真實小卡比例）
    // ------------------------------------------------------------------------
    openTradeSheetModal() {
      const s = this.getActiveSeries();
      if (!s) return;
      this.tradeCfg.cols = s.slots.length >= 12 ? 6 : (s.groupCols || 3);
      this.tradeCfg.seekMode = s.slots.some(x => x.wish) ? 'wish' : 'missing';
      this.updateTradeButtonsUI();
      document.getElementById('pcTradeModal')?.classList.remove('hidden');
      this.renderTradeSheetCanvas();
    },

    closeTradeSheetModal() { document.getElementById('pcTradeModal')?.classList.add('hidden'); },
    setTradeOption(k, v) { this.tradeCfg[k] = v; this.updateTradeButtonsUI(); this.renderTradeSheetCanvas(); },
    onTradeNoteInput(v) { this.tradeCfg.note = v; clearTimeout(this._tTimer); this._tTimer = setTimeout(() => this.renderTradeSheetCanvas(), 220); },

    updateTradeButtonsUI() {
      const setB = (id, on) => {
        const el = document.getElementById(id);
        if (el) el.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] ${on ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700'}`;
      };
      setB('pcTradeSeekMissing', this.tradeCfg.seekMode === 'missing');
      setB('pcTradeSeekWish', this.tradeCfg.seekMode === 'wish');
      setB('pcTradeCols3', this.tradeCfg.cols === 3);
      setB('pcTradeCols6', this.tradeCfg.cols === 6);
    },

    async renderTradeSheetCanvas() {
      const s = this.getActiveSeries(), cv = document.getElementById('pcTradeCanvas');
      if (!s || !cv) return;

      const spec = this.getSeriesRatioSpec(s);
      const cols = this.tradeCfg.cols || 6, rows = Math.max(1, Math.ceil(s.slots.length / cols));
      const W = 1080, pad = 34, gap = cols === 6 ? 14 : 24, headerH = 158, footerH = 66;
      const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols), cardH = Math.round(cardW * (spec.h / spec.w));
      const H = headerH + rows * cardH + (rows - 1) * gap + footerH + pad;

      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#FFF7FB'); bg.addColorStop(1, '#EFF6FF');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#272228'; this.pcRoundRectPath(ctx, pad + 5, 29, W - pad * 2, 108, 24); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; this.pcRoundRectPath(ctx, pad, 24, W - pad * 2, 108, 24); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#272228'; ctx.stroke();

      const giveCnt = s.slots.filter(x => x.qty > 1).length;
      const seekCnt = s.slots.filter(x => this.tradeCfg.seekMode === 'wish' ? x.wish : x.qty === 0).length;
      ctx.fillStyle = '#272228'; ctx.font = '900 32px "Zen Maru Gothic", sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText(`🃏 ${s.title}  換卡一覽`, pad + 26, 62);
      ctx.fillStyle = '#52525B'; ctx.font = '700 20px "Zen Maru Gothic", sans-serif';
      ctx.fillText(this.tradeCfg.note || '歡迎交換 ✨', pad + 26, 102);

      const drawLegend = (label, col, x) => {
        ctx.fillStyle = col; this.pcRoundRectPath(ctx, x, 46, 152, 42, 21); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = '900 20px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(label, x + 76, 68); ctx.textAlign = 'left';
      };
      drawLegend(`🟢 譲 ${giveCnt}款`, '#10B981', W - pad - 332);
      drawLegend(`🔴 求 ${seekCnt}款`, '#F43F5E', W - pad - 170);

      const imgs = await Promise.all(s.slots.map(sl => this.loadImgAsync(sl.realImg || sl.sampleImg)));
      s.slots.forEach((sl, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const x = pad + c * (cardW + gap), y = headerH + r * (cardH + gap);
        const isGive = sl.qty > 1, isSeek = this.tradeCfg.seekMode === 'wish' ? Boolean(sl.wish) : sl.qty === 0;
        const rad = Math.round(cardW * ((typeof sl.radiusPct === 'number' ? sl.radiusPct : 6) / 100));

        ctx.save(); this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad); ctx.clip();
        if (imgs[i]) ctx.drawImage(imgs[i], x, y, cardW, cardH);
        else { ctx.fillStyle = '#E4E4E7'; ctx.fillRect(x, y, cardW, cardH); }

        ctx.fillStyle = (!isGive && !isSeek) ? 'rgba(255,255,255,0.52)' : (isGive ? 'rgba(16,185,129,0.16)' : 'rgba(244,63,94,0.18)');
        ctx.fillRect(x, y, cardW, cardH);

        ctx.fillStyle = 'rgba(24,24,27,0.78)'; ctx.fillRect(x, y, Math.max(46, Math.round(cardW * 0.34)), 26);
        ctx.fillStyle = '#FFFFFF'; ctx.font = '900 15px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`#${sl.idx}`, x + Math.max(23, Math.round(cardW * 0.17)), y + 14);

        if (isGive || isSeek) {
          const stampH = Math.max(36, Math.round(cardH * 0.22)), stampY = y + cardH - stampH;
          ctx.fillStyle = isGive ? 'rgba(5,150,105,0.92)' : 'rgba(225,29,72,0.92)';
          ctx.fillRect(x, stampY, cardW, stampH);
          ctx.fillStyle = '#FFFFFF'; ctx.font = `900 ${cols === 6 ? 26 : 38}px "Zen Maru Gothic", sans-serif`;
          const extra = sl.qty - 1;
          ctx.fillText(isGive ? (extra > 1 ? `譲 ×${extra}` : '譲') : '求', x + cardW / 2, stampY + stampH / 2 + 2);
        } else if (sl.qty === 1) {
          ctx.fillStyle = 'rgba(39,34,40,0.65)'; ctx.font = `900 ${cols === 6 ? 20 : 28}px sans-serif`;
          ctx.fillText('済', x + cardW / 2, y + cardH - 22);
        }
        ctx.textAlign = 'left'; ctx.restore();

        ctx.lineWidth = (isGive || isSeek) ? 6 : 2;
        ctx.strokeStyle = isGive ? '#059669' : (isSeek ? '#E11D48' : '#CBD5E1');
        this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad); ctx.stroke();
      });

      const nick = (typeof userOshiProfile !== 'undefined' && userOshiProfile?.nickname) ? userOshiProfile.nickname : 'ChekiPocket Photocard Dex';
      ctx.fillStyle = '#52525B'; ctx.font = '900 20px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`✨ ${nick}  ·  ${new Date().toISOString().slice(0, 10)} ✨`, W / 2, H - 30);
      ctx.textAlign = 'left';
    },

    exportTradeSheet(shareMode = false) {
      const s = this.getActiveSeries(), cv = document.getElementById('pcTradeCanvas');
      if (!s || !cv) return;
      cv.toBlob(async (blob) => {
        if (!blob) return;
        const fname = `${this.safeFileName(s.title)}_換卡一覽_${new Date().toISOString().slice(0, 10)}.png`;
        if (shareMode && navigator.canShare) {
          try {
            const f = new File([blob], fname, { type: 'image/png' });
            if (navigator.canShare({ files: [f] })) return await navigator.share({ title: `${s.title} 換卡一覽`, files: [f] });
          } catch (_) {}
        }
        this.triggerBlobDownload(blob, fname);
        if (typeof window.showChekiToast === 'function') window.showChekiToast('🔁 【譲/求】換卡圖已下載！');
      }, 'image/png');
    },

    // ------------------------------------------------------------------------
    // 4. 本機 JSON 備份與 Google Drive 增量同步
    // ------------------------------------------------------------------------
    openPcBackupModal() {
      const totalSeries = this.state.seriesList.length;
      const totalOwned = this.state.seriesList.reduce((acc, s) => acc + s.slots.filter(x => x.qty > 0).length, 0);
      const totalReal = this.state.seriesList.reduce((acc, s) => acc + s.slots.filter(x => Boolean(x.realImg)).length, 0);
      const lastCloud = localStorage.getItem('pc_last_cloud_sync');
      const stEl = document.getElementById('pcBackupStatusText');
      if (stEl) {
        stEl.textContent = `目前共 ${totalSeries} 套圖鑑（已點亮 ${totalOwned} 張 · 掃描真卡 ${totalReal} 張）` +
          (lastCloud ? ` · 上次雲端同步：${lastCloud.replace('T', ' ').slice(0, 16)}` : '');
      }
      document.getElementById('pcBackupModal')?.classList.remove('hidden');
    },

    exportPhotocardJson() {
      const payload = { type: 'ChekiPocket_PhotocardDex', version: 2, exportedAt: new Date().toISOString(), seriesList: this.state.seriesList };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json;charset=utf-8' });
      this.triggerBlobDownload(blob, `PhotocardDex_Backup_${this.state.seriesList.length}series_${new Date().toISOString().slice(0, 10)}.json`);
      if (typeof window.showChekiToast === 'function') window.showChekiToast('📥 小卡圖鑑備份檔已下載！');
    },

    importPhotocardJson(e) {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          const list = Array.isArray(parsed.seriesList) ? parsed.seriesList : [];
          if (list.length === 0) throw new Error('檔案中找不到小卡圖鑑資料');
          for (const s of list) if (s?.id && Array.isArray(s.slots)) await this.saveSeries(s);
          await this.loadSeriesList();
          this.renderDex();
          document.getElementById('pcBackupModal')?.classList.add('hidden');
          alert(`✅ 成功還原 ${list.length} 套小卡圖鑑！`);
        } catch (err) {
          alert('❌ 匯入失敗：' + (err.message || err));
        }
      };
      reader.readAsText(file);
    },

    async syncPhotocardsToDrive() {
      if (typeof ensureGoogleDriveToken !== 'function' || typeof findOrCreateBackupFolder !== 'function') {
        return alert('請先確認主程式的 Google Drive 雲端同步模組已載入並設定 Client ID！');
      }
      try {
        await ensureGoogleDriveToken(false);
        if (typeof window.showChekiToast === 'function') window.showChekiToast('☁️ 正在上傳小卡圖鑑至 Google Drive...', 3000);
        const folderId = await findOrCreateBackupFolder(true);
        const remoteFiles = await listAllBackupFilesInFolder(folderId);
        for (const s of this.state.seriesList) {
          const fname = `pc_series_${s.id}.json`;
          const existing = remoteFiles.find(f => f.name === fname);
          await gdriveUploadMultipart({
            fileId: existing ? existing.id : null,
            name: fname,
            folderId,
            contentBlob: new Blob([JSON.stringify(s)], { type: 'application/json;charset=utf-8' }),
            mimeType: 'application/json'
          });
        }
        localStorage.setItem('pc_last_cloud_sync', new Date().toISOString());
        this.openPcBackupModal();
        if (typeof window.showChekiToast === 'function') window.showChekiToast(`☁️ 已同步 ${this.state.seriesList.length} 套小卡圖鑑至 Google Drive！`, 3500);
      } catch (err) {
        alert('❌ 雲端同步失敗：' + (err.message || err));
      }
    },

    async restorePhotocardsFromDrive() {
      if (typeof ensureGoogleDriveToken !== 'function' || typeof findOrCreateBackupFolder !== 'function') {
        return alert('請先確認主程式的 Google Drive 雲端同步模組已載入！');
      }
      try {
        const token = await ensureGoogleDriveToken(false);
        const folderId = await findOrCreateBackupFolder(false);
        if (!folderId) throw new Error('Google Drive 中找不到備份資料夾');
        const remoteFiles = await listAllBackupFilesInFolder(folderId);
        const pcFiles = remoteFiles.filter(f => f.name.startsWith('pc_series_') && f.name.endsWith('.json'));
        if (pcFiles.length === 0) throw new Error('雲端尚未有小卡圖鑑備份檔');

        let count = 0;
        for (const f of pcFiles) {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const sObj = await res.json();
            if (sObj?.id && Array.isArray(sObj.slots)) { await this.saveSeries(sObj); count++; }
          }
        }
        await this.loadSeriesList();
        this.renderDex();
        document.getElementById('pcBackupModal')?.classList.add('hidden');
        alert(`✅ 成功從 Google Drive 還原 ${count} 套小卡圖鑑！`);
      } catch (err) {
        alert('❌ 雲端還原失敗：' + (err.message || err));
      }
    }
  });

  // 啟動 Clean v2.0 引擎
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PCApp.start());
  } else {
    PCApp.start();
  }
})();
