import test from "node:test";
import assert from "node:assert/strict";
import {parseEuroCents,totalSpentCents,amountPaidByUser,computeBalances,settleDebts} from "./accounting.js";
const users=[{id:"a",name:"Anna"},{id:"b",name:"Bruno"},{id:"c",name:"Carlo"}];
test("Importi in euro: parsing preciso e convalida",()=>{
  assert.equal(parseEuroCents("12,34"),1234);
  assert.equal(parseEuroCents("0,01"),1);
  assert.equal(parseEuroCents("100"),10000);
  for(const value of ["", "0", "-5", "2,345", "1abc", "NaN", "1.000,00"])assert.equal(parseEuroCents(value),null);
});
test("Il costo complessivo conta ogni spesa una sola volta, non i rimborsi",()=>{
  const expenses=[{amountCents:12000,payerId:"a",participantIds:["a","b","c"]},{amountCents:5000,payerId:"b",participantIds:["b","c"]}];
  assert.equal(totalSpentCents(expenses),17000);
  assert.deepEqual(amountPaidByUser(users,expenses),{a:12000,b:5000,c:0});
  assert.deepEqual(computeBalances(users,expenses),{a:8000,b:-1500,c:-6500});
  assert.deepEqual(settleDebts(computeBalances(users,expenses)),[{from:"c",to:"a",amountCents:6500},{from:"b",to:"a",amountCents:1500}]);
});
test("Cent divisibili con resto: nessuna perdita monetaria",()=>{
  const expenses=[{amountCents:100,payerId:"a",participantIds:["a","b","c"]}];
  const balances=computeBalances(users,expenses);
  assert.deepEqual(balances,{a:66,b:-33,c:-33});
  assert.equal(Object.values(balances).reduce((a,b)=>a+b,0),0);
});
test("Anche il pagante non incluso nei partecipanti è corretto",()=>{
  const expenses=[{amountCents:1000,payerId:"a",participantIds:["b","c"]}];
  assert.deepEqual(computeBalances(users,expenses),{a:1000,b:-500,c:-500});
});
test("Spese vuote e utenti senza spese",()=>{
  assert.equal(totalSpentCents([]),0);
  assert.deepEqual(computeBalances(users,[]),{a:0,b:0,c:0});
  assert.deepEqual(settleDebts({a:0,b:0,c:0}),[]);
});
test("I duplicati accidentali nei partecipanti non gonfiano le quote",()=>{
  const expenses=[{amountCents:400,payerId:"a",participantIds:["a","b","b"]}];
  assert.deepEqual(computeBalances(users,expenses),{a:200,b:-200,c:0});
});
