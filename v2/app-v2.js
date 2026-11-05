import {parseEuroCents,totalSpentCents,amountPaidByUser,computeBalances,settleDebts} from "./accounting.js?v=2.2";
import {CATEGORIES,categoryInfo,selectedCategory,categoryBreakdown,filterExpensesByCategory} from "./categories.js?v=2.2";
const STORAGE_KEY="split-web-v2-local-rooms-v1";
const $=id=>document.getElementById(id);
const euro=cents=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(cents/100);
const colors=["#24e4ef","#ffe276","#b6a0ff","#7fe4bd","#ff9b85","#62c6ff","#ff8cca","#a7ff62","#dcb1ff","#ffbf61"];
let rooms=readRooms(),currentId=null,toastTimer,editingExpenseId=null,activeCategoryId=null;
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
  if(id!==currentId){activeCategoryId=null;$("expenseSearch").value="";}
  currentId=id;location.hash="v2room="+id;renderRoom();window.scrollTo({top:0,behavior:"smooth"});
}
function goHome(){currentId=null;activeCategoryId=null;$("expenseSearch").value="";history.replaceState(null,"",location.pathname+location.search);renderHome()}
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
  const expense={id:(crypto.randomUUID?.()||makeCode()),amountCents,payerId,participantIds,note,category:selectedCategory($("category").value,$("customCategory").value),createdAt:Date.now()};
  room.expenses.unshift(expense);
  if(!save()){room.expenses.shift();return}
  $("expenseForm").reset();$("customCategory").hidden=true;activeCategoryId=null;$("expenseSearch").value="";buildParticipants(room);renderRoom();notify("Spesa registrata.");
}
function deleteExpense(id){
  const room=currentRoom();if(!room)return;
  const expense=room.expenses.find(e=>e.id===id);if(!expense)return;
  if(!confirm('Eliminare la spesa "'+expense.note+'"?'))return;
  const old=room.expenses;room.expenses=old.filter(e=>e.id!==id);
  if(!save()){room.expenses=old;return}
  clearStaleFilter(room.expenses);renderRoom();notify("Spesa eliminata.");
}
function deleteRoom(){
  const room=currentRoom();if(!room)return;
  if(!confirm('Eliminare il gruppo "'+room.name+'" e tutte le sue spese locali?'))return;
  const backup=room;delete rooms[currentId];
  if(!save()){rooms[currentId]=backup;return}
  goHome();notify("Gruppo eliminato.");
}
function clearStaleFilter(expenses){
  if(activeCategoryId!==null && !expenses.some(e=>categoryInfo(e.category).id===activeCategoryId))activeCategoryId=null;
}
function setCategoryFilter(categoryId,scrollToList=false){
  activeCategoryId=activeCategoryId===categoryId?null:categoryId;
  const room=currentRoom();if(!room)return;
  renderCategoryTable(room.expenses||[]);
  renderExpenses(room,room.expenses||[]);
  if(scrollToList)$("activeCategoryFilter").hidden?$("expensesList").scrollIntoView({behavior:"smooth",block:"start"}):$("activeCategoryFilter").scrollIntoView({behavior:"smooth",block:"center"});
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
  clearStaleFilter(expenses);
  renderCategoryTable(expenses);
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
function renderCategoryTable(expenses){
  const {rows,totalCents,count}=categoryBreakdown(expenses);
  const body=$("categoryTableBody"),foot=$("categoryTableFoot");
  body.replaceChildren();foot.replaceChildren();
  if(!rows.length){
    const tr=document.createElement("tr"),td=text("td","category-none","Nessuna spesa da riepilogare.");td.colSpan=4;tr.append(td);body.append(tr);
  }
  for(const item of rows){
    const tr=document.createElement("tr");
    tr.className="category-filter-row"+(activeCategoryId===item.id?" is-selected":"");
    tr.title="Tocca per filtrare le spese: "+item.label;
    const first=document.createElement("th");first.scope="row";
    const button=text("button","category-filter-button","");
    button.type="button";button.setAttribute("aria-label","Mostra solo le spese in "+item.label);
    button.setAttribute("aria-pressed",String(activeCategoryId===item.id));
    const wrap=text("span","cat-stack",""),row=text("span","cat-name","");
    row.append(text("span","cat-icon",item.icon),text("span","",item.label));
    const track=text("span","cat-bar-track",""),fill=text("span","cat-bar-fill","");
    const percentage=totalCents?100*item.totalCents/totalCents:0;
    fill.style.width=percentage+"%";fill.style.background=item.color;track.append(fill);
    wrap.append(row,track);button.append(wrap);first.append(button);
    tr.append(first,text("td","num",item.count),text("td","num",euro(item.totalCents)),text("td","num",new Intl.NumberFormat("it-IT",{maximumFractionDigits:1}).format(percentage)+"%"));
    button.addEventListener("click",e=>{e.stopPropagation();setCategoryFilter(item.id,true)});
    tr.addEventListener("click",()=>setCategoryFilter(item.id,true));
    body.append(tr);
  }
  const footRow=document.createElement("tr"),head=text("th","","Totale complessivo");
  head.scope="row";
  footRow.append(head,text("td","num",count),text("td","num",euro(totalCents)),text("td","num",totalCents?"100%":"0%"));
  foot.append(footRow);
}
function renderBalances(room,expenses){
  const wrap=$("balanceList");wrap.replaceChildren();
  const balances=computeBalances(room.users,expenses),transfers=settleDebts(balances);
  if(!transfers.length){wrap.append(text("div","balance-fine",expenses.length?"✓ Tutti in pari! Nessun rimborso necessario.":"I rimborsi appariranno qui dopo la prima spesa."));return}
  for(const t of transfers){
    const from=room.users.find(u=>u.id===t.from)?.name||"?",to=room.users.find(u=>u.id===t.to)?.name||"?";
    const row=text("div","balance-item",""),avatars=text("div","balance-avatars","");
    avatars.append(avatar(from),avatar(to));
    const detail=text("div","balance-detail","");
    const label=text("div","balance-text","");
    label.append(text("strong","balance-from",from),text("span","balance-direction","deve a"),text("strong","balance-to",to));
    detail.append(label,text("span","balance-helper","Rimborso da effettuare"));
    row.append(avatars,detail,text("strong","balance-amount",euro(t.amountCents)));wrap.append(row);
  }
}
function renderExpenses(room,expenses){
  const list=$("expensesList"),query=$("expenseSearch").value.trim().toLocaleLowerCase("it");
  const filtered=filterExpensesByCategory(expenses,activeCategoryId);
  const shown=filtered.filter(e=>!query||String(e.note||"").toLocaleLowerCase("it").includes(query)||
    (room.users.find(u=>u.id===e.payerId)?.name||"").toLocaleLowerCase("it").includes(query)||
    categoryInfo(e.category).label.toLocaleLowerCase("it").includes(query));
  const isFiltered=activeCategoryId!==null||Boolean(query);
  $("expenseFooterLabel").textContent=isFiltered?"Totale delle spese filtrate":"Totale di tutte le spese";
  $("expenseFooterTotal").textContent=euro(totalSpentCents(shown));
  const filterBox=$("activeCategoryFilter");
  filterBox.hidden=activeCategoryId===null;
  if(activeCategoryId!==null){
    const group=categoryBreakdown(expenses).rows.find(item=>item.id===activeCategoryId);
    $("activeCategoryName").textContent=group?.label||categoryInfo(activeCategoryId).label;
  }
  list.replaceChildren();
  if(!shown.length){list.append(text("div","empty-box",isFiltered?"Nessuna spesa corrisponde ai filtri. Modifica la ricerca o rimuovi il filtro.":"Ancora nessuna spesa. Aggiungine una per iniziare."));return}
  for(const e of shown){
    const row=text("div","expense-row",""),cat=categoryInfo(e.category);
    const iconClass=CATEGORIES.some(c=>c.id===cat.id)?cat.id:"other";
    const pict=text("div","expense-icon "+iconClass,cat.icon);
    const main=text("div","expense-main",""),payer=room.users.find(u=>u.id===e.payerId)?.name||"Sconosciuto";
    const shared=(e.participantIds||[]).map(id=>room.users.find(u=>u.id===id)?.name||"?").join(", ");
    main.append(text("div","expense-title",e.note),text("div","expense-meta",payer+" ha pagato · Per: "+shared));
    const actions=text("div","expense-category-actions","");
    const chip=text("button","category-chip"+(!e.category?" none":"")+(activeCategoryId===cat.id?" selected":""),"");
    chip.type="button";chip.title="Filtra per "+cat.label;chip.setAttribute("aria-label","Mostra le spese della categoria "+cat.label);
    chip.setAttribute("aria-pressed",String(activeCategoryId===cat.id));
    chip.append(text("span","",cat.icon+" "+cat.label));
    chip.addEventListener("click",()=>setCategoryFilter(cat.id));
    const edit=text("button","category-edit","✎");
    edit.type="button";edit.title="Modifica categoria";edit.setAttribute("aria-label","Modifica la categoria della spesa "+e.note);
    edit.addEventListener("click",()=>openCategoryEditor(e.id));
    actions.append(chip,edit);main.append(actions);
    const amount=text("div","expense-amount","");amount.append(text("strong","",euro(e.amountCents)),text("small","","Spesa"));
    const del=text("button","expense-delete","×");del.type="button";del.title="Elimina questa spesa";del.setAttribute("aria-label","Elimina spesa "+e.note);del.addEventListener("click",()=>deleteExpense(e.id));
    row.append(pict,main,amount,del);list.append(row);
  }
}
function initCategoryOptions(){
  for(const select of [$("category"),$("editCategorySelect")]){
    for(const item of CATEGORIES)select.add(new Option(item.icon+" "+item.label,item.id));
    select.add(new Option("✎ Categoria personalizzata…","custom"));
  }
}
function toggleCustomCategory(select,input){
  input.hidden=select.value!=="custom";
  if(input.hidden)input.value="";
}
function openCategoryEditor(id){
  const expense=currentRoom()?.expenses?.find(e=>e.id===id);
  if(!expense)return;
  editingExpenseId=id;
  $("categoryDialogDescription").textContent=expense.note+" · "+euro(expense.amountCents);
  const current=expense.category||"";
  const choice=CATEGORIES.some(c=>c.id===current)?current:(current?"custom":"");
  $("editCategorySelect").value=choice;
  $("editCategoryCustom").hidden=choice!=="custom";
  $("editCategoryCustom").value=choice==="custom"?categoryInfo(current).label:"";
  $("categoryDialog").showModal();
}
function saveEditedCategory(event){
  event.preventDefault();
  const room=currentRoom(),expense=room?.expenses?.find(e=>e.id===editingExpenseId);
  if(!expense)return;
  const previous=expense.category;
  expense.category=selectedCategory($("editCategorySelect").value,$("editCategoryCustom").value);
  if(!save()){expense.category=previous;return}
  $("categoryDialog").close();editingExpenseId=null;
  clearStaleFilter(room.expenses);
  renderCategoryTable(room.expenses);
  renderExpenses(room,room.expenses);
  notify("Categoria aggiornata.");
}
function setup(){
  initCategoryOptions();
  $("category").addEventListener("change",()=>toggleCustomCategory($("category"),$("customCategory")));
  $("editCategorySelect").addEventListener("change",()=>toggleCustomCategory($("editCategorySelect"),$("editCategoryCustom")));
  $("editCategoryForm").addEventListener("submit",saveEditedCategory);
  $("cancelCategory").addEventListener("click",()=>$("categoryDialog").close());
  $("categoryDialog").addEventListener("close",()=>{editingExpenseId=null});
  const count=$("userCount");for(let n=2;n<=10;n++)count.add(new Option(n+" persone",String(n)));renderNameInputs();
  count.addEventListener("change",renderNameInputs);
  $("createForm").addEventListener("submit",createRoom);
  $("joinForm").addEventListener("submit",joinRoom);
  $("expenseForm").addEventListener("submit",createExpense);
  $("expenseSearch").addEventListener("input",()=>{const room=currentRoom();if(room)renderExpenses(room,room.expenses||[])});
  $("clearCategoryFilter").addEventListener("click",()=>{activeCategoryId=null;const room=currentRoom();if(room){renderCategoryTable(room.expenses||[]);renderExpenses(room,room.expenses||[])}});
  $("selectAll").addEventListener("click",()=>$("participantsWrap").querySelectorAll("input").forEach(x=>x.checked=true));
  $("selectNone").addEventListener("click",()=>$("participantsWrap").querySelectorAll("input").forEach(x=>x.checked=false));
  $("backHome").addEventListener("click",goHome);$("deleteRoom").addEventListener("click",deleteRoom);
  $("copyCode").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(currentId);notify("Codice copiato (utilizzabile solo in questo browser).")}catch{notify("Codice: "+currentId)}});
  window.addEventListener("hashchange",()=>{const id=readHash();if(id&&rooms[id]){if(id!==currentId){activeCategoryId=null;$("expenseSearch").value=""}currentId=id;renderRoom()}else if(!id)goHome()});
  window.addEventListener("storage",event=>{if(event.key!==STORAGE_KEY)return;rooms=readRooms();if(currentId&&rooms[currentId])renderRoom();else goHome()});
  const initial=readHash();if(initial&&rooms[initial])openRoom(initial);else renderHome();
}
setup();
