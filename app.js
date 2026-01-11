import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDocs,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/* ---------------- Firebase config (tuo) ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyBVD2lVIvsw8H1sKBDK3YPUYR0eB_6eC2Y",
  authDomain: "split-da653.firebaseapp.com",
  projectId: "split-da653",
  storageBucket: "split-da653.firebasestorage.app",
  messagingSenderId: "1024840060250",
  appId: "1:1024840060250:web:bcb7484b1398c741973763",
  measurementId: "G-Y2ZM33C3WT",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------- UI refs ---------------- */
const statusDiv = document.getElementById("status");

const noRoom = document.getElementById("noRoom");
const inRoom = document.getElementById("inRoom");

const splitNameInput = document.getElementById("splitName");
const userCountSelect = document.getElementById("userCount");
const namesWrap = document.getElementById("namesWrap");

const createBtn = document.getElementById("createRoom");
const joinBtn = document.getElementById("joinRoom");
const joinInput = document.getElementById("joinInput");

const splitNameText = document.getElementById("splitNameText");
const deleteSplitBtn = document.getElementById("deleteSplit");

const roomIdText = document.getElementById("roomIdText");
const shareLinkA = document.getElementById("shareLink");
const copyLinkBtn = document.getElementById("copyLink");
const leaveRoomBtn = document.getElementById("leaveRoom");

const saldoDiv = document.getElementById("saldo");

const amountInput = document.getElementById("amount");
const paidBySelect = document.getElementById("paidBy");
const noteInput = document.getElementById("note");
const addExpenseBtn = document.getElementById("addExpense");

// participants UI
const toggleParticipantsBtn = document.getElementById("toggleParticipants");
const participantsBox = document.getElementById("participantsBox");
const participantsWrap = document.getElementById("participantsWrap");
const selectAllBtn = document.getElementById("selectAll");
const selectNoneBtn = document.getElementById("selectNone");

const emptyDiv = document.getElementById("empty");
const list = document.getElementById("list");

const mySplitsList = document.getElementById("mySplitsList");

/* ---------------- State ---------------- */
let roomId = null;
let roomUsers = [];
let expenses = [];

let roomName = "";
let ownerUid = "";

let unsubRoom = null;
let unsubExpenses = null;
let unsubMySplits = null;

let mySplits = []; // [{roomId, name, createdAt}]

/* ---------------- Helpers ---------------- */
function setStatus(msg) {
  if (statusDiv) statusDiv.textContent = msg || "";
}

function euro(n) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function parseAmount(input) {
  const s = String(input ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function roomCode(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function getRoomFromHashOrText(text) {
  const str = (text ?? window.location.hash ?? "").trim();
  const m = str.match(/room=([A-Za-z0-9]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]{6,}$/.test(str)) return str;
  return null;
}

function setHashRoom(id) {
  window.location.hash = `room=${id}`;
}

function cleanupRoomSubs() {
  if (unsubRoom) unsubRoom();
  if (unsubExpenses) unsubExpenses();
  unsubRoom = null;
  unsubExpenses = null;
}

function meUid() {
  return auth.currentUser?.uid || "";
}

/* ---------------- UI helpers ---------------- */
function toggleParticipantsBox(force) {
  if (!participantsBox || !toggleParticipantsBtn) return;
  const show =
    typeof force === "boolean"
      ? force
      : (participantsBox.style.display === "none" || participantsBox.style.display === "");
  participantsBox.style.display = show ? "block" : "none";
  toggleParticipantsBtn.textContent = show ? "Nascondi partecipanti" : "Seleziona partecipanti";
}

function buildNameInputs() {
  if (!namesWrap || !userCountSelect) return;
  const n = Number(userCountSelect.value || 2);

  const existing = Array.from(namesWrap.querySelectorAll("input[data-user-name]")).map(i => i.value);

  namesWrap.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const input = document.createElement("input");
    input.className = "field";
    input.setAttribute("data-user-name", "1");
    input.placeholder = `Nome utente ${i + 1}`;
    input.autocomplete = "off";
    if (existing[i]) input.value = existing[i];
    namesWrap.appendChild(input);
  }
}

function renderParticipantsChecklist() {
  if (!participantsWrap) return;

  if (!roomUsers.length) {
    participantsWrap.innerHTML = `<div class="muted">Nessun utente.</div>`;
    return;
  }

  participantsWrap.innerHTML = "";
  for (const u of roomUsers) {
    const label = document.createElement("label");
    label.className = "check";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = u.id;
    cb.setAttribute("data-participant", "1");

    const span = document.createElement("span");
    span.textContent = u.name;

    label.appendChild(cb);
    label.appendChild(span);
    participantsWrap.appendChild(label);
  }
}

function getCheckedParticipants() {
  if (!participantsWrap) return [];
  const cbs = Array.from(participantsWrap.querySelectorAll("input[data-participant]"));
  return cbs.filter(c => c.checked).map(c => c.value);
}

function setAllParticipants(checked) {
  if (!participantsWrap) return;
  const cbs = Array.from(participantsWrap.querySelectorAll("input[data-participant]"));
  cbs.forEach(c => (c.checked = checked));
}

function renderPaidByOptions() {
  if (!paidBySelect) return;

  paidBySelect.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Chi ha pagato?";
  ph.disabled = true;
  ph.selected = true;
  paidBySelect.appendChild(ph);

  for (const u of roomUsers) {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.name;
    paidBySelect.appendChild(opt);
  }

  paidBySelect.classList.add("is-placeholder");
}

function isOwner() {
  const uid = meUid();
  return !!uid && !!ownerUid && uid === ownerUid;
}

function userName(id) {
  return roomUsers.find(u => u.id === id)?.name || id;
}

/* ---------------- Accounting ---------------- */
function computeNetBalances() {
  const bal = {};
  for (const u of roomUsers) bal[u.id] = 0;

  for (const e of expenses) {
    const amount = Number(e.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const payerId = e.payerId;
    const participants = Array.isArray(e.participantIds) ? e.participantIds.slice() : [];
    if (!payerId || !participants.length) continue;

    const share = amount / participants.length;
    for (const pid of participants) {
      bal[pid] = (bal[pid] ?? 0) - share;
      bal[payerId] = (bal[payerId] ?? 0) + share;
    }
  }
  return bal;
}

function settleDebts(balances, epsilon = 0.005) {
  const creditors = [];
  const debtors = [];

  for (const [uid, v] of Object.entries(balances)) {
    if (v > epsilon) creditors.push({ uid, amt: v });
    else if (v < -epsilon) debtors.push({ uid, amt: -v });
  }

  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const transfers = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const pay = Math.min(d.amt, c.amt);

    if (pay > epsilon) {
      transfers.push({ from: d.uid, to: c.uid, amount: pay });
      d.amt -= pay;
      c.amt -= pay;
    }
    if (d.amt <= epsilon) i++;
    if (c.amt <= epsilon) j++;
  }
  return transfers;
}

/* ---------------- Rendering ---------------- */
function renderShareLink() {
  if (!roomIdText || !shareLinkA) return;
  roomIdText.textContent = roomId;
  const link = `${window.location.origin}${window.location.pathname}#room=${roomId}`;
  shareLinkA.href = link;
  shareLinkA.textContent = link;
}

function renderRoomHeader() {
  if (splitNameText) splitNameText.textContent = roomName || "—";
  if (deleteSplitBtn) deleteSplitBtn.style.display = isOwner() ? "block" : "none";
}

function renderSaldo() {
  if (!saldoDiv) return;

  if (!roomUsers.length) {
    saldoDiv.textContent = "—";
    return;
  }
  if (!expenses.length) {
    saldoDiv.innerHTML = `<div class="muted">Nessuna spesa.</div>`;
    return;
  }

  const transfers = settleDebts(computeNetBalances());
  if (!transfers.length) {
    saldoDiv.innerHTML = `<div class="muted">Siete pari. Nessuno deve nulla a nessuno.</div>`;
    return;
  }

  const lines = transfers.map(t => `
    <div style="padding:8px 0;border-bottom:1px solid #2a2a2a">
      <b>${userName(t.from)}</b>
      <span style="color:#ff5c5c;font-weight:900">deve a</span>
      <b>${userName(t.to)}</b>: <b>${euro(t.amount)}</b>
    </div>
  `).join("");

  saldoDiv.innerHTML = `<div class="muted" style="margin-bottom:8px">Pagamenti consigliati:</div>${lines}`;
}

function renderExpensesList() {
  if (!list || !emptyDiv) return;
  list.innerHTML = "";

  if (!expenses.length) {
    emptyDiv.style.display = "block";
    return;
  }
  emptyDiv.style.display = "none";

  for (const e of expenses) {
    const amount = Number(e.amount || 0);
    const payer = e.payerId ? userName(e.payerId) : "Qualcuno";
    const participants = Array.isArray(e.participantIds) ? e.participantIds : [];
    
    const note = (e.note || "").trim() ? ` — <span style="color: #ff5c5c; font-weight: 900;">${e.note}</span>` : "";
    /*  const note = (e.note || "").trim() ? ` — ${e.note}` : ""; */
    const tag = ` (Per: ${participants.map(userName).join(", ")})`;

    const li = document.createElement("li");
    li.textContent = `${payer} ha pagato ${euro(amount)}${tag}${note}`;
    li.title = "Clicca per eliminare questa spesa";

    li.addEventListener("click", async () => {
      if (!confirm("Eliminare questa spesa?")) return;
      try {
        await deleteDoc(doc(db, "rooms", roomId, "expenses", e.id));
      } catch (err) {
        alert("Errore eliminazione: " + (err?.message || err));
      }
    });

    list.appendChild(li);
  }
}

function renderMySplits() {
  if (!mySplitsList) return;

  if (!mySplits.length) {
    mySplitsList.innerHTML = `<div class="muted">Nessuno $plit creato ancora.</div>`;
    return;
  }

  mySplitsList.innerHTML = "";
  for (const s of mySplits) {
    const row = document.createElement("div");
    row.className = "splitItem";

    const meta = document.createElement("div");
    meta.className = "meta";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = s.name || "(senza nome)";

    const code = document.createElement("div");
    code.className = "code";
    code.textContent = `codice: ${s.roomId}`;

    meta.appendChild(title);
    meta.appendChild(code);

    const actions = document.createElement("div");
    actions.className = "actions";

    const openBtn = document.createElement("button");
    openBtn.textContent = "Apri";
    openBtn.addEventListener("click", () => {
      setHashRoom(s.roomId);
      enterRoom(s.roomId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const delBtn = document.createElement("button");
    delBtn.textContent = "Elimina";
    delBtn.className = "danger";
    delBtn.addEventListener("click", async () => {
      if (!confirm(`Eliminare lo $plit “${s.name || s.roomId}”?`)) return;
      await deleteSplitById(s.roomId);
    });

    actions.appendChild(openBtn);
    actions.appendChild(delBtn);

    row.appendChild(meta);
    row.appendChild(actions);

    mySplitsList.appendChild(row);
  }
}

function renderPage() {
  if (!roomId) {
    noRoom.style.display = "block";
    inRoom.style.display = "none";
    renderMySplits(); // IMPORTANT: lista in prima pagina
    return;
  }
  noRoom.style.display = "none";
  inRoom.style.display = "block";

  renderShareLink();
  renderRoomHeader();
  renderSaldo();
  renderExpensesList();
}

/* ---------------- MySplits subscription ---------------- */
function subscribeMySplits() {
  if (unsubMySplits) unsubMySplits();
  const uid = meUid();
  if (!uid) return;

  const q = query(collection(db, "users", uid, "splits"), orderBy("createdAt", "desc"));
  unsubMySplits = onSnapshot(
    q,
    (snap) => {
      mySplits = snap.docs.map(d => ({ roomId: d.id, ...(d.data() || {}) }));
      renderMySplits();
    },
    (err) => {
      console.error(err);
    }
  );
}

/* ---------------- Auth / Boot ---------------- */
async function ensureAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
}

/* ---------------- Room flow ---------------- */
async function createRoomFromSetup() {
  const uid = meUid();
  if (!uid) throw new Error("Non autenticato");

  const splitName = (splitNameInput?.value || "").trim();
  if (!splitName) {
    alert("Inserisci il nome $plit (obbligatorio).");
    return;
  }

  const count = Number(userCountSelect?.value || 2);
  const inputs = Array.from(namesWrap.querySelectorAll("input[data-user-name]"));
  const names = inputs.map(i => (i.value || "").trim()).slice(0, count);

  if (names.length !== count || names.some(n => !n)) {
    alert("Inserisci tutti i nomi (non vuoti).");
    return;
  }

  const users = names.map((name, idx) => ({ id: `u${idx + 1}`, name }));

  const id = roomCode();

  // room
  await setDoc(doc(db, "rooms", id), {
    name: splitName,
    ownerUid: uid,
    users,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // indice "I miei split"
  await setDoc(doc(db, "users", uid, "splits", id), {
    name: splitName,
    createdAt: serverTimestamp(),
  });

  setHashRoom(id);
  enterRoom(id);
}

async function enterRoom(id) {
  cleanupRoomSubs();
  roomId = id;
  setStatus("Caricamento $plit…");

  const roomRef = doc(db, "rooms", roomId);

  unsubRoom = onSnapshot(
    roomRef,
    (snap) => {
      if (!snap.exists()) {
        setStatus("$plit non trovato.");
        alert("$plit non trovato.");
        leaveRoom();
        return;
      }

      const data = snap.data() || {};
      roomUsers = Array.isArray(data.users) ? data.users : [];
      roomName = data.name || "";
      ownerUid = data.ownerUid || "";

      renderPaidByOptions();
      renderParticipantsChecklist();

      setStatus("");
      renderPage();
    },
    (err) => {
      console.error(err);
      setStatus("Errore lettura $plit.");
      renderPage();
    }
  );

  const q = query(collection(db, "rooms", roomId, "expenses"), orderBy("createdAt", "desc"));
  unsubExpenses = onSnapshot(
    q,
    (snap) => {
      expenses = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      renderPage();
    },
    (err) => {
      console.error(err);
      setStatus("Errore lettura spese.");
      renderPage();
    }
  );

  renderPage();
}

function leaveRoom() {
  cleanupRoomSubs();
  roomId = null;
  roomUsers = [];
  expenses = [];
  roomName = "";
  ownerUid = "";
  window.location.hash = "";
  setStatus("");
  renderPage();
}

/* ---------------- Delete Split ---------------- */
async function deleteSplitById(id) {
  const uid = meUid();
  if (!uid) return alert("Non autenticato.");

  const roomSnap = await getDoc(doc(db, "rooms", id));
  if (!roomSnap.exists()) {
    try { await deleteDoc(doc(db, "users", uid, "splits", id)); } catch {}
    return;
  }

  const data = roomSnap.data() || {};
  const owner = data.ownerUid || "";
  if (owner && owner !== uid) {
    alert("Solo chi ha creato lo $plit può eliminarlo.");
    return;
  }

  setStatus("Eliminazione $plit…");

  // elimina spese
  try {
    const exSnap = await getDocs(collection(db, "rooms", id, "expenses"));
    for (const d of exSnap.docs) {
      await deleteDoc(doc(db, "rooms", id, "expenses", d.id));
    }
  } catch (e) {
    console.warn("Non riesco a cancellare tutte le spese:", e);
  }

  // elimina room
  try {
    await deleteDoc(doc(db, "rooms", id));
  } catch (e) {
    setStatus("");
    alert("Errore eliminazione $plit: " + (e?.message || e));
    return;
  }

  // elimina indice
  try { await deleteDoc(doc(db, "users", uid, "splits", id)); } catch {}

  setStatus("");

  // se eri dentro quello split
  if (roomId === id) leaveRoom();
}

/* ---------------- Add Expense ---------------- */
async function addExpense() {
  if (!roomId) return;

  const amount = parseAmount(amountInput?.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Inserisci un importo valido.");
    return;
  }

  const note = (noteInput?.value || "").trim();
  if (!note) {
    alert("Inserisci la causale (obbligatoria).");
    return;
  }

  const payerId = paidBySelect?.value;
  if (!payerId) {
    alert("Seleziona chi ha pagato.");
    return;
  }

  const participantIds = getCheckedParticipants();
  if (!participantIds.length) {
    alert("Seleziona almeno un partecipante.");
    return;
  }

  await addDoc(collection(db, "rooms", roomId, "expenses"), {
    amount: Math.round(amount * 100) / 100,
    payerId,
    participantIds,
    note,
    createdAt: serverTimestamp(),
    createdBy: meUid(),
  });

  // reset + chiudi imputata a
  if (amountInput) amountInput.value = "";
  if (noteInput) noteInput.value = "";
  setAllParticipants(false);

  renderPaidByOptions();
  toggleParticipantsBox(false);
}

/* ---------------- Events ---------------- */
userCountSelect?.addEventListener("change", buildNameInputs);

paidBySelect?.addEventListener("change", () => {
  if (paidBySelect.value) paidBySelect.classList.remove("is-placeholder");
});

toggleParticipantsBtn?.addEventListener("click", () => toggleParticipantsBox());

selectAllBtn?.addEventListener("click", () => setAllParticipants(true));
selectNoneBtn?.addEventListener("click", () => setAllParticipants(false));

createBtn?.addEventListener("click", () => {
  setStatus("Creazione $plit…");
  createRoomFromSetup().catch((e) => {
    console.error(e);
    alert(e?.message || e);
    setStatus("");
  });
});

joinBtn?.addEventListener("click", async () => {
  const id = getRoomFromHashOrText(joinInput?.value);
  if (!id) return alert("Incolla un link valido o un codice $plit.");

  setHashRoom(id);
  setStatus("Entrando…");

  try {
    const snap = await getDoc(doc(db, "rooms", id));
    if (!snap.exists()) {
      alert("$plit non trovato.");
      setStatus("");
      return;
    }
    enterRoom(id);
  } catch (e) {
    console.error(e);
    alert(e?.message || e);
    setStatus("");
  }
});

copyLinkBtn?.addEventListener("click", async () => {
  const link = shareLinkA?.href || "";
  if (!link) return;

  try {
    await navigator.clipboard.writeText(link);
    alert("Link copiato ✅");
  } catch {
    prompt("Copia questo link:", link);
  }
});

leaveRoomBtn?.addEventListener("click", leaveRoom);

deleteSplitBtn?.addEventListener("click", async () => {
  if (!roomId) return;
  if (!isOwner()) return alert("Solo chi ha creato lo $plit può eliminarlo.");
  if (!confirm(`Eliminare lo $plit “${roomName || roomId}”?`)) return;
  await deleteSplitById(roomId);
});

addExpenseBtn?.addEventListener("click", () => {
  addExpense().catch((e) => {
    console.error(e);
    alert(e?.message || e);
  });
});

window.addEventListener("hashchange", () => {
  const id = getRoomFromHashOrText();
  if (id) enterRoom(id);
});

/* ---------------- Boot ---------------- */
(function boot() {
  setStatus("Accesso…");
  buildNameInputs();
  toggleParticipantsBox(false);

  ensureAuth()
    .then(() => {
      subscribeMySplits();

      const fromHash = getRoomFromHashOrText();
      if (fromHash) enterRoom(fromHash);

      setStatus("");
      renderPage();
    })
    .catch((e) => {
      console.error(e);
      alert("Errore avvio app: " + (e?.message || e));
      setStatus("Errore avvio app.");
      renderPage();
    });
})();
