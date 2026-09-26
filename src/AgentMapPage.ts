// Self-contained assets: no CDN, browser credentials, or build-time frontend dependencies.
export const agentMapPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sandcastle · Agent map</title><link rel="stylesheet" href="/style.css"><script src="/app.js" defer></script></head>
<body><header><div class="brand"><span class="brand-mark">S</span><div>Sandcastle<small>HOST OBSERVATORY</small></div></div><span id="connection" role="status">Connecting…</span><span class="readonly">Read-only · local</span></header>
<main><section class="heading"><div><p class="eyebrow">WORKFLOW VISIBILITY</p><h1>Agent map</h1><p class="muted">Follow the work. See what is running, waiting, and ready to merge.</p></div><label class="run-picker">Recorded session<select id="runs" aria-label="Recorded session"><option>No sessions yet</option></select></label></section>
<section id="summary" class="summary" aria-label="Session summary"></section>
<div class="workspace"><section id="map" aria-label="Workflow map"></section><aside id="details" aria-label="Agent details"><div class="empty"><h2>Select an agent</h2><p>Activity, branch, commits and reported usage appear here.</p></div></aside></div>
<footer>Agents run in their configured sandboxes. This dashboard observes the host orchestrator.</footer></main></body></html>`;

export const agentMapStyles = `
:root{color-scheme:dark;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#101316;color:#e4e9ed;font-synthesis:none}
*{box-sizing:border-box}body{margin:0}header{height:78px;padding:0 36px;display:flex;align-items:center;gap:22px;border-bottom:1px solid #293138;background:#15191e}.brand{display:flex;align-items:center;gap:12px;font-weight:650;letter-spacing:.4px}.brand-mark{background:#cfecb5;color:#1e3018;border-radius:9px;padding:9px 13px;font-size:22px}.brand small{display:block;color:#8c989f;font-size:9px;letter-spacing:2px;margin-top:5px}#connection{margin-left:auto;font-size:12px;color:#b6d69f}.readonly{font-size:11px;color:#9aa7af;border:1px solid #35414b;border-radius:20px;padding:7px 11px}main{max-width:1600px;padding:34px 36px;margin:auto}.heading{display:flex;align-items:center;justify-content:space-between;gap:20px}.eyebrow{color:#b5d5a0;letter-spacing:2px;font-size:10px;font-weight:650}h1{font-size:32px;letter-spacing:-1px;margin:10px 0}h2{font-size:17px;margin:0 0 8px}h3{font-size:13px;margin:0}p{line-height:1.5}.muted,small{color:#8e9ca6;font-size:13px}.run-picker{display:grid;gap:9px;font-size:11px;color:#9aa7af;min-width:240px}select{background:#1b2229;color:#e4e9ed;border:1px solid #35414b;border-radius:7px;padding:11px;max-width:380px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.stat{background:#171d23;border:1px solid #2b353e;border-radius:10px;padding:17px 20px}.stat strong{display:block;font-size:23px;margin-top:8px;font-weight:550}.stat small{font-size:10px;letter-spacing:1px;text-transform:uppercase}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:20px;align-items:start}.batch{border:1px solid #303b44;border-radius:12px;background:#151b21;margin-bottom:20px;overflow:hidden}.batch-header{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;background:#1b2229;border-bottom:1px solid #303b44}.batch-header small{font-size:11px}.graph{padding:22px}.stage-label{font-size:9px;letter-spacing:1.5px;color:#788994;margin:0 0 10px;text-transform:uppercase}.planner-stage,.merge-stage{max-width:400px;margin:auto}.pipelines{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px;padding:25px 0;position:relative}.pipeline{border-top:1px solid #445449;padding-top:14px;min-width:0}.pipeline>small{display:block;margin-bottom:10px;color:#bdc9d2}.node{display:block;position:relative;text-align:left;width:100%;background:#202830;color:inherit;border:1px solid #37434e;border-left:3px solid #53626d;border-radius:8px;padding:13px;margin-bottom:9px;cursor:pointer;transition:background .15s,border-color .15s}.node:hover{background:#2a353e}.node:focus-visible,select:focus-visible{outline:2px solid #c9e7b1;outline-offset:3px}.node.selected{background:#2a3731;outline:1px solid #b0d599}.node.running{border-left-color:#b7e08e}.node.completed{border-left-color:#5b9ca0}.node.blocked,.node.failed,.node.interrupted{border-left-color:#efa97a}.node-top{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:12px;font-weight:600}.node p{margin:8px 0;font-size:12px;overflow-wrap:anywhere}.node small{font-size:10px}.badge{font-size:9px;border-radius:4px;padding:3px 5px;background:#303a43;color:#bbc7cf;font-weight:500;text-transform:uppercase;white-space:nowrap}.running .badge{background:#36472a;color:#d2efb6}.failed .badge,.blocked .badge,.interrupted .badge{background:#513728;color:#ffc4a1}.decisions{border-top:1px solid #303b44;padding:16px 22px}.decisions summary{cursor:pointer;font-size:12px;color:#c0cbd4}.decision{padding:13px 0;border-bottom:1px solid #29333b;font-size:12px}.decision:last-child{border:0}.decision p{color:#9eacb6;margin:6px 0}.decision small{font-family:ui-monospace,monospace;font-size:10px}aside{position:sticky;top:20px;border:1px solid #303b44;border-radius:12px;background:#171d23;padding:22px;max-height:80vh;overflow:auto}aside .badge{display:inline-block;margin:10px 0}dl{display:grid;grid-template-columns:85px 1fr;font-size:11px;line-height:1.5;gap:10px;margin:18px 0 25px}dt{color:#8c9ba6}dd{margin:0;overflow-wrap:anywhere}.activity{margin-top:15px}.activity-entry{border-left:1px solid #3d4c57;padding:0 0 17px 12px}.activity-entry small{font-size:9px;color:#7f949f}.activity-entry pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.6 ui-monospace,SFMono-Regular,monospace;color:#c5d1d9;margin:7px 0 0}.empty{padding:30px 15px;color:#98a8b2;line-height:1.7}.empty h2{color:#e4e9ed}.error{color:#f4b895}footer{margin-top:32px;color:#697e8b;font-size:11px}.title-row{display:flex;justify-content:space-between;gap:12px}@media(max-width:1000px){.workspace{grid-template-columns:1fr}aside{position:static;max-height:600px}}@media(max-width:640px){header{padding:0 18px;gap:10px}.readonly{display:none}main{padding:22px 16px}.heading{align-items:stretch;flex-direction:column}.summary{grid-template-columns:repeat(2,1fr)}select{max-width:100%}.graph{padding:15px}.pipelines{grid-template-columns:1fr}}
.run-picker select{width:100%;min-width:0}.run-picker{min-width:0;width:380px;max-width:100%}.planner-stage::after,.merge-stage::before{content:'↓';display:block;text-align:center;color:#718978;font-size:20px;line-height:22px}.pipeline .node+.node{margin-top:20px}.pipeline .node+.node::before{content:'↓';position:absolute;top:-20px;left:50%;color:#718978;font-size:14px}@media(max-width:640px){.run-picker{width:100%}}
`;

export const agentMapScript = `
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(cls) node.className = cls; return node; };
let runId = '', selectedId = '', current;
const duration = node => { if(!node.startedAt) return 'Not started'; const seconds = Math.max(0, Math.floor(((node.endedAt ? Date.parse(node.endedAt) : Date.now()) - Date.parse(node.startedAt))/1000)); return Math.floor(seconds/60)+'m '+seconds%60+'s'; };
const title = role => role.charAt(0).toUpperCase()+role.slice(1);
const json = async path => { const response = await fetch(path, {cache:'no-store'}); if(!response.ok) throw new Error('HTTP '+response.status); return response.json(); };
function card(node) {
  const button = el('button', undefined, 'node '+node.status+(selectedId===node.id?' selected':''));
  button.type='button'; button.dataset.node=node.id; button.setAttribute('aria-pressed',String(selectedId===node.id));
  const top = el('div',undefined,'node-top'); top.append(el('span', title(node.role)),el('span',node.status,'badge')); button.append(top,el('p',node.title),el('small',duration(node)));
  button.addEventListener('click',()=>{selectedId=node.id; render();}); return button;
}
function showDetails(node) {
  const panel=$('details'); const scroll=panel.scrollTop; panel.replaceChildren();
  if(!node){const empty=el('div',undefined,'empty');empty.append(el('h2','Select an agent'),el('p','Choose a node to inspect its activity and results.'));panel.append(empty);return;}
  panel.append(el('p',node.issueId?'ISSUE #'+node.issueId:'BATCH '+node.batch,'eyebrow'),el('h2',node.title),el('span',node.status,'badge'));
  const fields=el('dl');
  const values=[['Role',title(node.role)],['Branch',node.branch||'Integration branch'],['Model',node.model||'Not reported'],['Provider',node.provider||'Not reported'],['Elapsed',duration(node)],['Session',node.sessionId||'Not reported'],['Commits',node.commits.length?node.commits.join(', '):'None recorded']];
  if(node.usage) values.push(['Last usage','Input '+node.usage.inputTokens+' · Output '+node.usage.outputTokens+' · Cache read '+node.usage.cacheReadInputTokens+' · Cache write '+node.usage.cacheCreationInputTokens]);
  for(const [key,value] of values) fields.append(el('dt',key),el('dd',value)); panel.append(fields);
  if(node.error)panel.append(el('p',node.error,'error'));
  panel.append(el('h3','Recent activity'),el('p','Latest 150 entries · common credentials filtered · usage is the last reported snapshot, not a billed total.','muted'));
  const activity=el('div',undefined,'activity');
  if(!node.activity.length) activity.append(el('p','No activity received yet.','muted'));
  for(const event of node.activity){const item=el('div',undefined,'activity-entry');item.append(el('small',new Date(event.timestamp).toLocaleTimeString()+' · '+event.type),el('pre',event.text));activity.append(item);}
  panel.append(activity);panel.scrollTop=scroll;
}
function render() {
  const focus=document.activeElement?.dataset?.node;
  const map=$('map'), summary=$('summary'); map.replaceChildren();summary.replaceChildren();
  if(!current){map.append(el('div','No recorded sessions. Start an instrumented Sandcastle workflow; this page updates automatically.','empty'));showDetails();return;}
  const nodes=current.nodes;
  for(const [label,value] of [['Session',current.status],['Active agents',nodes.filter(n=>n.status==='running').length],['Finished agents',nodes.filter(n=>n.status==='completed').length],['Needs attention',nodes.filter(n=>['blocked','failed','stopped','interrupted'].includes(n.status)).length]]){const stat=el('div',undefined,'stat');stat.append(el('small',label),el('strong',String(value)));summary.append(stat);}
  const numbers=[...new Set([...current.batches.map(b=>b.number),...nodes.map(n=>n.batch)])].sort((a,b)=>b-a);
  if(!numbers.length)map.append(el('div','Session created. Waiting for the first planner.','empty'));
  for(const number of numbers){
    const batch=el('article',undefined,'batch');const header=el('div',undefined,'batch-header');header.append(el('h2','Batch '+number),el('small',current.name));batch.append(header);
    const graph=el('div',undefined,'graph');const members=nodes.filter(n=>n.batch===number);
    const planner=el('div',undefined,'planner-stage');planner.append(el('p','01 / Plan','stage-label'));for(const n of members.filter(n=>n.role==='planner'))planner.append(card(n));graph.append(planner);
    const pipelines=el('div',undefined,'pipelines');
    for(const issueId of [...new Set(members.filter(n=>n.issueId).map(n=>n.issueId))]){const column=el('div',undefined,'pipeline');column.append(el('small','ISSUE #'+issueId));for(const role of ['implementer','reviewer'])for(const n of members.filter(n=>n.issueId===issueId&&n.role===role))column.append(card(n));pipelines.append(column);}graph.append(pipelines);
    const merger=el('div',undefined,'merge-stage');merger.append(el('p','03 / Integrate','stage-label'));for(const n of members.filter(n=>n.role==='merger'))merger.append(card(n));graph.append(merger);batch.append(graph);
    const decisions=current.batches.find(b=>b.number===number)?.decisions||[];
    if(decisions.length){const list=el('details',undefined,'decisions');list.open=true;list.append(el('summary','Planner decisions · '+decisions.filter(d=>d.disposition!=='selected').length+' not selected'));
      for(const d of decisions){const item=el('div',undefined,'decision');item.append(el('strong','#'+d.id+' · '+d.disposition),el('p',d.reason),el('small',d.likelyAreas.join(', ')+(d.conflictsWith?.length?' · conflicts with '+d.conflictsWith.map(i=>'#'+i).join(', '):'')));list.append(item);}batch.append(list);}
    map.append(batch);
  }
  if(!nodes.some(n=>n.id===selectedId))selectedId=nodes.find(n=>n.status==='running')?.id||nodes.at(-1)?.id||'';
  showDetails(nodes.find(n=>n.id===selectedId));
  if(focus)Array.from(document.querySelectorAll('[data-node]')).find(n=>n.dataset.node===focus)?.focus({preventScroll:true});
}
async function refresh(){
  try{
    const listing=await json('/api/runs');const picker=$('runs');
    if(!listing.runs.some(r=>r.id===runId))runId=listing.runs[0]?.id||'';
    const signature=listing.runs.map(r=>r.id+':'+r.status).join('|');
    if(picker.dataset.signature!==signature){picker.replaceChildren();for(const r of listing.runs){const option=el('option',r.name+' · '+new Date(r.startedAt).toLocaleString()+' · '+r.status);option.value=r.id;picker.append(option);}if(!listing.runs.length)picker.append(el('option','No sessions yet'));picker.dataset.signature=signature;}
    picker.value=runId;const expected=runId;const next=expected?await json('/api/runs/'+expected):undefined;if(expected!==runId)return;
    current=next;render();$('connection').textContent='● Live · updated '+new Date().toLocaleTimeString();
  }catch(error){$('connection').textContent='Disconnected · retrying';}
  finally{setTimeout(refresh,1500);}
}
$('runs').addEventListener('change',()=>{runId=$('runs').value;selectedId='';});
refresh();
`;
