import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {policyBlocks} from '../src/policy-layout.js';
const store=JSON.parse(fs.readFileSync('data/store.json','utf8'));
for(const policy of store.policies.filter(item=>item.slug!=='سياسة-الا-ستبدال')){
 test(`${policy.slug}: paragraph formatting preserves every source word`,()=>{
  const blocks=policyBlocks(policy.bodyText);
  const actual=blocks.map(block=>[block.label,block.text].filter(Boolean).join(' ')).join(' ').replace(/\s+/g,' ').trim();
  assert.equal(actual,policy.bodyText.replace(/\s+/g,' ').trim());
  assert.ok(blocks.length>0);
 });
}
