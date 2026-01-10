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

const splitAllRadio = document.getElementById("splitAll");
const splitSomeRadio = document.getElementById("splitSome");
const participantsBox = document.getElementById("participantsBox");
const participantsWrap = document.getElementById("participantsWrap");
const selectAllBtn = document.getElementById("selectAll");
const selectNoneBtn = document.getElementById("selectNone");

const finishBtn = document.getElementById("finishSplit");
const finishResult = document.getElementById("finishResult");

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
  // accetta "20,50" e "20.50"
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

/* ---------------- UI builders ---------------- */
function buildNameInputs() {
  if (!namesWrap) return;
  const n = Number(userCountSelect?.value || 2);

  const existing = Array.from(namesWrap.querySelectorAll("input[data-user-name]")).map((i) => i.value);

  namesWrap.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const input = document.createElement("input");
    input.setAttribute("data-user-name", "1");
    input.placeholder = `Nome utente ${i + 1}`;
    // default carini: primi due
    if (existing[i]) input.value = existing[i];
    else if (i === 0) input.value = "Simon Simon";
    else if (i === 1) input.value = "Lulù";
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
  for (const u of roomUsers) {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = `${u.name} ha pagato`;
    paidBySelect.appendChild(opt);
  }
}

function showHideParticipantsBox() {
  if (!participantsBox) return;
  const show = splitSomeRadio && splitSomeRadio.checked;
  participantsBox.style.display = show ? "block" : "none";
}

/* ---------------- Accounting ---------------- */
function computeNetBalances() {
  // balance > 0 => deve ricevere
  // balance < 0 => deve pagare
  const bal = {};
  for (const u of roomUsers) bal[u.id] = 0;

  for (const e of expenses) {
    const amount = Number(e.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    // Nuovo formato
    let payerId = e.payerId;
    let participants = Array.isArray(e.participantIds) ? e.participantIds.slice() : null;

    // Compatibilità vecchie spese (2 utenti)
    if (!payerId && e.paidBy && roomUsers.length >= 2) {
      payerId = e.paidBy === "SIMON" ? roomUsers[0].id : roomUsers[1].id;
    }
    if (!participants && e.forWhom && roomUsers.length >= 2) {
      if (e.forWhom === "BOTH") participants = roomUsers.map((u) => u.id);
      else if (e.forWhom === "SIMON") participants = [roomUsers[0].id];
      else if (e.forWhom === "LULU") participants = [roomUsers[1].id];
    }

    if (!payerId) continue;
    if (!participants || participants.length === 0) continue;

    const share = amount / participants.length;

    for (const pid of participants) {
      if (!(pid in bal)) bal[pid] = 0;
      bal[pid] -= share;
      if (!(payerId in bal)) bal[payerId] = 0;
      bal[payerId] += share;
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

  // ordinamento: più grandi prima
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
function renderSummaryBalance() {
  if (!saldoDiv) return;
  if (!roomUsers.length) {
    saldoDiv.textContent = "—";
    return;
  }
  if (expenses.length === 0) {
    saldoDiv.textContent = "—";
    return;
  }

  const bal = computeNetBalances();
  const arr = Object.entries(bal).map(([uid, v]) => ({ uid, v }));
  arr.sort((a, b) => b.v - a.v);

  // mostra 3 righe max
  const lines = arr.slice(0, 3).map((x) => {
    const sign = x.v >= 0 ? "+" : "−";
    return `${userName(x.uid)} ${sign}${euro(Math.abs(x.v))}`;
  });

  const more = arr.length > 3 ? ` … (+${arr.length - 3})` : "";
  saldoDiv.textContent = lines.join(" | ") + more;
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
    const payerId = e.payerId || (e.paidBy && roomUsers.length >= 2 ? (e.paidBy === "SIMON" ? roomUsers[0].id : roomUsers[1].id) : null);
    const participants = Array.isArray(e.participantIds)
      ? e.participantIds
      : (e.forWhom ? (
          e.forWhom === "BOTH" ? roomUsers.map(u => u.id)
          : e.forWhom === "SIMON" ? [roomUsers[0]?.id]
          : e.forWhom === "LULU" ? [roomUsers[1]?.id]
          : []
        ) : []);

    const payerName = payerId ? userName(payerId) : "Qualcuno";
    const note = e.note && e.note.trim() ? ` — ${e.note}` : "";

    let tag = "";
    if (participants && participants.length) {
      if (participants.length === roomUsers.length) tag = " — (tutti)";
      else tag = ` — (tra: ${participants.map(userName).join(", ")})`;
    }

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
  renderSummaryBalance();
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

  if (names.length !== count) {
    alert("Inserisci tutti i nomi.");
    return;
  }
  if (names.some((n) => !n)) {
    alert("Inserisci tutti i nomi (non vuoti).");
    return;
  }

  // ids stabili u1..u10
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
  setStatus("Caricamento stanza…");

  const roomRef = doc(db, "rooms", roomId);

  unsubRoom = onSnapshot(
    roomRef,
    async (snap) => {
      if (!snap.exists()) {
        // stanza legacy? (prima versione non aveva users)
        setStatus("Stanza non valida o mancante.");
        alert("Stanza non trovata o non valida.");
        leaveRoom();
        return;
      }

      const data = snap.data() || {};
      roomUsers = Array.isArray(data.users) ? data.users : [];

      // Se roomUsers è vuoto, prova una stanza vecchia: fallback 2 utenti
      if (!roomUsers.length) {
        roomUsers = [
          { id: "u1", name: "Simon Simon" },
          { id: "u2", name: "Lulù" },
        ];
      }

      renderPaidByOptions();
      renderParticipantsChecklist();
      showHideParticipantsBox();

      setStatus("");
      render();
    },
    (err) => {
      console.error(err);
      setStatus("Errore lettura stanza.");
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
  finishResult.style.display = "none";
  finishResult.innerHTML = "";
  setStatus("");
  render();
}

/* ---------------- Actions ---------------- */
async function addExpense() {
  if (!roomId) return;
  if (!roomUsers.length) return alert("Nessun utente in stanza.");

  const amount = parseAmount(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Inserisci un importo valido (es. 20 o 20,50)");
    return;
  }

  const payerId = paidBySelect.value;
  if (!payerId) {
    alert("Seleziona chi ha pagato.");
    return;
  }

  let participantIds;
  if (splitAllRadio && splitAllRadio.checked) {
    participantIds = roomUsers.map((u) => u.id);
  } else {
    participantIds = getCheckedParticipants();
  }

  if (!participantIds || participantIds.length === 0) {
    alert("Se scegli 'Seleziona partecipanti', devi selezionarne almeno uno.");
    return;
  }

  await addDoc(collection(db, "rooms", roomId, "expenses"), {
    amount: Math.round(amount * 100) / 100,
    payerId,
    participantIds,
    note: (noteInput.value || "").trim(),
    createdAt: serverTimestamp(),
  });

  amountInput.value = "";
  noteInput.value = "";
  // non tocchiamo splitMode, così rimane comodo
}

function showFinishSplit() {
  if (!roomUsers.length) return;

  const balances = computeNetBalances();
  const transfers = settleDebts(balances);

  finishResult.style.display = "block";

  // Se non ci sono trasferimenti
  if (!transfers.length) {
    finishResult.innerHTML = `<div class="muted">Siete pari. Nessuno deve nulla a nessuno.</div>`;
    return;
  }

  // render lista pagamenti finali
  const lines = transfers.map((t) => {
    return `<div style="padding:8px 0;border-bottom:1px solid #2a2a2a">
      <b>${userName(t.from)}</b> deve a <b>${userName(t.to)}</b>: <b>${euro(t.amount)}</b>
    </div>`;
  }).join("");

  finishResult.innerHTML = `
    <div class="muted" style="margin-bottom:8px">Pagamenti consigliati per chiudere tutto:</div>
    ${lines}
  `;
}

/* ---------------- Events ---------------- */
userCountSelect?.addEventListener("change", buildNameInputs);

splitAllRadio?.addEventListener("change", showHideParticipantsBox);
splitSomeRadio?.addEventListener("change", showHideParticipantsBox);

selectAllBtn?.addEventListener("click", () => setAllParticipants(true));
selectNoneBtn?.addEventListener("click", () => setAllParticipants(false));

createBtn?.addEventListener("click", () => {
  setStatus("Creazione stanza…");
  createRoomFromSetup().catch((e) => {
    console.error(e);
    alert(e?.message || e);
    setStatus("");
  });
});

joinBtn?.addEventListener("click", async () => {
  const id = getRoomFromHashOrText(joinInput.value);
  if (!id) return alert("Incolla un link valido o un codice stanza.");
  setHashRoom(id);

  // controllo veloce esistenza stanza
  setStatus("Entrando…");
  try {
    const snap = await getDoc(doc(db, "rooms", id));
    if (!snap.exists()) {
      alert("Stanza non trovata.");
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

finishBtn?.addEventListener("click", showFinishSplit);

window.addEventListener("hashchange", () => {
  const id = getRoomFromHashOrText();
  if (id) enterRoom(id);
});

/* ---------------- Boot ---------------- */
(function boot() {
  setStatus("Accesso…");
  buildNameInputs();
  showHideParticipantsBox();

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
