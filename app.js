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

const userCountSelect = document.getElementById("userCount");
const namesWrap = document.getElementById("namesWrap");

const createBtn = document.getElementById("createRoom");
const joinBtn = document.getElementById("joinRoom");
const joinInput = document.getElementById("joinInput");

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

/* ---------------- State ---------------- */
let roomId = null;
let roomUsers = []; // [{id,name}]
let expenses = [];

let unsubRoom = null;
let unsubExpenses = null;

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

function cleanupSubs() {
  if (unsubRoom) unsubRoom();
  if (unsubExpenses) unsubExpenses();
  unsubRoom = null;
  unsubExpenses = null;
}

/* ---------------- UI helpers ---------------- */
function toggleParticipantsBox(force) {
  if (!participantsBox) return;
  const show =
    typeof force === "boolean"
      ? force
      : (participantsBox.style.display === "none" || participantsBox.style.display === "");
  participantsBox.style.display = show ? "block" : "none";
  if (toggleParticipantsBtn) {
    toggleParticipantsBtn.textContent = show ? "Nascondi partecipanti" : "Seleziona partecipanti";
  }
}

function buildNameInputs() {
  if (!namesWrap) return;

  const n = Number(userCountSelect?.value || 2);
  const existing = Array.from(namesWrap.querySelectorAll("input[data-user-name]")).map((i) => i.value);

  namesWrap.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const input = document.createElement("input");
    input.setAttribute("data-user-name", "1");
    input.placeholder = `Nome utente ${i + 1}`;
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
  const cbs = Array.from(participantsWrap.querySelectorAll("input[data-participant]"));
  return cbs.filter((c) => c.checked).map((c) => c.value);
}

function setAllParticipants(checked) {
  const cbs = Array.from(participantsWrap.querySelectorAll("input[data-participant]"));
  cbs.forEach((c) => (c.checked = checked));
}

function renderPaidByOptions() {
  paidBySelect.innerHTML = "";

  // placeholder “Chi ha pagato?” (grigio via class CSS is-placeholder)
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

/* ---------------- Accounting ---------------- */
function computeNetBalances() {
  const bal = {};
  for (const u of roomUsers) bal[u.id] = 0;

  for (const e of expenses) {
    const amount = Number(e.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const payerId = e.payerId;
    const participants = Array.isArray(e.participantIds) ? e.participantIds.slice() : [];

    if (!payerId) continue;
    if (!participants.length) continue;

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

function userName(id) {
  return roomUsers.find((u) => u.id === id)?.name || id;
}

/* ---------------- Rendering ---------------- */
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

  const lines = transfers.map((t) => {
    return `<div style="padding:8px 0;border-bottom:1px solid #2a2a2a">
      <b>${userName(t.from)}</b> <span style="color:#ff5c5c;font-weight:900">deve a</span> <b>${userName(t.to)}</b>: <b>${euro(t.amount)}</b>
    </div>`;
  }).join("");

  saldoDiv.innerHTML = `
    <div class="muted" style="margin-bottom:8px">Pagamenti consigliati:</div>
    ${lines}
  `;
}

function renderExpensesList() {
  list.innerHTML = "";

  if (expenses.length === 0) {
    emptyDiv.style.display = "block";
    return;
  }
  emptyDiv.style.display = "none";

  for (const e of expenses) {
    const amount = Number(e.amount || 0);
    const payerName = e.payerId ? userName(e.payerId) : "Qualcuno";
    const participants = Array.isArray(e.participantIds) ? e.participantIds : [];
    const note = e.note && e.note.trim() ? ` — ${e.note}` : "";

    const tag = ` — (tra: ${participants.map(userName).join(", ")})`;

    const li = document.createElement("li");
    li.textContent = `${payerName} ha pagato ${euro(amount)}${tag}${note}`;
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

function renderShareLink() {
  roomIdText.textContent = roomId;
  const link = `${window.location.origin}${window.location.pathname}#room=${roomId}`;
  shareLinkA.href = link;
  shareLinkA.textContent = link;
}

function render() {
  if (!roomId) {
    noRoom.style.display = "block";
    inRoom.style.display = "none";
    return;
  }
  noRoom.style.display = "none";
  inRoom.style.display = "block";

  renderShareLink();
  renderSaldo();
  renderExpensesList();
}

/* ---------------- Room flow ---------------- */
async function ensureAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
}

async function createRoomFromSetup() {
  const count = Number(userCountSelect?.value || 2);
  const inputs = Array.from(namesWrap.querySelectorAll("input[data-user-name]"));
  const names = inputs.map((i) => (i.value || "").trim()).slice(0, count);

  if (names.length !== count || names.some((n) => !n)) {
    alert("Inserisci tutti i nomi (non vuoti).");
    return;
  }

  const users = names.map((name, idx) => ({ id: `u${idx + 1}`, name }));

  const id = roomCode();
  await setDoc(doc(db, "rooms", id), {
    users,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  setHashRoom(id);
  enterRoom(id);
}

async function enterRoom(id) {
  cleanupSubs();
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

      if (!roomUsers.length) {
        roomUsers = [
          { id: "u1", name: "Utente 1" },
          { id: "u2", name: "Utente 2" },
        ];
      }

      renderPaidByOptions();
      renderParticipantsChecklist();

      setStatus("");
      render();
    },
    (err) => {
      console.error(err);
      setStatus("Errore lettura $plit.");
      render();
    }
  );

  const q = query(collection(db, "rooms", roomId, "expenses"), orderBy("createdAt", "desc"));
  unsubExpenses = onSnapshot(
    q,
    (snap) => {
      expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => {
      console.error(err);
      setStatus("Errore lettura spese.");
      render();
    }
  );

  render();
}

function leaveRoom() {
  cleanupSubs();
  roomId = null;
  roomUsers = [];
  expenses = [];
  window.location.hash = "";
  setStatus("");
  render();
}

/* ---------------- Actions ---------------- */
async function addExpense() {
  if (!roomId) return;
  if (!roomUsers.length) return alert("Nessun utente nel $plit.");

  const amount = parseAmount(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Inserisci un importo valido.");
    return;
  }

  const note = (noteInput.value || "").trim();
  if (!note) {
    alert("Inserisci la causale (obbligatoria).");
    return;
  }

  const payerId = paidBySelect.value;
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
    createdAt: serverTimestamp,
  });

  // Reset + chiudi box
  amountInput.value = "";
  noteInput.value = "";
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
  const id = getRoomFromHashOrText(joinInput.value);
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
  const link = shareLinkA.href;
  try {
    await navigator.clipboard.writeText(link);
    alert("Link copiato ✅");
  } catch {
    prompt("Copia questo link:", link);
  }
});

leaveRoomBtn?.addEventListener("click", leaveRoom);

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
      const fromHash = getRoomFromHashOrText();
      if (fromHash) enterRoom(fromHash);
      setStatus("");
      render();
    })
    .catch((e) => {
      console.error(e);
      alert("Errore avvio app: " + (e?.message || e));
      setStatus("Errore avvio app.");
      render();
    });
})();
