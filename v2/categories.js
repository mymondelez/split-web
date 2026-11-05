/**
 * Taxonomy and reporting for $plit 2.
 * Category never affects who owes whom; it only describes a registered expense.
 * Existing V2 data is preserved, including legacy labels and uncategorized expenses.
 */
export const CATEGORIES = Object.freeze([
  {id:"fuel", label:"Carburante", icon:"⛽", color:"#4fd2b0"},
  {id:"motorway", label:"Autostrada", icon:"🛣️", color:"#5b9cf4"},
  {id:"tolls", label:"Pedaggi", icon:"🚧", color:"#f4ad68"},
  {id:"groceries", label:"Supermercato", icon:"🛒", color:"#b290ee"},
  {id:"food", label:"Cibo e bevande", icon:"🍽️", color:"#f38e8d"},
  {id:"home", label:"Casa e alloggio", icon:"🏠", color:"#65cbe0"},
  {id:"museums", label:"Musei / attrazioni", icon:"🏛️", color:"#e0b96a"},
  {id:"purchase", label:"Acquisto", icon:"🛍️", color:"#e686bc"},
  {id:"leisure", label:"Svago", icon:"🎭", color:"#8dc77e"}
]);
const OLD = {
  travel:{id:"travel",label:"Trasporti e viaggi (V2 precedente)",icon:"🚆",color:"#7eabd4"},
  shop:{id:"shop",label:"Acquisti (V2 precedente)",icon:"🛍️",color:"#d29be4"},
  other:{id:"other",label:"Altro (V2 precedente)",icon:"💳",color:"#9bafba"}
};
const NONE={id:"",label:"Senza categoria",icon:"◌",color:"#70868d"};
const normalized=value=>String(value??"").trim().replace(/\s+/g," ").slice(0,48);
export function categoryInfo(raw) {
  const value=normalized(raw);
  if (!value) return NONE;
  const known=CATEGORIES.find(c=>c.id===value);
  if (known) return known;
  if (Object.hasOwn(OLD,value)) return OLD[value];
  // "custom:" identifies user-defined labels; unknown historical values are also preserved.
  const label=(value.startsWith("custom:")?value.slice(7):value).trim();
  return label?{id:"custom:"+label.toLocaleLowerCase("it"),label,icon:"✦",color:"#dbadf4"}:NONE;
}
export function selectedCategory(choice, customLabel="") {
  if (choice==="custom") {
    const label=normalized(customLabel);
    return label?"custom:"+label:"";
  }
  return CATEGORIES.some(c=>c.id===choice)?choice:"";
}
export function categoryBreakdown(expenses) {
  const groups=new Map();
  let totalCents=0, count=0;
  for(const e of expenses){
    const value=e.amountCents;
    if (!Number.isSafeInteger(value)||value<=0) continue;
    const info=categoryInfo(e.category);
    const key=info.id;
    const entry=groups.get(key)||{...info,count:0,totalCents:0};
    entry.count++; entry.totalCents+=value;
    groups.set(key,entry);
    count++;totalCents+=value;
  }
  const rows=[...groups.values()].sort((a,b)=>b.totalCents-a.totalCents||a.label.localeCompare(b.label,"it"));
  return {rows,totalCents,count};
}
