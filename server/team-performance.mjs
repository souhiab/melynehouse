import {z} from 'zod';
import {transaction} from './db.mjs';
export function installTeamPerformance(app,db,wrap,audit){
 app.get('/api/admin/team/performance',wrap(async(req,res)=>{
  const members=(await db.query(`SELECT u.id,u.display_name,u.disabled_at,u.role,
   count(a.order_id)::int assigned,
   count(a.order_id) FILTER (WHERE a.confirmed_at IS NOT NULL AND a.confirmed_by=u.id)::int confirmed,
   count(a.order_id) FILTER (WHERE a.confirmed_at IS NOT NULL AND a.confirmed_by<>u.id)::int confirmed_by_other
   FROM admin_users u LEFT JOIN order_assignments a ON a.assigned_to=u.id
   WHERE u.role='confirmation' OR EXISTS(SELECT 1 FROM order_assignments old WHERE old.assigned_to=u.id)
   GROUP BY u.id ORDER BY u.display_name,u.id`)).rows.map(m=>({...m,rate:m.assigned?Math.round(m.confirmed/m.assigned*10000)/100:null}));
  const queue=(await db.query(`SELECT o.id,o.order_number,o.status,a.assigned_to,a.assigned_at
   FROM orders o LEFT JOIN order_assignments a ON a.order_id=o.id
   WHERE o.status IN ('new','no_response') ORDER BY o.created_at DESC,o.id LIMIT 100`)).rows;
  res.json({members,queue,queueLimit:100,asOf:new Date().toISOString()});
 }));
 app.put('/api/admin/team/assignments/:orderId',wrap(async(req,res)=>{
  const parsed=z.object({assignedTo:z.string().uuid()}).strict().safeParse(req.body);
  if(!parsed.success||!z.string().uuid().safeParse(req.params.orderId).success)return res.status(400).json({error:'Select a valid order and employee'});
  await transaction(db,async client=>{
   const order=(await client.query('SELECT status FROM orders WHERE id=$1 FOR UPDATE',[req.params.orderId])).rows[0];
   if(!order)throw Object.assign(new Error('Order not found'),{status:404});
   if(!['new','no_response'].includes(order.status))throw Object.assign(new Error('Only pending or no-response orders can be assigned'),{status:409});
   const user=(await client.query("SELECT id FROM admin_users WHERE id=$1 AND role='confirmation' AND disabled_at IS NULL FOR SHARE",[parsed.data.assignedTo])).rows[0];
   if(!user)throw Object.assign(new Error('Select an active confirmation employee'),{status:400});
   const prior=(await client.query('SELECT * FROM order_assignments WHERE order_id=$1',[req.params.orderId])).rows[0];
   if(prior?.confirmed_at)throw Object.assign(new Error('Confirmed assignments cannot be changed'),{status:409});
   if(prior?.assigned_to===user.id)return;
   await client.query(`INSERT INTO order_assignments(order_id,assigned_to,assigned_by) VALUES($1,$2,$3)
    ON CONFLICT(order_id) DO UPDATE SET assigned_to=EXCLUDED.assigned_to,assigned_by=EXCLUDED.assigned_by,assigned_at=now()`,[req.params.orderId,user.id,req.admin.user_id]);
   await audit(client,req.admin.user_id,'assign_order','order',req.params.orderId,{from:prior?.assigned_to||null,to:user.id});
  });res.json({saved:true});
 }));
}
