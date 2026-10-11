export const operatorPage =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sandcastle operator</title><link rel="stylesheet" href="/style.css"><body><main><h1>Sandcastle operator</h1><p id="project"></p><p>Settings saved during a run apply to the next run.</p><nav><a href="#prompts">Prompts</a></nav><form id="roles"><div id="fields"></div><button type="submit">Save settings</button></form><section id="prompts"><h2>Prompts</h2><p>Compare with the current default. Overrides remain project-owned across default updates.</p><div id="prompt-fields"></div></section><p id="feedback" role="status" aria-live="polite"></p><button id="start" type="button">Start run</button><p id="run" role="status" aria-live="polite"></p><a href="/dashboard" target="_blank" rel="noopener">Observe runs and logs</a></main><script src="/app.js"></script></body></html>';
export const operatorStyles =
  "body{font:16px system-ui;background:#f6f8fa;color:#18212b;margin:0}main{max-width:850px;margin:2rem auto;padding:1rem}fieldset{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0;padding:1rem;border:1px solid #bbc4cf}[hidden]{display:none!important}label{display:grid;gap:.4rem}input,select,button,textarea{font:inherit;padding:.5rem}button{cursor:pointer}legend{font-weight:600}a{color:#135bac}#feedback[data-error=true]{color:#a11}textarea:focus,input:focus,select:focus,button:focus,a:focus{outline:3px solid #2479d4;outline-offset:2px}";
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
async function loadPrompts() {
  const data = await request('/api/prompts');
  const container = document.getElementById('prompt-fields');
  container.replaceChildren();
  for (const [role, prompt] of Object.entries(data.prompts)) {
    const form = document.createElement('form');
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
      save.disabled = reset.disabled = true;
      try { await request('/api/prompts', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({role, content})}); await loadPrompts(); message(role + ' prompt ' + (content === null ? 'reset' : 'saved') + '. Applies to the next run.'); }
      catch (error) { message(error.message, true); }
      finally { save.disabled = reset.disabled = false; }
    }
    form.addEventListener('submit', event => { event.preventDefault(); persist(editor.value); }); reset.addEventListener('click', () => persist(null));
    group.append(status, label, details, defaultDetails, save, reset); form.append(group); container.append(form);
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
loadPrompts().catch(error => message(error.message, true));
load().catch(error => message(error.message, true));
observe();
setInterval(observe, 1000);
`;
