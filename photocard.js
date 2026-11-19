// ============================================================================
// 🃏 ChekiPocket - Photocard Dex (小卡收集圖鑑系統)
// [第 1 段]：獨立資料庫、頂部雙模式切換、系列建立、三連橫排圖鑑與齊套金章
// ============================================================================
window.PCApp = {
  db: null,
  state: {
    mode: 'cheki',       // 'cheki' | 'pc'
    seriesList: [],
    activeSeriesId: localStorage.getItem('pc_active_series_id') || '',
    filter: 'ALL',       // 'ALL' | 'OWNED' | 'MISSING' | 'TRADE'
    justUnlockedIdx: -1
  },

  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  initDB() {
    return new Promise((resolve) => {
      const req = indexedDB.open('ChekiPocket_PhotocardDB', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('series')) {
          db.createObjectStore('series', { keyPath: 'id' });
        }
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

  injectStylesAndShell() {
    if (document.getElementById('pcDexStyle')) return;
    const st = document.createElement('style');
    st.id = 'pcDexStyle';
    st.textContent = `
      @keyframes pcUnlockFlash {
        0% { transform: scale(0.88); filter: brightness(2.5) saturate(1.8); }
        60% { transform: scale(1.04); filter: brightness(1.25); }
        100% { transform: scale(1); filter: brightness(1); }
      }
      .pc-unlock-anim { animation: pcUnlockFlash 0.55s cubic-bezier(0.22, 1, 0.36, 1); }
      .pc-holo-border { background: linear-gradient(135deg, #38bdf8, #f472b6, #facc15, #4ade80); padding: 2.5px; }
      .pc-sign-border { background: linear-gradient(135deg, #fde047, #f59e0b, #fef08a, #d97706); padding: 2.5px; }
    `;
    document.head.appendChild(st);

    const mainEl = document.querySelector('main');
    if (mainEl && !document.getElementById('pcDexRoot')) {
      const root = document.createElement('div');
      root.id = 'pcDexRoot';
      root.className = 'hidden max-w-md mx-auto px-3 pt-2.5 pb-28 space-y-3';
      mainEl.parentElement.insertBefore(root, mainEl);
    }

    const modalWrap = document.createElement('div');
    modalWrap.innerHTML = `
      <div id="pcCreateModal" class="hidden fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-3">
        <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-4 space-y-3 text-zinc-900 max-h-[90vh] overflow-y-auto">
          <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
            <h3 class="font-black text-base">🃏 建立新小卡圖鑑系列</h3>
            <button type="button" onclick="PCApp.closeCreateModal()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm">✕</button>
          </div>
          <div class="space-y-2 text-xs">
            <div>
              <label class="font-black block mb-1">✨ 系列名稱</label>
              <input id="pcNewTitle" type="text" placeholder="例：MORE STAR 2026 和服小卡" class="w-full px-3 py-2 rounded-xl border-2 border-cheki-dark font-bold bg-white">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="font-black block mb-1">👥 成員/分組數量</label>
                <input id="pcNewGroups" type="number" min="1" max="60" value="9" class="w-full px-3 py-2 rounded-xl border-2 border-cheki-dark font-black bg-white">
              </div>
              <div>
                <label class="font-black block mb-1">🎴 每人款式數 (橫排)</label>
                <input id="pcNewCols" type="number" min="1" max="6" value="3" class="w-full px-3 py-2 rounded-xl border-2 border-cheki-dark font-black bg-white">
              </div>
            </div>
            <div>
              <label class="font-black block mb-1">👑 成員名單（選填，用逗號或換行分隔，會自動對應各橫排）</label>
              <textarea id="pcNewMembers" rows="3" placeholder="例：遠藤まりん, 成員B, 成員C...（留空可之後逐排改名）" class="w-full px-3 py-2 rounded-xl border-2 border-cheki-dark font-bold bg-white"></textarea>
            </div>
          </div>
          <button type="button" onclick="PCApp.confirmCreateSeries()" class="w-full py-3 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs">🚀 建立圖鑑格（下一步可墊底官方預覽圖）</button>
        </div>
      </div>
      <div id="pcSlotModal" class="hidden fixed inset-0 z-[132] bg-black/85 flex items-center justify-center p-3 overflow-y-auto">
        <div id="pcSlotModalBody" class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-4 space-y-3 text-zinc-900 max-h-[92vh] overflow-y-auto"></div>
      </div>
    `;
    document.body.appendChild(modalWrap);
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

    // 點擊底部導覽列切換拍立得分頁時，自動返回拍立得模式
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

  openCreateModal() { document.getElementById('pcCreateModal')?.classList.remove('hidden'); },
  closeCreateModal() { document.getElementById('pcCreateModal')?.classList.add('hidden'); },

  async confirmCreateSeries() {
    const title = (document.getElementById('pcNewTitle')?.value || '').trim() || '全新小卡系列';
    const cols = Math.max(1, Math.min(6, Number(document.getElementById('pcNewCols')?.value) || 3));
    const rawMembers = (document.getElementById('pcNewMembers')?.value || '').split(/[,，\n]+/).map(s => s.trim()).filter(Boolean);
    const groups = rawMembers.length > 0 ? rawMembers.length : Math.max(1, Math.min(60, Number(document.getElementById('pcNewGroups')?.value) || 9));

    const variants = ['A', 'B', 'C', 'D', 'E', 'F'];
    const slots = [];
    for (let g = 0; g < groups; g++) {
      const mName = rawMembers[g] || `成員 ${g + 1}`;
      for (let c = 0; c < cols; c++) {
        slots.push({
          idx: slots.length + 1,
          groupIdx: g,
          member: mName,
          variant: variants[c] || String(c + 1),
          sampleImg: '',
          realImg: '',
          realBackImg: '',
          qty: 0,
          wish: false,
          rarity: 'N'
        });
      }
    }

    const newSeries = { id: 'pcs_' + Date.now(), title, groupCols: cols, backImage: '', createdAt: Date.now(), slots };
    await this.saveSeries(newSeries);
    this.state.activeSeriesId = newSeries.id;
    localStorage.setItem('pc_active_series_id', newSeries.id);
    this.closeCreateModal();
    this.renderDex();
    if (typeof window.showChekiToast === 'function') window.showChekiToast(`🃏 已建立「${title}」（共 ${slots.length} 格）！`);
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

  onSlotClick(slotIdx) {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!s || !slot) return;
    const body = document.getElementById('pcSlotModalBody');
    const imgSrc = slot.realImg || slot.sampleImg;
    const numStr = '#' + String(slot.idx).padStart(3, '0');

    body.innerHTML = `
      <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
        <div>
          <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">${numStr} · 款式 ${this.esc(slot.variant)}</span>
          <h4 class="font-black text-base mt-0.5">${this.esc(slot.member)}</h4>
        </div>
        <button type="button" onclick="document.getElementById('pcSlotModal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm">✕</button>
      </div>

      <div id="pcSlotStageArea" class="flex flex-col items-center py-2">
        <div class="w-44 aspect-[55/85] rounded-2xl border-2 border-cheki-dark overflow-hidden bg-zinc-900 flex items-center justify-center shadow-xl relative">
          ${imgSrc
            ? `<img src="${imgSrc}" class="w-full h-full object-cover ${slot.qty === 0 && !slot.realImg ? 'grayscale brightness-75 opacity-60' : ''}">`
            : `<span class="text-zinc-500 font-black text-sm">${numStr} 尚未墊底</span>`}
          ${slot.realImg ? `<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-400 text-zinc-950 font-black text-[10px]">✨ 實物真卡</span>` : ''}
        </div>
      </div>

      <div id="pcSlotScannerActions"></div>

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
    `;
    document.getElementById('pcSlotModal')?.classList.remove('hidden');
    if (typeof this.onAfterOpenSlotModal === 'function') this.onAfterOpenSlotModal(s, slot);
  },

  async adjustSlotQty(slotIdx, delta) {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!slot) return;
    const prev = slot.qty || 0;
    slot.qty = Math.max(0, prev + delta);
    if (prev === 0 && slot.qty > 0) {
      slot.wish = false;
      this.state.justUnlockedIdx = slotIdx;
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

  renderDex() {
    const root = document.getElementById('pcDexRoot');
    if (!root) return;
    const s = this.getActiveSeries();

    if (!s) {
      root.innerHTML = `
        <div class="neo-box bg-white rounded-3xl p-6 text-center space-y-3">
          <div class="text-4xl">🃏</div>
          <h2 class="font-black text-base text-zinc-900">小卡收集圖鑑 (Photocard Dex)</h2>
          <p class="text-xs font-bold text-zinc-500">好似寶可夢集卡冊咁管理隨機小卡！支援官方預覽圖一鍵切格墊底，再掃描實物真卡點亮覆蓋 ✨</p>
          <button type="button" onclick="PCApp.openCreateModal()" class="px-5 py-3 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs">＋ 建立第一套小卡圖鑑</button>
        </div>
      `;
      return;
    }

    const total = s.slots.length || 1;
    const owned = s.slots.filter(x => x.qty > 0).length;
    const realScanned = s.slots.filter(x => Boolean(x.realImg)).length;
    const pct = Math.round((owned / total) * 100);

    // 按 groupIdx 分組（預設每排 3 張）
    const groupMap = new Map();
    s.slots.forEach(sl => {
      const g = sl.groupIdx ?? Math.floor((sl.idx - 1) / (s.groupCols || 3));
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g).push(sl);
    });
    let compGroups = 0;
    groupMap.forEach(arr => { if (arr.every(x => x.qty > 0)) compGroups++; });

    root.innerHTML = `
      <div class="neo-box bg-gradient-to-br from-indigo-50 via-white to-pink-50 rounded-2xl p-3 space-y-2.5">
        <div class="flex items-center gap-1.5">
          <select onchange="PCApp.selectSeries(this.value)" class="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark bg-white font-black text-xs text-zinc-900">
            ${this.state.seriesList.map(it => `<option value="${it.id}" ${it.id === s.id ? 'selected' : ''}>🃏 ${this.esc(it.title)} (${it.slots.filter(x => x.qty > 0).length}/${it.slots.length})</option>`).join('')}
          </select>
          <button type="button" onclick="PCApp.openCreateModal()" class="px-2.5 py-1.5 rounded-xl bg-cheki-accent text-white neo-btn font-black text-xs shrink-0">＋新系列</button>
          <button type="button" onclick="PCApp.deleteActiveSeries()" class="px-2 py-1.5 rounded-xl bg-zinc-100 border-2 border-cheki-dark font-black text-xs text-rose-600 shrink-0" title="刪除此系列">🗑️</button>
        </div>

        <div id="pcToolbarExt" class="flex items-center gap-1.5 flex-wrap"></div>

        <div class="space-y-1">
          <div class="flex justify-between text-[11px] font-black text-zinc-800">
            <span>✨ 已點亮 ${owned}/${s.slots.length} (${pct}%) · 📸 真卡 ${realScanned} 張</span>
            <span class="text-amber-600">👑 齊套 ${compGroups}/${groupMap.size} 組</span>
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
                <button type="button" onclick="PCApp.renameGroupMember(${gIdx})" class="font-black text-xs text-zinc-900 flex items-center gap-1">
                  <span>👤 ${this.esc(arr[0]?.member || '')}</span>
                  <span class="text-[10px] text-zinc-400">✎</span>
                </button>
                ${isComp
                  ? `<span class="px-2 py-0.5 rounded-full bg-amber-300 border border-cheki-dark text-[10px] font-black text-zinc-950">👑 コンプ齊套!</span>`
                  : `<span class="text-[10px] font-bold text-zinc-400">${arr.filter(x => x.qty > 0).length}/${arr.length}</span>`}
              </div>
              <div class="grid gap-2" style="grid-template-columns: repeat(${s.groupCols || 3}, minmax(0, 1fr));">
                ${visibleArr.map(sl => this.renderSlotCardHtml(sl)).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    this.state.justUnlockedIdx = -1;
    if (typeof this.onAfterRenderDex === 'function') this.onAfterRenderDex(s);
  },

  renderSlotCardHtml(sl) {
    const unlocked = sl.qty > 0;
    const imgSrc = sl.realImg || sl.sampleImg;
    const numStr = '#' + String(sl.idx).padStart(3, '0');
    const borderCls = unlocked
      ? (sl.rarity === 'SIGN' ? 'pc-sign-border' : sl.rarity === 'HOLO' ? 'pc-holo-border' : 'bg-zinc-900 p-[2px]')
      : 'bg-zinc-300 p-[2px]';
    const animCls = this.state.justUnlockedIdx === sl.idx ? 'pc-unlock-anim' : '';

    return `
      <div onclick="PCApp.onSlotClick(${sl.idx})" class="rounded-xl ${borderCls} ${animCls} cursor-pointer active:scale-95 transition shadow-sm">
        <div class="w-full aspect-[55/85] rounded-[10px] bg-zinc-900 overflow-hidden relative flex flex-col items-center justify-center">
          ${imgSrc
            ? `<img src="${imgSrc}" loading="lazy" class="w-full h-full object-cover ${unlocked ? '' : 'grayscale contrast-75 brightness-50 opacity-65'} pointer-events-none">`
            : `<div class="text-center p-1"><span class="block text-[11px] font-black text-zinc-500">${numStr}</span><span class="text-[10px] font-bold text-zinc-600">${this.esc(sl.variant)}</span></div>`}
          <span class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[9px] font-black leading-none">${numStr}</span>
          ${!unlocked ? `<span class="absolute inset-0 flex items-center justify-center text-base pointer-events-none drop-shadow">${sl.wish ? '💖' : '🔒'}</span>` : ''}
          ${sl.realImg ? `<span class="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-emerald-400/95 text-zinc-950 text-[8px] font-black leading-none">真卡</span>` : ''}
          ${sl.qty > 1 ? `<span class="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-amber-300 border border-zinc-900 text-zinc-950 text-[9px] font-black leading-none">×${sl.qty}</span>` : ''}
          ${sl.wish && !unlocked ? `<span class="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-pink-500 text-white text-[8px] font-black leading-none">求</span>` : ''}
        </div>
      </div>
    `;
  },

  async start() {
    this.injectStylesAndShell();
    await this.loadSeriesList();
    setTimeout(() => this.mountHeaderSwitchBtn(), 860);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PCApp.start());
} else {
  PCApp.start();
}
// === [第 2 段貼在此行正下方] ===
// ============================================================================
// [第 2 段]：官方預覽大圖自動偵測白邊切格墊底 ＋ 系列共用卡背與翻面檢視
// ============================================================================
Object.assign(PCApp, {
  slicer: {
    img: null,
    mode: 'auto',      // 'auto' | 'grid'
    thresh: 224,       // 去白底與淺灰 SAMPLE 水印靈敏度
    trimPct: 1,        // 四邊內縮修邊 (%)
    gridRows: 5,
    gridCols: 6,
    boxes: []          // [{ rx, ry, rw, rh }] 相對比例 (0~1)
  },

  ensurePart2UI() {
    if (document.getElementById('pcSlicerModal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <input id="pcSheetFileInput" type="file" accept="image/*" class="hidden" onchange="PCApp.handleSheetFile(event)">
      <input id="pcBackFileInput" type="file" accept="image/*" class="hidden" onchange="PCApp.handleSeriesBackFile(event)">
      <div id="pcSlicerModal" class="hidden fixed inset-0 z-[134] bg-black/85 flex items-center justify-center p-2.5 overflow-y-auto">
        <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-3.5 space-y-2.5 text-zinc-900 max-h-[93vh] overflow-y-auto">
          <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
            <div>
              <h3 class="font-black text-base leading-tight">✂️ 官方預覽圖一鍵切格墊底</h3>
              <p class="text-[10px] font-bold text-zinc-500">自動過濾白邊與淺灰 SAMPLE 水印 · 點擊綠框可剔除誤判</p>
            </div>
            <button type="button" onclick="PCApp.closeSlicerModal()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm shrink-0">✕</button>
          </div>

          <div class="bg-zinc-900 rounded-2xl p-2 border-2 border-cheki-dark flex flex-col items-center">
            <div class="w-full max-h-[40vh] flex items-center justify-center overflow-hidden rounded-xl bg-zinc-950 relative">
              <canvas id="pcSlicerCanvas" onclick="PCApp.onSlicerCanvasTap(event)" class="max-h-[40vh] max-w-full w-auto h-auto object-contain cursor-pointer"></canvas>
              <div id="pcSlicerEmptyHint" class="py-10 text-center space-y-2">
                <p class="text-xs font-black text-zinc-300">尚未載入官方一覽圖</p>
                <button type="button" onclick="document.getElementById('pcSheetFileInput').click()" class="px-4 py-2 rounded-xl bg-sky-400 text-zinc-950 neo-btn text-xs font-black">🖼️ 選擇官方預覽圖</button>
              </div>
            </div>
            <div class="w-full flex items-center justify-between mt-1.5 px-1 text-[11px] font-black">
              <span id="pcSlicerCountText" class="text-emerald-400">待選擇圖片...</span>
              <button type="button" onclick="document.getElementById('pcSheetFileInput').click()" class="text-sky-300 underline">換另一張圖</button>
            </div>
          </div>

          <div class="rounded-2xl border-2 border-cheki-dark bg-white p-2.5 space-y-2 text-xs">
            <div class="grid grid-cols-2 gap-1.5">
              <button type="button" id="pcSliceModeAuto" onclick="PCApp.setSlicerMode('auto')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black">✨ 智能白邊偵測</button>
              <button type="button" id="pcSliceModeGrid" onclick="PCApp.setSlicerMode('grid')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black">📐 均分網格切圖</button>
            </div>

            <div id="pcSliceGridInputs" class="hidden grid grid-cols-2 gap-2 pt-0.5">
              <label class="font-black text-[11px]">橫排數 (Rows)
                <input id="pcSliceRowsInp" type="number" min="1" max="20" value="5" onchange="PCApp.recomputeSlicerBoxes()" class="mt-0.5 w-full px-2.5 py-1 rounded-lg border-2 border-cheki-dark bg-zinc-50 font-black">
              </label>
              <label class="font-black text-[11px]">每排格數 (Cols)
                <input id="pcSliceColsInp" type="number" min="1" max="15" value="6" onchange="PCApp.recomputeSlicerBoxes()" class="mt-0.5 w-full px-2.5 py-1 rounded-lg border-2 border-cheki-dark bg-zinc-50 font-black">
              </label>
            </div>

            <div class="space-y-1.5 pt-0.5">
              <div class="flex items-center justify-between text-[11px] font-black">
                <span>🎯 去白底/水印靈敏度</span>
                <span id="pcSliceThreshVal" class="text-indigo-600">224</span>
              </div>
              <input id="pcSliceThreshSlider" type="range" min="185" max="245" value="224" oninput="PCApp.onSlicerParamChange()" class="w-full accent-indigo-600">
              <div class="flex items-center justify-between text-[11px] font-black">
                <span>✂️ 四邊內縮修邊（去掉細白/藍邊）</span>
                <span id="pcSliceTrimVal" class="text-pink-600">1%</span>
              </div>
              <input id="pcSliceTrimSlider" type="range" min="0" max="6" step="0.5" value="1" oninput="PCApp.onSlicerParamChange()" class="w-full accent-pink-500">
            </div>
          </div>

          <div class="grid grid-cols-3 gap-1.5">
            <button type="button" onclick="PCApp.recomputeSlicerBoxes()" class="py-2.5 rounded-2xl bg-zinc-100 neo-btn font-black text-xs">🔄 重測</button>
            <button type="button" id="pcApplySliceBtn" onclick="PCApp.applySlicedSamplesToSeries()" class="col-span-2 py-2.5 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs">✅ 裁切並填入圖鑑格</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
  },

  openSlicerModal() {
    this.ensurePart2UI();
    this.updateSlicerModeButtons();
    document.getElementById('pcSlicerModal')?.classList.remove('hidden');
    if (!this.slicer.img) document.getElementById('pcSheetFileInput')?.click();
  },

  closeSlicerModal() {
    document.getElementById('pcSlicerModal')?.classList.add('hidden');
  },

  setSlicerMode(m) {
    this.slicer.mode = m;
    this.updateSlicerModeButtons();
    if (this.slicer.img) this.recomputeSlicerBoxes();
  },

  updateSlicerModeButtons() {
    const isAuto = this.slicer.mode === 'auto';
    const bA = document.getElementById('pcSliceModeAuto');
    const bG = document.getElementById('pcSliceModeGrid');
    const gBox = document.getElementById('pcSliceGridInputs');
    if (bA) bA.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black ${isAuto ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700'}`;
    if (bG) bG.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black ${!isAuto ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700'}`;
    if (gBox) gBox.classList.toggle('hidden', isAuto);
  },

  onSlicerParamChange() {
    this.slicer.thresh = Number(document.getElementById('pcSliceThreshSlider')?.value || 224);
    this.slicer.trimPct = Number(document.getElementById('pcSliceTrimSlider')?.value || 1);
    const tv = document.getElementById('pcSliceThreshVal');
    const trv = document.getElementById('pcSliceTrimVal');
    if (tv) tv.textContent = String(this.slicer.thresh);
    if (trv) trv.textContent = `${this.slicer.trimPct}%`;
    if (this.slicer.img) this.recomputeSlicerBoxes();
  },

  handleSheetFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        this.slicer.img = img;
        document.getElementById('pcSlicerEmptyHint')?.classList.add('hidden');
        this.recomputeSlicerBoxes();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  },

  recomputeSlicerBoxes() {
    const img = this.slicer.img;
    if (!img) return;
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const thresh = this.slicer.thresh;
    const satThresh = Math.max(14, Math.round((255 - thresh) * 0.65));
    const mask = new Uint8Array(w * h);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      if ((r + g + b) / 3 < thresh || (mx - mn) > satThresh) mask[p] = 1;
    }

    const getDensity = (x0, y0, x1, y1) => {
      let c = 0, tot = Math.max(1, (x1 - x0) * (y1 - y0));
      for (let y = y0; y < y1; y++) {
        let rowOff = y * w;
        for (let x = x0; x < x1; x++) if (mask[rowOff + x]) c++;
      }
      return c / tot;
    };

    const rawBoxes = [];

    if (this.slicer.mode === 'grid') {
      // 先自動鎖定外圍實質內容邊界，再套用行列均分並自動跳過全白空白格
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (mask[y * w + x]) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX <= minX || maxY <= minY) { minX = 0; minY = 0; maxX = w; maxY = h; }
      const rows = Math.max(1, Number(document.getElementById('pcSliceRowsInp')?.value) || 5);
      const cols = Math.max(1, Number(document.getElementById('pcSliceColsInp')?.value) || 6);
      const cw = (maxX - minX) / cols, ch = (maxY - minY) / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x0 = Math.round(minX + c * cw), y0 = Math.round(minY + r * ch);
          const x1 = Math.round(minX + (c + 1) * cw), y1 = Math.round(minY + (r + 1) * ch);
          if (getDensity(x0, y0, x1, y1) > 0.14) {
            rawBoxes.push({ rx: x0 / w, ry: y0 / h, rw: (x1 - x0) / w, rh: (y1 - y0) / h });
          }
        }
      }
    } else {
      // 1. 水平投影找出每個橫排
      const rowBands = [];
      let inBand = false, bStart = 0, gap = 0;
      for (let y = 0; y < h; y++) {
        let cnt = 0, rowOff = y * w;
        for (let x = 0; x < w; x++) if (mask[rowOff + x]) cnt++;
        if (cnt > w * 0.03) {
          if (!inBand) { inBand = true; bStart = y; }
          gap = 0;
        } else if (inBand) {
          gap++;
          if (gap > 3) {
            if (y - gap - bStart >= h * 0.05) rowBands.push([bStart, y - gap]);
            inBand = false;
          }
        }
      }
      if (inBand && h - bStart >= h * 0.05) rowBands.push([bStart, h]);

      // 2. 每個橫排內做垂直投影，遇到緊貼嘅三連卡自動按 55:85 比例拆分
      rowBands.forEach(([y0, y1]) => {
        const bh = y1 - y0;
        const segs = [];
        let inSeg = false, sStart = 0, sGap = 0;
        for (let x = 0; x < w; x++) {
          let cnt = 0;
          for (let y = y0; y < y1; y++) if (mask[y * w + x]) cnt++;
          if (cnt > bh * 0.14) {
            if (!inSeg) { inSeg = true; sStart = x; }
            sGap = 0;
          } else if (inSeg) {
            sGap++;
            if (sGap > 1) {
              if (x - sGap - sStart >= bh * 0.28) segs.push([sStart, x - sGap]);
              inSeg = false;
            }
          }
        }
        if (inSeg && w - sStart >= bh * 0.28) segs.push([sStart, w]);

        segs.forEach(([x0, x1]) => {
          const sw = x1 - x0;
          if (getDensity(x0, y0, x1, y1) < 0.20) return;
          const ratio = sw / bh;
          const splits = ratio > 1.08 ? Math.max(2, Math.round(ratio / 0.65)) : 1;
          const subW = sw / splits;
          for (let k = 0; k < splits; k++) {
            const sx0 = Math.round(x0 + k * subW), sx1 = Math.round(x0 + (k + 1) * subW);
            if (getDensity(sx0, y0, sx1, y1) >= 0.18) {
              rawBoxes.push({ rx: sx0 / w, ry: y0 / h, rw: (sx1 - sx0) / w, rh: bh / h });
            }
          }
        });
      });
    }

    this.slicer.boxes = rawBoxes;
    this.drawSlicerPreview();
  },

  drawSlicerPreview() {
    const img = this.slicer.img;
    const canvas = document.getElementById('pcSlicerCanvas');
    if (!img || !canvas) return;

    const maxW = 720;
    const scale = Math.min(1, maxW / img.width);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const trim = this.slicer.trimPct / 100;
    this.slicer.boxes.forEach((b, idx) => {
      const x = (b.rx + b.rw * trim) * canvas.width;
      const y = (b.ry + b.rh * trim) * canvas.height;
      const bw = b.rw * (1 - trim * 2) * canvas.width;
      const bh = b.rh * (1 - trim * 2) * canvas.height;

      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = Math.max(2, Math.round(canvas.width / 260));
      ctx.strokeRect(x, y, bw, bh);

      ctx.fillStyle = 'rgba(16, 185, 129, 0.88)';
      const badgeW = 28, badgeH = 18;
      ctx.fillRect(x, y, badgeW, badgeH);
      ctx.fillStyle = '#09090B';
      ctx.font = '900 11px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${idx + 1}`, x + 3, y + 9);
    });

    const cntEl = document.getElementById('pcSlicerCountText');
    const applyBtn = document.getElementById('pcApplySliceBtn');
    const n = this.slicer.boxes.length;
    if (cntEl) cntEl.textContent = n > 0 ? `✅ 已偵測到 ${n} 張小卡（點綠框可剔除）` : '⚠️ 未偵測到卡片，請調高靈敏度或改用均分網格';
    if (applyBtn) applyBtn.textContent = `✅ 裁切並填入圖鑑 (${n} 張)`;
  },

  onSlicerCanvasTap(e) {
    const canvas = document.getElementById('pcSlicerCanvas');
    if (!canvas || this.slicer.boxes.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;

    const hitIdx = this.slicer.boxes.findIndex(b => rx >= b.rx && rx <= b.rx + b.rw && ry >= b.ry && ry <= b.ry + b.rh);
    if (hitIdx >= 0) {
      this.slicer.boxes.splice(hitIdx, 1);
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(8);
      this.drawSlicerPreview();
    }
  },

  async applySlicedSamplesToSeries() {
    const s = this.getActiveSeries();
    const img = this.slicer.img;
    const boxes = this.slicer.boxes;
    if (!s || !img || boxes.length === 0) return;

    const trim = this.slicer.trimPct / 100;
    const cols = s.groupCols || 3;
    const variants = ['A', 'B', 'C', 'D', 'E', 'F'];
    const cutCanvas = document.createElement('canvas');
    const cutCtx = cutCanvas.getContext('2d');

    boxes.forEach((b, i) => {
      const sx = Math.max(0, Math.round((b.rx + b.rw * trim) * img.width));
      const sy = Math.max(0, Math.round((b.ry + b.rh * trim) * img.height));
      const sw = Math.max(10, Math.round(b.rw * (1 - trim * 2) * img.width));
      const sh = Math.max(10, Math.round(b.rh * (1 - trim * 2) * img.height));

      const outW = Math.min(360, sw);
      const outH = Math.round(outW * (sh / sw));
      cutCanvas.width = outW;
      cutCanvas.height = outH;
      cutCtx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      const dataUrl = cutCanvas.toDataURL('image/jpeg', 0.84);

      if (!s.slots[i]) {
        const gIdx = Math.floor(i / cols);
        s.slots.push({
          idx: i + 1, groupIdx: gIdx, member: `成員 ${gIdx + 1}`,
          variant: variants[i % cols] || String((i % cols) + 1),
          sampleImg: dataUrl, realImg: '', realBackImg: '', qty: 0, wish: false, rarity: 'N'
        });
      } else {
        s.slots[i].sampleImg = dataUrl;
      }
    });

    await this.saveSeries(s);
    this.closeSlicerModal();
    this.renderDex();
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
    if (typeof window.showChekiToast === 'function') {
      window.showChekiToast(`✂️ 已成功切割並墊底 ${boxes.length} 張預覽圖！`, 3500);
    }
  },

  triggerSeriesBackUpload() {
    this.ensurePart2UI();
    document.getElementById('pcBackFileInput')?.click();
  },

  handleSeriesBackFile(e) {
    const file = e.target.files?.[0];
    const s = this.getActiveSeries();
    if (!file || !s) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const outW = 440, outH = 680; // 55:85 標準小卡比例
        const c = document.createElement('canvas');
        c.width = outW; c.height = outH;
        const ctx = c.getContext('2d');
        const targetRatio = outW / outH;
        const imgRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (imgRatio > targetRatio) {
          sw = img.height * targetRatio; sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetRatio; sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
        s.backImage = c.toDataURL('image/jpeg', 0.86);
        await this.saveSeries(s);
        this.renderDex();
        if (typeof window.showChekiToast === 'function') window.showChekiToast('🎴 已設定本系列共用卡背！點開小卡即可翻面檢視');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  },

  onAfterRenderDex(s) {
    this.ensurePart2UI();
    const bar = document.getElementById('pcToolbarExt');
    if (!bar) return;
    bar.innerHTML = `
      <button type="button" onclick="PCApp.openSlicerModal()" class="px-2.5 py-1.5 rounded-xl bg-sky-200 hover:bg-sky-300 neo-btn font-black text-[11px] text-zinc-900">✂️ 預覽圖切格墊底</button>
      <button type="button" onclick="PCApp.triggerSeriesBackUpload()" class="px-2.5 py-1.5 rounded-xl ${s.backImage ? 'bg-emerald-200' : 'bg-amber-200'} neo-btn font-black text-[11px] text-zinc-900">${s.backImage ? '✅ 更換共用卡背' : '🎴 設定共用卡背'}</button>
      <span id="pcToolbarExtPart3" class="inline-flex items-center gap-1.5 flex-wrap"></span>
    `;
    if (typeof this.onAfterRenderPart2Toolbar === 'function') this.onAfterRenderPart2Toolbar(s);
  },

  onAfterOpenSlotModal(s, slot) {
    const stage = document.getElementById('pcSlotStageArea');
    const backSrc = slot.realBackImg || s.backImage;
    if (stage && backSrc && !document.getElementById('pcSlotFlipToggleBtn')) {
      let showingBack = false;
      const imgEl = stage.querySelector('img');
      const flipBtn = document.createElement('button');
      flipBtn.type = 'button';
      flipBtn.id = 'pcSlotFlipToggleBtn';
      flipBtn.className = 'mt-2 px-3 py-1 rounded-full bg-indigo-100 border-2 border-cheki-dark text-[11px] font-black text-indigo-900 active:scale-95';
      flipBtn.textContent = '🔄 翻看小卡背面';
      flipBtn.onclick = () => {
        if (!imgEl) return;
        showingBack = !showingBack;
        imgEl.src = showingBack ? backSrc : (slot.realImg || slot.sampleImg);
        if (showingBack) imgEl.classList.remove('grayscale', 'brightness-75', 'opacity-60');
        else if (slot.qty === 0 && !slot.realImg) imgEl.classList.add('grayscale', 'brightness-75', 'opacity-60');
        flipBtn.textContent = showingBack ? '🔄 翻回小卡正面' : '🔄 翻看小卡背面';
      };
      stage.appendChild(flipBtn);
    }
    if (typeof this.onAfterOpenSlotPart2 === 'function') this.onAfterOpenSlotPart2(s, slot);
  }
});

if (PCApp.state.mode === 'pc') PCApp.renderDex();
// === [第 3 段貼在此行正下方] ===
// ============================================================================
// [第 3 段]：滿版圓角真卡掃描覆蓋 ＋ 3D 全息閃卡檢視 ＋ 【譲/求】換卡圖 ＋ 備份同步
// ============================================================================
Object.assign(PCApp, {
  scanner: {
    slotIdx: -1,
    targetSide: 'front', // 'front' | 'back'
    img: null,
    scale: 1,
    ox: 0,
    oy: 0,
    rot: 0,              // 0 | 90 | 180 | 270
    deglare: 15,
    sharpen: 20,
    bright: 100,
    contrast: 104,
    radiusPct: 6,
    dragging: false,
    lastX: 0,
    lastY: 0
  },

  tradeCfg: {
    seekMode: 'missing', // 'missing' (全部未擁有) | 'wish' (只標記💖許願)
    cols: 6,
    note: '香港面交 / 郵寄交換歡迎 DM ✨'
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

  ensurePart3UI() {
    if (document.getElementById('pcPart3Style')) return;

    const st = document.createElement('style');
    st.id = 'pcPart3Style';
    st.textContent = `
      .pc-3d-wrap { perspective: 950px; touch-action: none; user-select: none; }
      .pc-3d-card { transform-style: preserve-3d; transition: transform 0.32s cubic-bezier(0.22,1,0.36,1); will-change: transform; }
      .pc-3d-card.is-tilting { transition: none; }
      .pc-3d-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
      .pc-3d-back { transform: rotateY(180deg); }
      .pc-holo-glare {
        position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
        background: radial-gradient(circle at var(--px, 50%) var(--py, 50%), rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 62%);
        mix-blend-mode: overlay; opacity: var(--glare-op, 0.45);
      }
      .pc-holo-foil {
        position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
        background: linear-gradient(115deg, transparent 15%, rgba(56,189,248,0.42) 32%, rgba(244,114,182,0.45) 50%, rgba(250,204,21,0.42) 68%, transparent 85%);
        background-size: 220% 220%;
        background-position: var(--px, 50%) var(--py, 50%);
        mix-blend-mode: color-dodge; opacity: var(--foil-op, 0.55);
      }
      .pc-sign-foil {
        position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
        background: linear-gradient(125deg, transparent 18%, rgba(253,224,71,0.52) 45%, rgba(255,255,255,0.65) 52%, rgba(245,158,11,0.48) 62%, transparent 82%);
        background-size: 230% 230%;
        background-position: var(--px, 50%) var(--py, 50%);
        mix-blend-mode: color-dodge; opacity: var(--foil-op, 0.65);
      }
    `;
    document.head.appendChild(st);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <input id="pcScanFileInput" type="file" accept="image/*" class="hidden" onchange="PCApp.handleScanFile(event)">
      <input id="pcJsonImportInput" type="file" accept=".json,application/json" class="hidden" onchange="PCApp.importPhotocardJson(event)">

      <!-- 📸 滿版圓角真卡掃描器 -->
      <div id="pcScanModal" class="hidden fixed inset-0 z-[136] bg-black/88 flex items-center justify-center p-2.5 overflow-y-auto">
        <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-3.5 space-y-2.5 text-zinc-900 max-h-[94vh] overflow-y-auto">
          <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
            <div>
              <h3 id="pcScanTitle" class="font-black text-base leading-tight">📸 掃描高清實物小卡</h3>
              <p class="text-[10px] font-bold text-zinc-500">拖曳圖片對準 55:85 滿版框 · 自動平滑圓角與去反光</p>
            </div>
            <button type="button" onclick="PCApp.closeCardScanner()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm shrink-0">✕</button>
          </div>

          <div class="bg-zinc-950 rounded-2xl p-2.5 border-2 border-cheki-dark flex flex-col items-center space-y-1.5">
            <canvas id="pcScanCanvas" width="330" height="510" class="w-48 aspect-[55/85] rounded-xl border border-white/25 cursor-grab active:cursor-grabbing shadow-2xl" style="touch-action:none;"></canvas>
            <div class="flex items-center gap-1.5 flex-wrap justify-center">
              <button type="button" onclick="document.getElementById('pcScanFileInput').click()" class="px-2.5 py-1 rounded-xl bg-sky-400 text-zinc-950 font-black text-[11px]">🖼️ 選相 / 拍照</button>
              <button type="button" onclick="PCApp.rotateScanImg()" class="px-2.5 py-1 rounded-xl bg-white/15 text-white font-black text-[11px]">🔄 旋轉 90°</button>
              <button type="button" onclick="PCApp.resetScanTransform()" class="px-2.5 py-1 rounded-xl bg-white/15 text-white font-black text-[11px]">🎯 重置對位</button>
            </div>
          </div>

          <div class="rounded-2xl border-2 border-cheki-dark bg-white p-2.5 space-y-1.5 text-[11px] font-black">
            <label class="block">
              <div class="flex justify-between"><span>🔎 縮放比例（拖曳畫面移位）</span><span id="pcScanZoomVal" class="text-indigo-600">100%</span></div>
              <input id="pcScanZoom" type="range" min="50" max="260" value="100" oninput="PCApp.onScanSlider()" class="w-full accent-indigo-600">
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
                <input id="pcScanRadius" type="range" min="0" max="12" step="1" value="6" oninput="PCApp.onScanSlider()" class="w-full accent-emerald-500">
              </label>
            </div>
          </div>

          <button type="button" onclick="PCApp.saveScannedCard()" class="w-full py-3 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs">
            ✨ 儲存真卡並點亮圖鑑格
          </button>
        </div>
      </div>

      <!-- 🔁 【譲／求】換卡圖生成器 -->
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
            <input id="pcTradeNoteInput" type="text" value="香港面交 / 郵寄交換歡迎 DM ✨" oninput="PCApp.onTradeNoteInput(this.value)" placeholder="輸入交換條件備註..." class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark font-bold text-xs bg-zinc-50">
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button type="button" onclick="PCApp.exportTradeSheet(false)" class="py-2.5 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs">⬇️ 下載換卡圖</button>
            <button type="button" onclick="PCApp.exportTradeSheet(true)" class="py-2.5 rounded-2xl bg-sky-300 text-zinc-950 neo-btn font-black text-xs">📤 分享至 X / IG</button>
          </div>
        </div>
      </div>

      <!-- ☁️ 小卡圖鑑備份與雲端同步 -->
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
    this.bindScanCanvasDrag();
  },

  // -------------------------------------------------------------------------
  // 1. 掛載工具列擴充按鈕 & 3D 閃卡大圖檢視
  // -------------------------------------------------------------------------
  onAfterRenderPart2Toolbar(s) {
    this.ensurePart3UI();
    const ext = document.getElementById('pcToolbarExtPart3');
    if (!ext) return;
    ext.innerHTML = `
      <button type="button" onclick="PCApp.openTradeSheetModal()" class="px-2.5 py-1.5 rounded-xl bg-pink-200 hover:bg-pink-300 neo-btn font-black text-[11px] text-zinc-900">🔁 【譲/求】換卡圖</button>
      <button type="button" onclick="PCApp.openPcBackupModal()" class="px-2.5 py-1.5 rounded-xl bg-white neo-btn font-black text-[11px] text-zinc-900">💾 備份</button>
    `;
  },

  onAfterOpenSlotPart2(s, slot) {
    this.ensurePart3UI();
    const stage = document.getElementById('pcSlotStageArea');
    const actions = document.getElementById('pcSlotScannerActions');
    const imgSrc = slot.realImg || slot.sampleImg;
    const backSrc = slot.realBackImg || s.backImage;
    const numStr = '#' + String(slot.idx).padStart(3, '0');
    const isLocked = slot.qty === 0 && !slot.realImg;

    if (stage) {
      const borderCls = slot.qty > 0
        ? (slot.rarity === 'SIGN' ? 'pc-sign-border' : slot.rarity === 'HOLO' ? 'pc-holo-border' : 'bg-zinc-900 p-[2.5px]')
        : 'bg-zinc-400 p-[2.5px]';
      const foilHtml = slot.rarity === 'SIGN'
        ? '<div class="pc-sign-foil"></div>'
        : (slot.rarity === 'HOLO' ? '<div class="pc-holo-foil"></div>' : '');

      stage.innerHTML = `
        <div id="pc3DTiltWrap" class="pc-3d-wrap py-1 flex flex-col items-center">
          <div id="pc3DCardInner" class="pc-3d-card relative w-48 aspect-[55/85] cursor-grab active:cursor-grabbing">
            <!-- 正面 -->
            <div class="pc-3d-face absolute inset-0 rounded-2xl ${borderCls} shadow-2xl">
              <div class="w-full h-full rounded-[13px] overflow-hidden bg-zinc-900 relative flex items-center justify-center">
                ${imgSrc
                  ? `<img src="${imgSrc}" draggable="false" class="w-full h-full object-cover pointer-events-none ${isLocked ? 'grayscale brightness-75 opacity-60' : ''}">`
                  : `<span class="text-zinc-500 font-black text-sm">${numStr} 尚未墊底</span>`}
                ${foilHtml}
                <div class="pc-holo-glare"></div>
                ${slot.realImg ? `<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-400 text-zinc-950 font-black text-[10px] shadow">✨ 實物真卡</span>` : ''}
              </div>
            </div>
            <!-- 背面 -->
            <div class="pc-3d-face pc-3d-back absolute inset-0 rounded-2xl ${borderCls} shadow-2xl">
              <div class="w-full h-full rounded-[13px] overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-zinc-950 relative flex flex-col items-center justify-center p-3 text-center">
                ${backSrc
                  ? `<img src="${backSrc}" draggable="false" class="w-full h-full object-cover pointer-events-none"><div class="pc-holo-glare"></div>`
                  : `<div class="text-3xl mb-1">🃏</div><p class="font-black text-xs text-sky-300">${this.esc(s.title)}</p><p class="text-[11px] font-bold text-zinc-400 mt-1">${numStr} · ${this.esc(slot.member)}</p><p class="text-[10px] text-zinc-500 mt-2">可於下方掃描獨立卡背<br>或設定系列共用卡背</p>`}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2 mt-2.5">
            <span class="text-[10px] font-bold text-zinc-500">👆 手指拖曳可 3D 傾斜賞閃膜</span>
            <button type="button" id="pc3DFlipBtn" class="px-2.5 py-1 rounded-full bg-indigo-100 border-2 border-cheki-dark text-[11px] font-black text-indigo-900 active:scale-95">🔄 3D 翻面</button>
          </div>
        </div>
      `;
      this.bind3DTiltCard();
    }

    if (actions) {
      actions.innerHTML = `
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
        </div>
      `;
    }
  },

  bind3DTiltCard() {
    const wrap = document.getElementById('pc3DTiltWrap');
    const card = document.getElementById('pc3DCardInner');
    const flipBtn = document.getElementById('pc3DFlipBtn');
    if (!wrap || !card) return;

    let flipped = false;
    let active = false;

    const applyTransform = (rx, ry, px, py) => {
      const baseY = flipped ? 180 : 0;
      card.style.transform = `rotateX(${rx.toFixed(1)}deg) rotateY(${(baseY + ry).toFixed(1)}deg)`;
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
      };
    }

    const onMove = (e) => {
      if (!active) return;
      const rect = card.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
      applyTransform(-ny * 18, nx * 22, Math.round((nx + 1) * 50), Math.round((ny + 1) * 50));
    };

    card.onpointerdown = (e) => {
      active = true;
      card.classList.add('is-tilting');
      card.setPointerCapture?.(e.pointerId);
      onMove(e);
    };
    card.onpointermove = onMove;
    const endTilt = () => {
      if (!active) return;
      active = false;
      card.classList.remove('is-tilting');
      applyTransform(0, 0, 50, 50);
    };
    card.onpointerup = endTilt;
    card.onpointercancel = endTilt;
  },

  // -------------------------------------------------------------------------
  // 2. 滿版圓角真卡掃描器（去反光、銳化、拖曳縮放與覆蓋點亮）
  // -------------------------------------------------------------------------
  openCardScanner(slotIdx, side = 'front') {
    this.ensurePart3UI();
    const sc = this.scanner;
    sc.slotIdx = slotIdx;
    sc.targetSide = side;
    sc.img = null;
    sc.rot = 0;
    sc.scale = 1;
    sc.ox = 0;
    sc.oy = 0;
    sc.deglare = 15;
    sc.sharpen = 20;
    sc.bright = 100;
    sc.radiusPct = 6;

    const titleEl = document.getElementById('pcScanTitle');
    if (titleEl) titleEl.textContent = side === 'back' ? '✍️ 掃描小卡獨立背面' : '📸 掃描高清實物小卡';
    document.getElementById('pcScanZoom').value = '100';
    document.getElementById('pcScanDeglare').value = '15';
    document.getElementById('pcScanSharpen').value = '20';
    document.getElementById('pcScanBright').value = '100';
    document.getElementById('pcScanRadius').value = '6';
    this.updateScanLabels();

    const cv = document.getElementById('pcScanCanvas');
    if (cv) {
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#18181B';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '900 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('請選擇或拍攝實體小卡', cv.width / 2, cv.height / 2);
    }

    document.getElementById('pcScanModal')?.classList.remove('hidden');
    document.getElementById('pcScanFileInput')?.click();
  },

  closeCardScanner() {
    document.getElementById('pcScanModal')?.classList.add('hidden');
  },

  handleScanFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const im = new Image();
      im.onload = () => {
        this.scanner.img = im;
        this.resetScanTransform();
      };
      im.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  },

  resetScanTransform() {
    const sc = this.scanner;
    sc.scale = 1;
    sc.ox = 0;
    sc.oy = 0;
    const zEl = document.getElementById('pcScanZoom');
    if (zEl) zEl.value = '100';
    this.updateScanLabels();
    this.renderScanCanvas(document.getElementById('pcScanCanvas'), false);
  },

  rotateScanImg() {
    this.scanner.rot = (this.scanner.rot + 90) % 360;
    this.scanner.ox = 0;
    this.scanner.oy = 0;
    this.renderScanCanvas(document.getElementById('pcScanCanvas'), false);
  },

  updateScanLabels() {
    const sc = this.scanner;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('pcScanZoomVal', `${Math.round(sc.scale * 100)}%`);
    set('pcScanDeglareVal', String(sc.deglare));
    set('pcScanSharpenVal', String(sc.sharpen));
    set('pcScanBrightVal', `${sc.bright}%`);
    set('pcScanRadiusVal', `${sc.radiusPct}%`);
  },

  onScanSlider() {
    const sc = this.scanner;
    sc.scale = Number(document.getElementById('pcScanZoom')?.value || 100) / 100;
    sc.deglare = Number(document.getElementById('pcScanDeglare')?.value || 0);
    sc.sharpen = Number(document.getElementById('pcScanSharpen')?.value || 0);
    sc.bright = Number(document.getElementById('pcScanBright')?.value || 100);
    sc.radiusPct = Number(document.getElementById('pcScanRadius')?.value || 6);
    this.updateScanLabels();
    this.renderScanCanvas(document.getElementById('pcScanCanvas'), false);
  },

  bindScanCanvasDrag() {
    const cv = document.getElementById('pcScanCanvas');
    if (!cv || cv._boundDrag) return;
    cv._boundDrag = true;
    const sc = this.scanner;

    cv.addEventListener('pointerdown', (e) => {
      if (!sc.img) return;
      sc.dragging = true;
      sc.lastX = e.clientX;
      sc.lastY = e.clientY;
      cv.setPointerCapture?.(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!sc.dragging || !sc.img) return;
      const rect = cv.getBoundingClientRect();
      const ratio = cv.width / Math.max(1, rect.width);
      sc.ox += (e.clientX - sc.lastX) * ratio;
      sc.oy += (e.clientY - sc.lastY) * ratio;
      sc.lastX = e.clientX;
      sc.lastY = e.clientY;
      this.renderScanCanvas(cv, false);
    });
    const stop = () => { sc.dragging = false; };
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);
  },

  applyCardPixelEnhance(ctx, w, h, deglare, sharpen) {
    if (deglare <= 0 && sharpen <= 0) return;
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // 1. 去反光與暗部通透 (Highlight roll-off + gentle dehaze)
    if (deglare > 0) {
      const k = deglare / 100;
      const cBoost = 1 + k * 0.16;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        let r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const hiPull = lum > 160 ? k * 24 * Math.pow((lum - 160) / 95, 1.5) : 0;
        const hazeCut = k * 8;
        r = (r - 128) * cBoost + 128 - hiPull - hazeCut;
        g = (g - 128) * cBoost + 128 - hiPull - hazeCut;
        b = (b - 128) * cBoost + 128 - hiPull - hazeCut;
        d[i] = r < 0 ? 0 : (r > 255 ? 255 : r);
        d[i + 1] = g < 0 ? 0 : (g > 255 ? 255 : g);
        d[i + 2] = b < 0 ? 0 : (b > 255 ? 255 : b);
      }
    }

    // 2. 3×3 清晰銳化濾鏡
    if (sharpen > 0) {
      const src = new Uint8ClampedArray(d);
      const s = (sharpen / 100) * 0.55;
      const centerW = 1 + 4 * s;
      const rowBytes = w * 4;
      for (let y = 1; y < h - 1; y++) {
        let idx = y * rowBytes + 4;
        for (let x = 1; x < w - 1; x++, idx += 4) {
          if (src[idx + 3] === 0) continue;
          for (let c = 0; c < 3; c++) {
            const p = idx + c;
            const val = src[p] * centerW - s * (src[p - 4] + src[p + 4] + src[p - rowBytes] + src[p + rowBytes]);
            d[p] = val < 0 ? 0 : (val > 255 ? 255 : val);
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  },

  renderScanCanvas(canvas, isExport = false) {
    const sc = this.scanner;
    if (!canvas || !sc.img) return;
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const scaleFactor = isExport ? (w / 330) : 1;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    this.pcRoundRectPath(ctx, 0, 0, w, h, w * (sc.radiusPct / 100));
    ctx.clip();

    ctx.fillStyle = '#111113';
    ctx.fillRect(0, 0, w, h);

    const rotRad = (sc.rot * Math.PI) / 180;
    const isSwapped = sc.rot === 90 || sc.rot === 270;
    const iw = isSwapped ? sc.img.height : sc.img.width;
    const ih = isSwapped ? sc.img.width : sc.img.height;
    const coverScale = Math.max(w / iw, h / ih) * sc.scale;

    ctx.save();
    ctx.filter = `brightness(${sc.bright}%) contrast(${sc.contrast}%)`;
    ctx.translate(w / 2 + sc.ox * scaleFactor, h / 2 + sc.oy * scaleFactor);
    ctx.rotate(rotRad);
    ctx.scale(coverScale, coverScale);
    ctx.drawImage(sc.img, -sc.img.width / 2, -sc.img.height / 2);
    ctx.restore();

    this.applyCardPixelEnhance(ctx, w, h, sc.deglare, sc.sharpen);
    ctx.restore();
  },

  async saveScannedCard() {
    const sc = this.scanner;
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === sc.slotIdx);
    if (!s || !slot || !sc.img) {
      alert('請先選擇或拍攝實體小卡相片！');
      return;
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = 550;
    outCanvas.height = 850;
    this.renderScanCanvas(outCanvas, true);

    let dataUrl = outCanvas.toDataURL('image/webp', 0.88);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = outCanvas.toDataURL('image/jpeg', 0.90);
    }

    if (sc.targetSide === 'back') {
      slot.realBackImg = dataUrl;
    } else {
      slot.realImg = dataUrl;
      if ((slot.qty || 0) === 0) {
        slot.qty = 1;
        slot.wish = false;
        this.state.justUnlockedIdx = slot.idx;
        if (typeof window.fireCheerConfetti === 'function') window.fireCheerConfetti();
      }
    }

    await this.saveSeries(s);
    this.closeCardScanner();
    this.onSlotClick(slot.idx);
    this.renderDex();
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic(16);
    if (typeof window.showChekiToast === 'function') {
      window.showChekiToast(sc.targetSide === 'back' ? '✍️ 已儲存小卡獨立背面！' : `✨ #${String(slot.idx).padStart(3, '0')} 真卡入庫點亮成功！`, 3200);
    }
  },

  async clearSlotRealImg(slotIdx) {
    const s = this.getActiveSeries();
    const slot = s?.slots.find(x => x.idx === slotIdx);
    if (!s || !slot || !confirm('確定移除此格實物真卡並恢復顯示預覽底圖嗎？')) return;
    slot.realImg = '';
    await this.saveSeries(s);
    this.onSlotClick(slotIdx);
    this.renderDex();
  },

  // -------------------------------------------------------------------------
  // 3. 一鍵生成【譲／求】換卡圖
  // -------------------------------------------------------------------------
  openTradeSheetModal() {
    this.ensurePart3UI();
    const s = this.getActiveSeries();
    if (!s) return;
    this.tradeCfg.cols = s.slots.length >= 12 ? 6 : (s.groupCols || 3);
    const hasWish = s.slots.some(x => x.wish);
    this.tradeCfg.seekMode = hasWish ? 'wish' : 'missing';
    this.updateTradeButtonsUI();
    document.getElementById('pcTradeModal')?.classList.remove('hidden');
    this.renderTradeSheetCanvas();
  },

  closeTradeSheetModal() {
    document.getElementById('pcTradeModal')?.classList.add('hidden');
  },

  setTradeOption(k, v) {
    this.tradeCfg[k] = v;
    this.updateTradeButtonsUI();
    this.renderTradeSheetCanvas();
  },

  onTradeNoteInput(v) {
    this.tradeCfg.note = v;
    clearTimeout(this._tradeTimer);
    this._tradeTimer = setTimeout(() => this.renderTradeSheetCanvas(), 220);
  },

  updateTradeButtonsUI() {
    const setBtn = (id, on) => {
      const el = document.getElementById(id);
      if (el) el.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] ${on ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700'}`;
    };
    setBtn('pcTradeSeekMissing', this.tradeCfg.seekMode === 'missing');
    setBtn('pcTradeSeekWish', this.tradeCfg.seekMode === 'wish');
    setBtn('pcTradeCols3', this.tradeCfg.cols === 3);
    setBtn('pcTradeCols6', this.tradeCfg.cols === 6);
  },

  async renderTradeSheetCanvas() {
    const s = this.getActiveSeries();
    const cv = document.getElementById('pcTradeCanvas');
    if (!s || !cv) return;

    const cols = this.tradeCfg.cols || 6;
    const rows = Math.max(1, Math.ceil(s.slots.length / cols));
    const W = 1080;
    const pad = 34;
    const gap = cols === 6 ? 14 : 24;
    const headerH = 158;
    const footerH = 66;
    const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
    const cardH = Math.round(cardW * (85 / 55));
    const H = headerH + rows * cardH + (rows - 1) * gap + footerH + pad;

    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');

    // 背景
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#FFF7FB');
    bg.addColorStop(1, '#EFF6FF');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 標題卡
    ctx.fillStyle = '#272228';
    this.pcRoundRectPath(ctx, pad + 5, 29, W - pad * 2, 108, 24);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    this.pcRoundRectPath(ctx, pad, 24, W - pad * 2, 108, 24);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#272228';
    ctx.stroke();

    const giveCnt = s.slots.filter(x => x.qty > 1).length;
    const seekCnt = s.slots.filter(x => this.tradeCfg.seekMode === 'wish' ? x.wish : x.qty === 0).length;

    ctx.fillStyle = '#272228';
    ctx.font = '900 32px "Zen Maru Gothic", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🃏 ${s.title}  換卡一覽`, pad + 26, 62);

    ctx.fillStyle = '#52525B';
    ctx.font = '700 20px "Zen Maru Gothic", sans-serif';
    ctx.fillText(this.tradeCfg.note || '歡迎交換 ✨', pad + 26, 102);

    // 右上圖例統計膠囊
    const drawLegend = (label, bgCol, x) => {
      ctx.fillStyle = bgCol;
      this.pcRoundRectPath(ctx, x, 46, 152, 42, 21);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 20px "Zen Maru Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + 76, 68);
      ctx.textAlign = 'left';
    };
    drawLegend(`🟢 譲 ${giveCnt}款`, '#10B981', W - pad - 332);
    drawLegend(`🔴 求 ${seekCnt}款`, '#F43F5E', W - pad - 170);

    // 載入全部卡圖
    const imgs = await Promise.all(s.slots.map(sl => this.loadImgAsync(sl.realImg || sl.sampleImg)));

    s.slots.forEach((sl, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = pad + c * (cardW + gap);
      const y = headerH + r * (cardH + gap);
      const isGive = sl.qty > 1;
      const isSeek = this.tradeCfg.seekMode === 'wish' ? Boolean(sl.wish) : sl.qty === 0;
      const rad = Math.round(cardW * 0.08);

      ctx.save();
      this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad);
      ctx.clip();

      const im = imgs[i];
      if (im) {
        ctx.drawImage(im, x, y, cardW, cardH);
      } else {
        ctx.fillStyle = '#E4E4E7';
        ctx.fillRect(x, y, cardW, cardH);
      }

      if (!isGive && !isSeek) {
        ctx.fillStyle = 'rgba(255,255,255,0.52)';
        ctx.fillRect(x, y, cardW, cardH);
      } else {
        ctx.fillStyle = isGive ? 'rgba(16,185,129,0.16)' : 'rgba(244,63,94,0.18)';
        ctx.fillRect(x, y, cardW, cardH);
      }

      // 編號小標
      ctx.fillStyle = 'rgba(24,24,27,0.78)';
      ctx.fillRect(x, y, Math.max(46, Math.round(cardW * 0.34)), 26);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`#${sl.idx}`, x + Math.max(23, Math.round(cardW * 0.17)), y + 14);

      // 顯眼【譲】或【求】印章
      if (isGive || isSeek) {
        const stampH = Math.max(36, Math.round(cardH * 0.22));
        const stampY = y + cardH - stampH;
        ctx.fillStyle = isGive ? 'rgba(5,150,105,0.92)' : 'rgba(225,29,72,0.92)';
        ctx.fillRect(x, stampY, cardW, stampH);
        ctx.fillStyle = '#FFFFFF';
        const fontSize = cols === 6 ? 26 : 38;
        ctx.font = `900 ${fontSize}px "Zen Maru Gothic", sans-serif`;
        const extra = sl.qty - 1;
        const txt = isGive ? (extra > 1 ? `譲 ×${extra}` : '譲') : '求';
        ctx.fillText(txt, x + cardW / 2, stampY + stampH / 2 + 2);
      } else if (sl.qty === 1) {
        ctx.fillStyle = 'rgba(39,34,40,0.65)';
        ctx.font = `900 ${cols === 6 ? 20 : 28}px sans-serif`;
        ctx.fillText('済', x + cardW / 2, y + cardH - 22);
      }
      ctx.textAlign = 'left';
      ctx.restore();

      // 外框強調色
      ctx.lineWidth = (isGive || isSeek) ? 6 : 2;
      ctx.strokeStyle = isGive ? '#059669' : (isSeek ? '#E11D48' : '#CBD5E1');
      this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad);
      ctx.stroke();
    });

    // 底部署名
    const nick = (typeof userOshiProfile !== 'undefined' && userOshiProfile?.nickname) ? userOshiProfile.nickname : 'ChekiPocket Photocard Dex';
    ctx.fillStyle = '#52525B';
    ctx.font = '900 20px "Zen Maru Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`✨ ${nick}  ·  ${new Date().toISOString().slice(0, 10)} ✨`, W / 2, H - 30);
    ctx.textAlign = 'left';
  },

  exportTradeSheet(shareMode = false) {
    const s = this.getActiveSeries();
    const cv = document.getElementById('pcTradeCanvas');
    if (!s || !cv) return;
    cv.toBlob(async (blob) => {
      if (!blob) return;
      const fname = `${s.title}_換卡一覽_${new Date().toISOString().slice(0, 10)}.png`;
      if (shareMode && navigator.canShare) {
        try {
          const f = new File([blob], fname, { type: 'image/png' });
          if (navigator.canShare({ files: [f] })) {
            await navigator.share({ title: `${s.title} 換卡一覽`, files: [f] });
            return;
          }
        } catch (_) {}
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      if (typeof window.showChekiToast === 'function') window.showChekiToast('🔁 【譲/求】換卡圖已下載！');
    }, 'image/png');
  },

  // -------------------------------------------------------------------------
  // 4. 小卡圖鑑本機備份 ＋ Google Drive 雲端同步連動
  // -------------------------------------------------------------------------
  openPcBackupModal() {
    this.ensurePart3UI();
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
    const payload = { type: 'ChekiPocket_PhotocardDex', version: 1, exportedAt: new Date().toISOString(), seriesList: this.state.seriesList };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PhotocardDex_Backup_${this.state.seriesList.length}series_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    if (typeof window.showChekiToast === 'function') window.showChekiToast('📥 小卡圖鑑備份檔已下載！');
  },

  importPhotocardJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const list = Array.isArray(parsed.seriesList) ? parsed.seriesList : [];
        if (list.length === 0) throw new Error('檔案中找不到小卡圖鑑資料');
        for (const s of list) {
          if (s && s.id && Array.isArray(s.slots)) await this.saveSeries(s);
        }
        await this.loadSeriesList();
        this.renderDex();
        document.getElementById('pcBackupModal')?.classList.add('hidden');
        alert(`✅ 成功還原 ${list.length} 套小卡圖鑑！`);
      } catch (err) {
        alert('❌ 匯入失敗：' + (err.message || err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  },

  async syncPhotocardsToDrive() {
    if (typeof ensureGoogleDriveToken !== 'function' || typeof findOrCreateBackupFolder !== 'function') {
      alert('請先確認主程式的 Google Drive 雲端同步模組已載入並設定 Client ID！');
      return;
    }
    try {
      await ensureGoogleDriveToken(false);
      if (typeof window.showChekiToast === 'function') window.showChekiToast('☁️ 正在上傳小卡圖鑑至 Google Drive...', 3000);
      const folderId = await findOrCreateBackupFolder(true);
      const remoteFiles = await listAllBackupFilesInFolder(folderId);

      for (const s of this.state.seriesList) {
        const fname = `pc_series_${s.id}.json`;
        const existing = remoteFiles.find(f => f.name === fname);
        const blob = new Blob([JSON.stringify(s)], { type: 'application/json;charset=utf-8' });
        await gdriveUploadMultipart({
          fileId: existing ? existing.id : null,
          name: fname,
          folderId,
          contentBlob: blob,
          mimeType: 'application/json'
        });
      }
      localStorage.setItem('pc_last_cloud_sync', new Date().toISOString());
      this.openPcBackupModal();
      if (typeof window.showChekiToast === 'function') {
        window.showChekiToast(`☁️ 已成功同步 ${this.state.seriesList.length} 套小卡圖鑑至 Google Drive！`, 3600);
      }
    } catch (err) {
      alert('❌ 雲端同步失敗：' + (err.message || err));
    }
  },

  async restorePhotocardsFromDrive() {
    if (typeof ensureGoogleDriveToken !== 'function' || typeof findOrCreateBackupFolder !== 'function') {
      alert('請先確認主程式的 Google Drive 雲端同步模組已載入！');
      return;
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
          const seriesObj = await res.json();
          if (seriesObj && seriesObj.id && Array.isArray(seriesObj.slots)) {
            await this.saveSeries(seriesObj);
            count++;
          }
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

if (PCApp.state.mode === 'pc') PCApp.renderDex();
// ============================================================================
// [第 4 段]：手機即時鏡頭掃描 (55:85對位框) ＋ 智能防黏排切格 ＋ 手拉橙框精準網格
// ============================================================================
(function applyPhotocardPart4Upgrades() {
  if (!window.PCApp) return;
  const _origEnsurePart2UI = PCApp.ensurePart2UI.bind(PCApp);
  const _origEnsurePart3UI = PCApp.ensurePart3UI.bind(PCApp);

  Object.assign(PCApp, {
    liveCamStream: null,
    gridBox: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 },
    gridGapX: 1.5,
    gridGapY: 1.5,
    gridExcludedSet: new Set(),
    slicerDrag: { handle: null, startX: 0, startY: 0, moved: false },

    // -----------------------------------------------------------------------
    // 1. 升級切格視窗 UI：加入手拉外框、格距微調與可還原剔除格
    // -----------------------------------------------------------------------
    ensurePart2UI() {
      _origEnsurePart2UI();
      if (document.getElementById('pcSliceGapXSlider')) return;
      const modal = document.getElementById('pcSlicerModal');
      if (!modal) return;

      modal.innerHTML = `
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

            <!-- 智能模式參數 -->
            <div id="pcSliceAutoInputs" class="space-y-1.5 pt-0.5">
              <div class="flex items-center justify-between text-[11px] font-black">
                <span>🎯 去白底/水印靈敏度</span>
                <span id="pcSliceThreshVal" class="text-indigo-600">212</span>
              </div>
              <input id="pcSliceThreshSlider" type="range" min="170" max="242" value="212" oninput="PCApp.onSlicerParamChange()" class="w-full accent-indigo-600">
            </div>

            <!-- 手拉網格參數 -->
            <div id="pcSliceGridInputs" class="hidden space-y-2 pt-0.5">
              <div class="grid grid-cols-3 gap-1.5 items-end">
                <label class="font-black text-[11px]">橫排 (Rows)
                  <input id="pcSliceRowsInp" type="number" min="1" max="20" value="3" onchange="PCApp.buildGridBoxesFromRect()" class="mt-0.5 w-full px-2 py-1 rounded-lg border-2 border-cheki-dark bg-zinc-50 font-black">
                </label>
                <label class="font-black text-[11px]">直欄 (Cols)
                  <input id="pcSliceColsInp" type="number" min="1" max="20" value="9" onchange="PCApp.buildGridBoxesFromRect()" class="mt-0.5 w-full px-2 py-1 rounded-lg border-2 border-cheki-dark bg-zinc-50 font-black">
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
              <p class="text-[10px] font-bold text-amber-700">💡 拖拉圖上「🟠 橙色邊點」框住全部小卡，點擊任何綠格可剔除/恢復空白位</p>
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
      `;
      this.slicer.thresh = 212;
      this.bindSlicerCanvasInteractions();
      this.updateSlicerModeButtons();
    },

    updateSlicerModeButtons() {
      const isAuto = this.slicer.mode === 'auto';
      const bA = document.getElementById('pcSliceModeAuto');
      const bG = document.getElementById('pcSliceModeGrid');
      const aBox = document.getElementById('pcSliceAutoInputs');
      const gBox = document.getElementById('pcSliceGridInputs');
      if (bA) bA.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black ${isAuto ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700'}`;
      if (bG) bG.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black ${!isAuto ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-100 text-zinc-700'}`;
      if (aBox) aBox.classList.toggle('hidden', !isAuto);
      if (gBox) gBox.classList.toggle('hidden', isAuto);
    },

    onGridGapChange() {
      this.gridGapX = Number(document.getElementById('pcSliceGapXSlider')?.value || 1.5);
      this.gridGapY = Number(document.getElementById('pcSliceGapYSlider')?.value || 1.5);
      const vx = document.getElementById('pcSliceGapXVal');
      const vy = document.getElementById('pcSliceGapYVal');
      if (vx) vx.textContent = `${this.gridGapX}%`;
      if (vy) vy.textContent = `${this.gridGapY}%`;
      if (this.slicer.img) this.buildGridBoxesFromRect();
    },

    resetSlicerCurrentMode() {
      this.gridExcludedSet.clear();
      if (this.slicer.mode === 'grid') this.autoFitGridOuterBox();
      else this.recomputeSlicerBoxes();
    },

    // 建立去白底與去中性淺灰 SAMPLE 水印的二值遮罩
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
        const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
        const sat = mx - mn;
        const lum = (r + g + b) / 3;
        // 過濾純白底及中性淺灰 SAMPLE 浮水印（低飽和度且偏亮）
        if (sat <= 14 && lum >= Math.min(thresh, 168)) continue;
        if (lum < thresh || sat > satThresh) mask[p] = 1;
      }
      return { w, h, mask };
    },

    autoFitGridOuterBox() {
      const img = this.slicer.img;
      if (!img) return;
      const { w, h, mask } = this.computeSlicerMask(img, this.slicer.thresh || 212);
      const rowProj = new Float32Array(h);
      const colProj = new Float32Array(w);
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

      if (maxX - minX < w * 0.1 || maxY - minY < h * 0.1) {
        this.gridBox = { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 };
      } else {
        this.gridBox = { x0: minX / w, y0: minY / h, x1: (maxX + 1) / w, y1: (maxY + 1) / h };
      }
      this.buildGridBoxesFromRect(true);
    },

    buildGridBoxesFromRect(autoSkipEmpty = false) {
      const img = this.slicer.img;
      if (!img) return;
      const rows = Math.max(1, Math.min(20, Number(document.getElementById('pcSliceRowsInp')?.value) || 3));
      const cols = Math.max(1, Math.min(20, Number(document.getElementById('pcSliceColsInp')?.value) || 9));
      const gb = this.gridBox;
      const totalW = Math.max(0.05, gb.x1 - gb.x0);
      const totalH = Math.max(0.05, gb.y1 - gb.y0);
      const cellW = totalW / cols;
      const cellH = totalH / rows;
      const gx = cellW * (this.gridGapX / 100);
      const gy = cellH * (this.gridGapY / 100);

      let maskInfo = null;
      if (autoSkipEmpty) {
        maskInfo = this.computeSlicerMask(img, this.slicer.thresh || 212);
        this.gridExcludedSet.clear();
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
            const x0 = Math.max(0, Math.floor(rx * maskInfo.w));
            const y0 = Math.max(0, Math.floor(ry * maskInfo.h));
            const x1 = Math.min(maskInfo.w, Math.ceil((rx + rw) * maskInfo.w));
            const y1 = Math.min(maskInfo.h, Math.ceil((ry + rh) * maskInfo.h));
            let fg = 0, area = Math.max(1, (x1 - x0) * (y1 - y0));
            for (let y = y0; y < y1; y++) {
              const off = y * maskInfo.w;
              for (let x = x0; x < x1; x++) if (maskInfo.mask[off + x]) fg++;
            }
            if (fg / area < 0.14) this.gridExcludedSet.add(key);
          }
          boxes.push({ rx, ry, rw, rh, gridKey: key, excluded: this.gridExcludedSet.has(key) });
        }
      }
      this.slicer.boxes = boxes;
      this.drawSlicerPreview();
    },

    // 升級智能偵測：低谷分排 ＋ 縱橫雙向防黏連自動拆格
    recomputeSlicerBoxes() {
      const img = this.slicer.img;
      if (!img) return;
      if (this.slicer.mode === 'grid') {
        this.autoFitGridOuterBox();
        return;
      }

      const { w, h, mask } = this.computeSlicerMask(img, this.slicer.thresh || 212);
      const getDensity = (x0, y0, x1, y1) => {
        let c = 0, tot = Math.max(1, (x1 - x0) * (y1 - y0));
        for (let y = y0; y < y1; y++) {
          const off = y * w;
          for (let x = x0; x < x1; x++) if (mask[off + x]) c++;
        }
        return c / tot;
      };

      // 1. 水平投影 + 低谷閥值分排（1px 窄縫亦能分開）
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
        if (rowProj[y] > rowCut) {
          if (!inB) { inB = true; bStart = y; }
        } else if (inB) {
          if (y - bStart >= h * 0.05) rawBands.push([bStart, y]);
          inB = false;
        }
      }
      if (inB && h - bStart >= h * 0.05) rawBands.push([bStart, h]);

      // 2. 防兩排黏連：若某排明顯高於基準排高 (>= 1.65倍)，在波谷位自動縱向拆分
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

      // 3. 每排內做垂直投影分欄 + 過寬自動拆分 + 過高(全圖黏排)保底拆分
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
          if (colProj[x] > colCut) {
            if (!inS) { inS = true; sStart = x; }
          } else if (inS) {
            if (x - sStart >= Math.max(10, bh * 0.22)) segs.push([sStart, x]);
            inS = false;
          }
        }
        if (inS && w - sStart >= Math.max(10, bh * 0.22)) segs.push([sStart, w]);

        const rowCells = [];
        segs.forEach(([x0, x1]) => {
          const sw = x1 - x0;
          if (getDensity(x0, y0, x1, y1) < 0.18) return;
          const whRatio = sw / bh;
          // 若單一區段太高（代表無縫多排全黏埋），先縱向估計排數
          const vSplits = (bh / sw > 2.25) ? Math.max(2, Math.round((bh / sw) / 1.54)) : 1;
          const effBh = bh / vSplits;
          const hSplits = (sw / effBh > 1.06) ? Math.max(2, Math.round((sw / effBh) / 0.65)) : 1;

          for (let vr = 0; vr < vSplits; vr++) {
            const sy0 = Math.round(y0 + vr * effBh);
            const sy1 = Math.round(y0 + (vr + 1) * effBh);
            const subW = sw / hSplits;
            for (let hc = 0; hc < hSplits; hc++) {
              let sx0 = Math.round(x0 + hc * subW);
              let sx1 = Math.round(x0 + (hc + 1) * subW);
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
        // 確保多層拆分時由上至下、由左至右順序正確
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

      const maxW = 720;
      const scale = Math.min(1, maxW / img.width);
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
          ctx.strokeStyle = '#F43F5E';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, bw, bh);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '900 16px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
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
        ctx.fillStyle = '#09090B';
        ctx.font = '900 11px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${activeNum}`, x + 3, y + 9);
      });

      // 手拉網格模式：繪製橙色可拖曳外框與 8 個控制圓點
      if (this.slicer.mode === 'grid') {
        const gb = this.gridBox;
        const gx = gb.x0 * canvas.width, gy = gb.y0 * canvas.height;
        const gw = (gb.x1 - gb.x0) * canvas.width, gh = (gb.y1 - gb.y0) * canvas.height;

        ctx.save();
        ctx.strokeStyle = '#F97316';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(gx, gy, gw, gh);
        ctx.setLineDash([]);

        const pts = [
          [gx, gy], [gx + gw, gy], [gx, gy + gh], [gx + gw, gy + gh],
          [gx + gw / 2, gy], [gx + gw / 2, gy + gh], [gx, gy + gh / 2], [gx + gw, gy + gh / 2]
        ];
        pts.forEach(([px, py]) => {
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#F97316';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();
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

    bindSlicerCanvasInteractions() {
      const cv = document.getElementById('pcSlicerCanvas');
      if (!cv || cv._boundPart4) return;
      cv._boundPart4 = true;

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
        this.slicerDrag = { handle: null, startX: e.clientX, startY: e.clientY, moved: false };

        if (this.slicer.mode === 'grid') {
          const gb = this.gridBox;
          const mx = (gb.x0 + gb.x1) / 2, my = (gb.y0 + gb.y1) / 2;
          const handles = [
            ['tl', gb.x0, gb.y0], ['tr', gb.x1, gb.y0], ['bl', gb.x0, gb.y1], ['br', gb.x1, gb.y1],
            ['t', mx, gb.y0], ['b', mx, gb.y1], ['l', gb.x0, my], ['r', gb.x1, my]
          ];
          let best = null, bestD = 0.068;
          handles.forEach(([name, hx, hy]) => {
            const d = Math.hypot(rx - hx, ry - hy);
            if (d < bestD) { bestD = d; best = name; }
          });
          if (best) {
            this.slicerDrag.handle = best;
            cv.setPointerCapture?.(e.pointerId);
            e.preventDefault();
          }
        }
      });

      cv.addEventListener('pointermove', (e) => {
        if (!this.slicerDrag.handle) return;
        if (Math.hypot(e.clientX - this.slicerDrag.startX, e.clientY - this.slicerDrag.startY) > 4) {
          this.slicerDrag.moved = true;
        }
        const { rx, ry } = getRel(e);
        const gb = this.gridBox;
        const h = this.slicerDrag.handle;
        const minSize = 0.08;
        if (h.includes('l')) gb.x0 = Math.min(gb.x1 - minSize, rx);
        if (h.includes('r')) gb.x1 = Math.max(gb.x0 + minSize, rx);
        if (h.includes('t')) gb.y0 = Math.min(gb.y1 - minSize, ry);
        if (h.includes('b')) gb.y1 = Math.max(gb.y0 + minSize, ry);
        this.buildGridBoxesFromRect(false);
        e.preventDefault();
      });

      cv.addEventListener('pointerup', (e) => {
        const wasDragging = this.slicerDrag.handle && this.slicerDrag.moved;
        this.slicerDrag.handle = null;
        if (wasDragging || !this.slicer.img) return;

        // 點擊格仔：切換剔除 / 恢復
        const { rx, ry } = getRel(e);
        const hit = this.slicer.boxes.find(b => rx >= b.rx && rx <= b.rx + b.rw && ry >= b.ry && ry <= b.ry + b.rh);
        if (hit) {
          hit.excluded = !hit.excluded;
          if (hit.gridKey) {
            if (hit.excluded) this.gridExcludedSet.add(hit.gridKey);
            else this.gridExcludedSet.delete(hit.gridKey);
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
        cutCanvas.width = outW;
        cutCanvas.height = outH;
        cutCtx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
        const dataUrl = cutCanvas.toDataURL('image/jpeg', 0.85);

        if (!s.slots[i]) {
          const gIdx = Math.floor(i / cols);
          s.slots.push({
            idx: i + 1, groupIdx: gIdx, member: `成員 ${gIdx + 1}`,
            variant: variants[i % cols] || String((i % cols) + 1),
            sampleImg: dataUrl, realImg: '', realBackImg: '', qty: 0, wish: false, rarity: 'N'
          });
        } else {
          s.slots[i].sampleImg = dataUrl;
        }
      });

      await this.saveSeries(s);
      this.closeSlicerModal();
      this.renderDex();
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
      if (typeof window.showChekiToast === 'function') {
        window.showChekiToast(`✂️ 已精準切割並墊底 ${activeBoxes.length} 張預覽圖！`, 3500);
      }
    },

    // -----------------------------------------------------------------------
    // 2. 升級真卡掃描器：加入手機即時鏡頭取景 (55:85 綠框) ＋ 原生相機直開
    // -----------------------------------------------------------------------
    ensurePart3UI() {
      _origEnsurePart3UI();
      if (document.getElementById('pcScanCamInput')) return;

      const camInp = document.createElement('input');
      camInp.id = 'pcScanCamInput';
      camInp.type = 'file';
      camInp.accept = 'image/*';
      camInp.setAttribute('capture', 'environment');
      camInp.className = 'hidden';
      camInp.onchange = (e) => this.handleScanFile(e);
      document.body.appendChild(camInp);

      const scanModal = document.getElementById('pcScanModal');
      if (!scanModal) return;

      scanModal.innerHTML = `
        <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-3.5 space-y-2.5 text-zinc-900 max-h-[94vh] overflow-y-auto">
          <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
            <div>
              <h3 id="pcScanTitle" class="font-black text-base leading-tight">📸 掃描高清實物小卡</h3>
              <p class="text-[10px] font-bold text-zinc-500">手機鏡頭直拍或選相 · 55:85 滿版對位、去反光與平滑圓角</p>
            </div>
            <button type="button" onclick="PCApp.closeCardScanner()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm shrink-0">✕</button>
          </div>

          <div class="bg-zinc-950 rounded-2xl p-2.5 border-2 border-cheki-dark flex flex-col items-center space-y-2">
            <!-- 即時手機鏡頭取景器 -->
            <div id="pcLiveCamWrap" class="hidden relative w-52 aspect-[55/85] rounded-xl overflow-hidden border-2 border-emerald-400 shadow-2xl bg-black">
              <video id="pcLiveCamVideo" autoplay playsinline muted class="w-full h-full object-cover"></video>
              <div class="absolute inset-1.5 border-2 border-dashed border-emerald-300/90 rounded-xl pointer-events-none"></div>
              <span class="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/65 text-emerald-300 text-[10px] font-black whitespace-nowrap">將小卡貼齊綠框拍照</span>
              <div class="absolute bottom-2 inset-x-0 flex items-center justify-center gap-2">
                <button type="button" onclick="PCApp.captureLiveCameraFrame()" class="px-4 py-1.5 rounded-full bg-rose-500 text-white border-2 border-white font-black text-xs shadow-lg active:scale-95">🔴 拍攝</button>
                <button type="button" onclick="PCApp.stopLiveCamera()" class="px-2.5 py-1.5 rounded-full bg-zinc-900/80 text-white border border-white/40 font-black text-[11px]">✕</button>
              </div>
            </div>

            <!-- 靜態裁切預覽畫布 -->
            <canvas id="pcScanCanvas" width="330" height="510" class="w-48 aspect-[55/85] rounded-xl border border-white/25 cursor-grab active:cursor-grabbing shadow-2xl" style="touch-action:none;"></canvas>

            <!-- 拍照與相簿 3 選 1 工具列 -->
            <div class="grid grid-cols-3 gap-1.5 w-full">
              <button type="button" onclick="PCApp.startLiveCamera()" class="py-1.5 px-1.5 rounded-xl bg-emerald-400 text-zinc-950 font-black text-[11px] active:scale-95">📷 鏡頭直拍</button>
              <button type="button" onclick="document.getElementById('pcScanCamInput').click()" class="py-1.5 px-1.5 rounded-xl bg-amber-300 text-zinc-950 font-black text-[11px] active:scale-95">📱 系統相機</button>
              <button type="button" onclick="document.getElementById('pcScanFileInput').click()" class="py-1.5 px-1.5 rounded-xl bg-sky-400 text-zinc-950 font-black text-[11px] active:scale-95">🖼️ 相簿選相</button>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" onclick="PCApp.rotateScanImg()" class="px-2.5 py-1 rounded-xl bg-white/15 text-white font-black text-[11px]">🔄 旋轉 90°</button>
              <button type="button" onclick="PCApp.resetScanTransform()" class="px-2.5 py-1 rounded-xl bg-white/15 text-white font-black text-[11px]">🎯 重置對位</button>
            </div>
          </div>

          <div class="rounded-2xl border-2 border-cheki-dark bg-white p-2.5 space-y-1.5 text-[11px] font-black">
            <label class="block">
              <div class="flex justify-between"><span>🔎 縮放比例（拖曳畫面移位）</span><span id="pcScanZoomVal" class="text-indigo-600">100%</span></div>
              <input id="pcScanZoom" type="range" min="50" max="260" value="100" oninput="PCApp.onScanSlider()" class="w-full accent-indigo-600">
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
                <input id="pcScanRadius" type="range" min="0" max="12" step="1" value="6" oninput="PCApp.onScanSlider()" class="w-full accent-emerald-500">
              </label>
            </div>
          </div>

          <button type="button" onclick="PCApp.saveScannedCard()" class="w-full py-3 rounded-2xl bg-cheki-accent text-white neo-btn font-black text-xs">
            ✨ 儲存高清真卡並套用
          </button>
        </div>
      `;
      this.bindScanCanvasDrag();
    },

    openCardScanner(slotIdx, side = 'front') {
      this.ensurePart3UI();
      this.stopLiveCamera();
      const sc = this.scanner;
      sc.slotIdx = slotIdx;
      sc.targetSide = side;
      sc.img = null;
      sc.rot = 0; sc.scale = 1; sc.ox = 0; sc.oy = 0;
      sc.deglare = 15; sc.sharpen = 20; sc.bright = 100; sc.radiusPct = 6;

      const titleMap = {
        front: '📸 掃描高清實物小卡',
        back: '✍️ 掃描小卡獨立背面',
        seriesBack: '🎴 拍攝 / 設定系列共用卡背'
      };
      const titleEl = document.getElementById('pcScanTitle');
      if (titleEl) titleEl.textContent = titleMap[side] || titleMap.front;

      document.getElementById('pcScanZoom').value = '100';
      document.getElementById('pcScanDeglare').value = '15';
      document.getElementById('pcScanSharpen').value = '20';
      document.getElementById('pcScanBright').value = '100';
      document.getElementById('pcScanRadius').value = '6';
      this.updateScanLabels();

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
      }

      document.getElementById('pcScanModal')?.classList.remove('hidden');
    },

    closeCardScanner() {
      this.stopLiveCamera();
      document.getElementById('pcScanModal')?.classList.add('hidden');
    },

    async startLiveCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        document.getElementById('pcScanCamInput')?.click();
        return;
      }
      this.stopLiveCamera();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false
        });
        this.liveCamStream = stream;
        const vid = document.getElementById('pcLiveCamVideo');
        const wrap = document.getElementById('pcLiveCamWrap');
        const cv = document.getElementById('pcScanCanvas');
        if (vid && wrap) {
          vid.srcObject = stream;
          await vid.play();
          wrap.classList.remove('hidden');
          if (cv) cv.classList.add('hidden');
        }
      } catch (_) {
        // 若瀏覽器權限被拒或不支援，自動退回喚起系統原生相機
        if (typeof window.showChekiToast === 'function') {
          window.showChekiToast('📱 正在切換至系統原生相機拍照...');
        }
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
      const vw = vid.videoWidth, vh = vid.videoHeight;
      const targetRatio = 55 / 85;
      const vRatio = vw / vh;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (vRatio > targetRatio) {
        sw = vh * targetRatio; sx = (vw - sw) / 2;
      } else {
        sh = vw / targetRatio; sy = (vh - sh) / 2;
      }

      const tmp = document.createElement('canvas');
      tmp.width = Math.min(1100, Math.round(sw));
      tmp.height = Math.round(tmp.width * (85 / 55));
      tmp.getContext('2d').drawImage(vid, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);

      const im = new Image();
      im.onload = () => {
        this.scanner.img = im;
        this.stopLiveCamera();
        this.resetScanTransform();
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(14);
      };
      im.src = tmp.toDataURL('image/jpeg', 0.94);
    },

    triggerSeriesBackUpload() {
      this.openCardScanner(-1, 'seriesBack');
    },

    async saveScannedCard() {
      const sc = this.scanner;
      const s = this.getActiveSeries();
      if (!s || !sc.img) {
        alert('請先按「📷 鏡頭直拍」、「📱 系統相機」或「🖼️ 相簿選相」拍攝小卡！');
        return;
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = 550;
      outCanvas.height = 850;
      this.renderScanCanvas(outCanvas, true);
      let dataUrl = outCanvas.toDataURL('image/webp', 0.88);
      if (!dataUrl.startsWith('data:image/webp')) dataUrl = outCanvas.toDataURL('image/jpeg', 0.90);

      if (sc.targetSide === 'seriesBack') {
        s.backImage = dataUrl;
        await this.saveSeries(s);
        this.closeCardScanner();
        this.renderDex();
        if (typeof window.showChekiToast === 'function') window.showChekiToast('🎴 已成功拍攝並儲存系列共用卡背！');
        return;
      }

      const slot = s.slots.find(x => x.idx === sc.slotIdx);
      if (!slot) return;
      if (sc.targetSide === 'back') {
        slot.realBackImg = dataUrl;
      } else {
        slot.realImg = dataUrl;
        if ((slot.qty || 0) === 0) {
          slot.qty = 1;
          slot.wish = false;
          this.state.justUnlockedIdx = slot.idx;
          if (typeof window.fireCheerConfetti === 'function') window.fireCheerConfetti();
        }
      }
      await this.saveSeries(s);
      this.closeCardScanner();
      this.onSlotClick(slot.idx);
      this.renderDex();
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(16);
      if (typeof window.showChekiToast === 'function') {
        window.showChekiToast(sc.targetSide === 'back' ? '✍️ 已儲存小卡獨立背面！' : `✨ #${String(slot.idx).padStart(3, '0')} 高清真卡點亮入庫！`, 3200);
      }
    }
  });
})();
// ============================================================================
// [第 5 段]：60fps 順滑掃描引擎 (雙指縮放＋代理預覽) ＋ 正背面切換與自動翻面修正
// ============================================================================
(function applyPhotocardPart5Fixes() {
  if (!window.PCApp) return;
  const _origEnsurePart3 = PCApp.ensurePart3UI.bind(PCApp);
  const _origOpenSlotP2 = PCApp.onAfterOpenSlotPart2.bind(PCApp);
  const _origOpenScanner = PCApp.openCardScanner.bind(PCApp);

  Object.assign(PCApp, {
    _scanRaf: null,
    _scanEnhanceTimer: null,
    _autoFlipSlotOnce: -1,

    ensurePart3UI() {
      _origEnsurePart3();
      if (document.getElementById('pcPart5Style')) return;

      const st = document.createElement('style');
      st.id = 'pcPart5Style';
      st.textContent = `
        .pc-3d-front { transform: rotateY(0deg) translateZ(1px); }
        .pc-3d-back  { transform: rotateY(180deg) translateZ(1px); }
      `;
      document.head.appendChild(st);

      // 在掃描視窗內注入「📸 存為正面真卡 / ✍️ 存為獨立背面」防誤存切換列
      const titleEl = document.getElementById('pcScanTitle');
      const headerRow = titleEl?.closest('.border-b-2');
      if (headerRow && !document.getElementById('pcScanSideSwitchBar')) {
        const bar = document.createElement('div');
        bar.id = 'pcScanSideSwitchBar';
        bar.className = 'grid grid-cols-2 gap-1.5';
        bar.innerHTML = `
          <button type="button" id="pcSideBtnFront" onclick="PCApp.setScanTargetSide('front')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs transition">📸 存為正面真卡</button>
          <button type="button" id="pcSideBtnBack" onclick="PCApp.setScanTargetSide('back')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs transition">✍️ 存為獨立背面</button>
        `;
        headerRow.insertAdjacentElement('afterend', bar);
      }

      const saveBtn = document.querySelector('#pcScanModal button[onclick="PCApp.saveScannedCard()"]');
      if (saveBtn) saveBtn.id = 'pcScanSaveSubmitBtn';

      this.bindScanCanvasDragV2();
    },

    setScanTargetSide(side) {
      if (this.scanner.targetSide === 'seriesBack') return;
      this.scanner.targetSide = side;
      this.updateScanSideSwitchUI();
    },

    updateScanSideSwitchUI() {
      const side = this.scanner.targetSide;
      const bar = document.getElementById('pcScanSideSwitchBar');
      const bF = document.getElementById('pcSideBtnFront');
      const bB = document.getElementById('pcSideBtnBack');
      const titleEl = document.getElementById('pcScanTitle');
      const saveBtn = document.getElementById('pcScanSaveSubmitBtn');

      if (bar) bar.classList.toggle('hidden', side === 'seriesBack');
      if (bF) bF.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs transition ${side === 'front' ? 'bg-emerald-400 text-zinc-950 shadow' : 'bg-zinc-100 text-zinc-500'}`;
      if (bB) bB.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-xs transition ${side === 'back' ? 'bg-amber-300 text-zinc-950 shadow' : 'bg-zinc-100 text-zinc-500'}`;

      if (titleEl) {
        titleEl.textContent = side === 'seriesBack'
          ? '🎴 拍攝 / 設定系列共用卡背'
          : (side === 'back' ? '✍️ 掃描小卡獨立背面' : '📸 掃描高清實物正面真卡');
      }
      if (saveBtn) {
        saveBtn.textContent = side === 'seriesBack'
          ? '✨ 儲存為系列共用卡背'
          : (side === 'back' ? '✨ 儲存至獨立背面（存後自動翻面）' : '✨ 儲存正面真卡並點亮圖鑑');
      }
    },

    openCardScanner(slotIdx, side = 'front') {
      _origOpenScanner(slotIdx, side);
      this.scanner.previewImg = null;
      this.scanner.hiResImg = null;
      this.updateScanSideSwitchUI();
      this.bindScanCanvasDragV2();
    },

    // 將高像素相片轉成雙層快取：680px 極速預覽圖（拖曳零卡頓）＋ 1600px 高清輸出圖
    loadSourceImageToScanner(imgObj) {
      const makeScaledCanvas = (src, maxEdge) => {
        const s = Math.min(1, maxEdge / Math.max(src.width, src.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(src.width * s));
        c.height = Math.max(1, Math.round(src.height * s));
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        return c;
      };
      this.scanner.hiResImg = makeScaledCanvas(imgObj, 1600);
      this.scanner.previewImg = makeScaledCanvas(imgObj, 680);
      this.scanner.img = this.scanner.hiResImg;
      this.resetScanTransform();
      this.scheduleScanRender(true);
    },

    // 改用 URL.createObjectURL 讀取原生相機/相簿相片，大幅降低手機記憶體崩潰與無反應風險
    handleScanFile(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const cv = document.getElementById('pcScanCanvas');
      if (cv) {
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#18181B';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = '#38BDF8';
        ctx.font = '900 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⏳ 正在載入相片...', cv.width / 2, cv.height / 2);
      }

      const objUrl = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        try {
          this.loadSourceImageToScanner(im);
          if (typeof window.triggerHaptic === 'function') window.triggerHaptic(10);
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      };
      im.onerror = () => {
        URL.revokeObjectURL(objUrl);
        alert('❌ 無法讀取此相片格式，請再試一次或從相簿選取！');
      };
      im.src = objUrl;
      e.target.value = '';
    },

    captureLiveCameraFrame() {
      const vid = document.getElementById('pcLiveCamVideo');
      if (!vid || !vid.videoWidth) return;
      const vw = vid.videoWidth, vh = vid.videoHeight;
      const targetRatio = 55 / 85;
      const vRatio = vw / vh;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (vRatio > targetRatio) { sw = vh * targetRatio; sx = (vw - sw) / 2; }
      else { sh = vw / targetRatio; sy = (vh - sh) / 2; }

      const snap = document.createElement('canvas');
      snap.width = Math.min(1100, Math.round(sw));
      snap.height = Math.round(snap.width * (85 / 55));
      snap.getContext('2d').drawImage(vid, sx, sy, sw, sh, 0, 0, snap.width, snap.height);

      this.stopLiveCamera();
      this.loadSourceImageToScanner(snap);
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(14);
    },

    resetScanTransform() {
      const sc = this.scanner;
      sc.scale = 1; sc.ox = 0; sc.oy = 0;
      const zEl = document.getElementById('pcScanZoom');
      if (zEl) zEl.value = '100';
      this.updateScanLabels();
      this.scheduleScanRender(true);
    },

    rotateScanImg() {
      this.scanner.rot = (this.scanner.rot + 90) % 360;
      this.scanner.ox = 0; this.scanner.oy = 0;
      this.scheduleScanRender(true);
    },

    onScanSlider() {
      const sc = this.scanner;
      sc.scale = Number(document.getElementById('pcScanZoom')?.value || 100) / 100;
      sc.deglare = Number(document.getElementById('pcScanDeglare')?.value || 0);
      sc.sharpen = Number(document.getElementById('pcScanSharpen')?.value || 0);
      sc.bright = Number(document.getElementById('pcScanBright')?.value || 100);
      sc.radiusPct = Number(document.getElementById('pcScanRadius')?.value || 6);
      this.updateScanLabels();
      this.scheduleScanRender(true);
    },

    // rAF 合幀渲染：操作時純硬體繪圖 (60fps)，停手 160ms 後再補畫去反光與銳化
    scheduleScanRender(withDelayedEnhance = true) {
      if (this._scanEnhanceTimer) {
        clearTimeout(this._scanEnhanceTimer);
        this._scanEnhanceTimer = null;
      }
      if (!this._scanRaf) {
        this._scanRaf = requestAnimationFrame(() => {
          this._scanRaf = null;
          const cv = document.getElementById('pcScanCanvas');
          if (cv && this.scanner.img) this.renderScanCanvasFast(cv, false, false);
        });
      }
      if (withDelayedEnhance && (this.scanner.deglare > 0 || this.scanner.sharpen > 0)) {
        this._scanEnhanceTimer = setTimeout(() => {
          const cv = document.getElementById('pcScanCanvas');
          if (cv && this.scanner.img) this.renderScanCanvasFast(cv, false, true);
        }, 160);
      }
    },

    renderScanCanvasFast(canvas, isExport = false, applyEnhance = false) {
      const sc = this.scanner;
      const srcImg = isExport ? (sc.hiResImg || sc.img) : (sc.previewImg || sc.img);
      if (!canvas || !srcImg) return;
      const w = canvas.width, h = canvas.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: applyEnhance });
      const scaleFactor = isExport ? (w / 330) : 1;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      this.pcRoundRectPath(ctx, 0, 0, w, h, w * (sc.radiusPct / 100));
      ctx.clip();

      ctx.fillStyle = '#111113';
      ctx.fillRect(0, 0, w, h);

      const rotRad = (sc.rot * Math.PI) / 180;
      const isSwapped = sc.rot === 90 || sc.rot === 270;
      const iw = isSwapped ? srcImg.height : srcImg.width;
      const ih = isSwapped ? srcImg.width : srcImg.height;
      const coverScale = Math.max(w / iw, h / ih) * sc.scale;

      ctx.save();
      if (sc.bright !== 100 || sc.contrast !== 100) {
        ctx.filter = `brightness(${sc.bright}%) contrast(${sc.contrast}%)`;
      }
      ctx.translate(w / 2 + sc.ox * scaleFactor, h / 2 + sc.oy * scaleFactor);
      ctx.rotate(rotRad);
      ctx.scale(coverScale, coverScale);
      ctx.drawImage(srcImg, -srcImg.width / 2, -srcImg.height / 2);
      ctx.restore();

      if (applyEnhance && (sc.deglare > 0 || sc.sharpen > 0)) {
        this.applyCardPixelEnhance(ctx, w, h, sc.deglare, sc.sharpen);
      }
      ctx.restore();
    },

    renderScanCanvas(canvas, isExport = false) {
      this.renderScanCanvasFast(canvas, isExport, isExport);
    },

    // 支援單指 60fps 拖曳 ＋ 雙指捏合縮放 (Pinch-to-Zoom)
    bindScanCanvasDragV2() {
      const oldCv = document.getElementById('pcScanCanvas');
      if (!oldCv || oldCv._boundDragV2) return;
      // 替換節點以移除舊版同步重繪監聽器，徹底解除卡頓
      const cv = oldCv.cloneNode(true);
      oldCv.parentNode.replaceChild(cv, oldCv);
      cv._boundDragV2 = true;

      const ptrs = new Map();
      let lastCenter = null;
      let lastDist = 0;

      const getMetrics = () => {
        const arr = [...ptrs.values()];
        if (arr.length === 1) return { cx: arr[0].x, cy: arr[0].y, dist: 0 };
        const cx = (arr[0].x + arr[1].x) / 2;
        const cy = (arr[0].y + arr[1].y) / 2;
        const dist = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        return { cx, cy, dist };
      };

      cv.addEventListener('pointerdown', (e) => {
        if (!this.scanner.img) return;
        cv.setPointerCapture?.(e.pointerId);
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const m = getMetrics();
        lastCenter = { x: m.cx, y: m.cy };
        lastDist = m.dist;
        e.preventDefault();
      });

      cv.addEventListener('pointermove', (e) => {
        if (!ptrs.has(e.pointerId) || !this.scanner.img) return;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const m = getMetrics();
        const rect = cv.getBoundingClientRect();
        const ratio = cv.width / Math.max(1, rect.width);

        if (lastCenter) {
          this.scanner.ox += (m.cx - lastCenter.x) * ratio;
          this.scanner.oy += (m.cy - lastCenter.y) * ratio;
        }
        if (ptrs.size >= 2 && lastDist > 10 && m.dist > 10) {
          const factor = m.dist / lastDist;
          this.scanner.scale = Math.max(0.5, Math.min(2.6, this.scanner.scale * factor));
          const zEl = document.getElementById('pcScanZoom');
          if (zEl) zEl.value = String(Math.round(this.scanner.scale * 100));
          this.updateScanLabels();
        }
        lastCenter = { x: m.cx, y: m.cy };
        lastDist = m.dist;
        this.scheduleScanRender(true);
        e.preventDefault();
      });

      const onUp = (e) => {
        ptrs.delete(e.pointerId);
        if (ptrs.size === 0) {
          lastCenter = null;
          lastDist = 0;
        } else {
          const m = getMetrics();
          lastCenter = { x: m.cx, y: m.cy };
          lastDist = m.dist;
        }
      };
      cv.addEventListener('pointerup', onUp);
      cv.addEventListener('pointercancel', onUp);
    },

    async saveScannedCard() {
      const sc = this.scanner;
      const s = this.getActiveSeries();
      if (!s || !sc.img) {
        alert('請先按「📷 鏡頭直拍」、「📱 系統相機」或「🖼️ 相簿選相」拍攝小卡！');
        return;
      }

      const saveBtn = document.getElementById('pcScanSaveSubmitBtn');
      const oldTxt = saveBtn?.textContent;
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ 正在合成高清真卡...'; }

      await new Promise(r => setTimeout(r, 30));
      try {
        const outCanvas = document.createElement('canvas');
        outCanvas.width = 550;
        outCanvas.height = 850;
        this.renderScanCanvasFast(outCanvas, true, true);
        let dataUrl = outCanvas.toDataURL('image/webp', 0.88);
        if (!dataUrl.startsWith('data:image/webp')) dataUrl = outCanvas.toDataURL('image/jpeg', 0.90);

        if (sc.targetSide === 'seriesBack') {
          s.backImage = dataUrl;
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
          this._autoFlipSlotOnce = slot.idx; // 存背面後自動翻去背面俾用家即時確認
        } else {
          slot.realImg = dataUrl;
          if ((slot.qty || 0) === 0) {
            slot.qty = 1;
            slot.wish = false;
            this.state.justUnlockedIdx = slot.idx;
            if (typeof window.fireCheerConfetti === 'function') window.fireCheerConfetti();
          }
        }
        await this.saveSeries(s);
        this.closeCardScanner();
        this.onSlotClick(slot.idx);
        this.renderDex();
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(16);
        if (typeof window.showChekiToast === 'function') {
          window.showChekiToast(
            sc.targetSide === 'back' ? '✍️ 已儲存小卡獨立背面（已自動翻面展示）！' : `✨ #${String(slot.idx).padStart(3, '0')} 高清正面真卡已點亮！`,
            3200
          );
        }
      } finally {
        if (saveBtn) { saveBtn.disabled = false; if (oldTxt) saveBtn.textContent = oldTxt; }
      }
    },

    // 一鍵將誤存於背面的真卡移去正面並點亮圖鑑
    async moveBackImgToFront(slotIdx) {
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === slotIdx);
      if (!s || !slot || !slot.realBackImg) return;
      const oldFront = slot.realImg || '';
      slot.realImg = slot.realBackImg;
      slot.realBackImg = oldFront;
      if ((slot.qty || 0) === 0) {
        slot.qty = 1;
        slot.wish = false;
        this.state.justUnlockedIdx = slot.idx;
        if (typeof window.fireCheerConfetti === 'function') window.fireCheerConfetti();
      }
      await this.saveSeries(s);
      this.onSlotClick(slotIdx);
      this.renderDex();
      if (typeof window.showChekiToast === 'function') window.showChekiToast('✨ 已將該相片移至正面真卡並點亮圖鑑！');
    },

    onAfterOpenSlotPart2(s, slot) {
      _origOpenSlotP2(s, slot);

      // 補齊 3D 正背面圖層標記，避免部分手機 Chrome 翻面穿透
      const cardInner = document.getElementById('pc3DCardInner');
      if (cardInner) {
        const faces = cardInner.querySelectorAll('.pc-3d-face');
        if (faces[0]) faces[0].classList.add('pc-3d-front');
        const flipBtn = document.getElementById('pc3DFlipBtn');
        if (flipBtn) {
          const origClick = flipBtn.onclick;
          let isBackVisible = false;
          flipBtn.onclick = () => {
            isBackVisible = !isBackVisible;
            if (origClick) origClick();
            setTimeout(() => {
              if (faces[0]) faces[0].style.opacity = isBackVisible ? '0' : '1';
              if (faces[1]) faces[1].style.opacity = isBackVisible ? '1' : '0';
            }, 130);
          };
          if (faces[1]) faces[1].style.opacity = '0';

          // 若剛剛儲存了獨立背面，自動 3D 翻去背面展示
          if (this._autoFlipSlotOnce === slot.idx) {
            this._autoFlipSlotOnce = -1;
            setTimeout(() => flipBtn.click(), 180);
          }
        }
      }

      // 若正面未有真卡但背面已存圖，提供一鍵搬回正面補救按鈕
      const actions = document.getElementById('pcSlotScannerActions');
      if (actions && !slot.realImg && slot.realBackImg && !document.getElementById('pcMoveBackToFrontBtn')) {
        const fixBtn = document.createElement('button');
        fixBtn.type = 'button';
        fixBtn.id = 'pcMoveBackToFrontBtn';
        fixBtn.onclick = () => this.moveBackImgToFront(slot.idx);
        fixBtn.className = 'w-full mt-1.5 py-2 rounded-xl bg-indigo-100 border-2 border-cheki-dark font-black text-[11px] text-indigo-900 active:scale-95';
        fixBtn.textContent = '🔄 將剛拍的背面相片直接移作正面真卡';
        actions.appendChild(fixBtn);
      }
    }
  });
})();
// ============================================================================
// [第 6 段]：四角透視拉點裁切 (附即時放大鏡) ＋ 多種小卡比例 (63×88 / 55×85 / 89×127)
// ============================================================================
(function applyPhotocardPart6QuadCropAndRatios() {
  if (!window.PCApp) return;

  const _origEnsurePart3 = PCApp.ensurePart3UI.bind(PCApp);
  const _origOpenScanner = PCApp.openCardScanner.bind(PCApp);
  const _origOpenSlotP2 = PCApp.onAfterOpenSlotPart2.bind(PCApp);
  const _origRenderSlot = PCApp.renderSlotCardHtml.bind(PCApp);

  Object.assign(PCApp, {
    CARD_RATIOS: {
      '63x88':  { label: '🃏 日系 63×88', css: '63 / 88',  w: 630, h: 880, preW: 315, preH: 440 },
      '55x85':  { label: '💳 韓系 55×85', css: '55 / 85',  w: 550, h: 850, preW: 330, preH: 510 },
      '89x127': { label: '🖼️ 生寫 89×127', css: '89 / 127', w: 560, h: 800, preW: 315, preH: 450 }
    },

    getSeriesRatioKey(s) {
      const k = s?.cardRatio;
      return (k && this.CARD_RATIOS[k]) ? k : '63x88';
    },

    getSeriesRatioSpec(s) {
      return this.CARD_RATIOS[this.getSeriesRatioKey(s)] || this.CARD_RATIOS['63x88'];
    },

    // -----------------------------------------------------------------------
    // 1. 讓圖鑑卡格與 3D 大圖自動跟隨該系列小卡尺寸比例
    // -----------------------------------------------------------------------
    renderSlotCardHtml(sl) {
      const html = _origRenderSlot(sl);
      const spec = this.getSeriesRatioSpec(this.getActiveSeries());
      return html.replace('aspect-[55/85]', `" style="aspect-ratio:${spec.css};" data-ratio="1`);
    },

    onAfterOpenSlotPart2(s, slot) {
      _origOpenSlotP2(s, slot);
      const spec = this.getSeriesRatioSpec(s);
      const cardInner = document.getElementById('pc3DCardInner');
      if (cardInner) {
        cardInner.classList.remove('aspect-[55/85]');
        cardInner.style.aspectRatio = spec.css;
      }
    },

    // -----------------------------------------------------------------------
    // 2. 掃描視窗升級：注入尺寸切換列、四角拉點/微調模式切換、細微旋轉滑桿
    // -----------------------------------------------------------------------
    ensurePart3UI() {
      _origEnsurePart3();
      if (document.getElementById('pcScanRatioBar')) return;

      const sideBar = document.getElementById('pcScanSideSwitchBar');
      if (sideBar) {
        const extraBars = document.createElement('div');
        extraBars.className = 'space-y-1.5';
        extraBars.innerHTML = `
          <div id="pcScanRatioBar" class="grid grid-cols-3 gap-1">
            ${Object.entries(this.CARD_RATIOS).map(([k, info]) => `
              <button type="button" id="pcRatioBtn_${k}" onclick="PCApp.setScanCardRatio('${k}')" class="py-1 rounded-xl border-2 border-cheki-dark font-black text-[10px] transition">${info.label}</button>
            `).join('')}
          </div>
          <div id="pcScanCropModeBar" class="grid grid-cols-2 gap-1.5">
            <button type="button" id="pcModeBtnQuad" onclick="PCApp.setScanCropMode('quad')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] transition">📐 四角拉點裁切</button>
            <button type="button" id="pcModeBtnAdjust" onclick="PCApp.setScanCropMode('adjust')" class="py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] transition">🔎 拖曳縮放預覽</button>
          </div>
        `;
        sideBar.insertAdjacentElement('afterend', extraBars);
      }

      // 在預覽區加入「✂️ 確認四角拉直預覽」確認按鈕
      const camBtnRow = document.querySelector('#pcScanModal button[onclick="PCApp.startLiveCamera()"]')?.parentElement;
      if (camBtnRow && !document.getElementById('pcQuadApplyBtn')) {
        const quadBar = document.createElement('div');
        quadBar.id = 'pcQuadActionRow';
        quadBar.className = 'hidden w-full space-y-1';
        quadBar.innerHTML = `
          <p class="text-[10px] font-bold text-emerald-300 text-center">👆 拖拉 4 隻綠點對準小卡四角（拖動時自動顯示放大鏡）</p>
          <button type="button" id="pcQuadApplyBtn" onclick="PCApp.confirmQuadPerspectiveCrop()" class="w-full py-2 rounded-xl bg-emerald-400 text-zinc-950 font-black text-xs shadow active:scale-95">
            ✂️ 確認四角拉直並檢視效果
          </button>
        `;
        camBtnRow.insertAdjacentElement('beforebegin', quadBar);
      }

      // 在縮放滑桿下方補上「微角度旋轉 (-15° ~ +15°)」
      const zoomInp = document.getElementById('pcScanZoom');
      const zoomLabel = zoomInp?.closest('label');
      if (zoomLabel && !document.getElementById('pcScanFineRot')) {
        zoomLabel.id = 'pcScanZoomWrap';
        const fineWrap = document.createElement('label');
        fineWrap.id = 'pcScanFineRotWrap';
        fineWrap.className = 'block';
        fineWrap.innerHTML = `
          <div class="flex justify-between"><span>📐 微角度水平校正</span><span id="pcScanFineRotVal" class="text-teal-600">0°</span></div>
          <input id="pcScanFineRot" type="range" min="-15" max="15" step="0.5" value="0" oninput="PCApp.onScanSlider()" class="w-full accent-teal-500">
        `;
        zoomLabel.insertAdjacentElement('afterend', fineWrap);
      }

      this.bindScanCanvasQuadAndDrag();
    },

    openCardScanner(slotIdx, side = 'front') {
      _origOpenScanner(slotIdx, side);
      const s = this.getActiveSeries();
      const sc = this.scanner;
      sc.ratioKey = this.getSeriesRatioKey(s);
      sc.cropMode = 'quad';
      sc.fineRot = 0;
      sc.rawHiResImg = null;
      sc.rawPreviewImg = null;
      sc.quadPts = [
        { x: 0.10, y: 0.10 },
        { x: 0.90, y: 0.10 },
        { x: 0.90, y: 0.90 },
        { x: 0.10, y: 0.90 }
      ];
      sc.activeCorner = -1;
      sc.quadRect = null;

      const fEl = document.getElementById('pcScanFineRot');
      if (fEl) fEl.value = '0';
      this.updateScanRatioAndModeUI();
      this.applyCanvasBoxForCurrentMode();
      this.bindScanCanvasQuadAndDrag();
    },

    async setScanCardRatio(ratioKey) {
      if (!this.CARD_RATIOS[ratioKey]) return;
      this.scanner.ratioKey = ratioKey;
      const s = this.getActiveSeries();
      if (s) {
        s.cardRatio = ratioKey;
        await this.saveSeries(s);
        this.renderDex();
      }
      this.updateScanRatioAndModeUI();
      this.applyCanvasBoxForCurrentMode();

      if (this.scanner.rawHiResImg) {
        if (this.scanner.cropMode === 'quad') {
          this.renderQuadEditorCanvas();
        } else {
          // 已在微調預覽模式時，依新比例重新拉直預覽
          this.confirmQuadPerspectiveCrop(true);
        }
      }
    },

    setScanCropMode(mode) {
      const sc = this.scanner;
      if (mode === 'adjust' && sc.cropMode === 'quad' && sc.rawHiResImg) {
        this.confirmQuadPerspectiveCrop();
        return;
      }
      sc.cropMode = mode;
      this.updateScanRatioAndModeUI();
      this.applyCanvasBoxForCurrentMode();
      if (sc.rawPreviewImg && mode === 'quad') {
        this.renderQuadEditorCanvas();
      } else if (sc.img && mode === 'adjust') {
        this.scheduleScanRender(true);
      }
    },

    updateScanRatioAndModeUI() {
      const sc = this.scanner;
      const rKey = sc.ratioKey || '63x88';
      const spec = this.CARD_RATIOS[rKey] || this.CARD_RATIOS['63x88'];
      const isQuad = sc.cropMode === 'quad';

      Object.keys(this.CARD_RATIOS).forEach(k => {
        const btn = document.getElementById(`pcRatioBtn_${k}`);
        if (btn) {
          btn.className = `py-1 rounded-xl border-2 border-cheki-dark font-black text-[10px] transition ${k === rKey ? 'bg-indigo-600 text-white shadow' : 'bg-white text-zinc-700'}`;
        }
      });

      const bQ = document.getElementById('pcModeBtnQuad');
      const bA = document.getElementById('pcModeBtnAdjust');
      if (bQ) bQ.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] transition ${isQuad ? 'bg-emerald-400 text-zinc-950 shadow' : 'bg-zinc-100 text-zinc-600'}`;
      if (bA) bA.className = `py-1.5 rounded-xl border-2 border-cheki-dark font-black text-[11px] transition ${!isQuad ? 'bg-sky-400 text-zinc-950 shadow' : 'bg-zinc-100 text-zinc-600'}`;

      const quadRow = document.getElementById('pcQuadActionRow');
      if (quadRow) quadRow.classList.toggle('hidden', !isQuad || !sc.rawPreviewImg);

      const zWrap = document.getElementById('pcScanZoomWrap');
      const fWrap = document.getElementById('pcScanFineRotWrap');
      if (zWrap) zWrap.classList.toggle('hidden', isQuad);
      if (fWrap) fWrap.classList.toggle('hidden', isQuad);

      const camWrap = document.getElementById('pcLiveCamWrap');
      if (camWrap) {
        camWrap.classList.remove('aspect-[55/85]');
        camWrap.style.aspectRatio = spec.css;
      }
    },

    applyCanvasBoxForCurrentMode() {
      const cv = document.getElementById('pcScanCanvas');
      if (!cv) return;
      const sc = this.scanner;
      const spec = this.CARD_RATIOS[sc.ratioKey || '63x88'] || this.CARD_RATIOS['63x88'];

      if (sc.cropMode === 'quad' && sc.rawPreviewImg) {
        const im = sc.rawPreviewImg;
        const pad = 22;
        const maxW = 360, maxH = 440;
        const fit = Math.min((maxW - pad * 2) / im.width, (maxH - pad * 2) / im.height);
        const dw = Math.round(im.width * fit);
        const dh = Math.round(im.height * fit);
        cv.width = dw + pad * 2;
        cv.height = dh + pad * 2;
        sc.quadRect = { x: pad, y: pad, w: dw, h: dh };
        cv.classList.remove('w-48', 'aspect-[55/85]');
        cv.style.width = '100%';
        cv.style.maxWidth = '290px';
        cv.style.maxHeight = '42vh';
        cv.style.aspectRatio = `${cv.width} / ${cv.height}`;
      } else {
        cv.width = spec.preW;
        cv.height = spec.preH;
        cv.classList.remove('aspect-[55/85]');
        cv.classList.add('w-48');
        cv.style.width = '';
        cv.style.maxWidth = '';
        cv.style.maxHeight = '';
        cv.style.aspectRatio = spec.css;
      }
    },

    // 載入相片後自動進入「📐 四角拉點裁切」模式
    loadSourceImageToScanner(imgObj) {
      const makeScaled = (src, maxEdge) => {
        const s = Math.min(1, maxEdge / Math.max(src.width, src.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(src.width * s));
        c.height = Math.max(1, Math.round(src.height * s));
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        return c;
      };
      const sc = this.scanner;
      sc.rawHiResImg = makeScaled(imgObj, 1600);
      sc.rawPreviewImg = makeScaled(imgObj, 720);
      sc.hiResImg = sc.rawHiResImg;
      sc.previewImg = sc.rawPreviewImg;
      sc.img = sc.rawHiResImg;
      sc.rot = 0;
      sc.fineRot = 0;
      sc.scale = 1; sc.ox = 0; sc.oy = 0;
      sc.quadPts = [
        { x: 0.10, y: 0.10 },
        { x: 0.90, y: 0.10 },
        { x: 0.90, y: 0.90 },
        { x: 0.10, y: 0.90 }
      ];
      sc.cropMode = 'quad';
      this.updateScanRatioAndModeUI();
      this.applyCanvasBoxForCurrentMode();
      this.renderQuadEditorCanvas();
    },

    // 即時鏡頭拍攝時保留小許白邊餘裕，方便後續拉四隻角精準拉直
    captureLiveCameraFrame() {
      const vid = document.getElementById('pcLiveCamVideo');
      if (!vid || !vid.videoWidth) return;
      const vw = vid.videoWidth, vh = vid.videoHeight;
      const snap = document.createElement('canvas');
      const s = Math.min(1, 1400 / Math.max(vw, vh));
      snap.width = Math.round(vw * s);
      snap.height = Math.round(vh * s);
      snap.getContext('2d').drawImage(vid, 0, 0, snap.width, snap.height);

      this.stopLiveCamera();
      this.loadSourceImageToScanner(snap);
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(14);
    },

    rotateScanImg() {
      const sc = this.scanner;
      if (sc.cropMode === 'quad' && sc.rawHiResImg) {
        const rot90 = (src) => {
          const c = document.createElement('canvas');
          c.width = src.height; c.height = src.width;
          const ctx = c.getContext('2d');
          ctx.translate(c.width / 2, c.height / 2);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(src, -src.width / 2, -src.height / 2);
          return c;
        };
        sc.rawHiResImg = rot90(sc.rawHiResImg);
        sc.rawPreviewImg = rot90(sc.rawPreviewImg);
        sc.img = sc.rawHiResImg;
        sc.quadPts = [
          { x: 0.10, y: 0.10 }, { x: 0.90, y: 0.10 },
          { x: 0.90, y: 0.90 }, { x: 0.10, y: 0.90 }
        ];
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
        sc.quadPts = [
          { x: 0.10, y: 0.10 }, { x: 0.90, y: 0.10 },
          { x: 0.90, y: 0.90 }, { x: 0.10, y: 0.90 }
        ];
        this.renderQuadEditorCanvas();
        return;
      }
      sc.scale = 1; sc.ox = 0; sc.oy = 0; sc.fineRot = 0;
      const zEl = document.getElementById('pcScanZoom');
      const fEl = document.getElementById('pcScanFineRot');
      if (zEl) zEl.value = '100';
      if (fEl) fEl.value = '0';
      this.updateScanLabels();
      this.scheduleScanRender(true);
    },

    onScanSlider() {
      const sc = this.scanner;
      sc.scale = Number(document.getElementById('pcScanZoom')?.value || 100) / 100;
      sc.fineRot = Number(document.getElementById('pcScanFineRot')?.value || 0);
      sc.deglare = Number(document.getElementById('pcScanDeglare')?.value || 0);
      sc.sharpen = Number(document.getElementById('pcScanSharpen')?.value || 0);
      sc.bright = Number(document.getElementById('pcScanBright')?.value || 100);
      sc.radiusPct = Number(document.getElementById('pcScanRadius')?.value || 6);
      this.updateScanLabels();
      const fVal = document.getElementById('pcScanFineRotVal');
      if (fVal) fVal.textContent = `${sc.fineRot}°`;
      if (sc.cropMode === 'adjust') this.scheduleScanRender(true);
    },

    // 繪製四角透視編輯畫布 ＋ 拖動角點時自動顯示 2.2 倍局部放大鏡
    renderQuadEditorCanvas() {
      const cv = document.getElementById('pcScanCanvas');
      const sc = this.scanner;
      const im = sc.rawPreviewImg;
      const r = sc.quadRect;
      if (!cv || !im || !r) return;

      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#09090B';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(im, r.x, r.y, r.w, r.h);

      const pts = sc.quadPts.map(p => ({ x: r.x + p.x * r.w, y: r.y + p.y * r.h }));

      // 外圍半透明暗幕（框內透亮）
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cv.width, cv.height);
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      ctx.fill('evenodd');

      // 輔助三分線
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      [1 / 3, 2 / 3].forEach(t => {
        const lx = pts[0].x + (pts[3].x - pts[0].x) * t, ly = pts[0].y + (pts[3].y - pts[0].y) * t;
        const rx = pts[1].x + (pts[2].x - pts[1].x) * t, ry = pts[1].y + (pts[2].y - pts[1].y) * t;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ry); ctx.stroke();
        const tx = pts[0].x + (pts[1].x - pts[0].x) * t, ty = pts[0].y + (pts[1].y - pts[0].y) * t;
        const bx = pts[3].x + (pts[2].x - pts[3].x) * t, by = pts[3].y + (pts[2].y - pts[3].y) * t;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke();
      });

      // 青綠外框線
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();
      ctx.strokeStyle = '#34D399';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 4 隻角點圓形手把
      pts.forEach((p, idx) => {
        const active = sc.activeCorner === idx;
        ctx.beginPath();
        ctx.arc(p.x, p.y, active ? 13 : 10, 0, Math.PI * 2);
        ctx.fillStyle = active ? '#F43F5E' : '#10B981';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
      });

      // 🔍 拖拉角點時於畫面頂部對側顯示 2.2x 放大鏡
      if (sc.activeCorner >= 0 && sc.activeCorner < 4) {
        const ap = sc.quadPts[sc.activeCorner];
        const lRad = 44;
        const lx = ap.x < 0.5 ? (cv.width - lRad - 10) : (lRad + 10);
        const ly = lRad + 10;
        const zoom = 2.2;
        const srcW = (lRad * 2) / zoom * (im.width / r.w);
        const srcH = (lRad * 2) / zoom * (im.height / r.h);
        const sx = ap.x * im.width - srcW / 2;
        const sy = ap.y * im.height - srcH / 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(lx, ly, lRad, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#09090B';
        ctx.fillRect(lx - lRad, ly - lRad, lRad * 2, lRad * 2);
        ctx.drawImage(im, sx, sy, srcW, srcH, lx - lRad, ly - lRad, lRad * 2, lRad * 2);
        // 放大鏡十字準星
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lx - 14, ly); ctx.lineTo(lx + 14, ly);
        ctx.moveTo(lx, ly - 14); ctx.lineTo(lx, ly + 14);
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(lx, ly, lRad, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();
    },

    // 真・透視校正演算法 (Projective Homography + Bilinear Interpolation)
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
      if (Math.abs(det) > 1e-6) {
        g = (dx3 * dy2 - dx2 * dy3) / det;
        h = (dx1 * dy3 - dx3 * dy1) / det;
      }
      const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
      const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;

      const out = document.createElement('canvas');
      out.width = outW; out.height = outH;
      const oCtx = out.getContext('2d');
      const oImg = oCtx.createImageData(outW, outH);
      const oData = oImg.data;
      const invW = 1 / Math.max(1, outW - 1);
      const invH = 1 / Math.max(1, outH - 1);
      const maxX = sw - 1.001, maxY = sh - 1.001;

      let p = 0;
      for (let oy = 0; oy < outH; oy++) {
        const v = oy * invH;
        const bv_c = b * v + c;
        const ev_f = e * v + f;
        const hv_1 = h * v + 1;
        for (let ox = 0; ox < outW; ox++, p += 4) {
          const u = ox * invW;
          const denom = g * u + hv_1;
          let sx = (a * u + bv_c) / denom;
          let sy = (d * u + ev_f) / denom;
          if (sx < 0) sx = 0; else if (sx > maxX) sx = maxX;
          if (sy < 0) sy = 0; else if (sy > maxY) sy = maxY;

          const ix = sx | 0, iy = sy | 0;
          const fx = sx - ix, fy = sy - iy;
          const ifx = 1 - fx, ify = 1 - fy;

          const i00 = (iy * sw + ix) * 4;
          const i10 = i00 + 4;
          const i01 = i00 + sw * 4;
          const i11 = i01 + 4;

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

    confirmQuadPerspectiveCrop(silent = false) {
      const sc = this.scanner;
      if (!sc.rawHiResImg) return;
      const spec = this.CARD_RATIOS[sc.ratioKey || '63x88'] || this.CARD_RATIOS['63x88'];
      sc.hiResImg = this.warpQuadToCanvas(sc.rawHiResImg, sc.quadPts, spec.w, spec.h);
      sc.previewImg = this.warpQuadToCanvas(sc.rawPreviewImg, sc.quadPts, spec.preW, spec.preH);
      sc.img = sc.hiResImg;
      sc.cropMode = 'adjust';
      sc.scale = 1; sc.ox = 0; sc.oy = 0; sc.rot = 0; sc.fineRot = 0;

      const zEl = document.getElementById('pcScanZoom');
      const fEl = document.getElementById('pcScanFineRot');
      if (zEl) zEl.value = '100';
      if (fEl) fEl.value = '0';
      this.updateScanLabels();
      const fVal = document.getElementById('pcScanFineRotVal');
      if (fVal) fVal.textContent = '0°';

      this.updateScanRatioAndModeUI();
      this.applyCanvasBoxForCurrentMode();
      this.scheduleScanRender(true);
      if (!silent && typeof window.triggerHaptic === 'function') window.triggerHaptic(12);
    },

    renderScanCanvasFast(canvas, isExport = false, applyEnhance = false) {
      const sc = this.scanner;
      const spec = this.CARD_RATIOS[sc.ratioKey || '63x88'] || this.CARD_RATIOS['63x88'];
      const srcImg = isExport ? (sc.hiResImg || sc.img) : (sc.previewImg || sc.img);
      if (!canvas || !srcImg) return;
      const w = canvas.width, h = canvas.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: applyEnhance });
      const scaleFactor = isExport ? (w / spec.preW) : 1;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      this.pcRoundRectPath(ctx, 0, 0, w, h, w * (sc.radiusPct / 100));
      ctx.clip();

      ctx.fillStyle = '#111113';
      ctx.fillRect(0, 0, w, h);

      const rotRad = (((sc.rot || 0) + (sc.fineRot || 0)) * Math.PI) / 180;
      const isSwapped = sc.rot === 90 || sc.rot === 270;
      const iw = isSwapped ? srcImg.height : srcImg.width;
      const ih = isSwapped ? srcImg.width : srcImg.height;
      const coverScale = Math.max(w / iw, h / ih) * sc.scale;

      ctx.save();
      if (sc.bright !== 100 || sc.contrast !== 100) {
        ctx.filter = `brightness(${sc.bright}%) contrast(${sc.contrast}%)`;
      }
      ctx.translate(w / 2 + sc.ox * scaleFactor, h / 2 + sc.oy * scaleFactor);
      ctx.rotate(rotRad);
      ctx.scale(coverScale, coverScale);
      ctx.drawImage(srcImg, -srcImg.width / 2, -srcImg.height / 2);
      ctx.restore();

      if (applyEnhance && (sc.deglare > 0 || sc.sharpen > 0)) {
        this.applyCardPixelEnhance(ctx, w, h, sc.deglare, sc.sharpen);
      }
      ctx.restore();
    },

    // 統一觸控事件：quad 模式拉動 4 角點，adjust 模式 60fps 單指拖曳＋雙指縮放
    bindScanCanvasQuadAndDrag() {
      const oldCv = document.getElementById('pcScanCanvas');
      if (!oldCv || oldCv._boundPart6) return;
      const cv = oldCv.cloneNode(true);
      oldCv.parentNode.replaceChild(cv, oldCv);
      cv._boundPart6 = true;

      const ptrs = new Map();
      let lastCenter = null, lastDist = 0;
      let quadRaf = null;

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
        return {
          cx: (arr[0].x + arr[1].x) / 2,
          cy: (arr[0].y + arr[1].y) / 2,
          dist: Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y)
        };
      };

      cv.addEventListener('pointerdown', (e) => {
        const sc = this.scanner;
        if (!sc.img) return;
        cv.setPointerCapture?.(e.pointerId);
        e.preventDefault();

        if (sc.cropMode === 'quad' && sc.quadRect) {
          const pos = getCanvasPos(e);
          const r = sc.quadRect;
          let bestIdx = -1, bestD = 54;
          sc.quadPts.forEach((p, idx) => {
            const px = r.x + p.x * r.w, py = r.y + p.y * r.h;
            const d = Math.hypot(pos.x - px, pos.y - py);
            if (d < bestD) { bestD = d; bestIdx = idx; }
          });
          sc.activeCorner = bestIdx;
          if (bestIdx >= 0) this.renderQuadEditorCanvas();
          return;
        }

        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const m = getMetrics();
        lastCenter = { x: m.cx, y: m.cy };
        lastDist = m.dist;
      });

      cv.addEventListener('pointermove', (e) => {
        const sc = this.scanner;
        if (!sc.img) return;

        if (sc.cropMode === 'quad') {
          if (sc.activeCorner < 0 || !sc.quadRect) return;
          e.preventDefault();
          const pos = getCanvasPos(e);
          const r = sc.quadRect;
          sc.quadPts[sc.activeCorner] = {
            x: Math.max(0, Math.min(1, (pos.x - r.x) / Math.max(1, r.w))),
            y: Math.max(0, Math.min(1, (pos.y - r.y) / Math.max(1, r.h)))
          };
          if (!quadRaf) {
            quadRaf = requestAnimationFrame(() => {
              quadRaf = null;
              this.renderQuadEditorCanvas();
            });
          }
          return;
        }

        if (!ptrs.has(e.pointerId)) return;
        e.preventDefault();
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const m = getMetrics();
        const rect = cv.getBoundingClientRect();
        const ratio = cv.width / Math.max(1, rect.width);

        if (lastCenter) {
          sc.ox += (m.cx - lastCenter.x) * ratio;
          sc.oy += (m.cy - lastCenter.y) * ratio;
        }
        if (ptrs.size >= 2 && lastDist > 10 && m.dist > 10) {
          sc.scale = Math.max(0.5, Math.min(2.6, sc.scale * (m.dist / lastDist)));
          const zEl = document.getElementById('pcScanZoom');
          if (zEl) zEl.value = String(Math.round(sc.scale * 100));
          this.updateScanLabels();
        }
        lastCenter = { x: m.cx, y: m.cy };
        lastDist = m.dist;
        this.scheduleScanRender(true);
      });

      const onUp = (e) => {
        const sc = this.scanner;
        if (sc.cropMode === 'quad') {
          if (sc.activeCorner >= 0) {
            sc.activeCorner = -1;
            this.renderQuadEditorCanvas();
          }
          return;
        }
        ptrs.delete(e.pointerId);
        if (ptrs.size === 0) { lastCenter = null; lastDist = 0; }
        else {
          const m = getMetrics();
          lastCenter = { x: m.cx, y: m.cy };
          lastDist = m.dist;
        }
      };
      cv.addEventListener('pointerup', onUp);
      cv.addEventListener('pointercancel', onUp);
    },

    // 儲存時若仍在四角拉點模式，自動先做透視拉直再輸出標準尺寸
    async saveScannedCard() {
      const sc = this.scanner;
      const s = this.getActiveSeries();
      if (!s || !sc.img) {
        alert('請先拍攝或選取實體小卡相片！');
        return;
      }

      const saveBtn = document.getElementById('pcScanSaveSubmitBtn');
      const oldTxt = saveBtn?.textContent;
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ 正在拉直並合成高清真卡...'; }

      await new Promise(r => setTimeout(r, 30));
      try {
        const spec = this.CARD_RATIOS[sc.ratioKey || '63x88'] || this.CARD_RATIOS['63x88'];
        s.cardRatio = sc.ratioKey || '63x88';

        if (sc.cropMode === 'quad' && sc.rawHiResImg) {
          sc.hiResImg = this.warpQuadToCanvas(sc.rawHiResImg, sc.quadPts, spec.w, spec.h);
          sc.img = sc.hiResImg;
          sc.scale = 1; sc.ox = 0; sc.oy = 0; sc.rot = 0; sc.fineRot = 0;
        }

        const outCanvas = document.createElement('canvas');
        outCanvas.width = spec.w;
        outCanvas.height = spec.h;
        this.renderScanCanvasFast(outCanvas, true, true);
        let dataUrl = outCanvas.toDataURL('image/webp', 0.89);
        if (!dataUrl.startsWith('data:image/webp')) dataUrl = outCanvas.toDataURL('image/jpeg', 0.90);

        if (sc.targetSide === 'seriesBack') {
          s.backImage = dataUrl;
          await this.saveSeries(s);
          this.closeCardScanner();
          this.renderDex();
          if (typeof window.showChekiToast === 'function') window.showChekiToast('🎴 已成功拉直並儲存系列共用卡背！');
          return;
        }

        const slot = s.slots.find(x => x.idx === sc.slotIdx);
        if (!slot) return;
        if (sc.targetSide === 'back') {
          slot.realBackImg = dataUrl;
          this._autoFlipSlotOnce = slot.idx;
        } else {
          slot.realImg = dataUrl;
          if ((slot.qty || 0) === 0) {
            slot.qty = 1;
            slot.wish = false;
            this.state.justUnlockedIdx = slot.idx;
            if (typeof window.fireCheerConfetti === 'function') window.fireCheerConfetti();
          }
        }
        await this.saveSeries(s);
        this.closeCardScanner();
        this.onSlotClick(slot.idx);
        this.renderDex();
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(16);
        if (typeof window.showChekiToast === 'function') {
          window.showChekiToast(
            sc.targetSide === 'back' ? '✍️ 已儲存小卡獨立背面（已自動翻面）！' : `✨ #${String(slot.idx).padStart(3, '0')} 真卡拉直入庫成功！`,
            3200
          );
        }
      } finally {
        if (saveBtn) { saveBtn.disabled = false; if (oldTxt) saveBtn.textContent = oldTxt; }
      }
    }
  });

  if (PCApp.state.mode === 'pc') PCApp.renderDex();
})();
// ============================================================================
// [第 7 段]：小卡下載中心（單張高清 PNG ＋ 雙面合圖 ＋ 圖鑑收藏海報 ＋ 一鍵 ZIP 打包）
// ============================================================================
(function applyPhotocardPart7DownloadEngine() {
  if (!window.PCApp) return;

  const _origEnsurePart3 = PCApp.ensurePart3UI.bind(PCApp);
  const _origRenderP2Bar = PCApp.onAfterRenderPart2Toolbar.bind(PCApp);
  const _origOpenSlotP2 = PCApp.onAfterOpenSlotPart2.bind(PCApp);

  // 標準 CRC-32 表（供純前端免依賴 ZIP 打包使用）
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

  // 純前端標準 ZIP 生成器（STORE 無損打包 + UTF-8 檔名支援中文／日文）
  function buildZipBlob(entries) {
    const encoder = new TextEncoder();
    const now = new Date();
    const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | ((now.getSeconds() >> 1) & 0x1F);
    const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);

    const localParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach(({ name, bytes }) => {
      const nameBytes = encoder.encode(name);
      const crc = calcCrc32(bytes);
      const size = bytes.length;

      const lh = new Uint8Array(30 + nameBytes.length);
      const ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034b50, true);
      ldv.setUint16(4, 20, true);
      ldv.setUint16(6, 0x0800, true);
      ldv.setUint16(8, 0, true);
      ldv.setUint16(10, dosTime, true);
      ldv.setUint16(12, dosDate, true);
      ldv.setUint32(14, crc, true);
      ldv.setUint32(18, size, true);
      ldv.setUint32(22, size, true);
      ldv.setUint16(26, nameBytes.length, true);
      ldv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      localParts.push(lh, bytes);

      const ch = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, dosTime, true);
      cdv.setUint16(14, dosDate, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, size, true);
      cdv.setUint32(24, size, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);

      centralParts.push(ch);
      offset += lh.length + size;
    });

    const cdOffset = offset;
    const cdSize = centralParts.reduce((s, p) => s + p.length, 0);

    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, entries.length, true);
    edv.setUint16(10, entries.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, cdOffset, true);
    edv.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
  }

  Object.assign(PCApp, {
    posterCfg: {
      cols: 6,
      dimMissing: true
    },

    safeFileName(str) {
      return String(str || 'Photocard').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 48);
    },

    triggerBlobDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 20000);
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

    // -----------------------------------------------------------------------
    // 1. 掛載下載中心彈窗與掃描器快捷下載掣
    // -----------------------------------------------------------------------
    ensurePart3UI() {
      _origEnsurePart3();

      // 在掃描器最底儲存掣下方，加入「⬇️ 僅下載目前裁切圖至手機相簿」
      const saveBtn = document.getElementById('pcScanSaveSubmitBtn');
      if (saveBtn && !document.getElementById('pcScanDirectDownloadBtn')) {
        const dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.id = 'pcScanDirectDownloadBtn';
        dlBtn.onclick = () => this.downloadCurrentScannerPreview();
        dlBtn.className = 'w-full py-2 rounded-2xl bg-sky-100 border-2 border-cheki-dark text-blue-950 font-black text-xs active:scale-95';
        dlBtn.textContent = '⬇️ 直接下載目前裁切圖至手機相簿 (.png)';
        saveBtn.insertAdjacentElement('afterend', dlBtn);
      }

      if (document.getElementById('pcDownloadCenterModal')) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div id="pcDownloadCenterModal" class="hidden fixed inset-0 z-[138] bg-black/85 flex items-center justify-center p-2.5 overflow-y-auto">
          <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl neo-box p-3.5 space-y-3 text-zinc-900 max-h-[93vh] overflow-y-auto">
            <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2">
              <div>
                <h3 class="font-black text-base leading-tight">⬇️ 小卡圖鑑下載中心</h3>
                <p class="text-[10px] font-bold text-zinc-500">匯出高清圖鑑收藏海報，或一鍵 ZIP 打包全部小卡圖檔</p>
              </div>
              <button type="button" onclick="PCApp.closeDownloadCenter()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm shrink-0">✕</button>
            </div>

            <!-- 區塊 A：高清收藏海報預覽與下載 -->
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
                <input id="pcPosterDimMissingCb" type="checkbox" checked onchange="PCApp.setPosterOption('dimMissing', this.checked)" class="w-4 h-4 accent-indigo-600 rounded">
                <span>未點亮小卡顯示為灰階鎖定狀態（取消則全彩顯示）</span>
              </label>

              <div class="grid grid-cols-2 gap-1.5">
                <button type="button" onclick="PCApp.exportShowcasePoster(false)" class="py-2 rounded-xl bg-cheki-accent text-white neo-btn font-black text-xs active:scale-95">⬇️ 下載圖鑑海報</button>
                <button type="button" onclick="PCApp.exportShowcasePoster(true)" class="py-2 rounded-xl bg-sky-300 text-zinc-950 neo-btn font-black text-xs active:scale-95">📤 分享至 X / IG</button>
              </div>
            </div>

            <!-- 區塊 B：批次 ZIP 打包下載 -->
            <div class="rounded-2xl border-2 border-cheki-dark bg-amber-50/80 p-3 space-y-2">
              <div>
                <span class="font-black text-xs block">📦 批次打包下載小卡原圖 (.zip)</span>
                <p id="pcZipCountHint" class="text-[10px] font-bold text-zinc-600 mt-0.5"></p>
              </div>
              <div class="grid grid-cols-1 gap-1.5">
                <button type="button" id="pcZipRealBtn" onclick="PCApp.downloadSeriesZip(false)" class="w-full py-2.5 rounded-xl bg-emerald-400 text-zinc-950 neo-btn font-black text-xs active:scale-95">
                  📦 打包下載「全部已掃描高清真卡」(.zip)
                </button>
                <button type="button" id="pcZipAllBtn" onclick="PCApp.downloadSeriesZip(true)" class="w-full py-2 rounded-xl bg-white border-2 border-cheki-dark text-zinc-800 font-black text-[11px] active:scale-95">
                  🗂️ 打包下載「全套圖鑑（真卡優先＋預覽切圖＋卡背）」(.zip)
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);
    },

    onAfterRenderPart2Toolbar(s) {
      _origRenderP2Bar(s);
      const ext = document.getElementById('pcToolbarExtPart3');
      if (!ext || document.getElementById('pcOpenDownloadCenterBtn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'pcOpenDownloadCenterBtn';
      btn.onclick = () => this.openDownloadCenter();
      btn.className = 'px-2.5 py-1.5 rounded-xl bg-indigo-200 hover:bg-indigo-300 neo-btn font-black text-[11px] text-zinc-900';
      btn.textContent = '⬇️ 下載圖鑑/原圖';
      ext.insertBefore(btn, ext.firstElementChild);
    },

    // -----------------------------------------------------------------------
    // 2. 單張小卡大圖視窗：注入「⬇️ 下載正面 / 🖼️ 雙面展示卡 / ⬇️ 背面」按鈕
    // -----------------------------------------------------------------------
    onAfterOpenSlotPart2(s, slot) {
      _origOpenSlotP2(s, slot);
      const actions = document.getElementById('pcSlotScannerActions');
      const frontSrc = slot.realImg || slot.sampleImg;
      const backSrc = slot.realBackImg || s.backImage;
      if (!actions || !frontSrc || document.getElementById('pcSlotDownloadRow')) return;

      const dlBox = document.createElement('div');
      dlBox.id = 'pcSlotDownloadRow';
      dlBox.className = 'pt-1.5 mt-1.5 border-t border-zinc-200 grid gap-1.5 ' + (backSrc ? 'grid-cols-3' : 'grid-cols-2');
      dlBox.innerHTML = `
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
      `;
      actions.appendChild(dlBox);
    },

    // 下載單張高清正面或背面 (.png，保留平滑透明圓角)
    async downloadSingleSlotImage(slotIdx, side = 'front') {
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === slotIdx);
      if (!s || !slot) return;
      const src = side === 'back' ? (slot.realBackImg || s.backImage) : (slot.realImg || slot.sampleImg);
      if (!src) {
        alert('此面尚未有圖片可下載！');
        return;
      }
      const blob = await this.dataUrlToPngBlob(src);
      if (!blob) return;
      const num = String(slot.idx).padStart(3, '0');
      const suffix = side === 'back' ? 'back' : (slot.realImg ? 'real' : 'sample');
      const fname = `${this.safeFileName(s.title)}_#${num}_${this.safeFileName(slot.member)}_${slot.variant}_${suffix}.png`;
      this.triggerBlobDownload(blob, fname);
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(10);
      if (typeof window.showChekiToast === 'function') window.showChekiToast(`⬇️ 已下載 #${num} ${slot.member} 高清圖！`);
    },

    // 匯出單張「正＋背」雙面紀念展示卡 (.png)
    async downloadSlotShowcaseCard(slotIdx) {
      const s = this.getActiveSeries();
      const slot = s?.slots.find(x => x.idx === slotIdx);
      if (!s || !slot) return;
      const frontImg = await this.loadImgAsync(slot.realImg || slot.sampleImg);
      const backImg = await this.loadImgAsync(slot.realBackImg || s.backImage);
      if (!frontImg) return;

      const spec = typeof this.getSeriesRatioSpec === 'function' ? this.getSeriesRatioSpec(s) : { w: 630, h: 880 };
      const cardW = 420;
      const cardH = Math.round(cardW * (spec.h / spec.w));
      const pad = 44;
      const gap = 30;
      const hasBack = Boolean(backImg);
      const W = hasBack ? (pad * 2 + cardW * 2 + gap) : (pad * 2 + cardW + 80);
      const H = 128 + cardH + 92;

      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');

      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#FDF2F8');
      bg.addColorStop(0.5, '#FFFFFF');
      bg.addColorStop(1, '#EFF6FF');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const numStr = '#' + String(slot.idx).padStart(3, '0');
      const rarityMap = { N: 'NORMAL', HOLO: '🌈 HOLO', SIGN: '✍️ SIGNED' };

      ctx.fillStyle = '#272228';
      ctx.font = '900 32px "Zen Maru Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${slot.member}  ·  ${numStr} (${slot.variant})`, W / 2, 50);

      ctx.fillStyle = '#6366F1';
      ctx.font = '800 20px "Zen Maru Gothic", sans-serif';
      ctx.fillText(`🃏 ${s.title}  |  ${rarityMap[slot.rarity] || 'NORMAL'}`, W / 2, 92);

      const drawFramedCard = (im, x, y, label) => {
        const rad = Math.round(cardW * 0.06);
        ctx.save();
        ctx.shadowColor = 'rgba(24, 24, 27, 0.24)';
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 10;
        ctx.fillStyle = '#18181B';
        this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad);
        ctx.fill();
        ctx.restore();

        ctx.save();
        this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad);
        ctx.clip();
        ctx.drawImage(im, x, y, cardW, cardH);
        ctx.restore();

        ctx.lineWidth = 4;
        ctx.strokeStyle = slot.rarity === 'SIGN' ? '#F59E0B' : (slot.rarity === 'HOLO' ? '#EC4899' : '#272228');
        this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad);
        ctx.stroke();

        ctx.fillStyle = '#52525B';
        ctx.font = '900 18px "Zen Maru Gothic", sans-serif';
        ctx.fillText(label, x + cardW / 2, y + cardH + 34);
      };

      const startY = 128;
      if (hasBack) {
        drawFramedCard(frontImg, pad, startY, 'FRONT 正面');
        drawFramedCard(backImg, pad + cardW + gap, startY, 'BACK 背面');
      } else {
        drawFramedCard(frontImg, (W - cardW) / 2, startY, slot.realImg ? '✨ 實物高清真卡' : 'PREVIEW');
      }

      ctx.fillStyle = '#A1A1AA';
      ctx.font = '700 16px sans-serif';
      ctx.fillText(`ChekiPocket Photocard Dex · ${new Date().toISOString().slice(0, 10)}`, W / 2, H - 22);

      cv.toBlob((blob) => {
        if (!blob) return;
        const fname = `${this.safeFileName(s.title)}_${numStr}_${this.safeFileName(slot.member)}_紀念卡.png`;
        this.triggerBlobDownload(blob, fname);
        if (typeof window.showChekiToast === 'function') window.showChekiToast('🖼️ 紀念展示卡已下載！');
      }, 'image/png');
    },

    // 在掃描器內直接下載目前拉直／裁切好嘅真卡
    async downloadCurrentScannerPreview() {
      const sc = this.scanner;
      const s = this.getActiveSeries();
      if (!sc.img) {
        alert('請先拍攝或選取實體小卡相片！');
        return;
      }
      const spec = (this.CARD_RATIOS && this.CARD_RATIOS[sc.ratioKey || '63x88']) || { w: 630, h: 880 };
      const origHi = sc.hiResImg;
      const origScale = sc.scale, origOx = sc.ox, origOy = sc.oy, origRot = sc.rot, origFine = sc.fineRot;

      if (sc.cropMode === 'quad' && sc.rawHiResImg && typeof this.warpQuadToCanvas === 'function') {
        sc.hiResImg = this.warpQuadToCanvas(sc.rawHiResImg, sc.quadPts, spec.w, spec.h);
        sc.scale = 1; sc.ox = 0; sc.oy = 0; sc.rot = 0; sc.fineRot = 0;
      }

      const out = document.createElement('canvas');
      out.width = spec.w; out.height = spec.h;
      this.renderScanCanvasFast(out, true, true);

      // 恢復掃描器狀態，不影響用戶繼續微調
      sc.hiResImg = origHi;
      sc.scale = origScale; sc.ox = origOx; sc.oy = origOy; sc.rot = origRot; sc.fineRot = origFine;

      out.toBlob((blob) => {
        if (!blob) return;
        const slot = s?.slots.find(x => x.idx === sc.slotIdx);
        const tag = slot ? `#${String(slot.idx).padStart(3, '0')}_${this.safeFileName(slot.member)}` : 'Card';
        this.triggerBlobDownload(blob, `Photocard_${tag}_${Date.now().toString().slice(-4)}.png`);
        if (typeof window.showChekiToast === 'function') window.showChekiToast('⬇️ 已將高清拉直小卡下載至手機！');
      }, 'image/png');
    },

    // -----------------------------------------------------------------------
    // 3. 下載中心：高清圖鑑收藏海報 ＋ 一鍵 ZIP 打包全套小卡
    // -----------------------------------------------------------------------
    openDownloadCenter() {
      this.ensurePart3UI();
      const s = this.getActiveSeries();
      if (!s) return;
      this.posterCfg.cols = s.slots.length >= 12 ? 6 : (s.groupCols || 3);
      const realCnt = s.slots.filter(x => Boolean(x.realImg)).length;
      const anyCnt = s.slots.filter(x => Boolean(x.realImg || x.sampleImg)).length;
      const hint = document.getElementById('pcZipCountHint');
      if (hint) {
        hint.textContent = `目前系列共 ${s.slots.length} 格：已有 ${realCnt} 張高清真卡、${anyCnt} 張可匯出圖檔${s.backImage ? '（含共用卡背）' : ''}`;
      }
      this.updatePosterButtonsUI();
      document.getElementById('pcDownloadCenterModal')?.classList.remove('hidden');
      this.renderDexShowcasePoster();
    },

    closeDownloadCenter() {
      document.getElementById('pcDownloadCenterModal')?.classList.add('hidden');
    },

    setPosterOption(k, v) {
      this.posterCfg[k] = v;
      this.updatePosterButtonsUI();
      this.renderDexShowcasePoster();
    },

    updatePosterButtonsUI() {
      const setBtn = (id, on) => {
        const el = document.getElementById(id);
        if (el) el.className = `px-2 py-0.5 rounded-lg border border-cheki-dark text-[10px] font-black ${on ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700'}`;
      };
      setBtn('pcPosterCols3', this.posterCfg.cols === 3);
      setBtn('pcPosterCols6', this.posterCfg.cols === 6);
    },

    async renderDexShowcasePoster() {
      const s = this.getActiveSeries();
      const cv = document.getElementById('pcShowcasePosterCanvas');
      if (!s || !cv) return;

      const spec = typeof this.getSeriesRatioSpec === 'function' ? this.getSeriesRatioSpec(s) : { w: 630, h: 880 };
      const cols = this.posterCfg.cols || 6;
      const rows = Math.max(1, Math.ceil(s.slots.length / cols));
      const W = 1080;
      const pad = 34;
      const gap = cols === 6 ? 14 : 24;
      const headerH = 166;
      const footerH = 62;
      const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
      const cardH = Math.round(cardW * (spec.h / spec.w));
      const H = headerH + rows * cardH + (rows - 1) * gap + footerH + pad;

      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');

      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#FFF7FB');
      bg.addColorStop(0.5, '#F5F3FF');
      bg.addColorStop(1, '#EFF6FF');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // 頂部標題與進度條卡片
      ctx.fillStyle = '#272228';
      this.pcRoundRectPath(ctx, pad + 5, 29, W - pad * 2, 114, 24);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      this.pcRoundRectPath(ctx, pad, 24, W - pad * 2, 114, 24);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#272228';
      ctx.stroke();

      const owned = s.slots.filter(x => x.qty > 0).length;
      const realCnt = s.slots.filter(x => Boolean(x.realImg)).length;
      const pct = Math.round((owned / Math.max(1, s.slots.length)) * 100);

      ctx.fillStyle = '#272228';
      ctx.font = '900 32px "Zen Maru Gothic", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🃏 ${s.title}`, pad + 24, 58);

      ctx.fillStyle = '#6366F1';
      ctx.font = '900 21px "Zen Maru Gothic", sans-serif';
      ctx.fillText(`✨ 已收集 ${owned}/${s.slots.length} (${pct}%)  ·  📸 高清真卡 ${realCnt} 張`, pad + 24, 102);

      // 右側進度膠囊
      const barW = 240, barH = 22, barX = W - pad - barW - 24, barY = 72;
      ctx.fillStyle = '#E4E4E7';
      this.pcRoundRectPath(ctx, barX, barY, barW, barH, 11);
      ctx.fill();
      if (pct > 0) {
        const gBar = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        gBar.addColorStop(0, '#6366F1');
        gBar.addColorStop(0.5, '#EC4899');
        gBar.addColorStop(1, '#F59E0B');
        ctx.fillStyle = gBar;
        this.pcRoundRectPath(ctx, barX, barY, Math.max(22, Math.round(barW * pct / 100)), barH, 11);
        ctx.fill();
      }
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#272228';
      this.pcRoundRectPath(ctx, barX, barY, barW, barH, 11);
      ctx.stroke();

      const imgs = await Promise.all(s.slots.map(sl => this.loadImgAsync(sl.realImg || sl.sampleImg)));

      s.slots.forEach((sl, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = pad + c * (cardW + gap);
        const y = headerH + r * (cardH + gap);
        const unlocked = sl.qty > 0;
        const rad = Math.round(cardW * 0.065);

        ctx.save();
        this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad);
        ctx.clip();

        const im = imgs[i];
        if (im) {
          if (!unlocked && this.posterCfg.dimMissing) {
            ctx.filter = 'grayscale(100%) brightness(58%) contrast(82%)';
          }
          ctx.drawImage(im, x, y, cardW, cardH);
          ctx.filter = 'none';
        } else {
          ctx.fillStyle = '#E4E4E7';
          ctx.fillRect(x, y, cardW, cardH);
        }

        // 左上編號
        ctx.fillStyle = 'rgba(24,24,27,0.78)';
        ctx.fillRect(x, y, Math.max(48, Math.round(cardW * 0.34)), 25);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`#${sl.idx}`, x + Math.max(24, Math.round(cardW * 0.17)), y + 13);

        // 右上複數數量
        if (sl.qty > 1) {
          ctx.fillStyle = '#FCD34D';
          this.pcRoundRectPath(ctx, x + cardW - 44, y + 4, 40, 22, 11);
          ctx.fill();
          ctx.fillStyle = '#18181B';
          ctx.font = '900 13px sans-serif';
          ctx.fillText(`×${sl.qty}`, x + cardW - 24, y + 15);
        }

        if (!unlocked && this.posterCfg.dimMissing) {
          ctx.font = `${cols === 6 ? 26 : 38}px sans-serif`;
          ctx.fillText('🔒', x + cardW / 2, y + cardH / 2);
        }
        ctx.textAlign = 'left';
        ctx.restore();

        // 外框（親簽金／全息粉／普通黑）
        ctx.lineWidth = unlocked ? 4 : 2;
        ctx.strokeStyle = unlocked
          ? (sl.rarity === 'SIGN' ? '#F59E0B' : (sl.rarity === 'HOLO' ? '#EC4899' : '#272228'))
          : '#CBD5E1';
        this.pcRoundRectPath(ctx, x, y, cardW, cardH, rad);
        ctx.stroke();
      });

      const nick = (typeof userOshiProfile !== 'undefined' && userOshiProfile?.nickname) ? userOshiProfile.nickname : 'ChekiPocket Photocard Dex';
      ctx.fillStyle = '#52525B';
      ctx.font = '900 20px "Zen Maru Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`✨ ${nick} 收藏圖鑑 · ${new Date().toISOString().slice(0, 10)} ✨`, W / 2, H - 28);
      ctx.textAlign = 'left';
    },

    exportShowcasePoster(shareMode = false) {
      const s = this.getActiveSeries();
      const cv = document.getElementById('pcShowcasePosterCanvas');
      if (!s || !cv) return;
      cv.toBlob(async (blob) => {
        if (!blob) return;
        const fname = `${this.safeFileName(s.title)}_圖鑑收藏海報_${new Date().toISOString().slice(0, 10)}.png`;
        if (shareMode && navigator.canShare) {
          try {
            const f = new File([blob], fname, { type: 'image/png' });
            if (navigator.canShare({ files: [f] })) {
              await navigator.share({ title: `${s.title} 收藏圖鑑`, files: [f] });
              return;
            }
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
          const num = String(sl.idx).padStart(3, '0');
          const mName = this.safeFileName(sl.member);

          if (src) {
            const blob = await this.dataUrlToPngBlob(src);
            if (blob) {
              const bytes = new Uint8Array(await blob.arrayBuffer());
              const tag = sl.realImg ? 'real' : 'sample';
              entries.push({ name: `${num}_${mName}_${sl.variant}_${tag}.png`, bytes });
            }
          }
          if (sl.realBackImg) {
            const bBlob = await this.dataUrlToPngBlob(sl.realBackImg);
            if (bBlob) {
              const bBytes = new Uint8Array(await bBlob.arrayBuffer());
              entries.push({ name: `${num}_${mName}_${sl.variant}_back.png`, bytes: bBytes });
            }
          }
        }

        if (includeSamples && s.backImage) {
          const sbBlob = await this.dataUrlToPngBlob(s.backImage);
          if (sbBlob) {
            entries.push({ name: `000_共用卡背.png`, bytes: new Uint8Array(await sbBlob.arrayBuffer()) });
          }
        }

        if (entries.length === 0) {
          alert(includeSamples ? '此系列尚未有任何小卡圖片可打包！' : '此系列尚未掃描任何高清實物真卡！如想下載預覽切圖，請按下方「全套圖鑑」打包掣。');
          return;
        }

        const zipBlob = buildZipBlob(entries);
        const fname = `${this.safeFileName(s.title)}_${includeSamples ? '全套圖檔' : '高清真卡'}_${entries.length}張.zip`;
        this.triggerBlobDownload(zipBlob, fname);
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
        if (typeof window.showChekiToast === 'function') {
          window.showChekiToast(`📦 已打包下載 ${entries.length} 張小卡圖檔 (.zip)！`, 3500);
        }
      } catch (err) {
        alert('❌ 打包下載失敗：' + (err.message || err));
      } finally {
        if (btn) { btn.disabled = false; if (oldText) btn.textContent = oldText; }
      }
    }
  });

  if (PCApp.state.mode === 'pc') PCApp.renderDex();
})();
// ============================================================================
// [第 8 段]：修正小卡頁向右撐爆、修復 63×88 卡格破版、按鈕對齊及釋放頂部標題空間
// ============================================================================
(function applyPhotocardPart8LayoutFix() {
  if (!window.PCApp) return;

  // 1. 注入防溢出與緊湊頂部 CSS（即時生效）
  if (!document.getElementById('pcPart8LayoutFixStyle')) {
    const st = document.createElement('style');
    st.id = 'pcPart8LayoutFixStyle';
    st.textContent = `
      html, body {
        max-width: 100vw;
        overflow-x: hidden;
      }
      #pcDexRoot {
        width: 100% !important;
        max-width: min(100vw, 28rem) !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
        padding-left: 10px !important;
        padding-right: 10px !important;
      }
      #pcDexRoot > *,
      #pcDexRoot .neo-box {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      #pcDexRoot select {
        width: 0 !important;
        flex: 1 1 0% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        text-overflow: ellipsis;
      }
      /* 縮窄頂部右側按鈕尺寸與間距，釋放空間俾 ChekiPocket 標題完整顯示 */
      @media (max-width: 480px) {
        header button#topPcModeSwitchBtn {
          height: 32px !important;
          padding-left: 8px !important;
          padding-right: 8px !important;
          font-size: 11px !important;
          border-radius: 12px !important;
        }
        header button#topSearchBtn,
        header button#topMoreToolsBtn {
          width: 32px !important;
          height: 32px !important;
          border-radius: 12px !important;
          font-size: 14px !important;
        }
        header .shrink-0.gap-1\\.5 {
          gap: 4px !important;
        }
      }
    `;
    document.head.appendChild(st);
  }

  const _origRenderDex = PCApp.renderDex.bind(PCApp);

  Object.assign(PCApp, {
    // 2. 重寫乾淨的卡格渲染函式（徹底修復第 6 段字串取代造成的 class 破版）
    renderSlotCardHtml(sl) {
      const unlocked = sl.qty > 0;
      const imgSrc = sl.realImg || sl.sampleImg;
      const numStr = '#' + String(sl.idx).padStart(3, '0');
      const spec = typeof this.getSeriesRatioSpec === 'function'
        ? this.getSeriesRatioSpec(this.getActiveSeries())
        : { css: '63 / 88' };

      const borderCls = unlocked
        ? (sl.rarity === 'SIGN' ? 'pc-sign-border' : sl.rarity === 'HOLO' ? 'pc-holo-border' : 'bg-zinc-900 p-[2px]')
        : 'bg-zinc-300 p-[2px]';
      const animCls = this.state.justUnlockedIdx === sl.idx ? 'pc-unlock-anim' : '';

      return `
        <div onclick="PCApp.onSlotClick(${sl.idx})" class="min-w-0 rounded-xl ${borderCls} ${animCls} cursor-pointer active:scale-95 transition shadow-sm">
          <div class="w-full rounded-[10px] bg-zinc-900 overflow-hidden relative flex flex-col items-center justify-center" style="aspect-ratio:${spec.css};">
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

    // 3. 重新整理工具列為工整 2＋3 滿版格線，並補齊篩選列與進度列防截斷
    onAfterRenderDex(s) {
      if (typeof this.ensurePart2UI === 'function') this.ensurePart2UI();
      if (typeof this.ensurePart3UI === 'function') this.ensurePart3UI();

      const bar = document.getElementById('pcToolbarExt');
      if (bar) {
        bar.className = 'w-full space-y-1.5';
        bar.innerHTML = `
          <div class="grid grid-cols-2 gap-1.5 w-full">
            <button type="button" onclick="PCApp.openSlicerModal()" class="py-1.5 px-2 rounded-xl bg-sky-200 hover:bg-sky-300 neo-btn font-black text-[11px] text-zinc-900 truncate active:scale-95">✂️ 預覽圖切格墊底</button>
            <button type="button" onclick="PCApp.triggerSeriesBackUpload()" class="py-1.5 px-2 rounded-xl ${s.backImage ? 'bg-emerald-200' : 'bg-amber-200'} neo-btn font-black text-[11px] text-zinc-900 truncate active:scale-95">${s.backImage ? '✅ 更換共用卡背' : '🎴 設定共用卡背'}</button>
          </div>
          <div class="grid grid-cols-3 gap-1.5 w-full">
            <button type="button" onclick="PCApp.openDownloadCenter()" class="py-1.5 px-1.5 rounded-xl bg-indigo-200 hover:bg-indigo-300 neo-btn font-black text-[11px] text-zinc-900 truncate active:scale-95">⬇️ 下載圖鑑</button>
            <button type="button" onclick="PCApp.openTradeSheetModal()" class="py-1.5 px-1.5 rounded-xl bg-pink-200 hover:bg-pink-300 neo-btn font-black text-[11px] text-zinc-900 truncate active:scale-95">🔁 譲/求換卡</button>
            <button type="button" onclick="PCApp.openPcBackupModal()" class="py-1.5 px-1.5 rounded-xl bg-white hover:bg-zinc-100 neo-btn font-black text-[11px] text-zinc-900 truncate active:scale-95">💾 備份同步</button>
          </div>
        `;
      }

      // 修正頂部系列列與進度列，確保右側刪除掣與「👑 齊套」完整顯示於螢幕內
      const root = document.getElementById('pcDexRoot');
      if (!root) return;
      const topCard = root.firstElementChild;
      if (topCard) {
        const selectRow = topCard.firstElementChild;
        if (selectRow) {
          selectRow.classList.add('w-full', 'min-w-0');
        }
        const progressRow = topCard.querySelector('.flex.justify-between');
        if (progressRow) {
          progressRow.className = 'flex items-center justify-between gap-1 text-[10.5px] font-black text-zinc-800';
          [...progressRow.children].forEach((sp, i) => {
            if (i === 0) sp.classList.add('truncate', 'min-w-0');
            if (i === 1) sp.classList.add('shrink-0', 'whitespace-nowrap');
          });
        }
      }
    },

    renderDex() {
      _origRenderDex();
      // 順手把頂部倒數膠囊壓緊一點，令 ChekiPocket 標題唔易出省略號
      const headerBtns = document.querySelectorAll('header button');
      headerBtns.forEach(b => {
        if ((b.textContent || '').includes('⏳')) {
          b.style.height = '32px';
          b.style.paddingLeft = '7px';
          b.style.paddingRight = '7px';
          b.style.fontSize = '11px';
        }
      });
    }
  });

  if (PCApp.state.mode === 'pc') PCApp.renderDex();
})();
