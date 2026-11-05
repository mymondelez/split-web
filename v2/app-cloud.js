import {parseEuroCents,totalSpentCents,amountPaidByUser,computeBalances,settleDebts} from "./accounting.js?v=2.2";
import {CATEGORIES,categoryInfo,selectedCategory,categoryBreakdown,filterExpensesByCategory} from "./categories.js?v=2.2";
import {connectCloud,isRoomCode} from "./cloud-store.js";
const STORAGE_KEY="split-web-v2-local-rooms-v1";
const $=id=>document.getElementById(id);
const euro=cents=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(cents/100);
const colors=["#24e4ef","#ffe276","#b6a0ff","#7fe4bd","#ff9b85","#62c6ff","#ff8cca","#a7ff62","#dcb1ff","#ffbf61"];
let rooms={},myGroups=[],currentId=null,toastTimer,editingExpenseId=null,activeCategoryId=null;
let store=null,stopGroups=null,stopRoom=null,stopExpenses=null,openingRoom=null,lastUsersSignature="";
const IMPORT_MAP="split-web-v2-imported-rooms-v1";
function localRooms(){try{
  const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
  return data&&typeof data==="object"&&!Array.isArray(data)?data:{};
}catch{return {}}}
function safeError(err){console.error(err);notify("Errore: "+(err?.message||err));}
function stopCurrentRoom(){stopRoom?.();stopExpenses?.();stopRoom=null;stopExpenses=null;}
function cloudReady(){if(!store){notify("Database non ancora connesso. Verifica la connessione.");return false}return true}
function notify(message){const el=$("toast");el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true},4200)}
function text(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value);return el}
function avatar(name){const a=text("div","avatar",name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||"").join("").toUpperCase());a.title=name;return a}
function readHash(){const match=location.hash.match(/^#v2room=([A-HJ-NP-Z2-9]{24})$/i);return match?match[1].toUpperCase():null}
function renderNameInputs(){const count=Number($("userCount").value);const wrap=$("namesWrap");const current=[...wrap.querySelectorAll("input")].map(el=>el.value);wrap.replaceChildren();for(let i=0;i<count;i++){const input=document.createElement("input");input.className="input";input.placeholder="Persona "+(i+1);input.maxLength=40;input.required=true;input.setAttribute("aria-label","Nome persona "+(i+1));input.value=current[i]||"";wrap.append(input)}}
function renderHome(){
  $("homePage").hidden=false;$("roomPage").hidden=true;
  const list=$("mySplitsList");list.replaceChildren();
  const items=[...myGroups].filter(r=>r&&Array.isArray(r.users)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
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
async function openRoom(id){
  if(!cloudReady())return;
  id=String(id||"").toUpperCase();
  if(!isRoomCode(id)){notify("Codice Split non valido.");return}
  if(openingRoom===id)return;
  if(currentId===id&&stopRoom&&stopExpenses)return;
  openingRoom=id;
  try{
    const remote=await store.getRoom(id);
    if(!remote){notify("Gruppo non trovato. Controlla il codice o il link.");return}
    stopCurrentRoom();
    const changed=id!==currentId;
    currentId=id;
    rooms[id]={...remote,expenses:[]};
    if(changed){activeCategoryId=null;$("expenseSearch").value="";lastUsersSignature=""}
    location.hash="v2room="+id;
    renderRoom();
    stopRoom=store.listenRoom(id,data=>{
      if(currentId!==id)return;
      if(!data){notify("Questo gruppo è stato eliminato.");goHome();return}
      rooms[id]={...rooms[id],...data};
      renderRoom();
    },safeError);
    stopExpenses=store.listenExpenses(id,items=>{
      if(currentId!==id)return;
      rooms[id].expenses=items;
      renderRoom();
    },safeError);
    // Index is private to this anonymous account; link owners may share with others.
    if(!myGroups.some(group=>group.id===id))await store.registerGroup(id);
    window.scrollTo({top:0,behavior:"smooth"});
  }catch(err){safeError(err)}finally{openingRoom=null}
}
function goHome(){
  stopCurrentRoom();currentId=null;openingRoom=null;activeCategoryId=null;lastUsersSignature="";
  $("expenseSearch").value="";
  history.replaceState(null,"",location.pathname+location.search);
  renderHome();
}
async function createRoom(event){
  event.preventDefault();
  if(!cloudReady())return;
  const name=$("splitName").value.trim();
  const users=[...$("namesWrap").querySelectorAll("input")].map((e,i)=>({id:"u"+(i+1),name:e.value.trim()}));
  if(!name||users.length<2||users.some(u=>!u.name)){notify("Inserisci il nome del gruppo e i nomi di tutte le persone.");return}
  if(new Set(users.map(u=>u.name.toLocaleLowerCase("it"))).size!==users.length){notify("Usa nomi distinti per ogni partecipante.");return}
  try{
    const id=await store.createRoom(name,users);
    $("createForm").reset();$("userCount").value="2";renderNameInputs();
    await openRoom(id);notify("Gruppo creato e salvato online.");
  }catch(err){safeError(err)}
}
async function joinRoom(event){
  event.preventDefault();if(!cloudReady())return;
  const entered=$("joinInput").value.trim();
  const match=entered.match(/(?:#v2room=|^)([A-HJ-NP-Z2-9]{24})$/i);
  if(!match){notify("Incolla il link di invito o un codice Split V2 valido.");return}
  await openRoom(match[1].toUpperCase());
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
async function createExpense(event){
  event.preventDefault();
  const room=currentRoom();if(!room||!cloudReady())return;
  const amountCents=parseEuroCents($("expenseAmount").value),payerId=$("paidBy").value;
  const note=$("expenseNote").value.trim();
  const participantIds=[...$("participantsWrap").querySelectorAll("input:checked")].map(x=>x.value);
  if(amountCents===null){notify("Importo non valido. Usa al massimo due decimali.");return}
  if(!note){notify("Inserisci una descrizione della spesa.");return}
  if(!room.users.some(u=>u.id===payerId)){notify("Seleziona chi ha pagato.");return}
  if(!participantIds.length){notify("Seleziona almeno un partecipante.");return}
  if(amountCents>1000000000){notify("Importo troppo elevato.");return}
  const data={amountCents,payerId,participantIds,note,
    category:selectedCategory($("category").value,$("customCategory").value)};
  const button=$("expenseForm").querySelector('button[type="submit"]');
  if(button.disabled)return;
  button.disabled=true;
  try{
    await store.addExpense(currentId,data);
    $("expenseForm").reset();$("customCategory").hidden=true;
    activeCategoryId=null;$("expenseSearch").value="";
    buildParticipants(room);notify("Spesa salvata nel database.");
  }catch(err){safeError(err)}finally{button.disabled=false}
}
async function deleteExpense(id){
  const room=currentRoom();if(!room||!cloudReady())return;
  const expense=(room.expenses||[]).find(e=>e.id===id);if(!expense)return;
  if(!confirm('Eliminare la spesa "'+expense.note+'"?'))return;
  try{await store.removeExpense(currentId,id);notify("Spesa eliminata dal database.")}
  catch(err){safeError(err)}
}
async function deleteRoom(){
  const room=currentRoom();if(!room||!cloudReady())return;
  if(room.ownerUid!==store.uid){notify("Solo chi ha creato il gruppo può eliminarlo.");return}
  if(!confirm('Eliminare definitivamente il gruppo "'+room.name+'" e tutte le spese dal database?'))return;
  try{const id=currentId;await store.deleteRoom(id);goHome();notify("Gruppo eliminato dal database.")}
  catch(err){safeError(err)}
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
  const sig=room.id+JSON.stringify(room.users);
  if(sig!==lastUsersSignature){buildParticipants(room);lastUsersSignature=sig}
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
async function saveEditedCategory(event){
  event.preventDefault();if(!cloudReady())return;
  const room=currentRoom(),expense=room?.expenses?.find(e=>e.id===editingExpenseId);
  if(!expense)return;
  const category=selectedCategory($("editCategorySelect").value,$("editCategoryCustom").value);
  try{
    await store.changeCategory(currentId,editingExpenseId,category);
    $("categoryDialog").close();editingExpenseId=null;
    notify("Categoria aggiornata online.");
  }catch(err){safeError(err)}
}
function renderImportOption(){
  const old=localRooms();
  let mapped={};try{mapped=JSON.parse(localStorage.getItem(IMPORT_MAP)||"{}")}catch{}
  const candidates=Object.values(old).filter(r=>r&&r.id&&Array.isArray(r.users)&&!mapped[r.id]);
  const block=$("importLocalWrap"),select=$("localImportSelect");
  block.hidden=!candidates.length;
  select.replaceChildren();
  for(const r of candidates)select.add(new Option(r.name+" ("+(r.expenses||[]).length+" spese)",r.id));
}
async function importGroup(){
  if(!cloudReady())return;
  const sourceId=$("localImportSelect").value,group=localRooms()[sourceId];
  if(!group){notify("Gruppo locale non disponibile.");return}
  if(!confirm("Copiare '"+group.name+"' nel nuovo database online? La copia locale rimarrà invariata."))return;
  $("importLocalButton").disabled=true;
  try{
    const newId=await store.importLocalRoom(group);
    let imported={};try{imported=JSON.parse(localStorage.getItem(IMPORT_MAP)||"{}")}catch{}
    imported[sourceId]=newId;localStorage.setItem(IMPORT_MAP,JSON.stringify(imported));
    renderImportOption();await openRoom(newId);
    notify("Gruppo importato. Ora puoi condividerlo tramite link.");
  }catch(err){safeError(err)}finally{$("importLocalButton").disabled=false}
}
function showConnectionError(err){
  const banner=$("cloudStatus");banner.hidden=false;
  banner.textContent="Impossibile collegarsi al database V2: "+(err?.message||err)+
    " Non creare nuove spese finché la connessione non è attiva.";
}
async function beginCloud(){
  const banner=$("cloudStatus");banner.textContent="Connessione al database Split…";banner.hidden=false;
  try{
    store=await connectCloud();
    stopGroups=store.listenMyGroups(groups=>{
      myGroups=groups;renderHomeListOnly();
      renderImportOption();
    },showConnectionError);
    banner.hidden=true;
    const initial=readHash();
    if(initial)await openRoom(initial);
    else renderHome();
    renderImportOption();
  }catch(err){console.error(err);showConnectionError(err);renderHome()}
}
function renderHomeListOnly(){
  // Preserve current room while a new index entry arrives from another device.
  if(currentId!==null){
    const index=$("mySplitsList");
    if(index){} // home list will be refreshed when user navigates back.
  }else renderHome();
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
  $("copyCode").textContent="↗ Condividi link";
  $("copyCode").addEventListener("click",async()=>{
    if(!currentId)return;
    const link=location.origin+location.pathname+"#v2room="+currentId;
    try{
      if(navigator.share)await navigator.share({title:"Split — invito al gruppo",url:link});
      else{await navigator.clipboard.writeText(link);notify("Link del gruppo copiato!")}
    }catch(err){if(err?.name!=="AbortError")notify("Link del gruppo: "+link)}
  });
  $("importLocalButton").addEventListener("click",importGroup);
  window.addEventListener("hashchange",()=>{const id=readHash();if(id&&id!==currentId)openRoom(id);else if(!id&&currentId)goHome()});
  renderHome();beginCloud();
}
setup();
