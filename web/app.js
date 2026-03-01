const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const CHAT_SESSION="owner";
let curAgent="",agents=[],pendingChats=0,lastMsgId=0;
let agentStateById={};
const seenMsgIds=new Set();
const recentLocalUserMessages=[];
const recentLocalAssistantMessages=[];
let unreadChats=0;

function rememberRecent(list,text){
  list.push({text,time:Date.now()});
  while(list.length>20)list.shift();
}
function isRecentLocalEcho(list,text,windowMs=15000){
  const now=Date.now();
  return list.some(x=>x.text===text&&(now-x.time)<windowMs);
}
function markSeen(id){
  if(!id)return;
  seenMsgIds.add(id);
  if(seenMsgIds.size>800){
    const arr=[...seenMsgIds];
    for(let i=0;i<300;i++)seenMsgIds.delete(arr[i]);
  }
}

// ─── UTILS ───
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

// ─── NAVIGATION ───
function switchView(name){
  $$(".nav-btn").forEach(x=>x.classList.remove("active"));
  $$(`.nav-btn[data-view="${name}"]`).forEach(x=>x.classList.add("active"));
  $$(".view").forEach(v=>v.classList.remove("active"));$(`#view-${name}`).classList.add("active");
  localStorage.setItem("omeclaw_view",name);
  if(name==="chat")loadChatHistory();
  if(name==="chat"){unreadChats=0;renderUnreadBadge();}
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
    updateChatHeader();
    renderSidebar();
    renderAgentsGrid();
  }catch(e){console.error("loadAgents:",e);setConn(false);}
}
function updateChatHeader(){
  const a=agents.find(x=>x.id===curAgent);
  $("#chat-agent-name").textContent=a?.name??curAgent;
}
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
    return `<div class="card">
    <div class="card-header"><h3>${esc(a.name)}</h3><span class="tag role">${a.role}</span></div>
    <div class="agent-live ${aliveCls}">
      <span class="live-dot"></span>
      <span class="live-text">${status}</span>
      <span class="live-time">${st.lastActiveAt?timeFmt(st.lastActiveAt):"暂无"}</span>
      <span class="live-runs">#${st.totalRuns||0}</span>
    </div>
    <p>${esc(a.systemPrompt.slice(0,150))}${a.systemPrompt.length>150?"...":""}</p>
    <div class="card-tags"><span class="tag model">${esc(a.model)}</span>
    ${(a.tools||[]).map(t=>`<span class="tag tool">${esc(t)}</span>`).join("")}</div>
  </div>`;
  }).join("");
}
function setConn(ok){
  $("#conn-status").textContent=ok?"Connected":"Disconnected";
  $("#status-dot").classList.toggle("off",!ok);
}

function renderUnreadBadge(){
  const btn=document.querySelector(`.nav-btn[data-view="chat"]`);
  if(!btn)return;
  btn.textContent=unreadChats>0?`💬 对话 (${unreadChats})`:"💬 对话";
}

// ─── STATUS ───
async function loadStatus(){
  try{
    const d=await(await fetch("/api/status")).json();setConn(true);
    const audit=await (await fetch("/api/pm/audit")).json().catch(()=>null);
    const consistency=await (await fetch("/api/agents/consistency")).json().catch(()=>null);
    loadEvolution();
    const fmt=s=>s<60?`${Math.floor(s)}s`:s<3600?`${Math.floor(s/60)}m ${Math.floor(s%60)}s`:`${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m`;
    const ag=d.agents||[];
    const gw=d.gateways?.length?d.gateways.join(", "):"Web";
    $("#status-grid").innerHTML=`
      <div class="status-hero">
        <div class="status-status"><span class="pulse-dot"></span>运行中</div>
        <div class="status-uptime">已运行 ${fmt(d.uptime)}</div>
      </div>
      <div class="status-section">
        <div class="status-section-title">分身体 (${ag.length})</div>
        <div class="status-agents">${ag.map(a=>`<div class="status-agent"><span class="agent-role-dot ${a.role}"></span><span>${esc(a.name)}</span><span class="agent-id">${esc(a.id)}</span></div>`).join("")}</div>
      </div>
      <div class="status-section">
        <div class="status-section-title">通道</div>
        <div class="status-val">${esc(gw)}</div>
      </div>
      <div class="status-section">
        <div class="status-section-title">记忆库</div>
        <div class="status-val">${d.memory?.messages??0} 条消息</div>
      </div>
      <div class="status-section">
        <div class="status-section-title">自动化提醒</div>
        <div class="status-val">${d.reminders?.count??0} 个待触发</div>
      </div>
      <div class="status-section">
        <div class="status-section-title">体验体检</div>
        <div class="status-val">${audit?`得分 ${audit.score}/${audit.total}`:"体检暂不可用"}</div>
        ${audit?.checks?.length?`<div class="status-audit">${audit.checks.map(c=>`<div class="audit-item ${c.ok?"ok":"bad"}"><span>${c.ok?"✅":"⚠️"} ${esc(c.title)}</span><span>${esc(c.detail)}</span></div>`).join("")}</div>`:""}
      </div>
      <div class="status-section">
        <div class="status-section-title">智能体一致性</div>
        <div class="status-val">${consistency?.ok?"✅ 无冲突":"⚠️ 发现配置冲突"}</div>
        ${consistency&&!consistency.ok?`<div class="status-audit">
          ${consistency.invalidIds?.length?`<div class="audit-item bad"><span>⚠️ 非法ID</span><span>${esc(consistency.invalidIds.join(", "))}</span></div>`:""}
          ${consistency.duplicateNames?.length?consistency.duplicateNames.map(x=>`<div class="audit-item bad"><span>⚠️ 重名</span><span>${esc(x.name)} → ${esc(x.ids.join(","))}</span></div>`).join(""):""}
        </div>`:""}
      </div>
      <div class="status-section">
        <div class="status-section-title">工具</div>
        <div class="status-tools">${(d.tools||[]).map(t=>`<span class="tool-tag">${esc(t)}</span>`).join("")}</div>
      </div>`;
  }catch{setConn(false);}
}
async function loadEvolution(){
  try{
    const d=await(await fetch("/api/evolution")).json();
    const el=$("#evolution-list");
    if(!el)return;
    const events=d.events||[];
    if(!events.length){el.innerHTML=`<p class="empty-msg">暂无进化记录</p>`;return;}
    el.innerHTML=events.map(e=>`<div class="evolution-item"><span class="ev-emoji">${e.emoji||"✨"}</span><span class="ev-time">${timeFmt(e.time)}</span><span class="ev-detail">${esc(e.detail)}</span></div>`).join("");
  }catch(e){console.error("loadEvolution:",e);}
}

// ─── ACTIVITY ───
const LOG_META={
  user_in:{icon:"📨",label:"用户",cls:"tl-user"},
  agent_out:{icon:"🤖",label:"回复",cls:"tl-agent"},
  tool:{icon:"🔧",label:"工具",cls:"tl-tool"},
  tool_result:{icon:"✅",label:"结果",cls:"tl-tool"},
  memory:{icon:"🧠",label:"记忆",cls:"tl-memory"},
  agent_created:{icon:"🧬",label:"创建",cls:"tl-system"},
  system:{icon:"⚙️",label:"系统",cls:"tl-system"},
};
async function loadActivity(){
  const el=$("#activity-log");
  try{
    const data=await(await fetch("/api/activity")).json();
    const items=data.timeline||[];
    if(!items.length){el.innerHTML=`<p class="empty-msg">暂无日志</p>`;return;}
    const groups={};
    for(const it of items){
      const k=it.thread||`${it.source||"system"}:${it.agent||"unknown"}`;
      if(!groups[k])groups[k]=[];
      groups[k].push(it);
    }
    const ordered=Object.entries(groups).sort((a,b)=>(a[1][a[1].length-1].time||0)-(b[1][b[1].length-1].time||0));
    let html="";
    for(const [thread,logs] of ordered){
      html+=`<div class="tl-thread"><div class="tl-thread-title">🧵 ${esc(thread)}</div>`;
      for(const it of logs){
        const t=timeFmt(it.time);
        const meta=LOG_META[it.type]||LOG_META.system;
        const src=it.source?`<span class="tl-src tl-src-${esc(it.source)}">${esc(it.source)}</span>`:"";
        const detail=esc(it.detail).slice(0,500);
        html+=`<div class="tl-row ${meta.cls}"><span class="tl-icon">${meta.icon}</span><span class="tl-time">${t}</span><span class="tl-label">${meta.label}</span>${src}<span class="tl-detail">${detail}</span></div>`;
      }
      html+=`</div>`;
    }
    el.innerHTML=html;
    el.scrollTop=el.scrollHeight;
  }catch(e){el.innerHTML=`<p class="empty-msg">加载失败</p>`;}
}

// ─── CHAT ───
function addMsg(role,html){
  const d=document.createElement("div");d.className=`msg ${role}`;
  d.innerHTML=html;
  const container=$("#messages");
  container.appendChild(d);
  container.scrollTop=container.scrollHeight;
  return d;
}
function thinkingHtml(name){
  return `<span class="agent-tag">${esc(name)}</span><div class="thinking"><span></span><span></span><span></span></div>`;
}

async function loadChatHistory(){
  try{
    const resp=await fetch(`/api/chat/history?merged=1`);
    const {messages}=await resp.json();
    const container=$("#messages");
    seenMsgIds.clear();
    if(!messages||!messages.length){
      if(!container.children.length||container.querySelector(".welcome-msg")){
        container.innerHTML=`<div class="welcome-msg">
          <div class="welcome-icon">🪼</div>
          <h3>嘿 👋</h3>
          <p>我还没名字呢，你给我起一个？<br>然后跟我聊聊你，让我知道我是谁的分身。</p>
          <div class="welcome-tips">
            <span data-text="以后叫你小O吧">给你起个名字</span>
            <span data-text="叫我老板就行">告诉我怎么叫你</span>
            <span data-text="最近工作太累了">随便聊聊</span>
          </div>
        </div>`;
      }
      return;
    }
    let html="";
    for(const m of messages){
      if(m.id)markSeen(m.id);
      const agent=m.agent_id||"";
      if(m.role==="user") html+=`<div class="msg user">${esc(m.content)}</div>`;
      else html+=`<div class="msg assistant">${agent?`<span class="agent-tag">${esc(agent)}</span>`:""}${formatMsg(m.content)}</div>`;
    }
    container.innerHTML=html;
    container.scrollTop=container.scrollHeight;
    // 记录最新 ID 用于轮询
    if(messages.length) lastMsgId=messages[messages.length-1].id||0;
  }catch(e){console.error("loadChatHistory:",e);}
}

// ─── 消息轮询：飞书消息实时同步 ───
async function pollNewMessages(){
  try{
    const resp=await fetch(`/api/chat/poll?since=${lastMsgId}`);
    const data=await resp.json();
    if(!data.messages?.length)return;
    const chatActive=!!document.querySelector("#view-chat.active");
    const container=$("#messages");
    // 移除欢迎页
    const welcome=container.querySelector(".welcome-msg");
    if(welcome&&chatActive)welcome.remove();
    let appended=0,received=0;
    for(const m of data.messages){
      if(m.id&&seenMsgIds.has(m.id))continue;
      if(m.id)markSeen(m.id);
      received++;
      if(m.role==="user"){
        if(isRecentLocalEcho(recentLocalUserMessages,m.content))continue;
        if(chatActive){addMsg("user",esc(m.content));appended++;}
      }else{
        if(isRecentLocalEcho(recentLocalAssistantMessages,m.content))continue;
        if(chatActive){addMsg("assistant",`${m.agent_id?`<span class="agent-tag">${esc(m.agent_id)}</span>`:""}${formatMsg(m.content)}`);appended++;}
      }
    }
    lastMsgId=data.latestId||lastMsgId;
    if(!chatActive&&received>0){
      unreadChats+=received;
      renderUnreadBadge();
    }
    if(chatActive&&data.messages.length){
      loadAgents();
      loadBond();
    }
  }catch{}
}
setInterval(pollNewMessages,3000);

// ─── CHAT SUBMIT ───
$("#chat-form").addEventListener("submit",e=>{
  e.preventDefault();
  const inp=$("#chat-input"),text=inp.value.trim();
  if(!text)return;
  inp.value="";inp.focus();

  const welcome=$("#messages .welcome-msg");
  if(welcome)welcome.remove();

  const agentName=agents.find(a=>a.id===curAgent)?.name??curAgent;
  addMsg("user",esc(text));
  rememberRecent(recentLocalUserMessages,text);
  const ld=addMsg("assistant",thinkingHtml(agentName));
  ld.classList.add("loading");
  pendingChats++;updatePending();

  fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({message:text,sessionId:CHAT_SESSION,agentId:curAgent})})
  .then(r=>r.json())
  .then(data=>{
    if(data.error){
      ld.innerHTML=`<span class="agent-tag error-tag">Error</span>${esc(data.error)}`;
      ld.classList.add("error");
    }else{
      ld.innerHTML=`<span class="agent-tag">${esc(data.agentId)}</span>${formatMsg(data.reply??"No response")}`;
      rememberRecent(recentLocalAssistantMessages,data.reply??"");
    }
    ld.classList.remove("loading");
    $("#messages").scrollTop=$("#messages").scrollHeight;
  })
  .catch(err=>{
    ld.innerHTML=`<span class="agent-tag error-tag">Error</span>${esc(err.message)}`;
    ld.classList.remove("loading");ld.classList.add("error");
  })
  .finally(()=>{pendingChats--;updatePending();loadBond();loadAgents();setTimeout(checkMemoryUpdate,800);setTimeout(loadAgents,1500);});
});
function updatePending(){
  $("#send-btn").textContent=pendingChats>0?`发送 (${pendingChats})`:"发送";
}

// ─── CREATE AGENT ───
$("#create-agent-btn").addEventListener("click",()=>{$("#create-modal").style.display="flex"});
$("#cancel-create").addEventListener("click",()=>{$("#create-modal").style.display="none"});
$("#confirm-create").addEventListener("click",async()=>{
  const body={id:$("#new-id").value.trim(),name:$("#new-name").value.trim(),model:$("#new-model").value.trim(),
    role:$("#new-role").value,systemPrompt:$("#new-prompt").value.trim(),
    tools:$("#new-tools").value.split(",").map(s=>s.trim()).filter(Boolean)};
  if(!body.id||!body.name){showToast("ID和名称必填","error");return;}
  if(!body.model){showToast("Model必填","error");return;}
  const btn=$("#confirm-create");btn.disabled=true;btn.textContent="创建中...";
  try{
    const r=await(await fetch("/api/agents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).json();
    if(r.ok){
      $("#create-modal").style.display="none";
      showToast(`Agent "${body.name}" 创建成功`,"success");
      await loadAgents();
      $("#new-id").value="";$("#new-name").value="";$("#new-prompt").value="";$("#new-tools").value="";
    }else showToast(r.error||"创建失败","error");
  }catch(err){showToast(err.message,"error");}
  finally{btn.disabled=false;btn.textContent="创建";}
});

// ─── MEMORY ───
async function loadMemory(){
  const q=$("#mem-q")?.value?.trim();
  if(q)return searchMemory(q);
  try{
    const data=await(await fetch(`/api/memory/model`)).json();
    renderMemoryModel(data);
  }catch(e){console.error("loadMemory:",e);}
}
async function searchMemory(q){
  const btn=$("#mem-search-btn");btn.disabled=true;btn.textContent="搜索中...";
  try{
    const{results}=await(await fetch(`/api/memory/search?q=${encodeURIComponent(q)}`)).json();
    const el=$("#mem-results");
    if(!results.length){el.innerHTML=`<p class="empty-msg">没有找到 "${esc(q)}" 相关记忆</p>`;return;}
    el.innerHTML=results.map(r=>{
      const ts=r.created_at?new Date(r.created_at*1000).toLocaleString("zh-CN"):"";
      return `<div class="mem-search-item"><span class="mem-role-tag">${r.role}</span><span class="mem-time">${ts}</span><div class="mem-text">${esc((r.content||"").slice(0,300))}</div></div>`;
    }).join("");
  }catch(e){showToast("搜索失败","error");}
  finally{btn.disabled=false;btn.textContent="搜索";}
}
function renderMemoryModel(data){
  const el=$("#mem-results");
  const pct=data.totalFacts?Math.round(data.filledCategories/data.totalCategories*100):0;
  let html=`<div class="mem-overview">
    <div class="mem-stats">
      <div class="mem-stat-ring"><svg viewBox="0 0 36 36"><path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" /><path class="ring-fill" stroke-dasharray="${pct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" /></svg><span class="ring-text">${pct}%</span></div>
      <div class="mem-stat-info"><div class="mem-stat-title">记忆完成度</div><div class="mem-stat-sub">${data.filledCategories}/${data.totalCategories} 维度 · ${data.totalFacts} 条记忆</div></div>
    </div>`;
  if(data.identity?.myName||data.identity?.callUser){
    html+=`<div class="mem-identity">`;
    if(data.identity.myName) html+=`<span class="mem-id-tag">我叫 ${esc(data.identity.myName)}</span>`;
    if(data.identity.callUser) html+=`<span class="mem-id-tag">叫TA ${esc(data.identity.callUser)}</span>`;
    if(data.identity.relationship) html+=`<span class="mem-id-tag">${esc(data.identity.relationship)}</span>`;
    html+=`</div>`;
  }
  html+=`</div><div class="mem-categories">`;
  for(const cat of data.categories){
    const filled=cat.filled;
    html+=`<div class="mem-cat ${filled?"mem-cat-filled":"mem-cat-empty"}">
      <div class="mem-cat-header"><span class="mem-cat-icon">${cat.icon}</span><span class="mem-cat-name">${esc(cat.name)}</span>${filled?`<span class="mem-cat-count">${cat.facts.length}</span>`:""}</div>`;
    if(filled){
      html+=`<div class="mem-cat-facts">`;
      for(const f of cat.facts) html+=`<div class="mem-fact"><span class="mem-fact-key">${esc(f.key)}</span><span class="mem-fact-val">${esc(f.value)}</span></div>`;
      html+=`</div>`;
    }else{
      html+=`<div class="mem-cat-hint">还没聊到这个方面</div>`;
    }
    html+=`</div>`;
  }
  html+=`</div>`;
  if(data.uncategorized?.length){
    html+=`<div class="mem-uncat"><div class="mem-cat-header"><span class="mem-cat-icon">📎</span><span class="mem-cat-name">其他记忆</span><span class="mem-cat-count">${data.uncategorized.length}</span></div><div class="mem-cat-facts">`;
    for(const f of data.uncategorized) html+=`<div class="mem-fact"><span class="mem-fact-key">${esc(f.key)}</span><span class="mem-fact-val">${esc(f.value)}</span></div>`;
    html+=`</div></div>`;
  }
  el.innerHTML=html;
}
$("#mem-search-btn")?.addEventListener("click",()=>{const q=$("#mem-q")?.value?.trim();if(q)searchMemory(q);else loadMemory();});
$("#mem-q")?.addEventListener("keypress",e=>{if(e.key==="Enter"){e.preventDefault();$("#mem-search-btn")?.click();}});
$("#mem-view-all-btn")?.addEventListener("click",async()=>{
  $("#mem-q").value="";
  try{const d=await(await fetch("/api/memory/all")).json();renderMemoryAll(d);}catch(e){showToast("加载失败","error");}
});
$("#mem-copy-btn")?.addEventListener("click",async()=>{
  try{const d=await(await fetch("/api/memory/all")).json();
  await navigator.clipboard.writeText(d.text||d.facts?.map(f=>`${f.key}: ${f.value}`).join("\n")||"");
  showToast("已复制到剪贴板","success");}catch(e){showToast("复制失败","error");}
});
function renderMemoryAll(data){
  const el=$("#mem-results");
  const facts=data.facts||[];
  if(!facts.length){el.innerHTML=`<p class="empty-msg">暂无记忆</p>`;return;}
  let html=`<div class="mem-all-header"><span>共 ${facts.length} 条记忆</span></div><div class="mem-all-list">`;
  for(const f of facts) html+=`<div class="mem-all-item"><span class="mem-fact-key">${esc(f.key)}</span><span class="mem-fact-val">${esc(f.value)}</span></div>`;
  html+=`</div>`;
  el.innerHTML=html;
}

// ─── TOAST ───
function showToast(msg,type="info"){
  const t=document.createElement("div");t.className=`toast ${type}`;t.textContent=msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),300);},3000);
}

// ─── 60秒引导式人格测试 ───
const ONBOARDING_KEY="omeclaw_onboarding_done_v1";
const onboardingSteps=[
  {key:"call_user",title:"我该怎么称呼你？",placeholder:"例如：爸爸、老板、小王…",hint:"这个称呼会立刻用于后续对话。"},
  {key:"relationship",title:"你希望我是什么关系？",placeholder:"例如：分身、伴侣、搭子、影子…",hint:"你定义关系，我就按这个关系和你说话。"},
  {key:"mbti",title:"你的MBTI是？（可跳过）",placeholder:"例如：INTJ",hint:"会写入人格层记忆，影响后续风格。"},
];
let onboardingIdx=0,onboardingFacts={};

function renderOnboarding(){
  const modal=$("#onboarding-modal"),stepEl=$("#onboarding-step"),bar=$("#onboarding-progress");
  if(!modal||!stepEl||!bar)return;
  const s=onboardingSteps[onboardingIdx];
  bar.style.width=`${Math.round((onboardingIdx/onboardingSteps.length)*100)}%`;
  stepEl.innerHTML=`<div class="onboarding-step"><h3>${esc(s.title)}</h3><p>${esc(s.hint)}</p><input class="onboarding-input" id="onboarding-input" placeholder="${esc(s.placeholder)}"></div>`;
  const input=$("#onboarding-input");
  if(input)input.value=onboardingFacts[s.key]||"";
}
async function finishOnboarding(skip=false){
  const modal=$("#onboarding-modal");
  if(modal)modal.style.display="none";
  localStorage.setItem(ONBOARDING_KEY,"1");
  if(skip)return;
  const snippets=[];
  if(onboardingFacts.call_user)snippets.push(`以后叫我${onboardingFacts.call_user}`);
  if(onboardingFacts.relationship)snippets.push(`你是我的${onboardingFacts.relationship}`);
  if(onboardingFacts.mbti)snippets.push(`我的MBTI是${onboardingFacts.mbti}`);
  if(!snippets.length)return;
  $("#chat-input").value=snippets.join("，");
  $("#chat-form").requestSubmit();
}
$("#onboarding-next")?.addEventListener("click",()=>{
  const s=onboardingSteps[onboardingIdx];
  const val=($("#onboarding-input")?.value||"").trim();
  if(val)onboardingFacts[s.key]=val;
  onboardingIdx++;
  if(onboardingIdx>=onboardingSteps.length)return void finishOnboarding(false);
  renderOnboarding();
});
$("#onboarding-skip")?.addEventListener("click",()=>finishOnboarding(true));

// ─── MEMORY UPDATE + ACHIEVEMENTS ───
let lastFactCount=0;
const ACHIEVEMENTS=[
  {id:"first_memory",name:"初次记忆",desc:"第一条记忆写入",threshold:1,emoji:"🌱",xp:10},
  {id:"five_facts",name:"初识",desc:"记住5件事",threshold:5,emoji:"🪼",xp:30},
  {id:"ten_facts",name:"渐熟",desc:"记住10件事",threshold:10,emoji:"💙",xp:50},
  {id:"twenty_facts",name:"知己",desc:"记住20件事",threshold:20,emoji:"💎",xp:100},
  {id:"fifty_facts",name:"灵魂伴侣",desc:"记住50件事",threshold:50,emoji:"🌊",xp:200},
];
let unlockedAchievements=JSON.parse(localStorage.getItem("omeclaw_achievements")||"[]");

function checkAchievements(count){
  for(const a of ACHIEVEMENTS){
    if(count>=a.threshold&&!unlockedAchievements.includes(a.id)){
      unlockedAchievements.push(a.id);
      localStorage.setItem("omeclaw_achievements",JSON.stringify(unlockedAchievements));
      showAchievement(a);
    }
  }
}

function showAchievement(a){
  const container=document.getElementById("memory-toast-container");
  if(!container)return;
  const el=document.createElement("div");
  el.className="memory-toast achievement";
  el.innerHTML=`<div class="mt-glow"></div><div class="mt-text">${a.emoji} 成就解锁: ${a.name}<br><span class="mt-sub">${a.desc} · +${a.xp}XP</span></div>`;
  container.appendChild(el);
  requestAnimationFrame(()=>el.classList.add("mt-show"));
  setTimeout(()=>{el.classList.remove("mt-show");setTimeout(()=>el.remove(),500);},5000);
}

function showMemoryToast(diff){
  const container=document.getElementById("memory-toast-container");
  if(!container)return;
  const messages=[
    "🧠 记忆碎片 +1 · 我又了解你多一点了",
    "💫 新记忆写入 · 我不会忘记的",
    "🪼 记忆核心更新 · 你在我心里越来越清晰",
    "✨ 记忆生长中 · 我们的羁绊加深了",
    "🌊 新数据融入记忆核 · 我正在变得更懂你",
  ];
  const msg=messages[Math.floor(Math.random()*messages.length)];
  const el=document.createElement("div");
  el.className="memory-toast";
  el.innerHTML=`<div class="mt-glow"></div><div class="mt-text">${msg}</div>`;
  container.appendChild(el);
  requestAnimationFrame(()=>el.classList.add("mt-show"));
  setTimeout(()=>{el.classList.remove("mt-show");setTimeout(()=>el.remove(),500);},4000);
}
async function checkMemoryUpdate(){
  try{
    const d=await(await fetch("/api/bond")).json();
    const count=d.factCount||0;
    if(lastFactCount>0&&count>lastFactCount){
      showMemoryToast(count-lastFactCount);
      checkAchievements(count);
    }
    lastFactCount=count;
  }catch{}
}

// ─── WELCOME TIPS ───
document.addEventListener("click",e=>{
  const tip=e.target.closest&&e.target.closest("[data-text]");
  if(tip){
    const text=tip.getAttribute("data-text");
    if(text){
      if(!document.querySelector("#view-chat.active"))switchView("chat");
      $("#chat-input").value=text;
      $("#chat-form").requestSubmit();
    }
  }
});
document.addEventListener("keydown",e=>{
  if(e.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName??"")){
    e.preventDefault();$("#chat-input").focus();
  }
});

$("#refresh-activity")?.addEventListener("click",loadActivity);
setInterval(()=>{if(document.querySelector("#view-activity.active"))loadActivity();},8000);
setInterval(loadStatus,15000);
setInterval(()=>{if(document.querySelector("#view-agents.active")||document.querySelector("#view-status.active"))loadAgents();},5000);

// ─── BOND STATUS ───
async function loadBond(){
  try{
    const d=await(await fetch(`/api/bond`)).json();
    const nameEl=$("#bond-name"),emojiEl=$("#bond-emoji"),levelEl=$("#bond-level"),progressEl=$("#bond-progress");
    if(nameEl)nameEl.textContent=d.myName||"还没名字";
    if(emojiEl)emojiEl.textContent=d.emoji||"🫧";
    const next=d.nextMilestone?` → ${d.nextMilestone.emoji} ${d.nextMilestone.name}`:"";
    if(levelEl)levelEl.innerHTML=`<span class="bond-level-text">${d.level}</span><span class="bond-stats">${d.factCount}条 · ${d.xp||0}XP · ${d.completeness||0}%</span>${next?"<span class=\"bond-next\">"+next+"</span>":""}`;
    if(progressEl){
      const pct=d.progressToNext??0;
      progressEl.innerHTML=`<div class="bond-progress-bar"><div class="bond-progress-fill" style="width:${pct}%"></div></div>`;
    }
    lastFactCount=d.factCount||0;
    checkAchievements(lastFactCount);
  }catch(e){console.error("loadBond:",e);}
}

// ─── INIT ───
const savedView=localStorage.getItem("omeclaw_view")||"chat";
loadStatus();
loadAgents().then(()=>{
  switchView(savedView);
  if(savedView==="chat")loadChatHistory();
  loadBond();
  const shouldOnboard=!localStorage.getItem(ONBOARDING_KEY);
  if(shouldOnboard){
    const modal=$("#onboarding-modal");
    if(modal){modal.style.display="flex";onboardingIdx=0;onboardingFacts={};renderOnboarding();}
  }
});
