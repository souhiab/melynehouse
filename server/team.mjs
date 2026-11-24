import crypto from 'node:crypto';
import { z } from 'zod';
import { hashPassword } from './security.mjs';
import { transaction } from './db.mjs';
import {installTeamPerformance} from './team-performance.mjs';

export const staffRoles = ['confirmation','follow_up','products_marketing'];
export function allowedAdminRequest(role, method, path, body={}) {
  if(role==='super_admin') return true;
  if(!staffRoles.includes(role)) return false;
  if(role==='products_marketing') return /^\/(marketing|products|categories|banners|banner-order|product-order|ordering|image-library|uploads)(\/|$)/.test(path);
  if(method==='GET') return /^\/orders(\/[^/]+)?$/.test(path)||path==='/products';
  if(method==='POST'&&path==='/orders') return true;
  if(method==='PATCH'&&/^\/orders\/[^/]+\/confirmation-outcome$/.test(path))return role==='confirmation';
  if(method==='PATCH'&&/^\/orders\/[^/]+$/.test(path)) return (role==='confirmation'?['no_response','confirmed','cancelled']:['no_response','preparing','shipped','delivered','cancelled']).includes(body.status);
  return false;
}
const schema=z.object({email:z.string().trim().email().max(254),displayName:z.string().trim().min(1).max(100),role:z.enum(staffRoles),password:z.string().min(12).max(128).optional(),active:z.boolean().optional()}).strict();
export function installTeamRoutes(app,db,wrap,audit) {
  installTeamPerformance(app,db,wrap,audit);
  app.get('/api/admin/team',wrap(async(req,res)=>{
    const users=(await db.query('SELECT id,email,display_name,role,disabled_at,created_at,(SELECT max(created_at) FROM admin_audit_log a WHERE a.admin_user_id=u.id AND action=\'login\') last_login_at FROM admin_users u ORDER BY created_at,id')).rows;
    res.json({users});
  }));
  app.get('/api/admin/team/activity',wrap(async(req,res)=>{
    const userId=req.query.userId;
    if(userId&&!z.string().uuid().safeParse(userId).success)return res.status(400).json({error:'Invalid user ID'});
    const events=(await db.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.created_at,u.display_name FROM admin_audit_log a LEFT JOIN admin_users u ON u.id=a.admin_user_id ${userId?'WHERE a.admin_user_id=$1':''} ORDER BY a.created_at DESC,a.id LIMIT 200`,userId?[userId]:[])).rows;
    res.json({events});
  }));
  app.get('/api/admin/team/analytics',wrap(async(req,res)=>{
    const userId=req.query.userId;
    if(userId&&!z.string().uuid().safeParse(userId).success)return res.status(400).json({error:'Invalid user ID'});
    const members=(await db.query(`SELECT u.id,u.display_name,u.disabled_at,
      max(a.created_at) FILTER (WHERE a.action='login') last_login_at,
      max(a.created_at) FILTER (WHERE a.action='logout') last_logout_at,
      count(a.id) FILTER (WHERE a.action='login' AND a.created_at>=now()-INTERVAL '30 days')::int logins,
      count(a.id) FILTER (WHERE a.action='logout' AND a.created_at>=now()-INTERVAL '30 days')::int logouts,
      (SELECT count(*)::int FROM admin_sessions s WHERE s.user_id=u.id AND s.expires_at>now() AND u.disabled_at IS NULL) valid_sessions
      FROM admin_users u LEFT JOIN admin_audit_log a ON a.admin_user_id=u.id AND a.entity_type='admin_session'
      ${userId?'WHERE u.id=$1':''} GROUP BY u.id ORDER BY u.created_at,u.id`,userId?[userId]:[])).rows;
    const events=(await db.query(`SELECT a.id,a.action,a.created_at,u.display_name FROM admin_audit_log a
      LEFT JOIN admin_users u ON u.id=a.admin_user_id WHERE a.entity_type='admin_session' AND a.action IN ('login','logout')
      AND a.created_at>=now()-INTERVAL '30 days' ${userId?'AND a.admin_user_id=$1':''}
      ORDER BY a.created_at DESC,a.id LIMIT 200`,userId?[userId]:[])).rows;
    res.json({asOf:new Date().toISOString(),periodDays:30,members,events,eventLimit:200});
  }));
  app.post('/api/admin/team',wrap(async(req,res)=>{
    const parsed=schema.safeParse(req.body);
    if(!parsed.success||!parsed.data.password)return res.status(400).json({error:'Name, valid email, staff role and password (12–128 characters) are required'});
    const v=parsed.data,id=crypto.randomUUID(),hash=await hashPassword(v.password);
    await transaction(db,async client=>{
      await client.query('INSERT INTO admin_users(id,email,display_name,password_hash,role,disabled_at) VALUES($1,$2,$3,$4,$5,$6)',[id,v.email.toLowerCase(),v.displayName,hash,v.role,v.active===false?new Date():null]);
      await audit(client,req.admin.user_id,'create_staff','admin_user',id,{role:v.role});
    });
    res.status(201).json({id});
  }));
  app.put('/api/admin/team/:id',wrap(async(req,res)=>{
    const parsed=schema.safeParse(req.body);
    if(!parsed.success||!z.string().uuid().safeParse(req.params.id).success)return res.status(400).json({error:'Invalid staff details'});
    const v=parsed.data,hash=v.password?await hashPassword(v.password):null;
    await transaction(db,async client=>{
      const row=(await client.query('SELECT role FROM admin_users WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      if(!row)throw Object.assign(new Error('Staff account not found'),{status:404});
      if(row.role==='super_admin')throw Object.assign(new Error('Super administrator accounts cannot be changed here'),{status:403});
      await client.query('UPDATE admin_users SET email=$1,display_name=$2,role=$3,password_hash=COALESCE($4,password_hash),disabled_at=$5,updated_at=now() WHERE id=$6',[v.email.toLowerCase(),v.displayName,v.role,hash,v.active===false?new Date():null,req.params.id]);
      await client.query('DELETE FROM admin_sessions WHERE user_id=$1',[req.params.id]);
      await audit(client,req.admin.user_id,'update_staff','admin_user',req.params.id,{role:v.role,active:v.active!==false,passwordChanged:Boolean(hash)});
    });
    res.json({id:req.params.id});
  }));
}
