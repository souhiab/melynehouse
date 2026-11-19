import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizedColor,commitOnSpace,appendValue,validHex} from '../src/admin/color-recognition.js';
test('exact multilingual aliases and code suffixes recognize without arbitrary substrings',()=>{
 for(const label of ['Black',' NOIR ','أسود','P30 BLACK','P34-Black'])assert.equal(recognizedColor(label),'#000000');
 assert.equal(recognizedColor('Bordeaux'),'#800020');assert.equal(recognizedColor('Vert Foncé'),'#006400');
 assert.equal(recognizedColor('P28 Blue Marine'),'#000080');assert.equal(recognizedColor('Blackberry'),null);
 assert.equal(recognizedColor('custom P30 Black'),null);
});
test('space commits only unambiguous tokens and keeps multiword sizes/colors possible',()=>{
 assert.equal(commitOnSpace('Black','color'),true);assert.equal(commitOnSpace('Blue','color'),false);
 assert.equal(commitOnSpace('Light','color'),false);assert.equal(commitOnSpace('5','size'),false);
 assert.equal(commitOnSpace('XL','size'),true);
});
test('chips deduplicate normalized labels, retain IDs and allow custom values',()=>{
 const old=[{id:'saved',label:' Black ',secondaryLabel:'#123456'}];assert.equal(appendValue(old,'BLACK','color'),old);
 const values=appendValue(old,'Blue Marine','color');assert.equal(values[0].id,'saved');assert.equal(values[1].label,'Blue Marine');assert.equal(values[1].secondaryLabel,'#000080');
 assert.equal(appendValue([],'5 ans','size')[0].label,'5 ans');assert.equal(appendValue([],'Custom shade','color')[0].secondaryLabel,null);
 assert.equal(validHex('#abcdef'),true);assert.equal(validHex('#xyzxyz'),false);
});
