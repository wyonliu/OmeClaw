const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const sid="w-"+Math.random().toString(36).slice(2,8);
let curAgent="",agents=[],pendingChats=0;

// Navigation
$$(".nav-btn").forEach(b=>{b.addEventListener("click",()=>{
  $$(".nav-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  $$(".view").forEach(v=>v.classList.remove("active"));$(`#view-${b.dataset.view}`).classList.add("active");
  if(b.dataset.view==="activity")loadActivity();
  if(b.dataset.view==="status")loadStatus();
  if(b.dataset.view==="agents")loadAgents();
  if(b.dataset.view==="memory")loadMemory();
})});

// Load agents
async function loadAgents(){
  try{
    const r=await(await fetch("/api/agents")).json();agents=r.agents;
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
  const badge=$("#chat-agent-role");
  if(badge&&a)badge.textContent=a.role;
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
  const grid=$("#agents-grid");
  if(!grid)return;
  grid.innerHTML=agents.map(a=>`<div class="card">
    <div class="card-header"><h3>${a.name}</h3><span class="tag role">${a.role}</span></div>
    <p>${esc(a.systemPrompt.slice(0,150))}${a.systemPrompt.length>150?"...":""}</p>
    <div class="card-tags"><span class="tag model">${a.model}</span>
    ${(a.tools||[]).map(t=>`<span class="tag tool">${t}</span>`).join("")}</div>
  </div>`).join("");
}

function switchView(name){
  $$(".nav-btn").forEach(x=>x.classList.remove("active"));
  $$(`.nav-btn[data-view="${name}"]`).forEach(x=>x.classList.add("active"));
  $$(".view").forEach(v=>v.classList.remove("active"));$(`#view-${name}`).classList.add("active");
}

function setConn(ok){
  $("#conn-status").textContent=ok?"Connected":"Disconnected";
  $("#status-dot").classList.toggle("off",!ok);
}

// Status
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
      <div class="card stat"><div class="stat-label">Tools</div><div class="stat-val">${d.tools?.join(", ")}</div></div>
      <div class="card stat"><div class="stat-label">Scheduler</div><div class="stat-val">${d.scheduler?`${d.scheduler.jobs} jobs`:"Off"}</div></div>
      <div class="card stat"><div class="stat-label">A2A Bus</div><div class="stat-val">${d.busAgents?.length??0} agents</div></div>`;
  }catch{setConn(false);}
}

// Activity
async function loadActivity(){
  try{
    const{logs}=await(await fetch("/api/activity")).json();
    const el=$("#activity-log");
    el.innerHTML=logs.length?logs.slice().reverse().map(l=>{
      const t=new Date(l.time).toLocaleString("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
      const tc=l.type.replace(/_/g,"-");
      return `<div class="act-row"><span class="act-time">${t}</span><span class="act-type ${tc}">${l.type}</span><span class="act-agent">${l.agent}</span><span class="act-detail">${esc(l.detail)}</span></div>`;
    }).join(""):`<p class="empty-msg">No activity yet</p>`;
  }catch{}
}

// ─── CHAT (fully async, non-blocking) ───
function esc(s){return String(s).replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function formatMsg(text){
  let s=esc(text);
  s=s.replace(/```([\s\S]*?)```/g,'<pre><code>$1</code></pre>');
  s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
  s=s.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/\n/g,'<br>');
  return s;
}

function addMsg(role,html){
  const d=document.createElement("div");d.className=`msg ${role}`;
  d.innerHTML=html;
  $("#messages").appendChild(d);
  $("#messages").scrollTop=$("#messages").scrollHeight;
  return d;
}

function thinkingHtml(name){
  return `<span class="agent-tag">${esc(name)}</span><div class="thinking"><span></span><span></span><span></span></div>`;
}

// Non-blocking chat submit
$("#chat-form").addEventListener("submit",e=>{
  e.preventDefault();
  const inp=$("#chat-input"),text=inp.value.trim();
  if(!text)return;
  inp.value="";inp.focus();

  const agentName=agents.find(a=>a.id===curAgent)?.name??curAgent;
  const agentId=curAgent;

  addMsg("user",esc(text));
  const ld=addMsg("assistant",thinkingHtml(agentName));
  ld.classList.add("loading");

  pendingChats++;
  updatePending();

  // Fire and forget — UI stays responsive
  fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({message:text,sessionId:sid,agentId})})
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
  .finally(()=>{pendingChats--;updatePending();});
});

function updatePending(){
  const btn=$("#send-btn");
  btn.textContent=pendingChats>0?`发送 (${pendingChats}处理中)`:"发送";
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
  // Default: show recent messages
  try{
    const{messages}=await(await fetch("/api/memory/recent")).json();
    renderMemory(messages,`最近 ${messages.length} 条记忆`);
  }catch(e){console.error("loadMemory:",e);}
}

async function searchMemory(q){
  const btn=$("#mem-search-btn");btn.disabled=true;btn.textContent="搜索中...";
  try{
    const{results}=await(await fetch(`/api/memory/search?q=${encodeURIComponent(q)}`)).json();
    renderMemory(results,results.length?`"${q}" 找到 ${results.length} 条`:`没有找到 "${q}" 相关记忆`);
  }catch(e){showToast("搜索失败","error");}
  finally{btn.disabled=false;btn.textContent="搜索";}
}

function renderMemory(items,title){
  const el=$("#mem-results");
  if(!items.length){el.innerHTML=`<div class="memory-empty"><p class="empty-msg">${esc(title)}</p></div>`;return;}
  el.innerHTML=`<div class="memory-header">${esc(title)}</div>`+
    items.map(r=>{
      const ts=r.created_at?new Date(r.created_at*1000).toLocaleString("zh-CN"):"";
      const agent=r.agent_id||"";
      const cls=r.role==="user"?"mem-user":"mem-assistant";
      return `<div class="mem-item ${cls}">
        <div class="mem-meta"><span class="mem-role">${r.role}</span>${agent?`<span class="mem-agent">${agent}</span>`:""}${ts?`<span class="mem-time">${ts}</span>`:""}</div>
        <div class="mem-content">${esc((r.content||"").slice(0,500))}${(r.content||"").length>500?"...":""}</div>
      </div>`;
    }).join("");
}

$("#mem-search-btn")?.addEventListener("click",()=>{
  const q=$("#mem-q")?.value?.trim();
  if(q)searchMemory(q);else loadMemory();
});
$("#mem-q")?.addEventListener("keypress",e=>{if(e.key==="Enter"){e.preventDefault();$("#mem-search-btn")?.click();}});

// ─── TOAST ───
function showToast(msg,type="info"){
  const t=document.createElement("div");t.className=`toast ${type}`;t.textContent=msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),300);},3000);
}

// ─── KEYBOARD ───
document.addEventListener("keydown",e=>{
  if(e.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName??"")){
    e.preventDefault();$("#chat-input").focus();
  }
});

// ─── REFRESH ───
$("#refresh-activity")?.addEventListener("click",loadActivity);
setInterval(()=>{if(document.querySelector("#view-activity.active"))loadActivity();},5000);
setInterval(loadStatus,15000);

// ─── INIT ───
loadAgents();loadStatus();
