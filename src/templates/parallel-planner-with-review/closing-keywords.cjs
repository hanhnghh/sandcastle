// GitHub closes an issue when a closing keyword reaches the default branch in a
// commit message or merged PR body. Issues here close only through the host after
// their gate or live acceptance, so these keywords are rejected; use "Refs #N".
const {execFileSync}=require('node:child_process');

const KEYWORD=String.raw`\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+`;
const REFERENCE=String.raw`(?:(?:[\w.-]+\/[\w.-]+)?#(\d+)|https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/(\d+))`;
const pattern=()=>new RegExp(KEYWORD+REFERENCE,'gi');

function closingReferences(text){
  return [...String(text??'').matchAll(pattern())].map(match=>({issue:Number(match[1]??match[2]),text:match[0]}));
}

function commitClosingReferences(base,head='HEAD',cwd=process.cwd()){
  const log=execFileSync('git',['log','--format=%H%x00%B%x01',`${base}..${head}`],{cwd,encoding:'utf8',maxBuffer:64*1024*1024});
  return log.split('\x01').map(entry=>entry.replace(/^\n/,'')).filter(Boolean).flatMap(entry=>{
    const [commit,message]=entry.split('\x00');
    return closingReferences(message).map(row=>({commit,...row}));
  });
}

function main([mode,base,head]){
  const found=mode==='commits'&&base?commitClosingReferences(base,head):
    mode==='text'?closingReferences(require('node:fs').readFileSync(0,'utf8')):null;
  if(!found){console.error('usage: closing-keywords.cjs commits <base> [head] | text < body');return 2;}
  for(const row of found)console.error(`${row.commit?row.commit.slice(0,8)+': ':''}closing keyword "${row.text}" would close #${row.issue}; use "Refs #${row.issue}"`);
  return found.length?1:0;
}

if(require.main===module)process.exitCode=main(process.argv.slice(2));
module.exports={closingReferences,commitClosingReferences};
