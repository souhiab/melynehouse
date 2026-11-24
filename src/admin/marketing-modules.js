export const marketingModules=[
 {key:'discounts',label:'الخصومات',english:'Discounts',icon:'Percent',description:'إعداد قسائم وعروض ترويجية للمتجر',kind:'store',fields:[['code','رمز القسيمة'],['amount','نسبة الخصم المقترحة (%)']]},
 {key:'upsells',label:'المنتجات الإضافية',english:'Upsells',icon:'Tag',description:'اختيار منتجات مكملة لعرضها مع الطلب',kind:'store',fields:[['productIds','مراجع المنتجات المقترحة']]},
 {key:'facebook',label:'Facebook Pixels',icon:'FacebookLogo',description:'إعداد معرّفات تتبع حملات Facebook',kind:'pixel',fields:[['identifier','Pixel ID']]},
 {key:'tiktok',label:'TikTok Pixel',icon:'TiktokLogo',description:'إعداد تتبع أداء حملات TikTok',kind:'pixel',fields:[['identifier','Pixel ID']]},
 {key:'chatgpt',label:'ChatGPT Pixel',icon:'ChatCircleDots',description:'مراجعة متطلبات ربط إشارات التسوق',kind:'unsupported',fields:[]},
 {key:'reviews',label:'تقييمات المنتجات',english:'Reviews',icon:'Star',description:'إعداد سياسة جمع التقييمات ومراجعتها',kind:'store',fields:[['moderation','ملاحظات سياسة مراجعة التقييمات']]},
 {key:'linkedin',label:'LinkedIn Pixel',icon:'LinkedinLogo',description:'إعداد معرّف Insight Tag لحملات LinkedIn',kind:'pixel',fields:[['identifier','Partner ID']]},
 {key:'twitter',label:'X / Twitter Pixel',icon:'XLogo',description:'إعداد معرّف تتبع حملات X',kind:'pixel',fields:[['identifier','Pixel ID']]},
 {key:'snapchat',label:'Snapchat Pixel',icon:'SnapchatLogo',description:'إعداد معرّف تتبع حملات Snapchat',kind:'pixel',fields:[['identifier','Pixel ID']]},
 {key:'google-ads',label:'Google Ads',icon:'GoogleLogo',description:'إعداد معرّف التحويل ووسمه لحملات Google',kind:'pixel',fields:[['identifier','Conversion ID'],['conversionLabel','Conversion label']]},
];
export const marketingTab=key=>`marketing-${key}`;
