import sys,re
h=open('/Users/ofir/kenyonexpress-web/kenyonexpress/refs/ke_live_home.html',encoding='utf-8',errors='ignore').read()
# split css into rules by scanning for '{...}' blocks and keep the selector before them
rules=[]
i=0
n=len(h)
# crude: iterate over all '}' and take selector between previous '}' or ';' and '{'
for m in re.finditer(r'\{[^{}]*\}', h):
    sel_end=m.start()
    sel_start=max(h.rfind('}',0,sel_end), h.rfind('{',0,sel_end), h.rfind('>',0,sel_end), h.rfind(';',0,sel_end))+1
    sel=h[sel_start:sel_end].strip()
    rules.append((sel, m.group(0)))
keys=sys.argv[1:]
for k in keys:
    print('##',k)
    seen=set()
    for sel,body in rules:
        if k in sel and (sel,body) not in seen and len(sel)<400:
            seen.add((sel,body)); print(sel[-200:], body[:300])
