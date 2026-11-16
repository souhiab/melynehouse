const option=(item,pattern)=>item.variantSnapshot.selections.find(selection=>pattern.test(selection.optionKey||selection.option))?.value||'';
const itemSummary=item=>[item.productSnapshot.originalName,option(item,/color|colour|لون/i),option(item,/size|مقاس/i),`× ${item.quantity}`].filter(Boolean).join(' · ');

// No default spreadsheet layout. Each approved destination column must be explicitly mapped.
// These are Google UpdateCells-compatible literal values, never formulaValue / USER_ENTERED.
export function mapSheetEvent(event,{columns,mode}={}) {
  if(!['order','items'].includes(mode)||!Array.isArray(columns)||!columns.length)throw new Error('Approved columns and multi-item mode required');
  if(new Set(columns.map(column=>column.header)).size!==columns.length)throw new Error('Duplicate destination headers');
  const order=event.order;
  const common={eventId:event.eventId,orderId:order.id,orderNumber:order.orderNumber,createdAt:order.createdAt,
    initialStatus:order.status,source:order.source,currency:order.currency,customerName:order.customer.name,
    customerPhone:order.customer.phone,city:order.customer.city,address:order.customer.address,note:order.note||'',
    itemsSummary:order.items.map(itemSummary).join('\n')};
  const records=mode==='order'?[{...common,orderTotalMad:order.totalMad}]:order.items.map((item,index)=>({...common,
    itemId:item.id,productName:item.productSnapshot.originalName,sku:item.productSnapshot.sku||'',color:option(item,/color|colour|لون/i),
    size:option(item,/size|مقاس/i),quantity:item.quantity,unitPriceMad:item.unitPriceMad,lineTotalMad:Math.round(item.unitPriceMad*100)*item.quantity/100,
    // A single copy of the order total avoids silently multiplying totals in sheet formulas.
    orderTotalMad:index===0?order.totalMad:''}));
  return records.map(record=>({values:columns.map(column=>{
    if(typeof column.header!=='string'||!column.header.trim()||!Object.hasOwn(record,column.field))throw new Error('Unknown mapping field/header');
    const value=record[column.field];
    return {userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value)}};
  })}));
}
