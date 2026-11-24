export const legacyRandomSku=value=>/^MLY-[A-F0-9]{32}$/i.test(value||'');
export async function productSku(client,requested,existing){
  const supplied=typeof requested==='string'?requested.trim():'';
  if(supplied&&!legacyRandomSku(supplied))return supplied;
  if(existing&&!legacyRandomSku(existing))return existing;
  for(;;){
    const row=(await client.query("UPDATE product_reference_counter SET last_number=last_number+1 WHERE name='product' RETURNING last_number")).rows[0];
    if(!row)throw new Error('Product reference counter migration is required');
    const sku=`MLY-P${String(row.last_number).padStart(4,'0')}`;
    if(!(await client.query('SELECT id FROM products WHERE sku=$1',[sku])).rowCount)return sku;
  }
}
