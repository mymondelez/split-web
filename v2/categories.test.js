import test from "node:test";
import assert from "node:assert/strict";
import {CATEGORIES,categoryInfo,selectedCategory,categoryBreakdown,filterExpensesByCategory} from "./categories.js";
import {totalSpentCents} from "./accounting.js";

test("Nove categorie richieste, tutte utilizzabili ma nessuna obbligatoria",()=>{
  assert.deepEqual(CATEGORIES.map(x=>x.label),[
    "Carburante","Autostrada","Pedaggi","Supermercato","Cibo e bevande",
    "Casa e alloggio","Musei / attrazioni","Acquisti","Svago"
  ]);
  assert.equal(selectedCategory(""),"");
  assert.equal(selectedCategory("custom",""),"");
  assert.equal(selectedCategory("custom","  Gite in barca  "),"custom:Gite in barca");
  assert.equal(selectedCategory("unknown",""),"");
  assert.equal(selectedCategory("fuel"),"fuel");
});
test("Senza categoria e personalizzate conservano le spese nel totale",()=>{
  const expenses=[
    {amountCents:2800,category:"fuel"},
    {amountCents:1800,category:"food"},
    {amountCents:900,category:""},
    {amountCents:450,category:undefined},
    {amountCents:1000,category:"custom:Gite in barca"},
    {amountCents:2000,category:"custom:gite in barca"}
  ];
  const summary=categoryBreakdown(expenses);
  assert.equal(summary.totalCents,8950);
  assert.equal(summary.totalCents,totalSpentCents(expenses));
  assert.equal(summary.count,6);
  assert.equal(summary.rows.find(r=>r.id==="").totalCents,1350);
  assert.equal(summary.rows.find(r=>r.id==="custom:gite in barca").totalCents,3000);
  assert.equal(summary.rows.find(r=>r.id==="custom:gite in barca").count,2);
});
test("La modifica categoria non influisce sui saldi, sul totale o sul numero delle spese",()=>{
  const expenses=[{amountCents:3000,payerId:"a",participantIds:["a","b"],category:""}];
  const oldTotal=totalSpentCents(expenses);
  expenses[0].category="groceries";
  assert.equal(totalSpentCents(expenses),oldTotal);
  assert.equal(categoryBreakdown(expenses).rows[0].label,"Supermercato");
});
test("Le vecchie categorie V2 non vengono cancellate",()=>{
  assert.equal(categoryInfo("travel").label,"Trasporti e viaggi (V2 precedente)");
  assert.equal(categoryInfo("shop").label,"Acquisti (V2 precedente)");
  assert.equal(categoryInfo("other").label,"Altro (V2 precedente)");
  assert.equal(categoryInfo(undefined).label,"Senza categoria");
});
test("Le etichette personalizzate fino a 48 caratteri si mantengono",()=>{
  const label="ABCDEFGHIJKLMNOPQRSTUVWXabcdefghijklmnopqrstuvwx";
  assert.equal(label.length,48);
  assert.equal(categoryInfo(selectedCategory("custom",label)).label,label);
});
test("I valori non validi non sono inclusi nel riepilogo",()=>{
  const summary=categoryBreakdown([{amountCents:0,category:"fuel"},{amountCents:120,category:"groceries"},{amountCents:NaN,category:""}]);
  assert.equal(summary.totalCents,120);
  assert.equal(summary.count,1);
});

test("Il filtro categoria distingue tutti / senza categoria / categoria scelta",()=>{
  const expenses=[
    {id:"a",category:"fuel",amountCents:500},
    {id:"b",category:"",amountCents:300},
    {id:"c",amountCents:120},
    {id:"d",category:"food",amountCents:400},
    {id:"e",category:"custom:Gita in barca",amountCents:800},
    {id:"f",category:"custom:gita in barca",amountCents:200}
  ];
  assert.equal(filterExpensesByCategory(expenses,null),expenses);
  assert.deepEqual(filterExpensesByCategory(expenses,"fuel").map(e=>e.id),["a"]);
  assert.deepEqual(filterExpensesByCategory(expenses,"").map(e=>e.id),["b","c"]);
  assert.deepEqual(filterExpensesByCategory(expenses,"custom:gita in barca").map(e=>e.id),["e","f"]);
  assert.deepEqual(filterExpensesByCategory(expenses,"museums"),[]);
  assert.equal(expenses.length,6);
});
test("Riepilogo per categoria e filtro riportano gli stessi importi",()=>{
  const expenses=[
    {id:"f1",category:"fuel",amountCents:4001},
    {id:"f2",category:"fuel",amountCents:3002},
    {id:"s1",category:"",amountCents:599},
    {id:"o1",category:"food",amountCents:1200}
  ];
  const {rows,totalCents}=categoryBreakdown(expenses);
  for(const row of rows)
    assert.equal(row.totalCents,totalSpentCents(filterExpensesByCategory(expenses,row.id)));
  assert.equal(totalCents,totalSpentCents(expenses));
});
