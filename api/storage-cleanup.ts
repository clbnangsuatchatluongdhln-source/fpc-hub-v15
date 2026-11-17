import type {VercelRequest,VercelResponse} from '@vercel/node';
import {timingSafeEqual} from 'node:crypto';
import {runStorageMaintenance} from './_lib/storage-maintenance';

export default async function handler(req:VercelRequest,res:VercelResponse) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).end();
  const secret=process.env.CRON_SECRET;
  if(!secret)return res.status(503).json({error:'Cleanup is not configured'});
  const actual=Buffer.from(req.headers.authorization??'');
  const expected=Buffer.from('Bearer '+secret);
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected))return res.status(401).end();
  try{return res.json(await runStorageMaintenance());}
  catch{return res.status(503).json({error:'Cleanup unavailable'});}
}
