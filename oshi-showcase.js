// ============================================================================
// 👑 ChekiPocket - Oshi No.1 Podium & Idol Showcase Mode (給偶像看專屬展示模組)
// ============================================================================
window.OshiShowcase = {
  observer: null,
  heroData: null,
  lang: 'ja',      // 'ja' (日文給偶像看) | 'zh' (中文)
  showShare: false, // 預設隱藏總數佔比，只聚焦主推張數

  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  injectStylesAndModal() {
    if (document.getElementById('oshiShowcaseStyle')) return;
    const st = document.createElement('style');
    st.id = 'oshiShowcaseStyle';
    st.textContent = `
      @keyframes oshiPulseGlow {
        0%, 100% { box-shadow: 0 0 24px rgba(56,189,248,0.35), 0 0 48px rgba(244,114,182,0.22); }
        50% { box-shadow: 0 0 34px rgba(250,204,21,0.55), 0 0 64px rgba(56,189,248,0.38); }
      }
      .oshi-stage-card { animation: oshiPulseGlow 3.2s ease-in-out infinite; }
    `;
    document.head.appendChild(st);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <input id="oshiCustomPicInput" type="file" accept="image/*" class="hidden" onchange="OshiShowcase.onPickCustomPhoto(event)">
      <div id="oshiIdolShowModal" class="hidden fixed inset-0 z-[160] bg-zinc-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none">
        <div class="w-full max-w-sm rounded-[28px] border-4 border-amber-300 bg-gradient-to-b from-sky-950 via-indigo-950 to-zinc-950 p-5 text-center text-white space-y-3.5 oshi-stage-card relative">
          <button type="button" onclick="OshiShowcase.closeModal()" class="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-white/15 border border-white/30 font-black text-base text-white active:scale-95">✕</button>

          <div class="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 text-zinc-950 font-black text-xs shadow">
            <span>👑</span><span id="oshiModalBadge">No.1 最推し · ONLY ONE</span>
          </div>

          <h2 id="oshiModalName" class="font-black text-3xl tracking-wide text-white drop-shadow"></h2>

          <div class="flex justify-center py-0.5">
            <div onclick="document.getElementById('oshiCustomPicInput').click()" class="relative w-48 aspect-[3/4] rounded-2xl bg-white p-2 shadow-2xl rotate-[-1deg] cursor-pointer active:scale-95 transition" title="點擊可更換展示用代表相片">
              <img id="oshiModalImg" src="" class="w-full h-full object-contain rounded-lg bg-zinc-100">
              <span class="absolute -bottom-2.5 right-2 px-2 py-0.5 rounded-full bg-zinc-900/90 border border-white/30 text-[9px] font-bold text-zinc-200">🖼️ 點相片可換圖</span>
            </div>
          </div>

          <!-- 超大張數展示框 -->
          <div class="rounded-2xl bg-white/10 border-2 border-amber-300/80 py-3 px-4 space-y-0.5 backdrop-blur-sm">
            <p id="oshiModalCountLabel" class="text-xs font-black text-sky-200 tracking-wider">これまでに集めたチェキ</p>
            <div class="flex items-baseline justify-center gap-1.5">
              <span id="oshiModalBigNum" class="font-black text-6xl leading-none text-amber-300 drop-shadow-[0_3px_10px_rgba(250,204,21,0.45)]">0</span>
              <span id="oshiModalUnit" class="font-black text-2xl text-white">枚</span>
            </div>
            <p id="oshiModalSubMeta" class="hidden text-[11px] font-bold text-zinc-300 pt-1"></p>
          </div>

          <div class="flex items-center justify-center gap-2 pt-0.5">
            <button type="button" id="oshiLangBtn" onclick="OshiShowcase.toggleLang()" class="px-3 py-1.5 rounded-full bg-white/15 border border-white/25 text-[11px] font-black text-white active:scale-95">🌐 日本語 / 中文</button>
            <button type="button" id="oshiShareToggleBtn" onclick="OshiShowcase.toggleShareMeta()" class="px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-[11px] font-bold text-zinc-300 active:scale-95">🔒 隱藏佔比</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  },

  parseHeroCard(mainEl) {
    const badgeEl = [...mainEl.querySelectorAll('span, div, p')].find(
      el => el.children.length === 0 && (el.textContent || '').includes('最愛主推') && !el.closest('[data-oshi-hero="1"]')
    );
    const card = badgeEl?.closest('.neo-box');
    if (!card) return null;

    const raw = card.innerText || card.textContent || '';
    const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const badgeIdx = lines.findIndex(l => l.includes('最愛主推'));
    const name = lines.find((l, i) => i > badgeIdx && !l.includes('累積收藏') && !l.includes('最新') && !l.includes('最愛：')) || '最愛主推';

    const cntMatch = raw.match(/累積收藏[：:\s]*([\d,]+)\s*張/);
    const pctMatch = raw.match(/佔比\s*([\d.]+%)/);
    const favMatch = raw.match(/最愛[：:\s]*([\d,]+)\s*張/);
    const dateMatch = raw.match(/最新[：:\s]*([\d-/.]+)/);
    const imgSrc = card.querySelector('img')?.src || '';

    return {
      card,
      name,
      count: cntMatch ? Number(cntMatch[1].replace(/,/g, '')) : 0,
      pct: pctMatch ? pctMatch[1] : '',
      fav: favMatch ? Number(favMatch[1].replace(/,/g, '')) : 0,
      latest: dateMatch ? dateMatch[1] : '',
      imgSrc
    };
  },

  upgradeStatsView() {
    const mainEl = document.querySelector('main');
    if (!mainEl || mainEl.classList.contains('hidden')) return;

    this.observer?.disconnect();
    try {
      // 1. 升級頂部「最愛主推 No.1」大卡
      const info = this.parseHeroCard(mainEl);
      if (info && info.card) {
        this.heroData = info;
        const customPic = localStorage.getItem(`oshi_showcase_pic_${info.name}`) || info.imgSrc;
        info.card.dataset.oshiHero = '1';
        info.card.className = 'neo-box rounded-3xl p-4 bg-gradient-to-br from-sky-50 via-white to-amber-50 space-y-3 relative overflow-hidden';
        info.card.innerHTML = `
          <div class="flex items-center gap-3.5">
            <div class="relative w-28 sm:w-32 aspect-[3/4] rounded-2xl border-2 border-cheki-dark bg-white p-1.5 shadow-md shrink-0">
              <img src="${this.esc(customPic)}" class="w-full h-full object-contain rounded-xl bg-zinc-50">
              <span class="absolute -top-2 -left-2 px-2 py-0.5 rounded-full bg-amber-300 border-2 border-cheki-dark text-[10px] font-black text-zinc-950 shadow">👑 No.1</span>
            </div>
            <div class="flex-1 min-w-0 space-y-1.5">
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-600 text-white text-[11px] font-black">💙 最愛主推 No.1</span>
              <h3 class="font-black text-xl text-zinc-900 truncate leading-tight">${this.esc(info.name)}</h3>
              <div class="rounded-2xl border-2 border-cheki-dark bg-white px-3 py-2 shadow-sm">
                <div class="text-[10px] font-black text-zinc-500">累積收藏 Cheki</div>
                <div class="flex items-baseline gap-1.5 flex-wrap">
                  <span class="font-black text-4xl text-blue-600 leading-none tracking-tight">${info.count}</span>
                  <span class="font-black text-sm text-zinc-800">張 (枚)</span>
                  ${info.pct ? `<span class="ml-auto px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-black text-[10px]">佔 ${this.esc(info.pct)}</span>` : ''}
                </div>
              </div>
              <div class="text-[11px] font-bold text-zinc-500 flex items-center gap-2 flex-wrap">
                ${info.fav > 0 ? `<span>⭐ 最愛：${info.fav} 張</span>` : ''}
                ${info.latest ? `<span>📅 最新：${this.esc(info.latest)}</span>` : ''}
              </div>
            </div>
          </div>
          <button type="button" onclick="event.stopPropagation(); OshiShowcase.openModal()" class="w-full py-2.5 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-500 to-pink-500 text-white neo-btn font-black text-xs flex items-center justify-center gap-1.5 active:scale-95">
            <span>💖</span><span>給偶像看 · 全屏大字展示（${info.count} 枚）</span>
          </button>
        `;
      }

      // 2. 升級「偶像應援排行榜」圖鑑格：第 1 名全寬大卡 + 第 2、3 名並列雙欄
      const rankBadge = [...mainEl.querySelectorAll('span, div')].find(el => {
        if (el.children.length > 1 || el.closest('[data-oshi-hero="1"]') || el.closest('[data-oshi-podium="1"]')) return false;
        const t = (el.textContent || '').trim();
        return /\bNo\.1\b/.test(t) && !t.includes('最愛主推');
      });

      if (rankBadge) {
        let no1Card = rankBadge;
        while (no1Card.parentElement && !getComputedStyle(no1Card.parentElement).display.includes('grid')) {
          no1Card = no1Card.parentElement;
        }
        const gridEl = no1Card.parentElement;
        if (gridEl && getComputedStyle(gridEl).display.includes('grid')) {
          gridEl.style.gridTemplateColumns = 'repeat(6, minmax(0, 1fr))';
          const cards = [...gridEl.children];

          cards.forEach((cEl, idx) => {
            cEl.style.gridColumn = idx === 0 ? 'span 6 / span 6' : (idx <= 2 ? 'span 3 / span 3' : 'span 2 / span 2');
            if (idx > 0 && !cEl.dataset.oshiSubBadge) {
              const m = (cEl.innerText || '').match(/([\d,]+)\s*(?:張|枚)/);
              if (m) {
                cEl.dataset.oshiSubBadge = '1';
                cEl.style.position = 'relative';
                const tag = document.createElement('span');
                tag.className = 'px-2 py-0.5 rounded-full bg-zinc-900 text-amber-300 font-black text-[11px] inline-block mt-1';
                tag.textContent = `${m[1]} 張`;
                cEl.appendChild(tag);
              }
            }
          });

          // 重塑第 1 名為橫跨全行冠軍大卡（保留原本點擊打開成績單事件）
          const cText = no1Card.innerText || '';
          const cLines = cText.split(/\r?\n/).map(s => s.trim()).filter(l => l && !/No\.1/i.test(l));
          const cCountMatch = cText.match(/([\d,]+)\s*(?:張|枚)/);
          const hData = this.heroData;
          const pName = (hData && cText.includes(hData.name)) ? hData.name : (cLines.find(l => !/^[\d,%.\s]+$/.test(l)) || hData?.name || 'No.1');
          const pCount = cCountMatch ? Number(cCountMatch[1].replace(/,/g, '')) : (pName === hData?.name ? hData.count : (Number(cLines.find(l => /^\d+$/.test(l))) || 0));
          const pPct = (pName === hData?.name && hData?.pct) ? hData.pct : ((cText.match(/(\d+(?:\.\d+)?%)/) || [])[1] || '');
          const pImg = no1Card.querySelector('img')?.src || hData?.imgSrc || '';

          no1Card.dataset.oshiPodium = '1';
          no1Card.className = 'rounded-3xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 via-yellow-50/70 to-sky-50 p-3.5 shadow-md cursor-pointer active:scale-[0.99] transition';
          no1Card.innerHTML = `
            <div class="flex items-center gap-3.5">
              <div class="w-28 sm:w-32 aspect-[3/4] rounded-2xl bg-white border-2 border-amber-400 p-1.5 shadow shrink-0">
                <img src="${this.esc(pImg)}" class="w-full h-full object-contain rounded-xl">
              </div>
              <div class="flex-1 min-w-0 text-left space-y-1.5">
                <div class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-900 text-amber-300 text-xs font-black">🥇 殿堂 No.1</div>
                <div class="font-black text-xl text-zinc-900 truncate">${this.esc(pName)}</div>
                <div class="inline-flex items-baseline gap-1.5 bg-white border-2 border-cheki-dark rounded-2xl px-3.5 py-1.5 shadow-sm">
                  <span class="font-black text-3xl text-amber-600 leading-none">${pCount}</span>
                  <span class="font-black text-xs text-zinc-800">張 Cheki</span>
                </div>
                ${pPct ? `<div class="text-[11px] font-black text-indigo-600">📊 佔全體收藏 ${this.esc(pPct)}</div>` : ''}
              </div>
            </div>
          `;
        }
      }
    } finally {
      this.observeMain();
    }
  },

  openModal() {
    const d = this.heroData;
    if (!d) return;
    this.injectStylesAndModal();
    this.renderModalText();
    document.getElementById('oshiIdolShowModal')?.classList.remove('hidden');
    if (typeof window.fireCheerConfetti === 'function') window.fireCheerConfetti();

    // 0.45 秒流暢跳字動畫，俾偶像睇時更有儀式感
    const numEl = document.getElementById('oshiModalBigNum');
    const target = d.count || 0;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 450);
      const eased = 1 - Math.pow(1 - p, 3);
      if (numEl) numEl.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  renderModalText() {
    const d = this.heroData;
    if (!d) return;
    const isJa = this.lang === 'ja';
    const customPic = localStorage.getItem(`oshi_showcase_pic_${d.name}`) || d.imgSrc;

    document.getElementById('oshiModalName').textContent = d.name;
    document.getElementById('oshiModalImg').src = customPic;
    document.getElementById('oshiModalBadge').textContent = isJa ? 'No.1 最推し · ONLY ONE' : '最愛主推 No.1';
    document.getElementById('oshiModalCountLabel').textContent = isJa ? 'これまでに集めたチェキ合計' : '累積收藏拍立得總數';
    document.getElementById('oshiModalUnit').textContent = isJa ? '枚！' : '張！';
    document.getElementById('oshiModalBigNum').textContent = String(d.count);

    const sub = document.getElementById('oshiModalSubMeta');
    const shareBtn = document.getElementById('oshiShareToggleBtn');
    if (sub) {
      sub.classList.toggle('hidden', !this.showShare);
      sub.textContent = isJa
        ? `全体の ${d.pct || '-'}  ·  最新 ${d.latest || '-'}`
        : `佔總數 ${d.pct || '-'}  ·  最新 ${d.latest || '-'}`;
    }
    if (shareBtn) {
      shareBtn.textContent = this.showShare ? '👁️ 已顯示佔比' : '🔒 已隱藏佔比';
    }
  },

  toggleLang() {
    this.lang = this.lang === 'ja' ? 'zh' : 'ja';
    this.renderModalText();
  },

  toggleShareMeta() {
    this.showShare = !this.showShare;
    this.renderModalText();
  },

  onPickCustomPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !this.heroData) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas');
        const s = Math.min(1, 900 / Math.max(im.width, im.height));
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        try {
          localStorage.setItem(`oshi_showcase_pic_${this.heroData.name}`, c.toDataURL('image/jpeg', 0.88));
        } catch (_) {}
        this.renderModalText();
        document.querySelectorAll('[data-oshi-hero="1"]').forEach(el => delete el.dataset.oshiHero);
        this.upgradeStatsView();
      };
      im.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  },

  closeModal() {
    document.getElementById('oshiIdolShowModal')?.classList.add('hidden');
  },

  observeMain() {
    const mainEl = document.querySelector('main');
    if (!mainEl) return;
    if (!this.observer) {
      let raf = null;
      this.observer = new MutationObserver(() => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = null; this.upgradeStatsView(); });
      });
    }
    this.observer.observe(mainEl, { childList: true, subtree: true });
  },

  start() {
    this.injectStylesAndModal();
    this.upgradeStatsView();
    this.observeMain();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => OshiShowcase.start());
} else {
  OshiShowcase.start();
}
