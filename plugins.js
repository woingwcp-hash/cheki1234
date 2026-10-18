// ==========================================
// 🎀 應援倒數計時器 & 特典會話題清單外掛模組
// ==========================================
let cheerEvents = [
  { id: 1, title: '福岡 Live 應援遠征', idol: '遠藤まりん', date: '2026-11-23', location: '福岡 (Fukuoka)', icon: '✈️', active: true }
];
let cheerTopics = [
  { id: 101, text: '香港から福岡に会いに来たよ！💙 (從香港來福岡見妳了！)', done: false },
  { id: 102, text: '📸 一齊影 トミーポーズ (T Pose) 同 犬のポーズ 🐶', done: false }
];
let selectedCdIcon = '✈️';

function mountCountdownBannerPosition() {
  const header = document.querySelector('header');
  if (!header) return;
  if (!document.getElementById('cuteCountdownBanner')) {
    const banner = document.createElement('div');
    banner.id = 'cuteCountdownBanner';
    banner.onclick = openCountdownModal;
    banner.className = 'cursor-pointer px-3 py-1.5 bg-gradient-to-r from-sky-200 via-pink-100 to-blue-200 border-b-2 border-cheki-dark flex items-center justify-between gap-2 select-none';
    banner.innerHTML = `
      <div class="flex items-center gap-1.5 min-w-0">
        <span id="bannerCuteIcon" class="text-base inline-block">✈️</span>
        <span id="bannerEventTitle" class="font-black text-xs text-cheki-dark truncate">載入應援倒數中...</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <span id="bannerCountdownBadge" class="px-2.5 py-0.5 rounded-full bg-white border-2 border-cheki-dark text-[11px] font-black text-blue-600 shadow-sm">⏳ 倒數 -- 日</span>
        <span class="w-6 h-6 rounded-full bg-cheki-accent text-white border border-cheki-dark flex items-center justify-center text-[11px] font-black">💌</span>
      </div>
    `;
    header.parentNode.insertBefore(banner, header.nextSibling);
  }
}

function initChekiPlugins() {
  mountCountdownBannerPosition();
  injectCountdownModalHtml();
  setTimeout(loadCheerDataFromDB, 350);
  setInterval(updateCountdownDisplays, 30000);
}

function injectCountdownModalHtml() {
  if (document.getElementById('countdownModal')) return;
  const container = document.createElement('div');
  container.innerHTML = `
    <div id="countdownModal" class="hidden fixed inset-0 z-[85] bg-black/75 flex items-center justify-center p-3 overflow-y-auto">
      <div class="bg-[#FFF9FB] w-full max-w-md rounded-3xl border-[2.5px] border-[#272228] p-4 space-y-3.5 max-h-[92vh] overflow-y-auto">
        <div class="flex justify-between items-center border-b-2 border-cheki-dark pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-2xl">💙</span>
            <div><h3 class="font-black text-base text-cheki-dark">應援倒數 & 話題手冊</h3><p class="text-[10px] text-zinc-500 font-bold">記錄下一場見面日 ✨</p></div>
          </div>
          <button onclick="closeCountdownModal()" class="w-8 h-8 rounded-full bg-pink-100 neo-btn font-black text-sm">✕</button>
        </div>
        <div id="heroCountdownCard" class="rounded-3xl border-[2.5px] border-[#272228] p-4 bg-gradient-to-br from-sky-300 via-blue-200 to-pink-200 relative overflow-hidden">
          <div class="flex justify-between items-start gap-2">
            <div class="space-y-0.5">
              <span id="heroIdolTag" class="inline-block px-2.5 py-0.5 rounded-full bg-white/90 border border-cheki-dark text-[10px] font-black text-blue-700">👑 主推應援</span>
              <h4 id="heroEventName" class="font-black text-lg text-cheki-dark leading-tight pt-1">福岡 Live 遠征</h4>
              <p id="heroEventMeta" class="text-xs font-bold text-zinc-700">📅 2026-11-23</p>
            </div>
            <button onclick="toggleAddEventForm()" class="px-2.5 py-1 rounded-xl bg-white neo-btn text-[11px] font-black shrink-0">+ 新增</button>
          </div>
          <div class="grid grid-cols-3 gap-2 mt-3 text-center">
            <div class="bg-white/95 rounded-2xl border-2 border-cheki-dark py-2"><p id="heroDaysNum" class="font-black text-2xl text-cheki-accent leading-none">0</p><p class="text-[10px] font-black text-zinc-500 mt-1">DAYS 日</p></div>
            <div class="bg-white/95 rounded-2xl border-2 border-cheki-dark py-2"><p id="heroHoursNum" class="font-black text-2xl text-blue-600 leading-none">0</p><p class="text-[10px] font-black text-zinc-500 mt-1">HOURS 時</p></div>
            <div class="bg-white/95 rounded-2xl border-2 border-cheki-dark py-2"><p id="heroMinsNum" class="font-black text-2xl text-amber-500 leading-none">0</p><p class="text-[10px] font-black text-zinc-500 mt-1">MINS 分</p></div>
          </div>
        </div>
        <div id="addEventFormBox" class="hidden rounded-2xl border-2 border-cheki-dark bg-white p-3 space-y-2.5">
          <div class="flex justify-between items-center"><span class="text-xs font-black text-cheki-accent">✨ 新增 / 修改行程</span><button onclick="toggleAddEventForm(false)" class="text-xs font-black text-zinc-400">收起 ▲</button></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="text-[10px] font-black block mb-0.5">名稱 *</label><input id="cdTitleInput" type="text" placeholder="例：福岡公演" class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark text-xs font-bold"></div>
            <div><label class="text-[10px] font-black block mb-0.5">偶像</label><input id="cdIdolInput" type="text" value="遠藤まりん" class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark text-xs font-bold"></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="text-[10px] font-black block mb-0.5">日期 *</label><input id="cdDateInput" type="date" class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark text-xs font-bold"></div>
            <div><label class="text-[10px] font-black block mb-0.5">地點</label><input id="cdLocInput" type="text" placeholder="例：福岡" class="w-full px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark text-xs font-bold"></div>
          </div>
          <div class="flex items-center justify-between gap-2 pt-1">
            <div class="flex gap-1.5" id="cdIconPicker">
              <button type="button" onclick="selectCdIcon('✈️')" data-icon="✈️" class="cd-icon-btn w-8 h-8 rounded-xl border-2 border-cheki-dark bg-sky-100 text-base">✈️</button>
              <button type="button" onclick="selectCdIcon('💙')" data-icon="💙" class="cd-icon-btn w-8 h-8 rounded-xl border-2 border-cheki-dark bg-white text-base">💙</button>
              <button type="button" onclick="selectCdIcon('🎤')" data-icon="🎤" class="cd-icon-btn w-8 h-8 rounded-xl border-2 border-cheki-dark bg-white text-base">🎤</button>
            </div>
            <button onclick="saveCountdownEvent()" class="px-4 py-2 rounded-xl bg-cheki-accent text-white neo-btn text-xs font-black">儲存</button>
          </div>
        </div>
        <div class="space-y-1.5"><div class="flex justify-between items-center px-1"><span class="text-xs font-black">🗓️ 行程清單</span></div><div id="countdownEventsList" class="space-y-1.5 max-h-36 overflow-y-auto pr-0.5"></div></div>
        <div class="rounded-2xl border-[2.5px] border-[#272228] bg-white p-3 space-y-2.5">
          <div class="flex items-center justify-between border-b-2 border-pink-100 pb-1.5"><div><h4 class="font-black text-sm">💌 特典會話語備忘</h4><p class="text-[10px] text-zinc-500 font-bold">點「📢 大字報」全螢幕放大</p></div></div>
          <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <button type="button" onclick="quickFillTopic('📸 擺 T Pose！')" class="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-300 text-[10px] font-black text-blue-800 shrink-0">+ T Pose</button>
            <button type="button" onclick="quickFillTopic('🐶 一齊擺狗狗 Pose！')" class="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-[10px] font-black text-amber-800 shrink-0">+ 狗狗</button>
            <button type="button" onclick="quickFillTopic('香港から会いに来たよ！大好き💙')" class="px-2 py-0.5 rounded-full bg-pink-50 border border-pink-300 text-[10px] font-black text-pink-700 shrink-0">+ 香港から</button>
          </div>
          <div class="flex gap-1.5">
            <input id="newTopicInput" type="text" placeholder="輸入想講嘅日文或 Pose..." onkeydown="if(event.key==='Enter'){event.preventDefault();addTalkTopic();}" class="flex-1 px-2.5 py-1.5 rounded-xl border-2 border-cheki-dark text-xs font-bold bg-pink-50/40">
            <button onclick="addTalkTopic()" class="px-3 py-1.5 rounded-xl bg-blue-500 text-white neo-btn text-xs font-black shrink-0">+ 加入</button>
          </div>
          <div id="talkTopicsList" class="space-y-1.5 max-h-48 overflow-y-auto pr-0.5"></div>
        </div>
      </div>
    </div>
    <div id="flashcardModal" onclick="closeFlashcardModal()" class="hidden fixed inset-0 z-[95] bg-gradient-to-br from-blue-500 via-sky-400 to-pink-400 flex flex-col justify-between p-6 text-white select-none cursor-pointer">
      <div class="flex justify-between items-center"><span class="px-3 py-1 rounded-full bg-white/25 backdrop-blur text-xs font-black">💙 特典會大字報</span><span class="px-3 py-1 rounded-full bg-black/30 text-xs font-black">點擊關閉 ✕</span></div>
      <div class="my-auto text-center px-2"><p id="flashcardMainText" class="font-black text-4xl sm:text-5xl leading-snug break-words drop-shadow-md"></p></div>
      <div class="text-center text-white/90 text-xs font-black">✨ 香港のトミー (Tommy) ✨</div>
    </div>
  `;
  document.body.appendChild(container);
}

function loadCheerDataFromDB() {
  if (!db) return;
  try {
    const tx = db.transaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    const evReq = store.get('cheerEvents'), tpReq = store.get('cheerTopics');
    tx.oncomplete = () => {
      if (evReq.result && Array.isArray(evReq.result.value) && evReq.result.value.length > 0) cheerEvents = evReq.result.value;
      if (tpReq.result && Array.isArray(tpReq.result.value)) cheerTopics = tpReq.result.value;
      updateCountdownDisplays();
    };
  } catch (_) { updateCountdownDisplays(); }
}

function saveCheerDataToDB() {
  if (!db) return;
  try {
    const tx = db.transaction('meta', 'readwrite'), store = tx.objectStore('meta');
    store.put({ key: 'cheerEvents', value: cheerEvents }); store.put({ key: 'cheerTopics', value: cheerTopics });
  } catch (_) {}
}

function getActiveCheerEvent() {
  let act = cheerEvents.find(e => e.active);
  if (!act && cheerEvents.length > 0) { cheerEvents[0].active = true; act = cheerEvents[0]; }
  return act;
}

function calculateTimeRemaining(dateStr) {
  if (!dateStr) return { days: 0, hours: 0, mins: 0, isToday: false, isPast: false };
  const now = new Date(), target = new Date(`${dateStr}T10:00:00`);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()), targetDayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDaysCalendar = Math.round((targetDayStart - todayStart) / (1000 * 60 * 60 * 24));
  if (diffDaysCalendar === 0) return { days: 0, hours: 0, mins: 0, isToday: true, isPast: false };
  if (diffDaysCalendar < 0) return { days: Math.abs(diffDaysCalendar), hours: 0, mins: 0, isToday: false, isPast: true };
  const diffMs = Math.max(0, target - now);
  return { days: Math.max(diffDaysCalendar, Math.floor(diffMs / (1000 * 60 * 60 * 24))), hours: Math.floor((diffMs / (1000 * 60 * 60)) % 24), mins: Math.floor((diffMs / 1000 / 60) % 60), isToday: false, isPast: false };
}

function updateCountdownDisplays() {
  const activeEv = getActiveCheerEvent();
  if (!activeEv) return;
  const rem = calculateTimeRemaining(activeEv.date);
  if (document.getElementById('bannerCuteIcon')) document.getElementById('bannerCuteIcon').textContent = activeEv.icon || '✈️';
  if (document.getElementById('bannerEventTitle')) document.getElementById('bannerEventTitle').textContent = `${activeEv.idol ? activeEv.idol + ' · ' : ''}${activeEv.title}`;
  const badge = document.getElementById('bannerCountdownBadge');
  if (badge) {
    if (rem.isToday) { badge.textContent = '🎉 TODAY 見面日！'; badge.className = 'px-2.5 py-0.5 rounded-full bg-amber-300 border-2 border-cheki-dark text-[11px] font-black text-cheki-dark'; }
    else if (rem.isPast) { badge.textContent = `✨ 已完成`; badge.className = 'px-2.5 py-0.5 rounded-full bg-white border-2 border-cheki-dark text-[11px] font-black text-zinc-500'; }
    else { badge.textContent = `⏳ 倒數 ${rem.days} 日`; badge.className = 'px-2.5 py-0.5 rounded-full bg-white border-2 border-cheki-dark text-[11px] font-black text-blue-600 shadow-sm'; }
  }
  if (document.getElementById('heroIdolTag')) document.getElementById('heroIdolTag').textContent = `${activeEv.icon \vert{}\vert{} '💙'} ${activeEv.idol || '應援'}`;
  if (document.getElementById('heroEventName')) document.getElementById('heroEventName').textContent = activeEv.title;
  if (document.getElementById('heroEventMeta')) document.getElementById('heroEventMeta').textContent = `📅 ${activeEv.date}${activeEv.location ? '· 📍 ' + activeEv.location : ''}`;
  if (document.getElementById('heroDaysNum')) document.getElementById('heroDaysNum').textContent = rem.isToday ? '🎉' : rem.days;
  if (document.getElementById('heroHoursNum')) document.getElementById('heroHoursNum').textContent = rem.isToday ? '當' : rem.hours;
  if (document.getElementById('heroMinsNum')) document.getElementById('heroMinsNum').textContent = rem.isToday ? '日' : rem.mins;
  renderCountdownEventsList(); renderTalkTopicsList();
}

function renderCountdownEventsList() {
  const box = document.getElementById('countdownEventsList'); if (!box) return;
  box.innerHTML = cheerEvents.map(ev => {
    const rem = calculateTimeRemaining(ev.date), statusText = rem.isToday ? '今日！' : (rem.isPast ? `已過 ${rem.days} 日` : `仲有 ${rem.days} 日`);
    return `
      <div onclick="setActiveCheerEvent(${ev.id})" class="p-2 rounded-2xl border-2 border-cheki-dark flex items-center justify-between gap-2 cursor-pointer transition ${ev.active ? 'bg-sky-100 shadow-sm' : 'bg-white opacity-80'}">
        <div class="flex items-center gap-2 min-w-0"><span class="text-lg shrink-0">${ev.icon || '✈️'}</span><div class="min-w-0"><p class="font-black text-xs truncate">${ev.title}</p><p class="text-[10px] text-zinc-500 font-bold">📅 ${ev.date}</p></div></div>
        <div class="flex items-center gap-1.5 shrink-0"><span class="px-2 py-0.5 rounded-full bg-white border border-cheki-dark text-[10px] font-black text-cheki-accent">${statusText}</span>${cheerEvents.length > 1 ? `<button onclick="event.stopPropagation();deleteCheerEvent(${ev.id})" class="w-6 h-6 rounded-lg bg-rose-50 border border-rose-200 text-xs">🗑️</button>` : ''}</div>
      </div>
    `;
  }).join('');
}
function setActiveCheerEvent(id) { cheerEvents.forEach(e => { e.active = (e.id === id); }); saveCheerDataToDB(); updateCountdownDisplays(); }
function deleteCheerEvent(id) { if (!confirm('確定刪除？')) return; cheerEvents = cheerEvents.filter(e => e.id !== id); if (cheerEvents.length > 0 && !cheerEvents.some(e => e.active)) cheerEvents[0].active = true; saveCheerDataToDB(); updateCountdownDisplays(); }
function toggleAddEventForm(forceState) {
  const box = document.getElementById('addEventFormBox'); if (!box) return;
  const show = typeof forceState === 'boolean' ? forceState : box.classList.contains('hidden');
  box.classList.toggle('hidden', !show); if (show) document.getElementById('cdDateInput').value = '2026-11-23';
}
function selectCdIcon(ic) {
  selectedCdIcon = ic;
  document.querySelectorAll('.cd-icon-btn').forEach(btn => { btn.classList.toggle('bg-sky-100', btn.dataset.icon === ic); btn.classList.toggle('bg-white', btn.dataset.icon !== ic); });
}
function saveCountdownEvent() {
  const title = (document.getElementById('cdTitleInput')?.value || '').trim(), idol = (document.getElementById('cdIdolInput')?.value || '').trim() || '遠藤まりん', date = document.getElementById('cdDateInput')?.value, location = (document.getElementById('cdLocInput')?.value || '').trim();
  if (!title || !date) { alert('請填寫名稱與日期！'); return; }
  cheerEvents.forEach(e => { e.active = false; });
  cheerEvents.unshift({ id: Date.now(), title, idol, date, location, icon: selectedCdIcon || '✈️', active: true });
  document.getElementById('cdTitleInput').value = ''; document.getElementById('cdLocInput').value = '';
  toggleAddEventForm(false); saveCheerDataToDB(); updateCountdownDisplays();
}

function renderTalkTopicsList() {
  const box = document.getElementById('talkTopicsList'); if (!box) return;
  if (cheerTopics.length === 0) { box.innerHTML = `<p class="text-center py-4 text-xs text-zinc-400 font-bold">尚無話題</p>'; return; }
  box.innerHTML = cheerTopics.map(t => `
    <div class="p-2 rounded-xl border-2 border-cheki-dark flex items-center justify-between gap-2 ${t.done ? 'bg-zinc-100 opacity-65' : 'bg-pink-50/50'}">
      <label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
        <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTalkTopicDone(${t.id})" class="w-4 h-4 accent-pink-500 shrink-0">
        <span class="text-xs font-bold break-words ${t.done ? 'line-through text-zinc-400' : 'text-cheki-dark'}">${t.text}</span>
      </label>
      <div class="flex items-center gap-1 shrink-0">
        <button onclick="openFlashcardModal('${t.text.replace(/'/g, "\\'")}')" class="px-2 py-1 rounded-lg bg-amber-200 border border-cheki-dark text-[10px] font-black">📢 大字報</button>
        <button onclick="deleteTalkTopic(${t.id})" class="w-6 h-6 rounded-lg bg-white border border-zinc-300 text-xs">✕</button>
      </div>
    </div>
  `).join('');
}
function quickFillTopic(text) { const inp = document.getElementById('newTopicInput'); if (inp) { inp.value = text; addTalkTopic(); } }
function addTalkTopic() {
  const inp = document.getElementById('newTopicInput'), text = (inp?.value || '').trim();
  if (!text) return; cheerTopics.unshift({ id: Date.now(), text, done: false }); inp.value = ''; saveCheerDataToDB(); renderTalkTopicsList();
}
function toggleTalkTopicDone(id) { const item = cheerTopics.find(t => t.id === id); if (item) { item.done = !item.done; saveCheerDataToDB(); renderTalkTopicsList(); } }
function deleteTalkTopic(id) { cheerTopics = cheerTopics.filter(t => t.id !== id); saveCheerDataToDB(); renderTalkTopicsList(); }
function openCountdownModal() { updateCountdownDisplays(); document.getElementById('countdownModal').classList.remove('hidden'); }
function closeCountdownModal() { document.getElementById('countdownModal').classList.add('hidden'); }
function openFlashcardModal(text) { document.getElementById('flashcardMainText').textContent = text; document.getElementById('flashcardModal').classList.remove('hidden'); }
function closeFlashcardModal() { document.getElementById('flashcardModal').classList.add('hidden'); }

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(initChekiPlugins, 250);
});
