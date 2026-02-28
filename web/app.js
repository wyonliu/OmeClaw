const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const sid=(()=>{let x=localStorage.getItem("omeclaw_sid");if(!x){x="w-"+Math.random().toString(36).slice(2,10);localStorage.setItem("omeclaw_sid",x);}return x;})();
let curAgent="",agents=[],pendingChats=0;

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
$$(".nav-btn").forEach(b=>{b.addEventListener("click",()=>{
  $$(".nav-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  $$(".view").forEach(v=>v.classList.remove("active"));$(`#view-${b.dataset.view}`).classList.add("active");
  if(b.dataset.view==="activity")loadActivity();
  if(b.dataset.view==="status")loadStatus();
  if(b.dataset.view==="agents")loadAgents();
  if(b.dataset.view==="memory")loadMemory();
})});
function switchView(name){
  $$(".nav-btn").forEach(x=>x.classList.remove("active"));
  $$(`.nav-btn[data-view="${name}"]`).forEach(x=>x.classList.add("active"));
  $$(".view").forEach(v=>v.classList.remove("active"));$(`#view-${name}`).classList.add("active");
}

// ─── AGENTS ───
async function loadAgents(){
  try{
    const r=await(await fetch("/api/agents")).json();agents=r.agents||[];
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
    agents.map(a=>`<div class="agent-item${a.id===curAgent?" active":""}" data-id="${a.id}"><span class="dot ${a.role}"></span><span>${a.name}</span></div>`).join("");
  sb.querySelectorAll(".agent-item").forEach(el=>{el.addEventListener("click",()=>{
    curAgent=el.dataset.id;$("#agent-select").value=curAgent;
    sb.querySelectorAll(".agent-item").forEach(x=>x.classList.remove("active"));el.classList.add("active");
    updateChatHeader();switchView("chat");
  })});
}
function renderAgentsGrid(){
  const grid=$("#agents-grid");if(!grid)return;
  grid.innerHTML=agents.map(a=>`<div class="card">
    <div class="card-header"><h3>${esc(a.name)}</h3><span class="tag role">${a.role}</span></div>
    <p>${esc(a.systemPrompt.slice(0,150))}${a.systemPrompt.length>150?"...":""}</p>
    <div class="card-tags"><span class="tag model">${esc(a.model)}</span>
    ${(a.tools||[]).map(t=>`<span class="tag tool">${esc(t)}</span>`).join("")}</div>
  </div>`).join("");
}
function setConn(ok){
  $("#conn-status").textContent=ok?"Connected":"Disconnected";
  $("#status-dot").classList.toggle("off",!ok);
}

// ─── STATUS ───
async function loadStatus(){
  try{
    const d=await(await fetch("/api/status")).json();setConn(true);
    const fmt=s=>s<60?`${Math.floor(s)}s`:s<3600?`${Math.floor(s/60)}m ${Math.floor(s%60)}s`:`${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m`;
    $("#status-grid").innerHTML=`
      <div class="card stat"><div class="stat-label">Status</div><div class="stat-val green">● Running</div></div>
      <div class="card stat"><div class="stat-label">Uptime</div><div class="stat-val">${fmt(d.uptime)}</div></div>
      <div class="card stat"><div class="stat-label">Agents</div><div class="stat-val">${d.agents?.length??0}</div></div>
      <div class="card stat"><div class="stat-label">Gateways</div><div class="stat-val">${d.gateways?.length?d.gateways.join(", "):"Web"}</div></div>
      <div class="card stat"><div class="stat-label">Memory</div><div class="stat-val">${d.memory?.messages??0} msgs</div></div>
      <div class="card stat"><div class="stat-label">Tools</div><div class="stat-val">${d.tools?.join(", ")}</div></div>`;
  }catch{setConn(false);}
}

// ─── ACTIVITY ── 统一时间线 ───
async function loadActivity(){
  const el=$("#activity-log");
  try{
    const data=await(await fetch("/api/activity")).json();
    const items=data.timeline||[];
    if(!items.length){el.innerHTML=`<p class="empty-msg">还没有任何动态</p>`;return;}
    let html="";
    for(const it of items){
      const t=timeFmt(it.time);
      const src=it.source?`<span class="tl-src">${esc(it.source)}</span>`:"";
      let cls="tl-system";
      if(it.type==="user_in") cls="tl-user";
      else if(it.type==="agent_out") cls="tl-agent";
      else if(it.type==="tool"||it.type==="tool_result") cls="tl-tool";
      html+=`<div class="tl-row ${cls}"><span class="tl-time">${t}</span>${src}<span class="tl-detail">${esc(it.detail)}</span></div>`;
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

// 加载聊天历史 — 只在拿到数据后才替换内容
async function loadChatHistory(){
  try{
    const resp=await fetch(`/api/chat/history?sessionId=${encodeURIComponent(sid)}`);
    const {messages}=await resp.json();
    const container=$("#messages");
    if(!messages||!messages.length){
      // 没有历史，只在容器为空时显示欢迎
      if(!container.children.length||container.querySelector(".welcome-msg")){
        const a=agents.find(x=>x.id===curAgent);
        const name=a?.name||"Ome";
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
    // 有历史消息：渲染
    let html="";
    for(const m of messages){
      const agent=m.agent_id||"";
      if(m.role==="user") html+=`<div class="msg user">${esc(m.content)}</div>`;
      else html+=`<div class="msg assistant">${agent?`<span class="agent-tag">${esc(agent)}</span>`:""}${formatMsg(m.content)}</div>`;
    }
    container.innerHTML=html;
    container.scrollTop=container.scrollHeight;
  }catch(e){console.error("loadChatHistory:",e);}
}

// ─── CHAT SUBMIT ───
$("#chat-form").addEventListener("submit",e=>{
  e.preventDefault();
  const inp=$("#chat-input"),text=inp.value.trim();
  if(!text)return;
  inp.value="";inp.focus();

  // 清除欢迎页
  const welcome=$("#messages .welcome-msg");
  if(welcome)welcome.remove();

  const agentName=agents.find(a=>a.id===curAgent)?.name??curAgent;
  addMsg("user",esc(text));
  const ld=addMsg("assistant",thinkingHtml(agentName));
  ld.classList.add("loading");
  pendingChats++;updatePending();

  fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({message:text,sessionId:sid,agentId:curAgent})})
  .then(r=>r.json())
  .then(data=>{
    if(data.error){
      ld.innerHTML=`<span class="agent-tag error-tag">Error</span>${esc(data.error)}`;
      ld.classList.add("error");
    }else{
      ld.innerHTML=`<span class="agent-tag">${esc(data.agentId)}</span>${formatMsg(data.reply??"No response")}`;
    }
    ld.classList.remove("loading");
    $("#messages").scrollTop=$("#messages").scrollHeight;
  })
  .catch(err=>{
    ld.innerHTML=`<span class="agent-tag error-tag">Error</span>${esc(err.message)}`;
    ld.classList.remove("loading");ld.classList.add("error");
  })
  .finally(()=>{pendingChats--;updatePending();loadBond();});
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

// ─── MEMORY ── 人本模型 ───
async function loadMemory(){
  const q=$("#mem-q")?.value?.trim();
  if(q)return searchMemory(q);
  try{
    const data=await(await fetch(`/api/memory/model?sessionId=${encodeURIComponent(sid)}`)).json();
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

// ─── TOAST ───
function showToast(msg,type="info"){
  const t=document.createElement("div");t.className=`toast ${type}`;t.textContent=msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),300);},3000);
}

// ─── WELCOME TIPS ───
document.addEventListener("click",e=>{
  const tip=e.target.closest&&e.target.closest("[data-text]");
  if(tip){
    const text=tip.getAttribute("data-text");
    if(text){$("#chat-input").value=text;$("#chat-input").focus();}
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

// ─── BOND STATUS ───
async function loadBond(){
  try{
    const d=await(await fetch(`/api/bond?sessionId=${encodeURIComponent(sid)}`)).json();
    const nameEl=$("#bond-name"),emojiEl=$("#bond-emoji"),levelEl=$("#bond-level");
    if(nameEl)nameEl.textContent=d.myName||"还没名字";
    if(emojiEl)emojiEl.textContent=d.emoji||"🫧";
    if(levelEl)levelEl.textContent=`${d.level} · ${d.factCount}条记忆 · ${d.completeness||0}%`;
  }catch(e){console.error("loadBond:",e);}
}

// ─── INIT ───
loadStatus();
loadAgents().then(()=>{loadChatHistory();loadBond();});
