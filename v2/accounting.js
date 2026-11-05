/**
 * $plit V2 money logic. All money is represented by integer cents.
 * Reimbursements are NOT expenses and never contribute to total spent.
 */
export function parseEuroCents(value) {
  const s = String(value ?? "").trim().replace(/\s/g, "");
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(s)) return null;
  const [whole, decimals = ""] = s.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
export function totalSpentCents(expenses) {
  return expenses.reduce((sum, e) => sum + (Number.isSafeInteger(e.amountCents) && e.amountCents > 0 ? e.amountCents : 0), 0);
}
export function amountPaidByUser(users, expenses) {
  const paid = Object.fromEntries(users.map(u => [u.id, 0]));
  for (const e of expenses) {
    if (Object.hasOwn(paid, e.payerId) && Number.isSafeInteger(e.amountCents) && e.amountCents > 0) paid[e.payerId] += e.amountCents;
  }
  return paid;
}
export function computeBalances(users, expenses) {
  const balances = Object.fromEntries(users.map(u => [u.id, 0]));
  for (const e of expenses) {
    const amount = e.amountCents;
    const participants = Array.isArray(e.participantIds) ? [...new Set(e.participantIds)].filter(id => Object.hasOwn(balances, id)) : [];
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Object.hasOwn(balances, e.payerId) || !participants.length) continue;
    balances[e.payerId] += amount;
    const base = Math.floor(amount / participants.length);
    const remainder = amount % participants.length;
    participants.forEach((id, i) => { balances[id] -= base + (i < remainder ? 1 : 0); });
  }
  return balances;
}
export function settleDebts(balances) {
  const debtors = [], creditors = [];
  for (const [id, amount] of Object.entries(balances)) {
    if (amount < 0) debtors.push({ id, cents: -amount });
    if (amount > 0) creditors.push({ id, cents: amount });
  }
  debtors.sort((a, b) => b.cents - a.cents);
  creditors.sort((a, b) => b.cents - a.cents);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amountCents = Math.min(debtors[i].cents, creditors[j].cents);
    if (amountCents > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amountCents });
    debtors[i].cents -= amountCents; creditors[j].cents -= amountCents;
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return transfers;
}
