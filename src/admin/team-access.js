import {createContext} from 'react';
export const TeamRoleContext=createContext('super_admin');
export function canSetOrderStatus(role,status){
 if(role==='super_admin')return true;
 return (role==='confirmation'?['no_response','confirmed','cancelled']:role==='follow_up'?['no_response','preparing','shipped','delivered','cancelled']:[]).includes(status);
}
