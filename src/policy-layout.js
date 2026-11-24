const headings=new Set(['طرق الدفع','تدابير أمنية','سياسة الاسترجاع','جمع المعلومات','كيف نستخدم معلوماتك','كيف نشارك المعلومات الخاصة بك','كيف نحمي معلوماتك','حقوقك','التغييرات على سياسة الخصوصية هذه','اتصل بالشركة']);

// Presentation only: retain original words and group adjacent lines into paragraphs.
export function policyBlocks(text){
 const result=[];let paragraph=[];
 const flush=()=>{if(paragraph.length){result.push({type:'paragraph',text:paragraph.join(' ')});paragraph=[];}};
 const lines=String(text||'').split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();
  if(!line){flush();continue;}
  if(headings.has(line)){flush();result.push({type:'heading',text:line});continue;}
  if(/^(البريد الالكتروني|رقم الهاتف)\s*:$/.test(line)){
   flush();let next=i+1;while(next<lines.length&&!lines[next].trim())next++;
   if(next<lines.length){result.push({type:'contact',label:line,text:lines[next].trim()});i=next;continue;}
  }
  paragraph.push(line);
 }
 flush();return result;
}
