import { buildQueue, deckStats, defaultProgress, effectiveState, scheduleReview } from './src/scheduler.js';
import { createDeck, loadData, replaceData, saveData, validateData } from './src/storage.js';
import { parseDelimited, parseXlsx, rowsToCards } from './src/importers.js';
import { encodeDeck, decodeDeck } from './src/share.js';
import { samples } from './src/samples.js';

const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
let data = loadData();
let activeSession = null;
let revealTimer = null;
let modalCleanup = null;

const h = escapeHtml;
const route = () => (location.hash.slice(1).split('/')[0] || 'home');
const routeArg = () => location.hash.slice(1).split('/').slice(1).join('/');

function commit() { data = saveData(data); }
function nav(name) { location.hash = `#${name}`; }
function toast(message) { toastEl.textContent = message; toastEl.classList.add('show'); clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2200); }
function getDeck(id) { return data.decks.find(deck => deck.id === id); }
function allStats() { return deckStats(data.decks.flatMap(deck => deck.cards), data.progress); }
function deckProgress(deck) { return deckStats(deck.cards, data.progress); }

function render() {
  clearReveal();
  if (modalCleanup) { modalCleanup(); modalCleanup = null; }
  document.documentElement.style.setProperty('--font-scale', String(data.settings.fontScale));
  const r = route();
  if (r === 'library') renderLibrary();
  else if (r === 'deck') renderDeck(routeArg());
  else if (r === 'create') renderCreate();
  else if (r === 'import') renderImport();
  else if (r === 'settings') renderSettings();
  else if (r === 'study') renderStudy();
  else if (r === 'summary') renderSummary();
  else renderHome();
}

function renderHome() {
  const s = allStats();
  const totalReviews = data.sessions.reduce((n, session) => n + (session.reviewed || 0), 0);
  app.innerHTML = `
    <section class="hero"><div><span class="eyebrow">UNLIMITED SPACED REPETITION</span><h1>覚える量は、<br>自分で決める。</h1><p>復習すべきカードを優先しながら、新しいカードも混ぜて学習します。問題数・デッキ枚数・1日の学習回数にアプリ側の上限はありません。</p><span class="unlimited">∞ No study limits</span></div><div class="hero-badge"><span>ALL-TIME REVIEWS</span><strong>${totalReviews.toLocaleString()}</strong><small>${data.decks.length} decks · ${s.total} cards</small></div></section>
    <section class="grid three"><article class="card stat"><span class="eyebrow">DUE NOW</span><strong>${s.due}</strong><small>いま復習すると効果的</small></article><article class="card stat"><span class="eyebrow">MASTERED</span><strong>${s.mastered}</strong><small>安定して覚えている</small></article><article class="card stat"><span class="eyebrow">NEW</span><strong>${s.new}</strong><small>まだ学習していない</small></article></section>
    <section class="section"><div class="section-head"><div><span class="eyebrow">QUICK START</span><h2>今日の学習</h2></div><div class="actions"><button class="btn green" id="studyAll">学習する</button><button class="btn" id="reviewAll">復習だけ</button></div></div>${data.decks.length ? `<div class="deck-list">${data.decks.slice(0,4).map(deckCard).join('')}</div>` : `<div class="empty">まだデッキがありません。<br><button class="btn primary" data-nav="library" style="margin-top:14px">デッキを追加する</button></div>`}</section>`;
  app.querySelector('#studyAll')?.addEventListener('click', () => startCombined('study'));
  app.querySelector('#reviewAll')?.addEventListener('click', () => startCombined('review'));
  wireNav(); wireDeckButtons();
}

function deckCard(deck) {
  const s = deckProgress(deck);
  return `<article class="card deck"><div><span class="eyebrow">${deck.cards.length} CARDS</span><h3>${h(deck.name)}</h3><p class="muted">${h(deck.description || 'Custom deck')}</p></div><div class="deck-stats"><span class="pill due">要復習 ${s.due}</span><span class="pill mastered">習得 ${s.mastered}</span><span class="pill">新規 ${s.new}</span></div><div class="actions"><button class="btn primary open-deck" data-id="${deck.id}">開く</button><button class="btn study-deck" data-id="${deck.id}">学習</button></div></article>`;
}

function renderLibrary() {
  app.innerHTML = `<section class="section-head"><div><span class="eyebrow">LIBRARY</span><h1>デッキ</h1><p class="muted">自作・ファイル取込・サンプルから追加できます。カード枚数の上限はありません。</p></div><div class="actions"><button class="btn" id="aiHelper">AIでCSVを作る</button><button class="btn" data-nav="import">ファイルから</button><button class="btn primary" data-nav="create">＋ デッキ作成</button></div></section>
  ${data.decks.length ? `<div class="deck-list">${data.decks.map(deckCard).join('')}</div>` : '<div class="empty">自分のデッキはまだありません。</div>'}
  <section class="section"><div class="section-head"><div><span class="eyebrow">STARTER DECKS</span><h2>サンプル</h2></div></div><div class="deck-list">${samples.map((sample,i) => `<article class="card deck"><div><span class="eyebrow">${sample.cards.length} CARDS</span><h3>${h(sample.name)}</h3><p class="muted">${h(sample.description)}</p></div><button class="btn add-sample" data-index="${i}">このデッキを追加</button></article>`).join('')}</div></section>`;
  app.querySelectorAll('.add-sample').forEach(btn => btn.addEventListener('click', () => { const sample=samples[Number(btn.dataset.index)]; data.decks.push(createDeck(sample.name,sample.cards,{description:sample.description})); commit(); toast('デッキを追加しました'); renderLibrary(); }));
  app.querySelector('#aiHelper').onclick=openAiHelper;
  wireNav(); wireDeckButtons();
}

function renderDeck(id) {
  const deck = getDeck(id); if (!deck) return nav('library');
  const s = deckProgress(deck);
  app.innerHTML = `<section class="section-head"><div><span class="eyebrow">STUDY DECK</span><h1>${h(deck.name)}</h1><p class="muted">${h(deck.description || '')}</p></div><button class="btn" data-nav="library">← デッキ一覧</button></section>
  <section class="grid three"><article class="card stat"><span>要復習</span><strong>${s.due}</strong></article><article class="card stat"><span>習得済み</span><strong>${s.mastered}</strong></article><article class="card stat"><span>未学習</span><strong>${s.new}</strong></article></section>
  <section class="card section"><div class="section-head"><div><h2>学習を始める</h2><p class="muted">問題数は「全件」または好きな数を指定できます。</p></div></div><div class="form-row"><div class="field"><label>今回の問題数</label><select id="sessionCount"><option value="all">全件（上限なし）</option><option>10</option><option>20</option><option>50</option><option>100</option><option value="custom">任意の数</option></select></div><div class="field" id="customWrap" hidden><label>任意の問題数</label><input id="customCount" type="number" min="1" step="1" value="200"></div></div><div class="actions"><button class="btn primary" id="startStudy">学習</button><button class="btn" id="startReview">復習だけ</button><button class="btn" id="startTest">実力テスト</button><button class="btn" id="shareDeck">共有リンク</button></div></section>
  <section class="card section"><div class="section-head"><div><h2>カード一覧</h2><p class="muted">${deck.cards.length} cards</p></div><div class="actions"><button class="btn" id="addCard">＋ カード</button><button class="btn danger" id="deleteDeck">デッキ削除</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>問題</th><th>答え</th><th>状態</th><th></th></tr></thead><tbody>${deck.cards.map(card => `<tr><td>${h(card.front)}</td><td>${h(card.back)}</td><td>${stateLabel(effectiveState(data.progress[card.id]||defaultProgress(card.id)))}</td><td><button class="btn edit-card" data-id="${card.id}">編集</button></td></tr>`).join('')}</tbody></table></div></section>`;
  const select=app.querySelector('#sessionCount'); select.value = String(data.settings.sessionCount ?? 'all');
  select.addEventListener('change',()=>app.querySelector('#customWrap').hidden=select.value!=='custom');
  const chosenCount=()=>select.value==='custom'?Number(app.querySelector('#customCount').value):select.value;
  app.querySelector('#startStudy').onclick=()=>startSession(deck,'study',chosenCount());
  app.querySelector('#startReview').onclick=()=>startSession(deck,'review',chosenCount());
  app.querySelector('#startTest').onclick=()=>startSession(deck,'test',chosenCount());
  app.querySelector('#deleteDeck').onclick=()=>{ if(confirm('このデッキと学習履歴を削除しますか？')){ const ids=new Set(deck.cards.map(c=>c.id)); data.decks=data.decks.filter(d=>d.id!==deck.id); for(const id2 of ids) delete data.progress[id2]; commit(); nav('library'); }};
  app.querySelector('#addCard').onclick=()=>openCardEditor(deck);
  app.querySelectorAll('.edit-card').forEach(btn=>btn.onclick=()=>openCardEditor(deck,deck.cards.find(c=>c.id===btn.dataset.id)));
  app.querySelector('#shareDeck').onclick=async()=>{try{const value=await encodeDeck({...deck,id:'shared'});const url=`${location.origin}${location.pathname}#share/${value}`;await navigator.clipboard.writeText(url);toast('共有リンクをコピーしました')}catch(e){toast(e.message||'共有リンクを作成できませんでした')}};
  wireNav();
}

function openCardEditor(deck, card=null) {
  openModal(`<div class="section-head"><div><span class="eyebrow">CARD</span><h2>${card?'カード編集':'カード追加'}</h2></div><button class="btn close-modal">×</button></div><div class="field"><label>問題</label><textarea id="cardFront">${h(card?.front||'')}</textarea></div><div class="field"><label>答え</label><textarea id="cardBack">${h(card?.back||'')}</textarea></div><div class="field"><label>補足</label><input id="cardNote" value="${h(card?.note||'')}"></div><div class="actions"><button class="btn primary" id="saveCard">保存</button>${card?'<button class="btn danger" id="removeCard">削除</button>':''}</div>`, root=>{
    root.querySelector('#saveCard').onclick=()=>{ const front=root.querySelector('#cardFront').value.trim(),back=root.querySelector('#cardBack').value.trim(); if(!front||!back)return toast('問題と答えを入力してください'); if(card){card.front=front;card.back=back;card.note=root.querySelector('#cardNote').value.trim();}else deck.cards.push({id:crypto.randomUUID(),front,back,note:root.querySelector('#cardNote').value.trim(),tags:[]}); deck.updatedAt=Date.now();commit();closeModal();renderDeck(deck.id);};
    root.querySelector('#removeCard')?.addEventListener('click',()=>{deck.cards=deck.cards.filter(c=>c.id!==card.id);delete data.progress[card.id];commit();closeModal();renderDeck(deck.id);});
  });
}

function renderCreate() {
  app.innerHTML=`<section class="section-head"><div><span class="eyebrow">CREATE</span><h1>新しいデッキ</h1></div><button class="btn" data-nav="library">← 戻る</button></section><section class="card"><div class="field"><label>デッキ名</label><input id="deckName" placeholder="例：英単語 1000"></div><div class="field"><label>説明</label><input id="deckDescription" placeholder="任意"></div><div class="field"><label>問題と答え</label><textarea id="bulkCards" placeholder="question[TAB]answer&#10;apple[TAB]りんご"></textarea><small class="muted">1行1カード。タブ区切り、または「問題 :: 答え」でも追加できます。</small></div><button class="btn primary" id="saveDeck">保存して学習</button></section>`;
  app.querySelector('#saveDeck').onclick=()=>{const name=app.querySelector('#deckName').value;const raw=app.querySelector('#bulkCards').value;const cards=raw.split(/\r?\n/).map(line=>{const parts=line.includes('\t')?line.split('\t'):line.split(/\s*::\s*/);return{front:parts[0]||'',back:parts.slice(1).join(' :: ')||''}}).filter(c=>c.front.trim()&&c.back.trim());const deck=createDeck(name,cards,{description:app.querySelector('#deckDescription').value.trim()});data.decks.push(deck);commit();nav(`deck/${deck.id}`)}; wireNav();
}

function renderImport() {
  app.innerHTML=`<section class="section-head"><div><span class="eyebrow">IMPORT</span><h1>ファイルからデッキ作成</h1><p class="muted">CSV・TSV・XLSXに対応。取り込む問題数にアプリ側の上限はありません。</p></div><button class="btn" data-nav="library">← 戻る</button></section><section class="card"><div class="field"><label>ファイル</label><input id="fileInput" type="file" accept=".csv,.tsv,.txt,.xlsx"></div><div class="field"><label>または貼り付け</label><textarea id="pasteInput" placeholder="問題,答え"></textarea></div><div class="actions"><button class="btn" id="parsePaste">貼り付けを読む</button></div><div id="mapping" class="section"></div></section>`;
  app.querySelector('#fileInput').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{let sheets;if(file.name.toLowerCase().endsWith('.xlsx'))sheets=await parseXlsx(await file.arrayBuffer());else sheets=[{name:file.name,rows:parseDelimited(await file.text())}];showMapping(sheets);}catch(err){toast(err.message)}};
  app.querySelector('#parsePaste').onclick=()=>showMapping([{name:'Pasted data',rows:parseDelimited(app.querySelector('#pasteInput').value)}]); wireNav();
}

function showMapping(sheets) {
  const root=app.querySelector('#mapping'); if(!sheets.length)return root.innerHTML='<p>読み込めるシートがありません。</p>'; let active=0;
  const draw=()=>{const rows=sheets[active].rows;const cols=Math.max(2,...rows.slice(0,20).map(r=>r.length));root.innerHTML=`<div class="tabs">${sheets.map((s,i)=>`<button data-i="${i}" class="${i===active?'active':''}">${h(s.name)}</button>`).join('')}</div><div class="form-row"><div class="field"><label>問題の列</label><select id="frontCol">${Array.from({length:cols},(_,i)=>`<option value="${i}">${columnName(i)} / ${h(rows[0]?.[i]||'')}</option>`).join('')}</select></div><div class="field"><label>答えの列</label><select id="backCol">${Array.from({length:cols},(_,i)=>`<option value="${i}" ${i===1?'selected':''}>${columnName(i)} / ${h(rows[0]?.[i]||'')}</option>`).join('')}</select></div></div><label><input id="headerCheck" type="checkbox"> 1行目は見出し</label><div class="field" style="margin-top:14px"><label>デッキ名</label><input id="importName" value="${h(sheets[active].name.replace(/\.[^.]+$/,''))}"></div><div class="table-wrap import-preview"><table class="table">${rows.slice(0,8).map(r=>`<tr>${r.map(c=>`<td>${h(c)}</td>`).join('')}</tr>`).join('')}</table></div><button class="btn primary" id="finishImport" style="margin-top:14px">全カードを保存</button>`;
    root.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{active=Number(b.dataset.i);draw()});root.querySelector('#finishImport').onclick=()=>{const cards=rowsToCards(rows,Number(root.querySelector('#frontCol').value),Number(root.querySelector('#backCol').value),root.querySelector('#headerCheck').checked);if(!cards.length)return toast('有効なカードがありません');const deck=createDeck(root.querySelector('#importName').value,cards);data.decks.push(deck);commit();nav(`deck/${deck.id}`)};
  }; draw();
}

function renderSettings() {
  app.innerHTML=`<section class="section-head"><div><span class="eyebrow">SETTINGS</span><h1>設定</h1></div></section><section class="card">
  <div class="setting-row"><div><strong>文字サイズ</strong><p>学習カードの文字サイズ。</p></div><select id="fontScale"><option value="0.9">小さめ</option><option value="1">標準</option><option value="1.2">大きめ</option><option value="1.4">特大</option></select></div>
  <div class="setting-row"><div><strong>早押し表示速度</strong><p>問題文を1文字ずつ表示する間隔。</p></div><input id="revealMs" type="range" min="20" max="500" step="10" value="${data.settings.revealMs}"></div>
  <div class="setting-row"><div><strong>間違いの出し直し</strong><p>その場で覚え直す方法。</p></div><select id="retryMode"><option value="multipleChoice">4択で出し直す</option><option value="same">同じカードをもう一度</option><option value="off">出し直さない</option></select></div>
  <div class="setting-row"><div><strong>キーボード</strong><p>× / △ / ○ のキー。3つは別々のキーにしてください。</p></div><div class="form-row"><input id="keyAgain" value="${h(data.settings.keys.again)}" maxlength="1"><input id="keyHard" value="${h(data.settings.keys.hard)}" maxlength="1"><input id="keyGood" value="${h(data.settings.keys.good)}" maxlength="1"></div></div>
  <div class="setting-row"><div><strong>学習データ</strong><p>JSONで書き出し・完全復元。</p></div><div class="actions"><button class="btn" id="exportData">書き出す</button><label class="btn">読み込む<input id="importData" type="file" accept="application/json" hidden></label></div></div>
  <div class="setting-row"><div><strong>クラウド同期（任意）</strong><p>Cloudflare D1を設定した場合のみ。データはブラウザ側でAES-GCM暗号化して保存します。</p></div><button class="btn" id="syncOpen">同期設定</button></div>
  </section>`;
  app.querySelector('#fontScale').value=String(data.settings.fontScale);app.querySelector('#retryMode').value=data.settings.retryMode;
  const saveSettings=()=>{const nextKeys={again:app.querySelector('#keyAgain').value||'1',hard:app.querySelector('#keyHard').value||'2',good:app.querySelector('#keyGood').value||'3',reveal:' '};if(new Set([nextKeys.again,nextKeys.hard,nextKeys.good]).size!==3){toast('× / △ / ○ は別々のキーにしてください');renderSettings();return}data.settings.fontScale=Number(app.querySelector('#fontScale').value);data.settings.revealMs=Number(app.querySelector('#revealMs').value);data.settings.retryMode=app.querySelector('#retryMode').value;data.settings.keys=nextKeys;commit();renderSettings()};
  app.querySelector('#fontScale').onchange=saveSettings;app.querySelector('#retryMode').onchange=saveSettings;app.querySelector('#revealMs').onchange=saveSettings;['keyAgain','keyHard','keyGood'].forEach(id=>app.querySelector(`#${id}`).onchange=saveSettings);
  app.querySelector('#exportData').onclick=()=>downloadBlob(JSON.stringify(data,null,2),'words-backup.json','application/json');
  app.querySelector('#importData').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{const parsed=validateData(JSON.parse(await file.text()));if(!parsed)throw new Error('Invalid backup');data=replaceData(parsed);toast('バックアップの内容で完全復元しました');renderSettings()}catch{toast('バックアップを読み込めませんでした')}};
  app.querySelector('#syncOpen').onclick=openSyncModal;
}

function startCombined(mode) {
  const combined={id:'all',name:'すべてのデッキ',cards:data.decks.flatMap(d=>d.cards)}; startSession(combined,mode,'all');
}
function startSession(deck, mode='study', count='all') {
  if(count!=='all'&&(!Number.isFinite(Number(count))||Number(count)<1)){toast('問題数は1以上の整数で指定してください');return}
  const queue=buildQueue(deck.cards,data.progress,{mode,count});
  if(!queue.length){toast(mode==='review'?'復習期限のカードはありません':'学習できるカードがありません');return}
  activeSession={deckId:deck.id,deckName:deck.name,mode,queue,index:0,results:[],startedAt:Date.now(),phase:'prompt',shownAt:Date.now(),responseMs:null,rapid:false,revealCount:0};nav('study');
}

function renderStudy() {
  if(!activeSession)return nav('home'); const s=activeSession;if(s.index>=s.queue.length){finishSession();return}
  const card=s.queue[s.index];s.shownAt=Date.now();s.responseMs=null;s.phase='prompt';
  app.innerHTML=`<div class="study-shell"><div class="study-top"><button class="btn" id="quitStudy">終了</button><span>${s.index+1} / ${s.queue.length}</span><span>${h(s.deckName)}</span></div><div class="progressbar"><span style="width:${(s.index/s.queue.length)*100}%"></span></div><article class="card study-card"><div id="prompt" class="prompt">${h(card.front)}</div><div id="answer" class="answer" hidden>${h(card.back)}</div>${card.note?`<div id="note" class="note" hidden>${h(card.note)}</div>`:''}<div id="choices" class="choices"></div></article><div class="actions" id="studyActions" style="margin-top:14px;justify-content:center"><button class="btn primary" id="showAnswer">答えを見る <span class="key">SPACE</span></button><button class="btn" id="rapidReveal">早押し</button></div><div id="rating" class="rating" hidden><button class="again" data-rating="0">× もう一度 <span class="key">${h(data.settings.keys.again)}</span></button><button class="hard" data-rating="1">△ 迷った <span class="key">${h(data.settings.keys.hard)}</span></button><button class="good" data-rating="2">○ わかった <span class="key">${h(data.settings.keys.good)}</span></button></div></div>`;
  app.querySelector('#quitStudy').onclick=()=>{if(confirm('学習を終了しますか？')){activeSession=null;nav('home')}};
  app.querySelector('#showAnswer').onclick=showAnswer;app.querySelector('#rapidReveal').onclick=()=>startRapidReveal(card.front);
  app.querySelectorAll('[data-rating]').forEach(btn=>btn.onclick=()=>rateCurrent(Number(btn.dataset.rating)));
}

function showAnswer() { const s=activeSession;if(!s||s.phase!=='prompt')return;clearReveal();s.responseMs=Math.max(100,Date.now()-s.shownAt);s.phase='answer';app.querySelector('#prompt').textContent=s.queue[s.index].front;app.querySelector('#answer').hidden=false;app.querySelector('#note')&&(app.querySelector('#note').hidden=false);app.querySelector('#studyActions').hidden=true;app.querySelector('#rating').hidden=false; }
function startRapidReveal(text) { const s=activeSession;if(!s||s.phase!=='prompt')return;clearReveal();s.rapid=true;s.revealCount=0;const prompt=app.querySelector('#prompt');prompt.textContent='';revealTimer=setInterval(()=>{s.revealCount+=1;prompt.textContent=text.slice(0,s.revealCount);if(s.revealCount>=text.length)clearReveal()},data.settings.revealMs); }
function clearReveal(){if(revealTimer){clearInterval(revealTimer);revealTimer=null}}
function rateCurrent(rating) { const s=activeSession;if(!s||s.phase!=='answer')return;s.phase='rated';const card=s.queue[s.index],responseMs=s.responseMs??Math.max(100,Date.now()-s.shownAt);if(s.mode!=='test')data.progress[card.id]=scheduleReview(data.progress[card.id]||defaultProgress(card.id),rating,responseMs);s.results.push({cardId:card.id,rating,responseMs});const retryMode=data.settings.retryMode;if(rating===0&&retryMode==='same'&&s.mode!=='test')s.queue.splice(Math.min(s.index+2,s.queue.length),0,card);commit();if(rating===0&&retryMode==='multipleChoice'&&s.mode!=='test')return showRetryChoice(card);s.index+=1;renderStudy(); }

function showRetryChoice(card){const s=activeSession;const pool=s.queue.filter(c=>c.id!==card.id).map(c=>c.back).filter(v=>v!==card.back);const options=[card.back,...shuffle([...new Set(pool)]).slice(0,3)];while(options.length<4)options.push(`— ${options.length+1} —`);shuffle(options);app.querySelector('#rating').hidden=true;const choices=app.querySelector('#choices');choices.innerHTML=`<p class="muted">すぐに4択で覚え直し</p>${options.map(v=>`<button data-value="${h(v)}">${h(v)}</button>`).join('')}`;let answered=false;choices.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{if(answered)return;answered=true;const buttons=[...choices.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);const ok=btn.dataset.value===card.back;btn.classList.add(ok?'correct':'wrong');if(!ok)buttons.find(b=>b.dataset.value===card.back)?.classList.add('correct');setTimeout(()=>{s.index+=1;renderStudy()},450)});}

function finishSession(){const s=activeSession;const reviewed=s.results.length,good=s.results.filter(r=>r.rating===2).length,again=s.results.filter(r=>r.rating===0).length,avg=reviewed?Math.round(s.results.reduce((n,r)=>n+r.responseMs,0)/reviewed):0;data.sessions.push({id:crypto.randomUUID(),deckId:s.deckId,mode:s.mode,startedAt:s.startedAt,endedAt:Date.now(),reviewed,good,again,avgResponseMs:avg});commit();activeSession={...s,summary:{reviewed,good,again,avg}};nav('summary');}
function renderSummary(){if(!activeSession?.summary)return nav('home');const session=activeSession,s=session.summary;const score=s.reviewed?Math.round((s.good/s.reviewed)*100):0;app.innerHTML=`<section class="study-shell"><article class="card" style="text-align:center"><span class="eyebrow">SESSION COMPLETE</span><h1>おつかれさまでした</h1><div class="summary-score">${score}%</div><div class="summary-grid"><div class="mini"><strong>${s.reviewed}</strong><span>解答</span></div><div class="mini"><strong>${s.good}</strong><span>すぐ正解</span></div><div class="mini"><strong>${s.again}</strong><span>覚え直し</span></div><div class="mini"><strong>${formatMs(s.avg)}</strong><span>平均時間</span></div></div><div class="actions" style="justify-content:center;margin-top:24px">${session.mode==='test'?'<button class="btn green" id="applyTest">テスト結果を学習プロファイルに反映</button>':''}<button class="btn primary" id="moreStudy">もっと学習</button><button class="btn" data-nav="home">ホーム</button></div></article></section>`;app.querySelector('#applyTest')?.addEventListener('click',()=>{for(const result of session.results){data.progress[result.cardId]=scheduleReview(data.progress[result.cardId]||defaultProgress(result.cardId),result.rating,result.responseMs)}commit();toast('テスト結果を反映しました');app.querySelector('#applyTest').disabled=true});app.querySelector('#moreStudy').onclick=()=>{const old=activeSession;activeSession=null;if(old.deckId==='all')startCombined('study');else{const deck=getDeck(old.deckId);deck?startSession(deck,'study','all'):nav('home')}};wireNav();}

function openAiHelper(){
  const prompt=`You are creating study flashcards for the Words app.\n\nFrom the material I attach or paste, create as many useful recall questions as needed. Do not impose a fixed question limit. Cover important facts without needless duplicates.\n\nReturn only CSV with exactly two columns named front and back. Quote fields when necessary. Each row must contain one clear question/prompt and one concise answer. Do not wrap the CSV in Markdown fences.`;
  openModal(`<div class="section-head"><div><span class="eyebrow">AI IMPORT HELPER</span><h2>AIで問題候補を作る</h2></div><button class="btn close-modal">×</button></div><p class="muted">教材をChatGPT・Claude・Geminiなどへ送り、CSVを作ってからWordsへ貼り付けるためのプロンプトです。Words自身は教材を外部AIへ送信しません。</p><div class="field"><label>コピーするプロンプト</label><textarea id="aiPrompt" style="min-height:240px">${h(prompt)}</textarea></div><div class="actions"><button class="btn primary" id="copyPrompt">プロンプトをコピー</button><button class="btn" id="goImport">CSV取込へ</button></div>`,root=>{root.querySelector('#copyPrompt').onclick=async()=>{await navigator.clipboard.writeText(root.querySelector('#aiPrompt').value);toast('コピーしました')};root.querySelector('#goImport').onclick=()=>{closeModal();nav('import')}});
}

async function openSyncModal(){openModal(`<div class="section-head"><div><span class="eyebrow">OPTIONAL CLOUD SYNC</span><h2>同期設定</h2></div><button class="btn close-modal">×</button></div><p class="muted">同じ「同期コード」と「パスフレーズ」を別端末に入力すると同期できます。サーバーへ送る保存キーはこの2つからブラウザ内で導出されます。同期回数にアプリ内上限はありません。</p><div class="field"><label>同期コード（12〜80文字）</label><input id="syncCode" value="${h(data.sync.code||randomCode())}"></div><div class="field"><label>パスフレーズ</label><input id="syncPass" type="password" autocomplete="new-password"></div><div class="actions"><button class="btn primary" id="syncPush">この端末 → クラウド</button><button class="btn" id="syncPull">クラウド → この端末</button></div>`,root=>{root.querySelector('#syncPush').onclick=async()=>{try{const code=validateSyncCredentials(root),pass=root.querySelector('#syncPass').value,key=await deriveSyncLookupKey(code,pass);const payload=await encryptJson(data,pass);const expectedUpdatedAt=data.sync.code===code?data.sync.updatedAt:0;const res=await fetch('./api/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'push',key,payload,expectedUpdatedAt})});const body=await res.json();if(!res.ok)throw new Error(body.error||'同期失敗');data.sync={code,updatedAt:body.updatedAt};commit();toast('クラウドへ保存しました')}catch(e){toast(e.message)}};root.querySelector('#syncPull').onclick=async()=>{try{const code=validateSyncCredentials(root),pass=root.querySelector('#syncPass').value,key=await deriveSyncLookupKey(code,pass);const res=await fetch('./api/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'pull',key})});const body=await res.json();if(!res.ok)throw new Error(body.error||'取得失敗');const restored=validateData(await decryptJson(body.payload,pass));if(!restored)throw new Error('同期データが不正です');restored.sync={code,updatedAt:body.updatedAt};data=replaceData(restored);closeModal();render();toast('クラウドから復元しました')}catch(e){toast(e.message)}};});}

function validateSyncCredentials(root){const code=root.querySelector('#syncCode').value.trim(),pass=root.querySelector('#syncPass').value;if(!/^[A-Za-z0-9_-]{12,80}$/.test(code))throw new Error('同期コードは英数字・_・-で12〜80文字にしてください');if(pass.length<10)throw new Error('パスフレーズは10文字以上にしてください');return code}
async function encryptJson(value,pass){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await deriveKey(pass,salt,['encrypt']);const plain=new TextEncoder().encode(JSON.stringify(value));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return [toB64(salt),toB64(iv),toB64(cipher)].join('.')}
async function decryptJson(payload,pass){const parts=String(payload).split('.');if(parts.length!==3)throw new Error('同期データが壊れています');const [s,i,c]=parts.map(fromB64);if(s.length!==16||i.length!==12)throw new Error('同期データが壊れています');const key=await deriveKey(pass,s,['decrypt']);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:i},key,c);return JSON.parse(new TextDecoder().decode(plain))}
async function deriveKey(pass,salt,usage){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,usage)}
async function deriveSyncLookupKey(code,pass){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveBits']);const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(`words-sync-v1:${code}`),iterations:200000,hash:'SHA-256'},material,256));return toB64Url(bits)}
function toB64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}function fromB64(s){if(typeof s!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw new Error('Invalid encrypted payload');return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}function toB64Url(bytes){return toB64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}

async function handleShareRoute(){if(!location.hash.startsWith('#share/'))return false;try{const shared=await decodeDeck(location.hash.slice(7));openModal(`<div class="section-head"><div><span class="eyebrow">SHARED DECK</span><h2>${h(shared.name||'Shared deck')}</h2></div></div><p>${h(shared.description||'')}</p><p><strong>${shared.cards?.length||0}</strong> cards</p><div class="actions"><button class="btn primary" id="acceptShare">自分のデッキに追加</button><button class="btn" id="cancelShare">やめる</button></div>`,root=>{root.querySelector('#acceptShare').onclick=()=>{const deck=createDeck(shared.name||'Shared deck',shared.cards||[],{description:shared.description||''});data.decks.push(deck);commit();closeModal();nav(`deck/${deck.id}`)};root.querySelector('#cancelShare').onclick=()=>{closeModal();nav('home')}});return true}catch{toast('共有リンクを読み込めませんでした');nav('home');return true}}

function openModal(htmlContent, setup){closeModal();const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.innerHTML=`<div class="modal" role="dialog" aria-modal="true">${htmlContent}</div>`;document.body.appendChild(wrap);const close=()=>closeModal();wrap.addEventListener('mousedown',e=>{if(e.target===wrap)close()});wrap.querySelectorAll('.close-modal').forEach(btn=>btn.onclick=close);const onKey=e=>{if(e.key==='Escape')close()};document.addEventListener('keydown',onKey);modalCleanup=()=>document.removeEventListener('keydown',onKey);setup?.(wrap);}
function closeModal(){document.querySelector('.modal-backdrop')?.remove();if(modalCleanup){modalCleanup();modalCleanup=null}}
function wireNav(){app.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>nav(btn.dataset.nav)))}
function wireDeckButtons(){app.querySelectorAll('.open-deck').forEach(btn=>btn.onclick=()=>nav(`deck/${btn.dataset.id}`));app.querySelectorAll('.study-deck').forEach(btn=>btn.onclick=()=>{const deck=getDeck(btn.dataset.id);deck&&startSession(deck,'study','all')})}
function stateLabel(state){return({new:'🌱 新規',learning:'🫧 学習中',due:'⏰ 要復習',mastered:'⭐ 習得', 'mastered-due':'⭐⏰ 再確認'}[state]||state)}
function formatMs(ms){return ms?`${(ms/1000).toFixed(1)}s`:'—'}function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}function columnName(i){let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function downloadBlob(text,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}function randomCode(){const bytes=crypto.getRandomValues(new Uint8Array(12));return [...bytes].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,20)}

document.querySelectorAll('[data-nav]').forEach(btn=>btn.onclick=()=>nav(btn.dataset.nav));
window.addEventListener('hashchange',async()=>{if(!(await handleShareRoute()))render()});
window.addEventListener('keydown',e=>{if(e.repeat||document.querySelector('.modal-backdrop')||route()!=='study'||!activeSession)return;const keys=data.settings.keys;if(activeSession.phase==='prompt'&&e.key===' '){e.preventDefault();showAnswer();return}if(activeSession.phase==='answer'){const match=[[keys.again,0],[keys.hard,1],[keys.good,2]].find(([key])=>e.key===key);if(match){e.preventDefault();rateCurrent(match[1])}}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
if(!(await handleShareRoute()))render();
