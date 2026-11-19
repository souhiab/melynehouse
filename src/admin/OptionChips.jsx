import {useState} from 'react';
import {appendValue,colorNames,commitOnSpace,normalizeValue,recognizedColor,validHex} from './color-recognition.js';

export function OptionChips({options,onChange,onConfirm}){
 const [emptyRows,setEmptyRows]=useState(options.length?[]:[crypto.randomUUID()]);
 const change=(id,patch)=>onChange(options.map(option=>option.id===id?{...option,...patch}:option));
 const remove=id=>{if(window.confirm('إزالة الخيار؟ ستتقاعد التوليفات المتأثرة مع حفظ تاريخها عند الحفظ.'))onChange(options.filter(option=>option.id!==id));};
 return <div className="owner-options-chips"><p>Enter لإضافة القيمة كاملة. المسافة تضيف قيمة معروفة غير ملتبسة. الأسماء المركبة مثل Blue Marine و5 ans تُحفظ بـ Enter. تأكيد الخيارات يحدّث التوليفات ولا ينشر المنتج.</p>
 {options.map(option=><OptionRow key={option.id} option={option} onChange={patch=>change(option.id,patch)} onRemove={()=>remove(option.id)}/>)}
 {emptyRows.map(id=><div className="owner-option-row" key={id}><label>الخيار<select value="" onChange={event=>{const kind=event.target.value;onChange([...options,{id:crypto.randomUUID(),name:kind==='color'?'Color':'Size',key:kind,values:[]}]);setEmptyRows(rows=>rows.filter(row=>row!==id));}}><option value="">اختر خيارًا — اللون أو المقاس</option>{!options.some(o=>/color|colour|لون/i.test(o.key||o.name))&&<option value="color">اللون</option>}{!options.some(o=>/size|مقاس/i.test(o.key||o.name))&&<option value="size">المقاس</option>}</select></label><label>القيم<input disabled placeholder="اختر الخيار أولاً"/></label><button type="button" className="quiet" onClick={()=>setEmptyRows(rows=>rows.filter(row=>row!==id))}>إزالة</button></div>)}
 <button type="button" className="quiet" disabled={emptyRows.length>0||options.filter(o=>/color|colour|لون|size|مقاس/i.test(o.key||o.name)).length>=2} onClick={()=>setEmptyRows([crypto.randomUUID()])}>+ إضافة خيار آخر</button>
 <button type="button" onClick={onConfirm}>تأكيد الخيارات</button>
 <button type="button" className="quiet" onClick={()=>{const name=window.prompt('اسم الخيار المخصص');if(name?.trim()&&name.trim().length<=120&&!options.some(option=>normalizeValue(option.name)===normalizeValue(name))){const id=crypto.randomUUID();onChange([...options,{id,name:name.trim(),key:id,values:[]}]);}}}>إضافة خيار مخصص</button>
 </div>;
}
function OptionRow({option,onChange,onRemove}){
 const kind=/color|colour|لون/i.test(option.key||option.name)?'color':/size|مقاس/i.test(option.key||option.name)?'size':'custom';
 const [text,setText]=useState('');const [editing,setEditing]=useState(null);const [message,setMessage]=useState('');
 const commit=()=>{
  if(!text.trim())return;
  if(text.length>200){setMessage('الحد الأقصى 200 حرف');return;}
  const base=editing?option.values.filter(value=>value.id!==editing):option.values;
  if(base.some(value=>normalizeValue(value.label)===normalizeValue(text))){setMessage('هذه القيمة موجودة');return;}
  const old=option.values.find(value=>value.id===editing);
  const next=old?option.values.map(value=>value.id===editing?{...value,label:text.trim()}:value):appendValue(option.values,text,kind);
  onChange({values:next});setText('');setEditing(null);setMessage('');
 };
 const swatch=(value)=>validHex(value.secondaryLabel)?value.secondaryLabel:recognizedColor(value.label);
 return <div className="owner-option-row"><label>الخيار<strong>{kind==='color'?'اللون':kind==='size'?'المقاس':option.name}</strong></label><div className="owner-chip-values"><label>القيم<input dir="auto" aria-label={`قيم ${option.name}`} value={text} list={kind==='color'?`colors-${option.id}`:undefined} onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.nativeEvent.isComposing||event.keyCode===229)return;if(event.key==='Enter'||event.key===','||event.key===' '&&commitOnSpace(text,kind)){event.preventDefault();commit();}if(event.key==='Escape'){setText('');setEditing(null);}}}/></label>{kind==='color'&&<datalist id={`colors-${option.id}`}>{colorNames.map(name=><option key={name} value={name}/>)}</datalist>}<div className="owner-chip-wrap">{option.values.map(value=><span className="owner-option-chip" key={value.id}>{kind==='color'&&<label className="owner-chip-swatch" title={swatch(value)||'لون غير محدد — اختر اللون'} style={{background:swatch(value)||'transparent'}}><input type="color" value={swatch(value)||'#808080'} aria-label={`تصحيح لون ${value.label}`} onChange={event=>onChange({values:option.values.map(v=>v.id===value.id?{...v,secondaryLabel:event.target.value}:v)})}/></label>}<bdi>{value.label}</bdi><button type="button" aria-label={`تعديل ${value.label}`} onClick={()=>{setText(value.label);setEditing(value.id);}}>✎</button><button type="button" aria-label={`إزالة ${value.label}`} onClick={()=>onChange({values:option.values.filter(v=>v.id!==value.id)})}>×</button></span>)}</div><span role="status">{message}</span></div><button type="button" className="quiet" onClick={onRemove}>إزالة الخيار</button></div>;
}
