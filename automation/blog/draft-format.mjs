import {createHash} from 'node:crypto';
const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function paragraphs(body){
  if(typeof body!=='string'||!body.trim())throw Error('EMPTY_DRAFT');
  return body.replace(/\r\n?/g,'\n').split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
}
export function draftHTML(body){return paragraphs(body).map(p=>'<p style="margin:0 0 1.2em!important;line-height:1.8">'+escape(p).replace(/\n/g,'<br>')+'</p>').join('\n');}
export function fingerprint(draft){return createHash('sha256').update(JSON.stringify({title:draft.title,body:draft.body})).digest('hex');}
export function normalizedText(text){return text.replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n').replace(/\s+/g,' ').trim();}
