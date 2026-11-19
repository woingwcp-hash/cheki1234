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
