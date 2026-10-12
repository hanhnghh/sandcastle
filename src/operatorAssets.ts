export const operatorPage =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sandcastle operator</title><link rel="stylesheet" href="/style.css"><body><main><h1>Sandcastle operator</h1><p id="project"></p><p>Settings saved during a run apply to the next run.</p><nav><a href="#environment">Environment</a> · <a href="#prompts">Prompts</a></nav><form id="roles"><div id="fields"></div><button type="submit">Save settings</button></form><section id="environment"><h2>Environment</h2><p>Choose a host-installed image or enter a custom name. Save applies to the next run. Build and preflight use saved settings.</p><p id="image-availability" role="status"></p><form id="environment-form"><label>Docker image<select id="docker-image" aria-label="Docker image"></select></label><label id="custom-image-label">Custom Docker image<input id="custom-image" maxlength="255" aria-label="Custom Docker image"></label><label>Dockerfile<input id="dockerfile" required aria-label="Dockerfile"></label><label>Build arguments (KEY=value, one per line)<textarea id="build-args" rows="3" aria-label="Build arguments"></textarea></label><button type="submit">Save environment</button></form><button id="build-image" type="button">Build image</button> <button id="preflight" type="button">Run preflight</button> <button id="cancel-environment" type="button" disabled>Cancel environment job</button><p id="environment-job" role="status" aria-live="polite"></p><pre id="environment-logs" aria-label="Environment job logs" tabindex="0"></pre></section><section id="prompts"><h2>Prompts</h2><p>Compare with the current default. Overrides remain project-owned across default updates.</p><div id="prompt-fields"></div></section><p id="feedback" role="status" aria-live="polite"></p><button id="start" type="button">Start run</button><p id="run" role="status" aria-live="polite"></p><a href="/dashboard" target="_blank" rel="noopener">Observe runs and logs</a></main><script src="/app.js"></script></body></html>';
export const operatorStyles =
  "body{font:16px system-ui;background:#f6f8fa;color:#18212b;margin:0}main{max-width:850px;margin:2rem auto;padding:1rem}fieldset{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0;padding:1rem;border:1px solid #bbc4cf}[hidden]{display:none!important}label{display:grid;gap:.4rem}input,select,button,textarea{font:inherit;padding:.5rem}button{cursor:pointer}legend{font-weight:600}a{color:#135bac}#feedback[data-error=true]{color:#a11}#environment-form{display:grid;gap:1rem;margin-bottom:1rem}#environment-logs{white-space:pre-wrap;overflow-wrap:anywhere;max-height:24rem;overflow:auto;background:#fff;padding:1rem}textarea:focus,input:focus,select:focus,button:focus,a:focus{outline:3px solid #2479d4;outline-offset:2px}";
export const operatorScript = `
let config;
const fields = document.getElementById('fields');
const feedback = document.getElementById('feedback');
const run = document.getElementById('run');
async function request(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}
function message(text, error = false) {
  feedback.textContent = text;
  feedback.dataset.error = String(error);
}
async function load() {
  const data = await request('/api/config');
  config = data.config;
  document.getElementById('project').textContent = 'Project: ' + data.project;
  for (const [role, settings] of Object.entries(config.roles)) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = role[0].toUpperCase() + role.slice(1);
    group.append(legend);
    const modelLabel = document.createElement('label');
    modelLabel.textContent = legend.textContent + ' model';
    const model = document.createElement('select');
    model.id = role + '-model';
    model.setAttribute('aria-label', legend.textContent + ' model');
    for (const value of [...data.capability.models, 'custom']) {
      const option = document.createElement('option');
      option.value = value; option.textContent = value === 'custom' ? 'Custom model ID' : value;
      model.append(option);
    }
    const customLabel = document.createElement('label');
    customLabel.textContent = legend.textContent + ' custom model';
    const custom = document.createElement('input');
    custom.id = role + '-custom';
    custom.setAttribute('aria-label', legend.textContent + ' custom model');
    custom.maxLength = 200;
    custom.value = settings.model;
    const isSuggested = data.capability.models.includes(settings.model);
    model.value = isSuggested ? settings.model : 'custom';
    function showCustom() {
      customLabel.hidden = model.value !== 'custom';
      custom.required = model.value === 'custom';
    }
    model.addEventListener('change', showCustom);
    showCustom();
    customLabel.append(custom);
    modelLabel.append(model);
    const effortLabel = document.createElement('label');
    effortLabel.textContent = legend.textContent + ' effort';
    const effort = document.createElement('select');
    effort.id = role + '-effort';
    for (const value of data.capability.efforts) {
      const option = document.createElement('option');
      option.value = value; option.textContent = value;
      effort.append(option);
    }
    effort.value = settings.effort;
    effortLabel.append(effort);
    group.append(modelLabel, customLabel, effortLabel);
    fields.append(group);
  }
}
document.getElementById('roles').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    const next = structuredClone(config);
    for (const [role, settings] of Object.entries(next.roles)) {
      const selected = document.getElementById(role + '-model').value;
      settings.model = selected === 'custom' ? document.getElementById(role + '-custom').value : selected;
      settings.effort = document.getElementById(role + '-effort').value;
    }
    config = (await request('/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(next) })).config;
    message('Settings saved. Revision ' + config.revision.slice(0, 12) + '. Applies to the next run.');
  } catch (error) { message(error.message, true); }
  finally { if (button) button.disabled = false; }
});
document.getElementById('start').addEventListener('click', async () => {
  try {
    await request('/api/run', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    await observe();
  } catch (error) { message(error.message, true); }
});
function diff(before, after) {
  if (before === after) return 'No changes.';
  const left = before.split('\\n'), right = after.split('\\n');
  let start = 0, end = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  while (end < left.length - start && end < right.length - start && left[left.length - end - 1] === right[right.length - end - 1]) end++;
  return left.slice(0, start).map(line => '  ' + line).concat(left.slice(start, left.length-end).map(line => '- ' + line), right.slice(start, right.length-end).map(line => '+ ' + line), left.slice(left.length-end).map(line => '  ' + line)).join('\\n');
}
async function loadPrompts(updatedRole) {
  const data = await request('/api/prompts');
  const container = document.getElementById('prompt-fields');
  if (updatedRole === null) container.replaceChildren();
  for (const [role, prompt] of Object.entries(data.prompts)) {
    if (updatedRole !== null && role !== updatedRole) continue;
    const form = document.createElement('form');
    form.id = role + '-prompt-form';
    const group = document.createElement('fieldset');
    group.style.display = 'block';
    const legend = document.createElement('legend');
    legend.textContent = role[0].toUpperCase() + role.slice(1);
    group.append(legend);
    if (!prompt) { const text = document.createElement('p'); text.textContent = 'No prompt configured by the project adapter.'; group.append(text); form.append(group); container.append(form); continue; }
    const status = document.createElement('p');
    status.textContent = (prompt.status === 'override' ? 'Override' : 'Default') + (prompt.defaultChanged ? ' · default changed' : '') + ' · default ' + prompt.default.version.slice(0,12) + ' · base ' + prompt.base.version.slice(0,12);
    const label = document.createElement('label');
    label.textContent = legend.textContent + ' prompt';
    const editor = document.createElement('textarea');
    editor.id = role + '-prompt'; editor.rows = 12; editor.style.width = '95%'; editor.value = prompt.content; editor.required = true;
    label.htmlFor = editor.id; label.append(editor);
    const changes = document.createElement('pre'); changes.style.whiteSpace = 'pre-wrap'; changes.setAttribute('aria-label', legend.textContent + ' prompt diff');
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Diff against current default (− default, + editor)'; details.append(summary, changes);
    const update = () => changes.textContent = diff(prompt.default.content, editor.value);
    editor.addEventListener('input', update); update();
    const defaultDetails = document.createElement('details'); const defaultSummary = document.createElement('summary'); defaultSummary.textContent = 'Changed default diff (− original base, + current default)';
    const defaultDiff = document.createElement('pre'); defaultDiff.id = role + '-default-diff'; defaultDiff.style.whiteSpace = 'pre-wrap'; defaultDiff.textContent = diff(prompt.base.content, prompt.default.content); defaultDetails.append(defaultSummary, defaultDiff);
    const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save ' + role + ' prompt';
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset ' + role + ' prompt';
    async function persist(content) {
      const restoreFocus = form.contains(document.activeElement);
      save.disabled = reset.disabled = true;
      editor.disabled = true;
      try { await request('/api/prompts', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({role, content})}); await loadPrompts(role); message(role + ' prompt ' + (content === null ? 'reset' : 'saved') + '. Applies to the next run.'); }
      catch (error) { message(error.message, true); }
      finally {
        save.disabled = reset.disabled = editor.disabled = false;
        if (restoreFocus && document.activeElement === document.body) document.getElementById(form.id).querySelector(content === null ? 'button[type=button]' : 'button[type=submit]').focus();
      }
    }
    form.addEventListener('submit', event => { event.preventDefault(); persist(editor.value); }); reset.addEventListener('click', () => persist(null));
    group.append(status, label, details, defaultDetails, save, reset); form.append(group);
    const previous = document.getElementById(form.id);
    if (previous) previous.replaceWith(form); else container.append(form);
  }
}
async function observe() {
  try {
    const data = await request('/api/run');
    if (!data.run) { run.textContent = 'No run started in this operator session.'; return; }
    document.getElementById('start').disabled = data.run.status === 'running';
    run.textContent = 'Run ' + data.run.id + ' · ' + data.run.status + ' · revision ' + data.run.config.revision.slice(0,12) + ' · runtime ' + data.run.runtimeVersion + '\\n' +
      Object.entries(data.run.config.roles).map(([role, settings]) => role + ': ' + settings.model + ' / ' + settings.effort).join(' · ');
  } catch (error) { run.textContent = 'Cannot observe run: ' + error.message; }
}
let environmentConfig, environmentJob, environmentEvents;
const imageSelect = document.getElementById('docker-image');
const customImage = document.getElementById('custom-image');
function showCustomImage() {
  document.getElementById('custom-image-label').hidden = imageSelect.value !== 'custom';
  customImage.required = imageSelect.value === 'custom';
}
imageSelect.addEventListener('change', showCustomImage);
function availability(data) {
  document.getElementById('image-availability').textContent = 'Configured image: ' + data.config.image + ' · ' + (data.available ? 'Available on host · ' + data.identity : 'Unavailable on host; check Docker or build the image.');
}
async function loadEnvironment() {
  const data = await request('/api/environment'); environmentConfig = data.config;
  imageSelect.replaceChildren();
  for(const value of [...data.images, 'custom']) {
    const option = document.createElement('option'); option.value=value; option.textContent=value === 'custom' ? 'Custom image name' : value; imageSelect.append(option);
  }
  imageSelect.value = data.images.includes(data.config.image) ? data.config.image : 'custom';
  customImage.value = data.config.image; showCustomImage();
  document.getElementById('dockerfile').value = data.config.dockerfile;
  document.getElementById('build-args').value = Object.entries(data.config.buildArgs).map(([key,value]) => key+'='+value).join('\\n');
  availability(data);
}
document.getElementById('environment-form').addEventListener('submit', async event => {
  event.preventDefault(); event.submitter.disabled=true;
  try {
    const buildArgs = {};
    for(const line of document.getElementById('build-args').value.split('\\n').filter(line => line.trim())) {
      const equals = line.indexOf('='); if(equals < 1) throw new Error('Build arguments require KEY=value, one per line.');
      const key=line.slice(0,equals); if(Object.hasOwn(buildArgs,key)) throw new Error('Duplicate build argument: '+key);
      Object.defineProperty(buildArgs,key,{value:line.slice(equals+1),enumerable:true});
    }
    environmentConfig = (await request('/api/environment',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({schemaVersion:1,image:imageSelect.value === 'custom' ? customImage.value : imageSelect.value,dockerfile:document.getElementById('dockerfile').value,buildArgs})})).config;
    availability(await request('/api/environment')); message('Environment saved. Applies to the next run.');
  } catch(error) {message(error.message,true);}
  finally {event.submitter.disabled=false;}
});
function showEnvironmentJob(job) {
  environmentJob = job;
  const active = ['running','cancelling','promoting'].includes(job.status);
  document.getElementById('build-image').disabled = document.getElementById('preflight').disabled = active;
  document.getElementById('cancel-environment').disabled = job.status !== 'running';
  document.getElementById('environment-job').textContent = job.kind+' · '+job.status+' · '+job.config.image+(job.identity ? ' · '+job.identity : '')+(job.error ? ' · '+job.error : '');
  document.getElementById('environment-logs').textContent = job.logs;
  if(!active) {
    environmentEvents?.close();
    request('/api/environment').then(availability).catch(error=>message(error.message,true));
  }
}
function watchEnvironmentJob(job) {
  showEnvironmentJob(job); environmentEvents?.close();
  if(!['running','cancelling','promoting'].includes(job.status)) return;
  environmentEvents = new EventSource('/api/environment/jobs/'+job.id+'/events');
  environmentEvents.onmessage = event => showEnvironmentJob(JSON.parse(event.data));
  environmentEvents.onerror = () => { request('/api/environment/jobs/'+job.id).then(showEnvironmentJob).catch(error=>message(error.message,true)); };
}
async function startEnvironmentJob(kind) {
  try {
    const job = await request('/api/environment/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind})});
    watchEnvironmentJob(job);
  } catch(error) {message(error.message,true);}
}
document.getElementById('build-image').addEventListener('click',()=>startEnvironmentJob('build'));
document.getElementById('preflight').addEventListener('click',()=>startEnvironmentJob('preflight'));
document.getElementById('cancel-environment').addEventListener('click',async()=> {
  try {showEnvironmentJob(await request('/api/environment/jobs/'+environmentJob.id+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));} catch(error) {message(error.message,true);}
});
loadEnvironment().catch(error => message(error.message,true));
request('/api/environment/jobs').then(data => {const job=data.jobs.at(-1);if(job) watchEnvironmentJob(job);}).catch(error=>message(error.message,true));
loadPrompts(null).catch(error => message(error.message, true));
load().catch(error => message(error.message, true));
observe();
setInterval(observe, 1000);
`;
