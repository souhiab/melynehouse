import {useEffect,useState} from 'react';
export function useStoreMarketing(){
 const [settings,setSettings]=useState({upsellProductIds:[],reviewsEnabled:false});
 useEffect(()=>{let live=true;fetch('/api/public/marketing').then(r=>r.ok?r.json():null).then(data=>{if(live&&data)setSettings(data);}).catch(()=>{});return()=>{live=false;};},[]);
 return settings;
}
export function ProductReviews({productId,enabled}){
 const [reviews,setReviews]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setReviews([]);setMessage('');if(!enabled)return;let live=true;fetch(`/api/public/products/${encodeURIComponent(productId)}/reviews`).then(r=>r.ok?r.json():null).then(data=>{if(live)setReviews(data?.reviews||[]);}).catch(()=>{});return()=>{live=false;};},[productId,enabled]);
 if(!enabled)return null;
 const submit=async event=>{event.preventDefault();const form=event.currentTarget,values=new FormData(form);setBusy(true);setMessage('');try{const response=await fetch(`/api/public/products/${encodeURIComponent(productId)}/reviews`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({authorName:values.get('authorName'),rating:Number(values.get('rating')),body:values.get('body')})});const data=await response.json();if(!response.ok)throw Error(data.error||'تعذر إرسال التقييم');setMessage('شكراً لك، سيظهر تقييمك بعد المراجعة.');form.reset();}catch(error){setMessage(error.message);}finally{setBusy(false);}};
 return <section className="product-reviews"><h2>تقييمات العملاء</h2>{reviews.length?reviews.map(review=><article key={review.id}><strong>{review.author_name}</strong><span aria-label={`${review.rating} من 5`}>{review.rating} / 5</span><p>{review.body}</p></article>):<p>لا توجد تقييمات منشورة بعد.</p>}<details><summary>أضف تقييمك</summary><form onSubmit={submit}><label>الاسم المعروض علناً<input name="authorName" required minLength={2} maxLength={80}/></label><label>التقييم<select name="rating" defaultValue="5">{[5,4,3,2,1].map(value=><option key={value} value={value}>{value} / 5</option>)}</select></label><label>رأيك في المنتج<textarea name="body" required minLength={5} maxLength={2000}/></label><small>اكتب رأيك دون أرقام هاتف أو معلومات شخصية. التقييمات تخضع للمراجعة ولا تعني التحقق من الشراء.</small><button className="primary-button" disabled={busy}>{busy?'جارٍ الإرسال…':'إرسال للمراجعة'}</button>{message&&<p role="status">{message}</p>}</form></details></section>;
}
