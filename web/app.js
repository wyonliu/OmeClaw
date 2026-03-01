const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const CHAT_SESSION="owner";
let curAgent="",agents=[],pendingChats=0,lastMsgId=0;
let agentStateById={};
const seenMsgIds=new Set();
let chatFullyLoaded=false;
let unreadChats=0;
let lastFactCount=0;
let streakDays=parseInt(localStorage.getItem("omeclaw_streak")||"0");
let lastActiveDay=localStorage.getItem("omeclaw_last_day")||"";
let ttsEnabled=localStorage.getItem("omeclaw_tts")==="1";

function markSeen(id){if(!id)return;seenMsgIds.add(id);if(seenMsgIds.size>1200){const a=[...seenMsgIds];for(let i=0;i<400;i++)seenMsgIds.delete(a[i]);}}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function formatMsg(text){
  let s=esc(text);
  s=s.replace(/```([\s\S]*?)```/g,'<pre><code>$1</code></pre>');
  s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
  s=s.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/\n/g,'<br>');
  return s;
}
function timeFmt(t){return new Date(typeof t==="number"&&t<1e12?t*1000:t).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})}
function todayKey(){return new Date().toISOString().slice(0,10);}

// ─── STREAK ───
function updateStreak(){
  const today=todayKey();
  if(lastActiveDay===today)return;
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  if(lastActiveDay===yesterday)streakDays++;
  else streakDays=1;
  lastActiveDay=today;
  localStorage.setItem("omeclaw_streak",String(streakDays));
  localStorage.setItem("omeclaw_last_day",today);
  if(streakDays>1)showToast(`🔥 连续第 ${streakDays} 天！`,"info");
}

// ─── VOICE ───
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let recognition=null,isListening=false;
function initVoice(){
  if(!SpeechRecognition)return;
  recognition=new SpeechRecognition();
  recognition.lang="zh-CN";
  recognition.continuous=false;
  recognition.interimResults=false;
  recognition.onresult=e=>{
    const text=e.results[0][0].transcript;
    if(text){$("#chat-input").value=text;$("#chat-form").requestSubmit();}
  };
  recognition.onend=()=>{isListening=false;updateMicBtn();};
  recognition.onerror=()=>{isListening=false;updateMicBtn();};
}
function toggleVoice(){
  if(!recognition){showToast("浏览器不支持语音输入","error");return;}
  if(isListening){recognition.stop();isListening=false;}
  else{recognition.start();isListening=true;}
  updateMicBtn();
}
function updateMicBtn(){
  const btn=$("#mic-btn");if(!btn)return;
  btn.classList.toggle("active",isListening);
  btn.textContent=isListening?"🔴":"🎤";
}
function speak(text){
  if(!ttsEnabled||!window.speechSynthesis)return;
  const clean=text.replace(/<[^>]+>/g,"").replace(/[🪼💙💎🌊🫧✨🧠💡⚡🔥👑🎯💌🧬❤️💬👥📌💭🔮⏰🎭📥]/g,"").trim();
  if(!clean)return;
  window.speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(clean.slice(0,500));
  u.lang="zh-CN";u.rate=1.1;u.pitch=1.05;
  window.speechSynthesis.speak(u);
}
function toggleTTS(){
  ttsEnabled=!ttsEnabled;
  localStorage.setItem("omeclaw_tts",ttsEnabled?"1":"0");
  const btn=$("#tts-btn");if(btn)btn.classList.toggle("active",ttsEnabled);
  showToast(ttsEnabled?"语音播报已开启 🔊":"语音播报已关闭 🔇","info");
}

// ─── NAVIGATION ───
function switchView(name){
  $$(".nav-btn").forEach(x=>x.classList.remove("active"));
  $$(`.nav-btn[data-view="${name}"]`).forEach(x=>x.classList.add("active"));
  $$(".view").forEach(v=>v.classList.remove("active"));
  const view=$(`#view-${name}`);if(view)view.classList.add("active");
  localStorage.setItem("omeclaw_view",name);
  if(name==="chat"){loadChatHistory();unreadChats=0;renderUnreadBadge();}
  if(name==="activity")loadActivity();
  if(name==="status")loadStatus();
  if(name==="agents")loadAgents();
  if(name==="memory")loadMemory();
}
$$(".nav-btn").forEach(b=>{b.addEventListener("click",()=>switchView(b.dataset.view))});

// ─── AGENTS ───
async function loadAgents(){
  try{
    const [r,rs]=await Promise.all([
      (await fetch("/api/agents")).json(),
      (await fetch("/api/agents/state")).json().catch(()=>({agents:[]})),
    ]);
    agents=r.agents||[];
    agentStateById=Object.fromEntries((rs.agents||[]).map(a=>[a.id,a]));
    const sel=$("#agent-select");
    sel.innerHTML=agents.map(a=>`<option value="${a.id}"${a.id===curAgent?" selected":""}>${a.name} [${a.role}]</option>`).join("");
    if(!curAgent||!agents.find(a=>a.id===curAgent))curAgent=agents[0]?.id??"";
    sel.value=curAgent;
    sel.onchange=()=>{curAgent=sel.value;updateChatHeader();};
    updateChatHeader();renderSidebar();renderAgentsGrid();
  }catch(e){console.error("loadAgents:",e);setConn(false);}
}
function updateChatHeader(){const a=agents.find(x=>x.id===curAgent);$("#chat-agent-name").textContent=a?.name??curAgent;}
function renderSidebar(){
  const sb=$("#sidebar-agents");
  sb.innerHTML=`<div class="section-title">Agents (${agents.length})</div>`+
    agents.map(a=>{
      const st=agentStateById[a.id]?.status||"idle";
      const run=agentStateById[a.id]?.totalRuns||0;
      return `<div class="agent-item${a.id===curAgent?" active":""}" data-id="${a.id}"><span class="dot ${a.role} ${st==="running"?"live":""}"></span><span>${a.name}${st==="running"?" · 思考中":""}${run?` · ${run}`:""}</span></div>`;
    }).join("");
  sb.querySelectorAll(".agent-item").forEach(el=>{el.addEventListener("click",()=>{
    curAgent=el.dataset.id;$("#agent-select").value=curAgent;
    sb.querySelectorAll(".agent-item").forEach(x=>x.classList.remove("active"));el.classList.add("active");
    updateChatHeader();switchView("chat");
  })});
}
function renderAgentsGrid(){
  const grid=$("#agents-grid");if(!grid)return;
  grid.innerHTML=agents.map(a=>{
    const st=agentStateById[a.id]||{};
    const status=st.status==="running"?"运行中":"待命";
    const aliveCls=st.status==="running"?"alive":"idle";
    const preview=st.lastTaskPreview?esc(st.lastTaskPreview.slice(0,60)):"";
    return `<div class="card agent-card"><div class="card-header"><h3>${esc(a.name)}</h3><span class="tag role">${a.role}</span></div>
    <div class="agent-live ${aliveCls}"><span class="live-dot"></span><span class="live-text">${status}</span><span class="live-time">${st.lastActiveAt?timeFmt(st.lastActiveAt):"暂无"}</span><span class="live-runs">#${st.totalRuns||0}</span></div>
    ${preview?`<div class="agent-preview">"${preview}"</div>`:""}
    <div class="card-tags"><span class="tag model">${esc(a.model)}</span>${(a.tools||[]).map(t=>`<span class="tag tool">${esc(t)}</span>`).join("")}</div></div>`;
  }).join("");
}
function setConn(ok){$("#conn-status").textContent=ok?"在线":"离线";$("#status-dot").classList.toggle("off",!ok);}
function renderUnreadBadge(){const btn=document.querySelector(`.nav-btn[data-view="chat"]`);if(btn)btn.textContent=unreadChats>0?`💬 对话 (${unreadChats})`:"💬 对话";}

// ─── STATUS ───
async function loadStatus(){
  try{
    const d=await(await fetch("/api/status")).json();setConn(true);
    const audit=await(await fetch("/api/pm/audit")).json().catch(()=>null);
    loadEvolution();
    const fmt=s=>s<60?`${Math.floor(s)}s`:s<3600?`${Math.floor(s/60)}m ${Math.floor(s%60)}s`:`${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m`;
    const ag=d.agents||[];
    const gw=d.gateways?.length?d.gateways.join(", "):"Web";
    $("#status-grid").innerHTML=`
      <div class="status-hero"><div class="status-status"><span class="pulse-dot"></span>运行中</div><div class="status-uptime">已运行 ${fmt(d.uptime)}</div></div>
      <div class="status-section"><div class="status-section-title">分身体 (${ag.length})</div><div class="status-agents">${ag.map(a=>`<div class="status-agent"><span class="agent-role-dot ${a.role}"></span><span>${esc(a.name)}</span><span class="agent-id">${esc(a.id)}</span></div>`).join("")}</div></div>
      <div class="status-section"><div class="status-section-title">通道</div><div class="status-val">${esc(gw)}</div></div>
      <div class="status-section"><div class="status-section-title">记忆库</div><div class="status-val">${d.memory?.messages??0} 条消息</div></div>
      <div class="status-section"><div class="status-section-title">提醒</div><div class="status-val">${d.reminders?.count??0} 个待触发</div></div>
      ${audit?.checks?.length?`<div class="status-section"><div class="status-section-title">体验体检 ${audit.score}/${audit.total}</div><div class="status-audit">${audit.checks.map(c=>`<div class="audit-item ${c.ok?"ok":"bad"}"><span>${c.ok?"✅":"⚠️"} ${esc(c.title)}</span><span>${esc(c.detail)}</span></div>`).join("")}</div></div>`:""}
      <div class="status-section"><div class="status-section-title">工具</div><div class="status-tools">${(d.tools||[]).map(t=>`<span class="tool-tag">${esc(t)}</span>`).join("")}</div></div>`;
  }catch{setConn(false);}
}
async function loadEvolution(){
  try{const d=await(await fetch("/api/evolution")).json();const el=$("#evolution-list");if(!el)return;const events=d.events||[];
    if(!events.length){el.innerHTML=`<p class="empty-msg">暂无进化记录</p>`;return;}
    el.innerHTML=events.map(e=>`<div class="evolution-item"><span class="ev-emoji">${e.emoji||"✨"}</span><span class="ev-time">${timeFmt(e.time)}</span><span class="ev-detail">${esc(e.detail)}</span></div>`).join("");
  }catch{}
}

// ─── ACTIVITY ───
const LOG_META={user_in:{icon:"📨",label:"用户",cls:"tl-user"},agent_out:{icon:"🤖",label:"回复",cls:"tl-agent"},tool:{icon:"🔧",label:"工具",cls:"tl-tool"},tool_result:{icon:"✅",label:"结果",cls:"tl-tool"},memory:{icon:"🧠",label:"记忆",cls:"tl-memory"},agent_created:{icon:"🧬",label:"创建",cls:"tl-system"},system:{icon:"⚙️",label:"系统",cls:"tl-system"}};
async function loadActivity(){
  const el=$("#activity-log");
  try{const data=await(await fetch("/api/activity")).json();const items=(data.timeline||[]).slice(-200);
    if(!items.length){el.innerHTML=`<p class="empty-msg">暂无日志</p>`;return;}
    let html="";for(const it of items){const t=timeFmt(it.time);const meta=LOG_META[it.type]||LOG_META.system;const src=it.source?`<span class="tl-src tl-src-${esc(it.source)}">${esc(it.source)}</span>`:"";
      html+=`<div class="tl-row ${meta.cls}"><span class="tl-icon">${meta.icon}</span><span class="tl-time">${t}</span><span class="tl-label">${meta.label}</span>${src}<span class="tl-detail">${esc(it.detail).slice(0,500)}</span></div>`;}
    el.innerHTML=html;el.scrollTop=el.scrollHeight;
  }catch{el.innerHTML=`<p class="empty-msg">加载失败</p>`;}
}

// ─── CHAT ───
function addMsg(role,html,msgId){
  if(msgId&&seenMsgIds.has(msgId))return null;
  if(msgId)markSeen(msgId);
  const d=document.createElement("div");d.className=`msg ${role}`;
  if(msgId)d.dataset.msgId=String(msgId);
  d.innerHTML=html;
  const container=$("#messages");container.appendChild(d);container.scrollTop=container.scrollHeight;
  return d;
}
function thinkingHtml(name){return `<span class="agent-tag">${esc(name)}</span><div class="thinking"><span></span><span></span><span></span></div>`;}

async function loadChatHistory(){
  try{
    const resp=await fetch(`/api/chat/history?merged=1`);
    const {messages}=await resp.json();
    const container=$("#messages");
    seenMsgIds.clear();chatFullyLoaded=false;
    if(!messages||!messages.length){
      const dailyP=await fetch("/api/daily-prompt").then(r=>r.json()).catch(()=>({prompt:"聊聊你今天过得怎么样？"}));
      container.innerHTML=`<div class="welcome-msg"><div class="welcome-icon">🪼</div><h3>嘿 👋</h3>
        <p>我还没名字呢，你给我起一个？<br>然后跟我聊聊你。</p>
        <div class="daily-prompt"><span class="daily-label">💡 今日话题</span><span data-text="${esc(dailyP.prompt)}">${esc(dailyP.prompt)}</span></div>
        <div class="welcome-tips"><span data-text="以后叫你小O吧">给你起个名字</span><span data-text="叫我老板就行">告诉我怎么叫你</span><span data-text="最近工作太累了">随便聊聊</span></div></div>`;
      lastMsgId=0;chatFullyLoaded=true;return;
    }
    let html="",maxId=0;
    for(const m of messages){const mid=m.id||0;if(mid)markSeen(mid);if(mid>maxId)maxId=mid;
      if(m.role==="user")html+=`<div class="msg user" data-msg-id="${mid}">${esc(m.content)}</div>`;
      else html+=`<div class="msg assistant" data-msg-id="${mid}">${m.agent_id?`<span class="agent-tag">${esc(m.agent_id)}</span>`:""}${formatMsg(m.content)}</div>`;}
    container.innerHTML=html;container.scrollTop=container.scrollHeight;lastMsgId=maxId;chatFullyLoaded=true;
  }catch(e){console.error("loadChatHistory:",e);}
}

// ─── POLL ───
async function pollNewMessages(){
  if(!chatFullyLoaded)return;
  try{const resp=await fetch(`/api/chat/poll?since=${lastMsgId}`);const data=await resp.json();
    if(!data.messages?.length)return;
    const chatActive=!!document.querySelector("#view-chat.active");
    const container=$("#messages");const welcome=container.querySelector(".welcome-msg");
    if(welcome&&chatActive)welcome.remove();
    let newCount=0;
    for(const m of data.messages){if(m.id&&seenMsgIds.has(m.id))continue;newCount++;
      if(chatActive){
        if(m.role==="user")addMsg("user",esc(m.content),m.id);
        else{addMsg("assistant",`${m.agent_id?`<span class="agent-tag">${esc(m.agent_id)}</span>`:""}${formatMsg(m.content)}`,m.id);speak(m.content);}
      }else{if(m.id)markSeen(m.id);}
    }
    if(data.latestId)lastMsgId=data.latestId;
    if(!chatActive&&newCount>0){unreadChats+=newCount;renderUnreadBadge();}
  }catch{}
}
setInterval(pollNewMessages,3000);

// ─── CHAT SUBMIT ───
$("#chat-form").addEventListener("submit",e=>{
  e.preventDefault();
  const inp=$("#chat-input"),text=inp.value.trim();if(!text)return;
  inp.value="";inp.focus();updateStreak();
  const welcome=$("#messages .welcome-msg");if(welcome)welcome.remove();
  const agentName=agents.find(a=>a.id===curAgent)?.name??curAgent;
  addMsg("user",esc(text));
  const ld=addMsg("assistant",thinkingHtml(agentName));
  if(ld)ld.classList.add("loading");
  pendingChats++;updatePending();
  fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,sessionId:CHAT_SESSION,agentId:curAgent})})
  .then(r=>r.json()).then(data=>{if(!ld)return;
    if(data.error){ld.innerHTML=`<span class="agent-tag error-tag">Error</span>${esc(data.error)}`;ld.classList.add("error");}
    else{ld.innerHTML=`<span class="agent-tag">${esc(data.agentId)}</span>${formatMsg(data.reply??"")}`; speak(data.reply??"");}
    ld.classList.remove("loading");$("#messages").scrollTop=$("#messages").scrollHeight;
  }).catch(err=>{if(ld){ld.innerHTML=`<span class="agent-tag error-tag">Error</span>${esc(err.message)}`;ld.classList.remove("loading");ld.classList.add("error");}})
  .finally(()=>{pendingChats--;updatePending();loadBond();loadAgents();setTimeout(checkMemoryUpdate,800);});
});
function updatePending(){$("#send-btn").textContent=pendingChats>0?`发送 (${pendingChats})`:"发送";}

// ─── CREATE AGENT ───
$("#create-agent-btn").addEventListener("click",()=>{$("#create-modal").style.display="flex"});
$("#cancel-create").addEventListener("click",()=>{$("#create-modal").style.display="none"});
$("#confirm-create").addEventListener("click",async()=>{
  const body={id:$("#new-id").value.trim(),name:$("#new-name").value.trim(),model:$("#new-model").value.trim(),role:$("#new-role").value,systemPrompt:$("#new-prompt").value.trim(),tools:$("#new-tools").value.split(",").map(s=>s.trim()).filter(Boolean)};
  if(!body.id||!body.name){showToast("ID和名称必填","error");return;}
  if(!body.model){showToast("Model必填","error");return;}
  const btn=$("#confirm-create");btn.disabled=true;btn.textContent="创建中...";
  try{const r=await(await fetch("/api/agents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).json();
    if(r.ok){$("#create-modal").style.display="none";showToast(`🧬 ${body.name} 已唤醒`,"success");await loadAgents();
      $("#new-id").value="";$("#new-name").value="";$("#new-prompt").value="";$("#new-tools").value="";}
    else showToast(r.error||"创建失败","error");
  }catch(err){showToast(err.message,"error");}finally{btn.disabled=false;btn.textContent="创建";}
});

// ─── MEMORY ───
async function loadMemory(){
  const q=$("#mem-q")?.value?.trim();if(q)return searchMemory(q);
  try{const data=await(await fetch(`/api/memory/model`)).json();renderMemoryModel(data);}catch(e){console.error("loadMemory:",e);}
}
async function searchMemory(q){
  const btn=$("#mem-search-btn");btn.disabled=true;btn.textContent="搜索中...";
  try{const{results}=await(await fetch(`/api/memory/search?q=${encodeURIComponent(q)}`)).json();const el=$("#mem-results");
    if(!results.length){el.innerHTML=`<p class="empty-msg">没有找到 "${esc(q)}" 相关记忆</p>`;return;}
    el.innerHTML=results.map(r=>`<div class="mem-search-item"><span class="mem-role-tag">${r.role}</span><span class="mem-time">${r.created_at?new Date(r.created_at*1000).toLocaleString("zh-CN"):""}</span><div class="mem-text">${esc((r.content||"").slice(0,300))}</div></div>`).join("");
  }catch{showToast("搜索失败","error");}finally{btn.disabled=false;btn.textContent="搜索";}
}

function renderRadarChart(categories){
  const n=categories.length;
  const cx=100,cy=100,r=80;
  const angles=categories.map((_,i)=>(Math.PI*2*i/n)-Math.PI/2);
  const labels=categories.map(c=>c.icon);
  const values=categories.map(c=>c.filled?Math.min(1,c.facts.length/3):0);
  let gridLines="",axisLines="",labelEls="";
  for(let ring=1;ring<=3;ring++){
    const rr=r*ring/3;
    const pts=angles.map(a=>`${cx+rr*Math.cos(a)},${cy+rr*Math.sin(a)}`).join(" ");
    gridLines+=`<polygon points="${pts}" fill="none" stroke="var(--border)" stroke-width="0.5"/>`;
  }
  for(let i=0;i<n;i++){
    const x2=cx+r*Math.cos(angles[i]),y2=cy+r*Math.sin(angles[i]);
    axisLines+=`<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="var(--border)" stroke-width="0.3"/>`;
    const lx=cx+(r+14)*Math.cos(angles[i]),ly=cy+(r+14)*Math.sin(angles[i]);
    labelEls+=`<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" font-size="10">${labels[i]}</text>`;
  }
  const dataPts=values.map((v,i)=>`${cx+r*v*Math.cos(angles[i])},${cy+r*v*Math.sin(angles[i])}`).join(" ");
  return `<svg viewBox="0 0 200 200" class="radar-svg">${gridLines}${axisLines}<polygon points="${dataPts}" fill="rgba(124,108,240,0.2)" stroke="var(--accent)" stroke-width="1.5"/>${values.map((v,i)=>v>0?`<circle cx="${cx+r*v*Math.cos(angles[i])}" cy="${cy+r*v*Math.sin(angles[i])}" r="3" fill="var(--accent)"/>`:"").join("")}${labelEls}</svg>`;
}

function renderMemoryModel(data){
  const el=$("#mem-results");
  const pct=data.totalFacts?Math.round(data.filledCategories/data.totalCategories*100):0;
  let html=`<div class="mem-overview"><div class="mem-stats">
    <div class="mem-stat-ring"><svg viewBox="0 0 36 36"><path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" /><path class="ring-fill" stroke-dasharray="${pct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" /></svg><span class="ring-text">${pct}%</span></div>
    <div class="mem-stat-info"><div class="mem-stat-title">记忆完成度</div><div class="mem-stat-sub">${data.filledCategories}/${data.totalCategories} 维度 · ${data.totalFacts} 条</div></div></div>`;
  if(data.identity?.myName||data.identity?.callUser){
    html+=`<div class="mem-identity">`;
    if(data.identity.myName)html+=`<span class="mem-id-tag">我叫 ${esc(data.identity.myName)}</span>`;
    if(data.identity.callUser)html+=`<span class="mem-id-tag">叫TA ${esc(data.identity.callUser)}</span>`;
    if(data.identity.relationship)html+=`<span class="mem-id-tag">${esc(data.identity.relationship)}</span>`;
    html+=`</div>`;}
  html+=`</div>`;
  html+=`<div class="mem-radar">${renderRadarChart(data.categories)}</div>`;
  html+=`<div class="mem-categories">`;
  for(const cat of data.categories){
    html+=`<div class="mem-cat ${cat.filled?"mem-cat-filled":"mem-cat-empty"}"><div class="mem-cat-header"><span class="mem-cat-icon">${cat.icon}</span><span class="mem-cat-name">${esc(cat.name)}</span>${cat.filled?`<span class="mem-cat-count">${cat.facts.length}</span>`:""}</div>`;
    if(cat.filled){html+=`<div class="mem-cat-facts">`;for(const f of cat.facts)html+=`<div class="mem-fact"><span class="mem-fact-key">${esc(f.key)}</span><span class="mem-fact-val">${esc(f.value)}</span></div>`;html+=`</div>`;}
    else html+=`<div class="mem-cat-hint">还没聊到这个方面</div>`;
    html+=`</div>`;}
  html+=`</div>`;
  if(data.uncategorized?.length){
    html+=`<div class="mem-uncat"><div class="mem-cat-header"><span class="mem-cat-icon">📎</span><span class="mem-cat-name">其他</span><span class="mem-cat-count">${data.uncategorized.length}</span></div><div class="mem-cat-facts">`;
    for(const f of data.uncategorized)html+=`<div class="mem-fact"><span class="mem-fact-key">${esc(f.key)}</span><span class="mem-fact-val">${esc(f.value)}</span></div>`;
    html+=`</div></div>`;}
  el.innerHTML=html;
}
$("#mem-search-btn")?.addEventListener("click",()=>{const q=$("#mem-q")?.value?.trim();if(q)searchMemory(q);else loadMemory();});
$("#mem-q")?.addEventListener("keypress",e=>{if(e.key==="Enter"){e.preventDefault();$("#mem-search-btn")?.click();}});
$("#mem-view-all-btn")?.addEventListener("click",async()=>{$("#mem-q").value="";try{const d=await(await fetch("/api/memory/all")).json();renderMemoryAll(d);}catch{showToast("加载失败","error");}});
$("#mem-copy-btn")?.addEventListener("click",async()=>{
  try{const d=await(await fetch("/api/memory/all")).json();
    await navigator.clipboard.writeText(d.text||d.facts?.map(f=>`${f.key}: ${f.value}`).join("\n")||"");
    showToast("已复制到剪贴板","success");}catch{showToast("复制失败","error");}
});
function renderMemoryAll(data){
  const el=$("#mem-results");const facts=data.facts||[];
  if(!facts.length){el.innerHTML=`<p class="empty-msg">暂无记忆</p>`;return;}
  let html=`<div class="mem-all-header"><span>共 ${facts.length} 条记忆</span></div><div class="mem-all-list">`;
  for(const f of facts)html+=`<div class="mem-all-item"><span class="mem-fact-key">${esc(f.key)}</span><span class="mem-fact-val">${esc(f.value)}</span></div>`;
  el.innerHTML=html+`</div>`;
}

// ─── DATA IMPORT ───
$("#import-btn")?.addEventListener("click",()=>{$("#import-modal").style.display="flex";});
$("#cancel-import")?.addEventListener("click",()=>{$("#import-modal").style.display="none";});
$("#confirm-import")?.addEventListener("click",async()=>{
  const text=$("#import-text")?.value?.trim();
  if(!text||text.length<10){showToast("文本太短了","error");return;}
  const btn=$("#confirm-import");btn.disabled=true;btn.textContent="导入中...";
  try{
    const r=await(await fetch("/api/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})})).json();
    if(r.ok){
      $("#import-modal").style.display="none";$("#import-text").value="";
      showToast(`📥 成功导入 ${r.count} 条记忆！`,"success");
      loadMemory();loadBond();
    }else showToast(r.error||"导入失败","error");
  }catch(err){showToast(err.message,"error");}finally{btn.disabled=false;btn.textContent="导入";}
});

// ─── SHARE CARD ───
$("#share-btn")?.addEventListener("click",async()=>{
  try{
    const d=await(await fetch("/api/share-card")).json();
    const lines=[`🪼 ${d.myName}的AI分身`,`关系：${d.relationship||"分身"}`];
    if(d.mbti)lines.push(`MBTI：${d.mbti}`);
    if(d.zodiac)lines.push(`属相：${d.zodiac}`);
    if(d.constellation)lines.push(`星座：${d.constellation}`);
    lines.push(`记忆：${d.factCount}条 · ${d.completeness}%完成度`);
    lines.push(`\n✨ 由 OmeClaw 养成`);
    await navigator.clipboard.writeText(lines.join("\n"));
    showToast("分身名片已复制！分享给朋友 ✨","success");
  }catch{showToast("生成失败","error");}
});

// ─── MBTI QUICK TEST ───
const MBTI_QS=[
  {q:"周末你更喜欢？",a:["和朋友出去玩 (E)","在家安静待着 (I)"],dim:0},
  {q:"你更信赖？",a:["经验和事实 (S)","直觉和灵感 (N)"],dim:1},
  {q:"做决定时你更看重？",a:["逻辑和公平 (T)","感受和和谐 (F)"],dim:2},
  {q:"你更偏好？",a:["提前计划好 (J)","随机应变 (P)"],dim:3},
];
let mbtiAnswers=[null,null,null,null],mbtiIdx=0;
$("#mbti-test-btn")?.addEventListener("click",()=>{mbtiIdx=0;mbtiAnswers=[null,null,null,null];renderMbtiStep();$("#mbti-modal").style.display="flex";});
$("#cancel-mbti")?.addEventListener("click",()=>{$("#mbti-modal").style.display="none";});
function renderMbtiStep(){
  const el=$("#mbti-step");if(!el)return;
  if(mbtiIdx>=MBTI_QS.length){
    const dims=["EI","SN","TF","JP"];
    const result=dims.map((d,i)=>mbtiAnswers[i]===0?d[0]:d[1]).join("");
    el.innerHTML=`<div class="mbti-result"><h3>你的MBTI是 <span class="mbti-type">${result}</span></h3><p>结果已写入记忆核 🧠</p></div>`;
    fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`我的MBTI测试结果是${result}`})}).then(()=>{loadBond();loadMemory();});
    return;
  }
  const q=MBTI_QS[mbtiIdx];
  el.innerHTML=`<h3>${q.q}</h3><div class="mbti-options">${q.a.map((a,i)=>`<button class="mbti-opt" data-idx="${i}">${a}</button>`).join("")}</div>`;
  el.querySelectorAll(".mbti-opt").forEach(btn=>{btn.addEventListener("click",()=>{mbtiAnswers[q.dim]=parseInt(btn.dataset.idx);mbtiIdx++;renderMbtiStep();});});
}

// ─── TOAST ───
function showToast(msg,type="info"){
  const t=document.createElement("div");t.className=`toast ${type}`;t.textContent=msg;
  document.body.appendChild(t);requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),300);},3000);
}

// ─── ONBOARDING ───
const ONBOARDING_KEY="omeclaw_onboarding_done_v1";
const onboardingSteps=[
  {key:"call_user",title:"我该怎么称呼你？",placeholder:"例如：爸爸、老板、小王…",hint:"这个称呼会立刻用于后续对话。"},
  {key:"relationship",title:"你希望我们是什么关系？",placeholder:"例如：分身、伴侣、搭子、影子…",hint:"你定义关系，我就按这个关系和你相处。"},
  {key:"mbti",title:"你的MBTI是？（可跳过）",placeholder:"例如：INTJ",hint:"会写入人格层记忆。"},
];
let onboardingIdx=0,onboardingFacts={};
function renderOnboarding(){
  const stepEl=$("#onboarding-step"),bar=$("#onboarding-progress");if(!stepEl||!bar)return;
  const s=onboardingSteps[onboardingIdx];
  bar.style.width=`${Math.round(((onboardingIdx+1)/onboardingSteps.length)*100)}%`;
  stepEl.innerHTML=`<div class="onboarding-step"><h3>${esc(s.title)}</h3><p>${esc(s.hint)}</p><input class="onboarding-input" id="onboarding-input" placeholder="${esc(s.placeholder)}" autofocus></div>`;
  const input=$("#onboarding-input");
  if(input){input.value=onboardingFacts[s.key]||"";input.addEventListener("keypress",e=>{if(e.key==="Enter"){e.preventDefault();$("#onboarding-next")?.click();}});}
}
async function finishOnboarding(skip=false){
  $("#onboarding-modal").style.display="none";localStorage.setItem(ONBOARDING_KEY,"1");
  if(skip)return;
  const snippets=[];
  if(onboardingFacts.call_user)snippets.push(`以后叫我${onboardingFacts.call_user}`);
  if(onboardingFacts.relationship)snippets.push(`你是我的${onboardingFacts.relationship}`);
  if(onboardingFacts.mbti)snippets.push(`我的MBTI是${onboardingFacts.mbti}`);
  if(!snippets.length)return;
  switchView("chat");await new Promise(r=>setTimeout(r,200));
  $("#chat-input").value=snippets.join("，");$("#chat-form").requestSubmit();
}
$("#onboarding-next")?.addEventListener("click",()=>{
  const s=onboardingSteps[onboardingIdx];const val=($("#onboarding-input")?.value||"").trim();
  if(val)onboardingFacts[s.key]=val;onboardingIdx++;
  if(onboardingIdx>=onboardingSteps.length)return void finishOnboarding(false);
  renderOnboarding();
});
$("#onboarding-skip")?.addEventListener("click",()=>finishOnboarding(true));

// ─── ACHIEVEMENTS ───
const ACHIEVEMENTS=[
  {id:"first_memory",name:"初次记忆",desc:"第一条记忆写入",threshold:1,emoji:"🌱",xp:10},
  {id:"five_facts",name:"初识",desc:"记住5件事",threshold:5,emoji:"🪼",xp:30},
  {id:"ten_facts",name:"渐熟",desc:"记住10件事",threshold:10,emoji:"💙",xp:50},
  {id:"twenty_facts",name:"知己",desc:"记住20件事",threshold:20,emoji:"💎",xp:100},
  {id:"thirty_facts",name:"老朋友",desc:"记住30件事",threshold:30,emoji:"🔥",xp:150},
  {id:"fifty_facts",name:"灵魂伴侣",desc:"记住50件事",threshold:50,emoji:"🌊",xp:200},
  {id:"streak3",name:"三日连击",desc:"连续3天",threshold:-3,emoji:"🔥",xp:30},
  {id:"streak7",name:"周连击",desc:"连续7天",threshold:-7,emoji:"⚡",xp:80},
  {id:"streak30",name:"月连击",desc:"连续30天",threshold:-30,emoji:"👑",xp:300},
];
let unlockedAchievements=JSON.parse(localStorage.getItem("omeclaw_achievements")||"[]");
function checkAchievements(count){
  for(const a of ACHIEVEMENTS){if(unlockedAchievements.includes(a.id))continue;
    if((a.threshold>0&&count>=a.threshold)||(a.threshold<0&&streakDays>=Math.abs(a.threshold))){
      unlockedAchievements.push(a.id);localStorage.setItem("omeclaw_achievements",JSON.stringify(unlockedAchievements));
      showAchievement(a);}
  }
}
function showAchievement(a){const c=document.getElementById("memory-toast-container");if(!c)return;
  const el=document.createElement("div");el.className="memory-toast achievement";
  el.innerHTML=`<div class="mt-glow"></div><div class="mt-text">${a.emoji} 成就解锁: ${a.name}<br><span class="mt-sub">${a.desc} · +${a.xp}XP</span></div>`;
  c.appendChild(el);requestAnimationFrame(()=>el.classList.add("mt-show"));
  setTimeout(()=>{el.classList.remove("mt-show");setTimeout(()=>el.remove(),500);},5000);}
function showMemoryToast(){const c=document.getElementById("memory-toast-container");if(!c)return;
  const msgs=["🧠 记忆碎片 +1","💫 新记忆写入","🪼 记忆核更新","✨ 记忆生长中","🌊 新数据融入"];
  const el=document.createElement("div");el.className="memory-toast";
  el.innerHTML=`<div class="mt-glow"></div><div class="mt-text">${msgs[Math.floor(Math.random()*msgs.length)]} · 我又了解你多一点了</div>`;
  c.appendChild(el);requestAnimationFrame(()=>el.classList.add("mt-show"));
  setTimeout(()=>{el.classList.remove("mt-show");setTimeout(()=>el.remove(),500);},4000);}
async function checkMemoryUpdate(){try{const d=await(await fetch("/api/bond")).json();const count=d.factCount||0;
    if(lastFactCount>0&&count>lastFactCount){showMemoryToast();checkAchievements(count);}lastFactCount=count;}catch{}}

// ─── TIPS & KEYS ───
document.addEventListener("click",e=>{const tip=e.target.closest&&e.target.closest("[data-text]");
  if(tip){const text=tip.getAttribute("data-text");if(text){
    if(!document.querySelector("#view-chat.active"))switchView("chat");
    $("#chat-input").value=text;$("#chat-form").requestSubmit();}}});
document.addEventListener("keydown",e=>{if(e.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName??"")){e.preventDefault();$("#chat-input").focus();}});
$("#refresh-activity")?.addEventListener("click",loadActivity);
setInterval(()=>{if(document.querySelector("#view-activity.active"))loadActivity();},8000);
setInterval(loadStatus,15000);
setInterval(()=>{if(document.querySelector("#view-agents.active")||document.querySelector("#view-status.active"))loadAgents();},5000);

// ─── BOND ───
async function loadBond(){
  try{const d=await(await fetch(`/api/bond`)).json();
    const nameEl=$("#bond-name"),emojiEl=$("#bond-emoji"),levelEl=$("#bond-level"),progressEl=$("#bond-progress"),moodEl=$("#bond-mood");
    if(nameEl)nameEl.textContent=d.myName||"还没名字";
    if(emojiEl)emojiEl.textContent=d.emoji||"🫧";
    const streakText=streakDays>1?` · 🔥${streakDays}天`:"";
    const next=d.nextMilestone?` → ${d.nextMilestone.emoji} ${d.nextMilestone.name}`:"";
    if(levelEl)levelEl.innerHTML=`<span class="bond-level-text">${d.level}</span><span class="bond-stats">${d.factCount}条 · ${d.xp||0}XP · ${d.completeness||0}%${streakText}</span>${next?"<span class=\"bond-next\">"+next+"</span>":""}`;
    if(progressEl){const pct=d.progressToNext??0;progressEl.innerHTML=`<div class="bond-progress-bar"><div class="bond-progress-fill" style="width:${pct}%"></div></div>`;}
    lastFactCount=d.factCount||0;checkAchievements(lastFactCount);
    // mood indicator
    if(moodEl){
      const facts=await(await fetch("/api/memory/all")).json().then(r=>r.facts).catch(()=>[]);
      const emotion=facts?.find(f=>f.key.includes("情绪")||f.key.includes("心情"));
      moodEl.textContent=emotion?`${emotion.value.includes("积极")||emotion.value.includes("开心")?"😊":"😔"}`:"";
    }
  }catch(e){console.error("loadBond:",e);}
}

// ─── INIT ───
initVoice();
const savedView=localStorage.getItem("omeclaw_view")||"chat";
loadStatus();
loadAgents().then(()=>{
  switchView(savedView);if(savedView==="chat")loadChatHistory();loadBond();
  if(!localStorage.getItem(ONBOARDING_KEY)){const m=$("#onboarding-modal");if(m){m.style.display="flex";onboardingIdx=0;onboardingFacts={};renderOnboarding();}}
});
