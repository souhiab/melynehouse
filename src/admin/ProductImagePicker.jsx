import {useEffect,useRef,useState} from 'react';

export function ProductImagePicker({api,onInsert,onClose}){
 const [library,setLibrary]=useState([]),[selected,setSelected]=useState([]),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const urls=useRef([]),panel=useRef(null);
 useEffect(()=>{
  let active=true;const previous=document.activeElement;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  api('/api/admin/image-library').then(data=>{if(active)setLibrary(data.items);}).catch(failure=>{if(active)setError(failure.message);});
  panel.current?.focus();
  return()=>{active=false;urls.current.forEach(URL.revokeObjectURL);document.body.style.overflow=overflow;previous?.focus?.();};
 },[]);
 const addFiles=async files=>{
  if(busy)return;
  const next=[];
  for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){setError('الصور المقبولة JPG وPNG وWebP حتى 10 MB لكل صورة');continue;}const preview=URL.createObjectURL(file);urls.current.push(preview);next.push({key:crypto.randomUUID(),file,preview,label:file.name});}
  if(!next.length)return;
  setBusy(true);setError('');
  const remaining=new Set(next.map(item=>item.key));
  try{
    for(let index=0;index<next.length;index++){
      const item=next[index];const body=new FormData();body.append('image',item.file);
      const saved=await api('/api/admin/uploads',{method:'POST',body});
      next[index]={key:item.key,assetId:saved.id,preview:saved.publicUrl,label:item.label};
    }
    await onInsert(next,key=>remaining.delete(key));
    onClose();
  }catch(failure){
    setError(failure.message);
    setSelected(current=>[...current,...next.filter(item=>remaining.has(item.key))]);
  }finally{setBusy(false);}
 };
 const move=(index,offset)=>setSelected(current=>{const next=[...current];[next[index],next[index+offset]]=[next[index+offset],next[index]];return next;});
 const insert=async()=>{setBusy(true);setError('');try{await onInsert(selected,key=>setSelected(current=>current.filter(item=>item.key!==key)));onClose();}catch(failure){setError(failure.message);}finally{setBusy(false);}};
 return <div className="owner-media-overlay" onKeyDown={event=>{
  if(event.key==='Escape'&&!busy)onClose();
  if(event.key==='Tab'){const nodes=[...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')];const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
 }}><section ref={panel} tabIndex={-1} className="owner-media-picker" role="dialog" aria-modal="true" aria-labelledby="media-picker-title" dir="rtl"><header><h2 id="media-picker-title">اختيار صور المنتج</h2><button type="button" disabled={busy} onClick={onClose} aria-label="إغلاق اختيار الصور">×</button></header><div className="owner-media-content"><label>البحث في المكتبة<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="اسم المنتج أو الصورة"/></label><label className="owner-image-drop">رفع صور من الجهاز<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event=>{addFiles(event.target.files);event.target.value='';}} disabled={busy}/><small>JPG / PNG / WebP · 10 MB لكل صورة</small></label>{error&&<p role="alert" className="owner-error">{error}</p>}<h3>المكتبة</h3><div className="owner-media-grid">{library.filter(image=>`${image.productName} ${image.altText||''}`.toLowerCase().includes(search.toLowerCase())).map(image=><button type="button" key={image.id} aria-pressed={selected.some(item=>item.key===image.id)} onClick={()=>setSelected(current=>current.some(item=>item.key===image.id)?current.filter(item=>item.imageId!==image.id):[...current,{key:image.id,imageId:image.imageId,assetId:image.assetId,preview:image.localOptimizedPath,label:image.productName}])}><img src={image.localOptimizedPath} alt={image.altText||image.productName} loading="lazy"/><span>{image.productName}</span></button>)}</div><h3>الصور المختارة — الأولى رئيسية عند إنشاء المنتج</h3><ol className="owner-media-selection">{selected.map((item,index)=><li key={item.key}><img src={item.preview} alt=""/><span>{index+1}. {item.label}</span><button type="button" disabled={index===0||busy} onClick={()=>move(index,-1)} aria-label={`تقديم الصورة ${index+1}`}>↑</button><button type="button" disabled={index===selected.length-1||busy} onClick={()=>move(index,1)} aria-label={`تأخير الصورة ${index+1}`}>↓</button><button type="button" disabled={busy} onClick={()=>setSelected(current=>current.filter(value=>value.key!==item.key))} aria-label={`إزالة الصورة المختارة ${index+1}`}>×</button></li>)}</ol></div><footer><button type="button" disabled={!selected.length||busy} onClick={insert}>{busy?'جارٍ الإدراج…':`إدراج الصور (${selected.length})`}</button></footer></section></div>;
}
