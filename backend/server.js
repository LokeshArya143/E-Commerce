import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { rateLimit } from 'express-rate-limit';
import { seedProducts } from './seed.js';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 10000);
const secret = process.env.JWT_SECRET;
const ownerEmail = process.env.ADMIN_EMAIL;
const ownerPassword = process.env.ADMIN_PASSWORD;
if (!process.env.DATABASE_URL || !secret || !ownerEmail || !ownerPassword) throw new Error('Set DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD in Render.');
const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined,max:5});
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function item(r){return{id:r.id,name:r.name,type:r.type,fabric:r.fabric,color:r.color,occasion:r.occasion,price:Number(r.price),img:r.img,tag:r.tag,quality:r.quality,details:r.details,stock:r.stock}}
function admin(req,res,next){try{const token=String(req.headers.authorization||'').split(' ')[1]||'';req.owner=jwt.verify(token,secret,{issuer:'rama-sarees-api'});next()}catch{res.status(401).json({error:'Please sign in to the owner studio again.'})}}
function validate(input={}){const keys=['name','type','fabric','color','occasion','img','tag','quality','details'];const p=Object.fromEntries(keys.map(k=>[k,String(input[k]||'').trim()]));p.price=Number(input.price);p.stock=input.stock!==false&&input.stock!=='false';if(!p.name||p.name.length>120)return{error:'Enter a product name under 120 characters.'};if(!['Saree','Dress'].includes(p.type))return{error:'Choose Saree or Dress.'};if(!Number.isSafeInteger(p.price)||p.price<1||p.price>10000000)return{error:'Enter a valid price.'};try{if(new URL(p.img).protocol!=='https:')return{error:'Photo links must use HTTPS.'}}catch{return{error:'Add a valid product photo URL.'}}return{product:p}}

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin(origin,cb){if(!origin)return cb(null,true);const parsed=new URL(origin);const local=parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname);const vercel=parsed.protocol==='https:'&&parsed.hostname.endsWith('.vercel.app');const explicit=allowedOrigins.includes(origin);const ok=local||vercel||explicit;cb(ok?null:new Error('Origin not allowed'),ok)}}));
app.use(express.json({limit:'64kb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'rama-sarees-api'}));
app.get('/api/products',async(_req,res,next)=>{try{const{rows}=await pool.query('SELECT * FROM products ORDER BY created_at DESC,id ASC');res.json(rows.map(item))}catch(e){next(e)}});
app.post('/api/admin/login',rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:'draft-7',legacyHeaders:false}),(req,res)=>{const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');if(!equal(email,ownerEmail.toLowerCase())||!equal(password,ownerPassword))return res.status(401).json({error:'Email or password is incorrect.'});const token=jwt.sign({sub:email,role:'owner'},secret,{issuer:'rama-sarees-api',expiresIn:'2h'});res.json({token,expiresIn:7200})});
app.get('/api/admin/products',admin,async(_req,res,next)=>{try{const{rows}=await pool.query('SELECT * FROM products ORDER BY created_at DESC,id ASC');res.json(rows.map(item))}catch(e){next(e)}});
app.post('/api/admin/products',admin,async(req,res,next)=>{const{product,error}=validate(req.body);if(error)return res.status(400).json({error});const p={...product,id:crypto.randomUUID()};try{const{rows}=await pool.query('INSERT INTO products(id,name,type,fabric,color,occasion,price,img,tag,quality,details,stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[p.id,p.name,p.type,p.fabric,p.color,p.occasion,p.price,p.img,p.tag,p.quality,p.details,p.stock]);res.status(201).json(item(rows[0]))}catch(e){next(e)}});
app.put('/api/admin/products/:id',admin,async(req,res,next)=>{const{product,error}=validate(req.body);if(error)return res.status(400).json({error});const p=product;try{const{rows}=await pool.query('UPDATE products SET name=$2,type=$3,fabric=$4,color=$5,occasion=$6,price=$7,img=$8,tag=$9,quality=$10,details=$11,stock=$12,updated_at=NOW() WHERE id=$1 RETURNING *',[req.params.id,p.name,p.type,p.fabric,p.color,p.occasion,p.price,p.img,p.tag,p.quality,p.details,p.stock]);if(!rows[0])return res.status(404).json({error:'Product not found.'});res.json(item(rows[0]))}catch(e){next(e)}});
app.delete('/api/admin/products/:id',admin,async(req,res,next)=>{try{const{rowCount}=await pool.query('DELETE FROM products WHERE id=$1',[req.params.id]);if(!rowCount)return res.status(404).json({error:'Product not found.'});res.status(204).end()}catch(e){next(e)}});
app.use((e,_req,res,_next)=>{console.error(e.message);res.status(e.message==='Origin not allowed'?403:500).json({error:e.message==='Origin not allowed'?'Website origin not allowed.':'The store service is temporarily unavailable.'})});
async function start(){
 await pool.query("CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('Saree','Dress')),fabric TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '',occasion TEXT NOT NULL DEFAULT '',price INTEGER NOT NULL CHECK(price>0),img TEXT NOT NULL,tag TEXT NOT NULL DEFAULT '',quality TEXT NOT NULL DEFAULT '',details TEXT NOT NULL DEFAULT '',stock BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 const{rows}=await pool.query('SELECT COUNT(*)::int AS count FROM products');
 if(rows[0].count===0){for(const p of seedProducts())await pool.query('INSERT INTO products(id,name,type,fabric,color,occasion,price,img,tag,quality,details,stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING',[p.id,p.name,p.type,p.fabric,p.color,p.occasion,p.price,p.img,p.tag,p.quality,p.details,p.stock]);console.log('Seeded 50 sample sarees and 12 sample dresses.')}
 app.listen(port,'0.0.0.0',()=>console.log('Rama Sarees API listening on '+port));
}
start().catch(e=>{console.error('API startup failed:',e.message);process.exit(1)});
