"""Servidor local para VocabLab: arquivos estáticos + pré-análise de PDFs (PyMuPDF)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json, re, sys, unicodedata

ROOT=Path(__file__).resolve().parent
MAX_BYTES=80*1024*1024
GLOSSARY={'hair':'cabelo','eye':'olho','nose':'nariz','tooth':'dente','teeth':'dentes','ear':'orelha','lip':'lábio','neck':'pescoço','shoulder':'ombro','nail':'unha','thumb':'polegar','finger':'dedo','hand':'mão','arm':'braço','chest':'peito','side':'lado','stomach':'estômago','back':'costas','waist':'cintura','hip':'quadril','leg':'perna','knee':'joelho','foot':'pé','feet':'pés','toe':'dedo do pé','heart':'coração','brain':'cérebro','blood':'sangue','skin':'pele','mouth':'boca','head':'cabeça'}
BLOCK={'common mistakes','tip','expressions','pronunciation problems','singular and plurals','english vocabulary in use elementary','exercises','audio not supported','over to you'}

def slug(s):
 s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower();return re.sub('-+','-',re.sub('[^a-z0-9]+','-',s)).strip('-')[:64] or 'item'

def extract(data, filename):
 import fitz
 doc=fitz.open(stream=data,filetype='pdf')
 if doc.page_count>700:raise ValueError('PDF muito longo (máximo: 700 páginas).')
 units=[]
 for idx,page in enumerate(doc):
  lines=[]
  for block in page.get_text('dict').get('blocks',[]):
   for line in block.get('lines',[]):
    spans=line.get('spans',[])
    if not spans:continue
    txt=''.join(s.get('text','') for s in spans).strip()
    if txt:lines.append((txt,spans))
  if not lines:continue
  # Unit openers: a giant number + heading in giant bold type, not the exercise page.
  no=None;title=None
  # Publishers vary heading order (number before/after title, or same line).
  for j,(txt,sp) in enumerate(lines[:9]):
   sz=max(x.get('size',0) for x in sp)
   m=re.fullmatch(r'(\d{1,3})\s+(.{3,90})',txt)
   if m and sz>20:
    no=int(m.group(1));title=m.group(2);break
   if re.fullmatch(r'\d{1,3}',txt) and sz>25:
    candidate=int(txt)
    for off in (-1,1):
     pos=j+off
     if 0<=pos<len(lines):
      t,sp2=lines[pos]
      if max(x.get('size',0) for x in sp2)>20 and len(t)<100 and not re.fullmatch(r'\d+',t):
       no=candidate;title=t;break
    if no is not None:break
  if no is None:continue
  if units and no<=units[-1]['number']:continue
  units.append({'number':no,'title':title,'page':idx+1,'items':[],'warnings':[]})
  seen=set(); section=title
  for text, spans in lines:
   if len(text)>110:continue
   font=spans[0].get('font','')
   size=spans[0].get('size',0)
   if size>16 and size<23 and len(text)>2 and text.lower() not in BLOCK:section=text;continue
   if size<11 or size>21:continue
   # take standalone bold entries and highlighted words embedded in prose, but never complete sentences
   candidates=[]
   if all('Bold' in s.get('font','') for s in spans) and len(text)<=47:
    candidates=[text]
   else:
    for s in spans:
     t=s.get('text','').strip()
     if 'Bold' in s.get('font','') and t and len(t)<=35:candidates.append(t)
   for candidate in candidates:
    candidate=re.sub(r'\s+',' ',candidate).strip(' .,;:!?()[]–-')
    if ('/' in candidate and len(candidate)>24) or len(candidate)>42:continue
    if not re.fullmatch(r"[A-Za-z][A-Za-z '\-/]{1,41}",candidate):continue
    if len(candidate.split())>4 or len(candidate)<3:continue
    if candidate.lower() in BLOCK or candidate.lower()==title.lower() or candidate.lower()==section.lower():continue
    if candidate[0].isupper() and candidate.lower() not in GLOSSARY and len(candidate.split())>1:continue
    if candidate.lower() in ('the','and','with','that','this','you','your','are','have','has','but','not','from','was','were','they','what','when','which','see','for','can','no','yes','one','two','three','we','she','he','is','in','it','a','b','c','d','e','f'):continue
    k=candidate.casefold()
    if k in seen:continue
    seen.add(k)
    units[-1]['items'].append({'word':candidate,'pt':GLOSSARY.get(k,''),'ipa':'','example':'','section':section,'page':idx+1,'selected':bool(GLOSSARY.get(k)),'confidence':'high' if all('Bold' in s.get('font','') for s in spans) else 'review'})
 for u in units:
  if not u['items']:u['warnings'].append('Nenhum termo foi identificado automaticamente.')
  if len(u['items'])>100:
   u['items']=u['items'][:100];u['warnings'].append('Lista limitada aos primeiros 100 candidatos; revise o PDF.')
 if not units:raise ValueError('Não encontrei unidades numeradas em texto selecionável. PDFs digitalizados exigem OCR, ainda não incluído.')
 return {'filename':filename[:180],'pages':doc.page_count,'book':re.sub(r'\s*\[[^]]*\]','',filename).removesuffix('.pdf')[:120], 'units':units,'warnings':['Extração heurística: candidatos podem conter erros, lacunas ou palavras de contexto. Confirme a seleção, traduções e frases antes de publicar.','Sem OCR para páginas digitalizadas. O processamento ocorre somente neste computador.']}

class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_POST(self):
  if self.path!='/api/pdf/analyze':return self.send_error(404)
  try:
   size=int(self.headers.get('Content-Length','0'))
   if not 0<size<=MAX_BYTES:raise ValueError('Envie um PDF de até 80 MB.')
   data=self.rfile.read(size)
   if not data.startswith(b'%PDF'):raise ValueError('Arquivo não é um PDF válido.')
   result=extract(data,self.headers.get('X-Filename','Imported Book.pdf'))
   payload=json.dumps(result,ensure_ascii=False).encode()
   code=200
  except Exception as e:
   payload=json.dumps({'error':str(e)},ensure_ascii=False).encode();code=400
  self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
 def log_message(self,*args):pass

if __name__=='__main__':
 try:import fitz
 except ImportError:sys.exit('Dependência ausente. Execute: python -m pip install pymupdf')
 port=int(sys.argv[1]) if len(sys.argv)>1 else 8085
 print(f'VocabLab PDF importer: http://127.0.0.1:{port}/ (Ctrl+C para encerrar)',flush=True)
 ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
