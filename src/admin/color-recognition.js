export const normalizeValue=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0640]/g,'').replace(/[أإآ]/g,'ا').trim().replace(/\s+/g,' ').toLowerCase();
const groups=[
 ['#000000','Black','Noir','أسود'],['#FFFFFF','White','Blanc','أبيض'],['#FF0000','Red','Rouge','أحمر'],
 ['#008000','Green','Vert','أخضر'],['#0000FF','Blue','Bleu','أزرق'],['#FFFF00','Yellow','Jaune','أصفر'],
 ['#FFA500','Orange','برتقالي'],['#FFC0CB','Pink','Rose','وردي'],['#800080','Purple','Violet','بنفسجي'],
 ['#8B4513','Brown','Marron','بني'],['#808080','Grey','Gray','Gris','رمادي'],['#F5F5DC','Beige','بيج'],
 ['#800020','Bordeaux','Burgundy','عنابي'],['#000080','Navy','Navy Blue','Blue Marine','Bleu Marine','كحلي'],
 ['#ADD8E6','Light Blue','Bleu Clair','أزرق فاتح'],['#006400','Dark Green','Vert Foncé','أخضر داكن'],
 ['#D3D3D3','Light Grey','Light Gray','Gris Clair'],['#C0C0C0','Silver','Argent','فضي'],['#FFD700','Gold','Doré','ذهبي']
];
export const colorNames=groups.flatMap(([, ...aliases])=>aliases);
const colors=new Map(groups.flatMap(([hex,...aliases])=>aliases.map(alias=>[normalizeValue(alias),hex])));
export const validHex=value=>/^#[\da-f]{6}$/i.test(value||'');
export function recognizedColor(label){
 const name=normalizeValue(label);
 return colors.get(name)||colors.get(name.replace(/^p\d+[\s-]+/,'') )||null;
}
export function commitOnSpace(text,kind){
 const value=normalizeValue(text);
 if(!value||/\s/.test(value))return false;
 if(kind==='size')return /^(?:xs|s|m|l|xl|xxl|xxxl|\d+xl)$/i.test(value);
 return colors.has(value)&&!colorNames.some(name=>normalizeValue(name).startsWith(value+' '));
}
export function appendValue(values,label,kind){
 if(!label.trim()||label.length>200)return values;
 if(values.some(value=>normalizeValue(value.label)===normalizeValue(label)))return values;
 return [...values,{id:crypto.randomUUID(),label:label.trim(),secondaryLabel:kind==='color'?recognizedColor(label):label.trim()}];
}
