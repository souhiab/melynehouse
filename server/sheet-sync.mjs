import crypto from 'node:crypto';
import { verifiedReceipt } from './sheet-event.mjs';

export const signSheetBody = (secret, body) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
export function validSheetSignature(secret, body, signature) {
  const expected=Buffer.from(signSheetBody(secret,body));
  const actual=Buffer.from(typeof signature==='string'?signature:'');
  return actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
}
export function sheetDeliveryEnabled(config) {
  return config.sheetSyncEnabled===true && !!config.googleSheetsWebhookUrl && !!config.googleSheetsWebhookSecret;
}
export function validateSheetEndpoint(config) {
  if(!sheetDeliveryEnabled(config))throw new Error('Sheet worker is disabled or not configured');
  let url;try{url=new URL(config.googleSheetsWebhookUrl);}catch{throw new Error('Sheet endpoint URL is invalid');}
  const mockLoopback=!config.production && config.sheetSyncAllowLoopback===true
    && ['127.0.0.1','localhost','[::1]'].includes(url.hostname) && url.protocol==='http:';
  if(url.username||url.password||url.hash || (!mockLoopback &&
    (url.protocol!=='https:' || !config.sheetSyncAllowedOrigin || url.origin!==config.sheetSyncAllowedOrigin)))
    throw new Error('Sheet endpoint must use the approved HTTPS origin (or explicit local mock)');
}
export function retryDelay(attempt,retryAfter,now=Date.now()) {
  const exponential=Math.min(3600,30*2**Math.min(10,Math.max(0,attempt-1)));
  let remote=0;
  if(retryAfter){remote=/^\d+$/.test(retryAfter)?Number(retryAfter):Math.ceil((Date.parse(retryAfter)-now)/1000);if(!Number.isFinite(remote))remote=0;}
  return Math.min(86400,Math.max(exponential,remote));
}
// Safe diagnostic codes only: never retain a remote body, URL or raw exception.
export async function deliverSheetEvent(config,event,fetchImpl=globalThis.fetch) {
  validateSheetEndpoint(config);
  const body=JSON.stringify(event);
  try{
    const response=await fetchImpl(config.googleSheetsWebhookUrl,{method:'POST',redirect:'error',
      headers:{'content-type':'application/json','x-melyne-signature':signSheetBody(config.googleSheetsWebhookSecret,body)},body,signal:AbortSignal.timeout(8000)});
    if(!response.ok){const status=response.status;return {ok:false,httpStatus:status,errorCode:`HTTP_${status}`,
      retryable:status===429||status===408||status>=500,retryAfter:status===429||status===503?response.headers?.get('retry-after'):null};}
    const raw=await response.text();
    if(raw.length>8192||!validSheetSignature(config.googleSheetsWebhookSecret,raw,response.headers.get('x-melyne-receipt-signature')))
      return {ok:false,httpStatus:response.status,errorCode:'INVALID_ACK_SIGNATURE',retryable:false};
    let value;try{value=JSON.parse(raw);}catch{return {ok:false,httpStatus:response.status,errorCode:'INVALID_ACK',retryable:false};}
    const receipt=verifiedReceipt(value,event);
    return receipt?{ok:true,httpStatus:response.status,receipt}:{ok:false,httpStatus:response.status,errorCode:'INVALID_ACK',retryable:false};
  }catch{return {ok:false,httpStatus:null,errorCode:'NETWORK_OR_TIMEOUT',retryable:true};}
}
