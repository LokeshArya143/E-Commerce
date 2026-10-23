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
const publicApiUrl = String(process.env.PUBLIC_API_URL || 'https://rama-sarees-api.onrender.com').replace(/\/+$/, '');
if (!process.env.DATABASE_URL || !secret || !ownerEmail || !ownerPassword) throw new Error('Set DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD in Render.');
const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined,max:5});
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function item(r){return{id:r.id,name:r.name,type:r.type,fabric:r.fabric,color:r.color,occasion:r.occasion,price:Number(r.price),img:r.img,tag:r.tag,quality:r.quality,details:r.details,stock:r.stock,images:Array.isArray(r.images)?r.images:[],customFields:r.custom_fields||{}}}
function admin(req,res,next){try{const token=String(req.headers.authorization||'').split(' ')[1]||'';req.owner=jwt.verify(token,secret,{issuer:'rama-sarees-api'});next()}catch{res.status(401).json({error:'Please sign in to the owner studio again.'})}}
function validate(input={}){const keys=['name','type','fabric','color','occasion','img','tag','quality','details'];const p=Object.fromEntries(keys.map(k=>[k,String(input[k]||'').trim()]));p.price=Number(input.price);p.stock=input.stock!==false&&input.stock!=='false';const raw=input.customFields&&typeof input.customFields==='object'&&!Array.isArray(input.customFields)?input.customFields:{};const entries=Object.entries(raw);if(entries.length>12)return{error:'Use up to 12 custom catalog columns.'};p.customFields=Object.fromEntries(entries.map(([k,v])=>[String(k).trim().slice(0,40),String(v||'').trim().slice(0,300)]).filter(([k])=>k));if(!p.name||p.name.length>120)return{error:'Enter a product name under 120 characters.'};if(!['Saree','Cultural Saree','Blouse Piece','Dress'].includes(p.type))return{error:'Choose a valid product type.'};if(!Number.isSafeInteger(p.price)||p.price<99||p.price>3998)return{error:'Set the price between ₹99 and ₹3,998.'};if(p.img){try{if(new URL(p.img).protocol!=='https:')return{error:'Photo links must use HTTPS.'}}catch{return{error:'Add a valid product photo URL.'}}}return{product:p}}

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin(origin,cb){if(!origin)return cb(null,true);const parsed=new URL(origin);const local=parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname);const vercel=parsed.protocol==='https:'&&parsed.hostname.endsWith('.vercel.app');const explicit=allowedOrigins.includes(origin);const ok=local||vercel||explicit;cb(ok?null:new Error('Origin not allowed'),ok)}}));
app.use(express.json({limit:'1mb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'rama-sarees-api'}));
app.get('/api/products',async(_req,res,next)=>{try{const{rows}=await pool.query('SELECT * FROM products ORDER BY created_at DESC,id ASC');res.json(rows.map(item))}catch(e){next(e)}});
app.get('/api/promo',async(_req,res,next)=>{try{const{rows}=await pool.query("SELECT value FROM store_settings WHERE key='first_order_offer'");res.json(rows[0]?.value||{active:true,percent:25,message:'Enjoy 25% off your first order.'})}catch(e){next(e)}});
app.post('/api/admin/login',rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:'draft-7',legacyHeaders:false}),(req,res)=>{const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');if(!equal(email,ownerEmail.toLowerCase())||!equal(password,ownerPassword))return res.status(401).json({error:'Email or password is incorrect.'});const token=jwt.sign({sub:email,role:'owner'},secret,{issuer:'rama-sarees-api',expiresIn:'2h'});res.json({token,expiresIn:7200})});
app.get('/api/admin/products',admin,async(_req,res,next)=>{try{const{rows}=await pool.query('SELECT * FROM products ORDER BY created_at DESC,id ASC');res.json(rows.map(item))}catch(e){next(e)}});
app.put('/api/admin/promo',admin,async(req,res,next)=>{const percent=Number(req.body?.percent),message=String(req.body?.message||'').trim();const value={active:req.body?.active===true,percent,message};if(!Number.isInteger(percent)||percent<1||percent>100)return res.status(400).json({error:'Offer must be between 1% and 100%.'});if(!message||message.length>180)return res.status(400).json({error:'Enter offer text under 180 characters.'});try{await pool.query("INSERT INTO store_settings(key,value) VALUES('first_order_offer',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",[JSON.stringify(value)]);res.json(value)}catch(e){next(e)}});
app.post('/api/admin/products',admin,async(req,res,next)=>{const{product,error}=validate(req.body);if(error)return res.status(400).json({error});const p={...product,id:crypto.randomUUID()};try{const{rows}=await pool.query("INSERT INTO products(id,name,type,fabric,color,occasion,price,img,tag,quality,details,stock,custom_fields,images) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,jsonb_build_array($8::text,'','')) RETURNING *",[p.id,p.name,p.type,p.fabric,p.color,p.occasion,p.price,p.img,p.tag,p.quality,p.details,p.stock,p.customFields]);res.status(201).json(item(rows[0]))}catch(e){next(e)}});
app.put('/api/admin/products/:id',admin,async(req,res,next)=>{const{product,error}=validate(req.body);if(error)return res.status(400).json({error});const p=product;try{const{rows}=await pool.query("UPDATE products SET name=$2,type=$3,fabric=$4,color=$5,occasion=$6,price=$7,img=$8,tag=$9,quality=$10,details=$11,stock=$12,custom_fields=$13,images=jsonb_build_array($8::text,COALESCE(NULLIF(images->>1,''),''),COALESCE(NULLIF(images->>2,''),'')),updated_at=NOW() WHERE id=$1 RETURNING *",[req.params.id,p.name,p.type,p.fabric,p.color,p.occasion,p.price,p.img,p.tag,p.quality,p.details,p.stock,p.customFields]);if(!rows[0])return res.status(404).json({error:'Product not found.'});res.json(item(rows[0]))}catch(e){next(e)}});
app.delete('/api/admin/products/:id',admin,async(req,res,next)=>{try{const{rowCount}=await pool.query('DELETE FROM products WHERE id=$1',[req.params.id]);if(!rowCount)return res.status(404).json({error:'Product not found.'});res.status(204).end()}catch(e){next(e)}});
async function saveImage(req,res,next,slot){const match=String(req.body?.dataUrl||'').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);if(!Number.isInteger(slot)||slot<1||slot>3)return res.status(400).json({error:'Choose image 1, 2, or 3.'});if(!match)return res.status(400).json({error:'Upload a JPEG, PNG, or WebP photo.'});const image=Buffer.from(match[2],'base64');if(!image.length||image.length>512*1024)return res.status(400).json({error:'Each photo must be 512 KB or smaller after compression.'});try{const{id}=req.params;const product=await pool.query('SELECT 1 FROM products WHERE id=$1',[id]);if(!product.rowCount)return res.status(404).json({error:'Product not found.'});await pool.query('INSERT INTO product_images(product_id,slot,content_type,data) VALUES($1,$2,$3,$4) ON CONFLICT(product_id,slot) DO UPDATE SET content_type=EXCLUDED.content_type,data=EXCLUDED.data,updated_at=NOW()',[id,slot,match[1],image]);const img=publicApiUrl+'/api/images/'+encodeURIComponent(id)+'/'+slot;const{rows}=await pool.query("UPDATE products SET img=CASE WHEN $2=1 THEN $3 ELSE img END,images=jsonb_build_array(CASE WHEN $2=1 THEN $3::text ELSE COALESCE(NULLIF(images->>0,''),img) END,CASE WHEN $2=2 THEN $3::text ELSE COALESCE(NULLIF(images->>1,''),'') END,CASE WHEN $2=3 THEN $3::text ELSE COALESCE(NULLIF(images->>2,''),'') END),updated_at=NOW() WHERE id=$1 RETURNING images",[id,slot,img]);res.json({img,images:rows[0].images})}catch(e){next(e)}}
app.post('/api/admin/products/:id/images/:slot',admin,(req,res,next)=>saveImage(req,res,next,Number(req.params.slot)));
app.post('/api/admin/products/:id/image',admin,(req,res,next)=>saveImage(req,res,next,1));
async function sendImage(req,res,next,slot){try{const{rows}=await pool.query('SELECT content_type,data FROM product_images WHERE product_id=$1 AND slot=$2',[req.params.id,slot]);if(!rows[0])return res.status(404).end();res.set('Content-Type',rows[0].content_type);res.set('Cross-Origin-Resource-Policy','cross-origin');res.set('Cache-Control','public, max-age=60, must-revalidate');res.send(rows[0].data)}catch(e){next(e)}}
app.get('/api/images/:id',(req,res,next)=>sendImage(req,res,next,1));
app.get('/api/images/:id/:slot',(req,res,next)=>sendImage(req,res,next,Number(req.params.slot)));
app.use((e,_req,res,_next)=>{console.error(e.message);res.status(e.message==='Origin not allowed'?403:500).json({error:e.message==='Origin not allowed'?'Website origin not allowed.':'The store service is temporarily unavailable.'})});
async function start(){
 await pool.query("CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('Saree','Cultural Saree','Blouse Piece','Dress')),fabric TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '',occasion TEXT NOT NULL DEFAULT '',price INTEGER NOT NULL CHECK(price>0),img TEXT NOT NULL DEFAULT '',tag TEXT NOT NULL DEFAULT '',quality TEXT NOT NULL DEFAULT '',details TEXT NOT NULL DEFAULT '',stock BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await pool.query("ALTER TABLE products DROP CONSTRAINT IF EXISTS products_type_check");
 await pool.query("ALTER TABLE products ADD CONSTRAINT products_type_check CHECK(type IN ('Saree','Cultural Saree','Blouse Piece','Dress'))");
 await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb");
 await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb");
 await pool.query("UPDATE products SET images=jsonb_build_array(img,'','') WHERE images='[]'::jsonb AND img<>''");
 await pool.query("CREATE TABLE IF NOT EXISTS store_settings(key TEXT PRIMARY KEY,value JSONB NOT NULL DEFAULT '{}'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await pool.query("CREATE TABLE IF NOT EXISTS product_images(product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,slot SMALLINT NOT NULL DEFAULT 1 CHECK(slot BETWEEN 1 AND 3),content_type TEXT NOT NULL,data BYTEA NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(product_id,slot))");
 await pool.query("ALTER TABLE product_images ADD COLUMN IF NOT EXISTS slot SMALLINT NOT NULL DEFAULT 1");
 await pool.query("ALTER TABLE product_images DROP CONSTRAINT IF EXISTS product_images_pkey");
 await pool.query("ALTER TABLE product_images ADD CONSTRAINT product_images_pkey PRIMARY KEY(product_id,slot)");
 await pool.query("DELETE FROM products WHERE (id LIKE 's-%' AND tag IN ('Featured sample','Collection sample') AND details ILIKE 'Sample product notes.%') OR (id LIKE 'dress-%' AND tag='Dress edit' AND details ILIKE 'Sample dress details.%')");
 console.log('Removed generated sample inventory; owner products are preserved.');
 app.listen(port,'0.0.0.0',()=>console.log('Rama Sarees API listening on '+port));
}
start().catch(e=>{console.error('API startup failed:',e.message);process.exit(1)});
