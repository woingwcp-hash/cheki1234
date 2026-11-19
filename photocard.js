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
