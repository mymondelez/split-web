import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBVD2lVIvsw8H1sKBDK3YPUYR0eB_6eC2Y",
  authDomain: "split-da653.firebaseapp.com",
  projectId: "split-da653",
  storageBucket: "split-da653.firebasestorage.app",
  messagingSenderId: "1024840060250",
  appId: "1:1024840060250:web:bcb7484b1398c741973763",
  measurementId: "G-Y2ZM33C3WT",
};

const USER_SIMON = "Simon Simon";
const USER_LULU = "Lulù";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// UI
const noRoom = document.getElementById("noRoom");
const inRoom = document.getElementById("inRoom");

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
const forWhomSelect = document.getElementById("forWhom");

const noteInput = document.getElementById("note");
const addExpenseBtn = document.getElementById("addExpense");

const emptyDiv = document.getElementById("empty");
const list = document.getElementById("list");

let roomId = null;
let unsubExpenses = null;
let expenses = [];

function euro(n) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
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

function computeBalance() {
  // positivo => Lulù deve a Simon
  // negativo => Simon deve a Lulù
  let b = 0;

  for (const e of expenses) {
    const amount = e.amount || 0;
    const paidBy = e.paidBy; // SIMON / LULU
    const forWhom = e.forWhom || "BOTH"; // compatibilità con spese vecchie

    if (forWhom === "BOTH") {
      const half = amount / 2;
      if (paidBy === "SIMON") b += half;
      else b -= half;
    } else if (forWhom === "SIMON") {
      // spesa solo di Simon
      if (paidBy === "LULU") b -= amount; // Simon deve a Lulù
    } else if (forWhom === "LULU") {
      // spesa solo di Lulù
      if (paidBy === "SIMON") b += amount; // Lulù deve a Simon
    }
  }

  return b;
}


function render() {
  if (!roomId) {
    noRoom.style.display = "block";
    inRoom.style.display = "none";
    return;
  }
  noRoom.style.display = "none";
  inRoom.style.display = "block";

  roomIdText.textContent = roomId;

  const link = `${window.location.origin}${window.location.pathname}#room=${roomId}`;
  shareLinkA.href = link;
  shareLinkA.textContent = link;

  const bal = computeBalance();
  if (expenses.length === 0) {
    saldoDiv.textContent = "—";
  } else if (Math.abs(bal) < 0.005) {
    saldoDiv.textContent = "Siete pari";
  } else if (bal > 0) {
    saldoDiv.textContent = `${USER_LULU} deve a ${USER_SIMON}: ${euro(bal)}`;
  } else {
    saldoDiv.textContent = `${USER_SIMON} deve a ${USER_LULU}: ${euro(Math.abs(bal))}`;
  }

  list.innerHTML = "";
  if (expenses.length === 0) {
    emptyDiv.style.display = "block";
    return;
  }
  emptyDiv.style.display = "none";

  for (const e of expenses) {
const who = e.paidBy === "SIMON" ? USER_SIMON : USER_LULU;
const note = e.note && e.note.trim() ? ` — ${e.note}` : "";
const forWhom = e.forWhom || "BOTH";
const tag =
  forWhom === "BOTH" ? " — (50/50)" :
  forWhom === "SIMON" ? ` — (solo ${USER_SIMON})` :
  ` — (solo ${USER_LULU})`;

const li = document.createElement("li");
li.textContent = `${who} ha pagato ${euro(e.amount || 0)}${tag}${note}`;

    li.title = "Clicca per eliminare questa spesa";
    li.style.cursor = "pointer";
    li.addEventListener("click", async () => {
      if (!confirm("Eliminare questa spesa?")) return;
      await deleteDoc(doc(db, "rooms", roomId, "expenses", e.id));
    });
    list.appendChild(li);
  }
}

async function ensureAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
}

async function createRoom() {
  const id = roomCode();
  await setDoc(doc(db, "rooms", id), { createdAt: serverTimestamp() });
  setHashRoom(id);
  enterRoom(id);
}

function enterRoom(id) {
  roomId = id;

  if (unsubExpenses) unsubExpenses();
  expenses = [];

  const q = query(
    collection(db, "rooms", roomId, "expenses"),
    orderBy("createdAt", "desc")
  );

  unsubExpenses = onSnapshot(q, (snap) => {
    expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });

  render();
}

function leaveRoom() {
  if (unsubExpenses) unsubExpenses();
  unsubExpenses = null;
  expenses = [];
  roomId = null;
  window.location.hash = "";
  render();
}

async function joinRoom(id) {
  setHashRoom(id);
  enterRoom(id);
}

async function addExpense() {
  if (!roomId) return;

  const n = Number(amountInput.value);
  if (!Number.isFinite(n) || n <= 0) {
    alert("Inserisci un importo valido (es. 12.50)");
    return;
  }

await addDoc(collection(db, "rooms", roomId, "expenses"), {
  amount: Math.round(n * 100) / 100,
  paidBy: paidBySelect.value,
  forWhom: forWhomSelect.value, // ✅ nuovo
  note: noteInput.value.trim(),
  createdAt: serverTimestamp(),
});


copyLinkBtn.addEventListener("click", async () => {
  const link = shareLinkA.href;
  try {
    await navigator.clipboard.writeText(link);
    alert("Link copiato ✅");
  } catch {
    prompt("Copia questo link:", link);
  }
});

leaveRoomBtn.addEventListener("click", leaveRoom);

createBtn.addEventListener("click", () =>
  createRoom().catch((e) => alert(e.message))
);

joinBtn.addEventListener("click", () => {
  const id = getRoomFromHashOrText(joinInput.value);
  if (!id) return alert("Incolla un link valido o un codice stanza.");
  joinRoom(id).catch((e) => alert(e.message));
});

addExpenseBtn.addEventListener("click", () =>
  addExpense().catch((e) => alert(e.message))
);

// Boot
await ensureAuth();

const fromHash = getRoomFromHashOrText();
if (fromHash) enterRoom(fromHash);

render();
