const fs = require('fs');
const content = fs.readFileSync('C:/Users/Merlin/.claude/projects/C--Users-Merlin-Documents-repos-Black-Owned/bd5ec2d8-e737-4130-b12e-c0f6e4c72c77/tool-results/balhdcwp9.txt', 'utf8');
const json = JSON.parse(content);

console.log('=== DISPATCH BUDGET ===');
console.log(JSON.stringify(json.dispatch_budget, null, 2));

console.log('\n=== TO_DISPATCH (' + json.to_dispatch.length + ') ===');
json.to_dispatch.forEach(e => {
  const suffix = e.is_redisplay ? ' (redisplay)' : '';
  console.log(e.ac_id + ' - ' + e.stage + suffix);
});

console.log('\n=== BLOCKED (' + json.blocked_details.length + ') ===');
json.blocked_details.forEach(b => {
  console.log(b.ac_id + ' - waiting: ' + b.unmet_deps.join(', '));
});

console.log('\n=== UNVERIFIED_GARBAGE (' + json.unverified_garbage.length + ') ===');
json.unverified_garbage.forEach(u => console.log(u));

console.log('\n=== IN_PROGRESS (' + json.in_progress.length + ') ===');
json.in_progress.forEach(i => console.log(i));

console.log('\n=== READY_TO_MERGE (' + json.ready_to_merge.length + ') ===');
json.ready_to_merge.forEach(r => console.log(r));

console.log('\n=== NEEDS_MERGE_VERIFY (' + json.needs_merge_verify.length + ') ===');
json.needs_merge_verify.forEach(n => console.log(n));
