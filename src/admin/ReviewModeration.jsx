import {useEffect,useState} from 'react';
export function ReviewModeration({api}){
 const [reviews,setReviews]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=async()=>setReviews((await api('/api/admin/marketing/review-list')).reviews);
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 const moderate=async(id,status)=>{setBusy(true);setError('');try{await api(`/api/admin/marketing/reviews/${id}`,{method:'PATCH',body:JSON.stringify({status})});await load();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="marketing-review-list"><h2>مراجعة التقييمات</h2><p>أحدث 200 تقييم. لا تظهر التقييمات للعامة قبل نشرها.</p>{error&&<p role="alert">{error}</p>}{!reviews.length&&<p>لا توجد تقييمات بعد.</p>}{reviews.map(review=><article key={review.id}><div><strong>{review.display_name}</strong><small>{review.author_name} · {review.rating} / 5</small><p>{review.body}</p></div><label>الحالة<select disabled={busy} value={review.status} onChange={e=>moderate(review.id,e.target.value)}><option value="pending">قيد المراجعة</option><option value="published">منشور</option><option value="rejected">مرفوض</option></select></label></article>)}</section>;
}
