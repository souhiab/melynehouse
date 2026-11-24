export function nextConfirmationPage(page,total,currentLeftFilter){
 return currentLeftFilter?Math.max(1,Math.min(page,total)):page+1;
}
export function productInventoryLabel(item){
 const value=item.currentInventory;
 if(!value||value.productStatus==='unknown')return 'المخزون الحالي غير معروف';
 if(value.retired)return 'التوليفة مؤرشفة';
 if(value.productStatus!=='published')return 'المنتج غير منشور';
 if(!value.available)return 'التوليفة غير متاحة';
 if(!Number.isInteger(value.stockQuantity))return 'المخزون الحالي غير معروف';
 return value.stockQuantity>0?`المخزون الحالي: ${value.stockQuantity}`:'نفد المخزون';
}
