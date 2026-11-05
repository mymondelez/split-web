import {parseEuroCents,totalSpentCents,amountPaidByUser,computeBalances,settleDebts} from "./accounting.js";
const STORAGE_KEY="split-web-v2-local-rooms-v1";
const $=id=>document.getElementById(id);
const euro=cents=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(cents/100);
const colors=["#0cb99b","#5b9cf4","#f6a36d","#9779dc","#e86b97","#54bcba","#d3a93d","#7e9fb4","#df8576","#6cad85"];
const categories={food:["🍽️","food"],travel:["🚆","travel"],home:["🏠","home"],shop:["🛍️","shop"],other:["💳","other"]};
let rooms=readRooms(),currentId=null,toastTimer;
function readRooms(){try{const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");return data&&typeof data==="object"&&!Array.isArray(data)?data:{}}catch{return {}}}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(rooms));return true}catch{notify("Impossibile salvare. Verifica lo spazio o i permessi del browser.");return false}}
function notify(message){const el=$("toast");el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true},4200)}
function makeCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";const bytes=new Uint8Array(10);crypto.getRandomValues(bytes);return Array.from(bytes,b=>chars[b%chars.length]).join("")}
function text(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value);return el}
function avatar(name){const a=text("div","avatar",name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||"").join("").toUpperCase());a.title=name;return a}
function readHash(){const match=location.hash.match(/^#v2room=([A-Z0-9]{6,20})$/i);return match?match[1].toUpperCase():null}
function renderNameInputs(){const count=Number($("userCount").value);const wrap=$("namesWrap");const current=[...wrap.querySelectorAll("input")].map(el=>el.value);wrap.replaceChildren();for(let i=0;i<count;i++){const input=document.createElement("input");input.className="input";input.placeholder="Persona "+(i+1);input.maxLength=40;input.required=true;input.setAttribute("aria-label","Nome persona "+(i+1));input.value=current[i]||"";wrap.append(input)}}
function renderHome(){
  $("homePage").hidden=false;$("roomPage").hidden=true;
  const list=$("mySplitsList");list.replaceChildren();
  const items=Object.values(rooms).filter(r=>r&&Array.isArray(r.users)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  $("groupCount").textContent=items.length+" grupp"+(items.length===1?"o":"i");
  if(!items.length){list.append(text("div","empty-box","Non hai ancora gruppi. Crea il primo $plit!"));return}
  for(const r of items){
    const item=text("div","split-item",""),circle=text("div","split-circle","✦"),main=text("div","split-main","");
    main.append(text("div","split-name",r.name),text("div","split-code",r.users.length+" partecipanti · "+r.id));
    const btn=text("button","btn ghost sm","Apri →");btn.type="button";btn.addEventListener("click",()=>openRoom(r.id));
    item.append(circle,main,btn);list.append(item);
  }
}
function currentRoom(){return rooms[currentId]||null}
function openRoom(id){
  if(!rooms[id]){notify("Gruppo non trovato in questo browser. I gruppi V2 sono solo locali.");return}
  currentId=id;location.hash="v2room="+id;renderRoom();window.scrollTo({top:0,behavior:"smooth"});
}
function goHome(){currentId=null;history.replaceState(null,"",location.pathname+location.search);renderHome()}
function createRoom(event){
  event.preventDefault();
  const name=$("splitName").value.trim();
  const users=[...$("namesWrap").querySelectorAll("input")].map((e,i)=>({id:"u"+(i+1),name:e.value.trim()}));
  if(!name||users.length<2||users.some(u=>!u.name)){notify("Inserisci il nome del gruppo e i nomi di tutte le persone.");return}
  if(new Set(users.map(u=>u.name.toLocaleLowerCase("it"))).size!==users.length){notify("Usa nomi distinti per ogni partecipante.");return}
  let id;do{id=makeCode()}while(rooms[id]);
  rooms[id]={id,name,users,expenses:[],createdAt:Date.now()};
  if(!save()){delete rooms[id];return}
  $("createForm").reset();$("userCount").value="2";renderNameInputs();openRoom(id);notify("Gruppo creato!");
}
function joinRoom(event){
  event.preventDefault();const entered=$("joinInput").value.trim();const match=entered.match(/(?:#v2room=|^)([A-Z0-9]{6,20})$/i);
  if(!match){notify("Inserisci un codice V2 valido.");return}
  openRoom(match[1].toUpperCase());
}
function buildParticipants(room){
  const wrap=$("participantsWrap");wrap.replaceChildren();
  $("paidBy").replaceChildren();
  $("paidBy").append(new Option("Seleziona…",""));
  for(const u of room.users){
    $("paidBy").append(new Option(u.name,u.id));
    const label=text("label","participant","");
    const cb=document.createElement("input");cb.type="checkbox";cb.value=u.id;cb.checked=true;cb.name="participant";
    label.append(cb,text("span","",u.name));wrap.append(label);
  }
}
function createExpense(event){
  event.preventDefault();const room=currentRoom();if(!room)return;
  const amountCents=parseEuroCents($("expenseAmount").value),payerId=$("paidBy").value;
  const note=$("expenseNote").value.trim(),participantIds=[...$("participantsWrap").querySelectorAll("input:checked")].map(x=>x.value);
  if(amountCents===null){notify("Importo non valido. Usa al massimo due decimali.");return}
  if(!note){notify("Inserisci una descrizione della spesa.");return}
  if(!room.users.some(u=>u.id===payerId)){notify("Seleziona chi ha pagato.");return}
  if(!participantIds.length){notify("Seleziona almeno un partecipante.");return}
  const expense={id:(crypto.randomUUID?.()||makeCode()),amountCents,payerId,participantIds,note,category:$("category").value,createdAt:Date.now()};
  room.expenses.unshift(expense);
  if(!save()){room.expenses.shift();return}
  $("expenseForm").reset();buildParticipants(room);renderRoom();notify("Spesa registrata.");
}
function deleteExpense(id){
  const room=currentRoom();if(!room)return;
  const expense=room.expenses.find(e=>e.id===id);if(!expense)return;
  if(!confirm('Eliminare la spesa "'+expense.note+'"?'))return;
  const old=room.expenses;room.expenses=old.filter(e=>e.id!==id);
  if(!save()){room.expenses=old;return}
  renderRoom();notify("Spesa eliminata.");
}
function deleteRoom(){
  const room=currentRoom();if(!room)return;
  if(!confirm('Eliminare il gruppo "'+room.name+'" e tutte le sue spese locali?'))return;
  const backup=room;delete rooms[currentId];
  if(!save()){rooms[currentId]=backup;return}
  goHome();notify("Gruppo eliminato.");
}
function renderRoom(){
  const room=currentRoom();if(!room){goHome();return}
  $("homePage").hidden=true;$("roomPage").hidden=false;
  $("roomTitle").textContent=room.name;$("roomCode").textContent=room.id;
  $("roomAvatars").replaceChildren(...room.users.map(u=>avatar(u.name)));
  const expenses=room.expenses||[],total=totalSpentCents(expenses),paid=amountPaidByUser(room.users,expenses);
  $("totalSpent").textContent=euro(total);
  $("expenseFooterTotal").textContent=euro(total);
  $("expenseCount").textContent=expenses.length;
  $("peopleCount").textContent=room.users.length;
  $("averagePerPerson").textContent=euro(Math.round(total/room.users.length));
  renderChart(room,paid,total);
  renderBalances(room,expenses);
  renderExpenses(room,expenses);
  buildParticipants(room);
}
function renderChart(room,paid,total){
  const donut=$("spendingDonut"),legend=$("spendingLegend");legend.replaceChildren();
  const amounts=room.users.map(u=>Math.max(0,paid[u.id]||0));
  let degree=0;const ranges=[];
  amounts.forEach((value,i)=>{if(value<=0)return;const angle=total?value/total*360:0;ranges.push(colors[i%colors.length]+" "+degree+"deg "+(degree+angle)+"deg");degree+=angle});
  donut.style.background=ranges.length?"conic-gradient("+ranges.join(",")+")":"conic-gradient(#e2eeec 0 100%)";
  donut.setAttribute("aria-label",total?"Importi pagati: "+room.users.map((u,i)=>u.name+" "+euro(amounts[i])).join(", "):"Nessuna spesa registrata");
  const all=room.users.map((u,i)=>({u,amount:amounts[i],color:colors[i%colors.length]})).sort((a,b)=>b.amount-a.amount);
  for(const item of all){
    const row=text("div","legend-item",""),dot=text("div","legend-dot","");dot.style.background=item.color;
    row.append(dot,text("span","legend-label",item.u.name),text("strong","legend-value",euro(item.amount)));legend.append(row)
  }
}
function renderBalances(room,expenses){
  const wrap=$("balanceList");wrap.replaceChildren();
  const balances=computeBalances(room.users,expenses),transfers=settleDebts(balances);
  if(!transfers.length){wrap.append(text("div","balance-fine",expenses.length?"✓ Tutti in pari! Nessun rimborso necessario.":"I rimborsi appariranno qui dopo la prima spesa."));return}
  for(const t of transfers){
    const from=room.users.find(u=>u.id===t.from)?.name||"?",to=room.users.find(u=>u.id===t.to)?.name||"?";
    const row=text("div","balance-item",""),avatars=text("div","balance-avatars","");
    avatars.append(avatar(from),avatar(to));
    const label=text("div","balance-text",from+" deve a "+to);
    row.append(avatars,label,text("strong","balance-amount",euro(t.amountCents)));wrap.append(row)
  }
}
function renderExpenses(room,expenses){
  const list=$("expensesList"),search=$("expenseSearch").value.trim().toLocaleLowerCase("it");
  const shown=expenses.filter(e=>!search||e.note.toLocaleLowerCase("it").includes(search)||room.users.find(u=>u.id===e.payerId)?.name.toLocaleLowerCase("it").includes(search));
  list.replaceChildren();
  if(!shown.length){list.append(text("div","empty-box",search?"Nessuna spesa corrisponde alla ricerca.":"Ancora nessuna spesa. Aggiungine una per iniziare."));return}
  for(const e of shown){
    const row=text("div","expense-row",""),cat=categories[e.category]||categories.other;
    const pict=text("div","expense-icon "+cat[1],cat[0]);
    const main=text("div","expense-main",""),payer=room.users.find(u=>u.id===e.payerId)?.name||"Sconosciuto";
    const shared=(e.participantIds||[]).map(id=>room.users.find(u=>u.id===id)?.name||"?").join(", ");
    main.append(text("div","expense-title",e.note),text("div","expense-meta",payer+" ha pagato · Per: "+shared));
    const amount=text("div","expense-amount","");amount.append(text("strong","",euro(e.amountCents)),text("small","","Spesa"));
    const del=text("button","expense-delete","×");del.type="button";del.title="Elimina questa spesa";del.setAttribute("aria-label","Elimina spesa "+e.note);del.addEventListener("click",()=>deleteExpense(e.id));
    row.append(pict,main,amount,del);list.append(row);
  }
}
function setup(){
  const count=$("userCount");for(let n=2;n<=10;n++)count.add(new Option(n+" persone",String(n)));renderNameInputs();
  count.addEventListener("change",renderNameInputs);
  $("createForm").addEventListener("submit",createRoom);
  $("joinForm").addEventListener("submit",joinRoom);
  $("expenseForm").addEventListener("submit",createExpense);
  $("expenseSearch").addEventListener("input",()=>{const room=currentRoom();if(room)renderExpenses(room,room.expenses||[])});
  $("selectAll").addEventListener("click",()=>$("participantsWrap").querySelectorAll("input").forEach(x=>x.checked=true));
  $("selectNone").addEventListener("click",()=>$("participantsWrap").querySelectorAll("input").forEach(x=>x.checked=false));
  $("backHome").addEventListener("click",goHome);$("deleteRoom").addEventListener("click",deleteRoom);
  $("copyCode").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(currentId);notify("Codice copiato (utilizzabile solo in questo browser).")}catch{notify("Codice: "+currentId)}});
  window.addEventListener("hashchange",()=>{const id=readHash();if(id&&rooms[id]){currentId=id;renderRoom()}else if(!id)goHome()});
  window.addEventListener("storage",event=>{if(event.key!==STORAGE_KEY)return;rooms=readRooms();if(currentId&&rooms[currentId])renderRoom();else goHome()});
  const initial=readHash();if(initial&&rooms[initial])openRoom(initial);else renderHome();
}
setup();
