#!/usr/bin/env python3
"""One-time migration for Bifrost v2/PostgreSQL. Run on the cluster host after DB backups.
Adds missing exact-channel catalog rows without inventing prices/capabilities,
then moves legacy facts using Bifrost's supported attribute API. Idempotent;
conflicting existing attributes abort before writes. No credentials are printed.
"""
import argparse
import json
import os
import subprocess

namespace = os.environ.get('NAMESPACE', 'opsiforce')
pg_pod = os.environ.get('POSTGRES_POD', 'opsiforce-postgres-0')
backend = os.environ.get('BACKEND_DEPLOYMENT', 'opsiforce-backend')
keys = ('context', 'maxInput', 'maxOutput', 'tools', 'streaming', 'reasoningAccounting', 'reasoningEfforts', 'maxTokensField', 'source')

def sql(database, query):
    return subprocess.check_output(['kubectl', '-n', namespace, 'exec', pg_pod, '--', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, '-Atc', query], text=True).strip()

def gateway(method, path, body=None):
    script = '''const [method,path,body]=JSON.parse(process.argv[1]);
const root=process.env.BIFROST_PROXY_URL.replace(/\\/v1\\/?$/, '');
const headers={'Content-Type':'application/json',Authorization:'Basic '+Buffer.from(process.env.BIFROST_ADMIN_USERNAME+':'+process.env.BIFROST_ADMIN_PASSWORD).toString('base64')};
const r=await fetch(root+path,{method,headers,signal:AbortSignal.timeout(20000),...(body===null?{}:{body:JSON.stringify(body)})});
if(!r.ok)throw new Error('Bifrost '+r.status+': '+await r.text());
console.log(r.status===204?'null':await r.text());'''
    return json.loads(subprocess.check_output(['kubectl', '-n', namespace, 'exec', 'deployment/'+backend, '--', 'node', '--input-type=module', '-e', script, json.dumps([method, path, body])], text=True))

def catalog():
    result = []
    while True:
        page = gateway('GET', '/api/models/details?limit=100&offset='+str(len(result)))
        if not page['models'] and len(result) < page['total']: raise RuntimeError('Incomplete catalog')
        result.extend(page['models'])
        if len(result) >= page['total']: return result

def literal(value):
    return "'"+value.replace("'", "''")+"'"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepare-provider', help='Prepare catalog rows for this exact channel only, without migrating legacy facts')
args = parser.parse_args()
models = catalog()
profiles = json.loads(sql('opsiforce', "SELECT COALESCE(json_agg(row_to_json(p)), '[]') FROM model_capability_profiles p"))
if args.prepare_provider:
    profiles = []
providers = {args.prepare_provider} if args.prepare_provider else {p['provider'] for p in profiles}
models = [m for m in models if m['provider'] in providers]
by_id = {(m['provider'], m['name']): m for m in models}
entries = []
for profile in profiles:
    pair = (profile['provider'], profile['model'])
    if pair not in by_id: raise RuntimeError('Legacy model absent from Bifrost: '+repr(pair))
    attrs = dict(by_id[pair].get('additional_attributes') or {})
    for key in keys:
        if key not in profile['policy']: continue
        value = profile['policy'][key]
        encoded = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        name = 'opsiforce.'+key
        if name in attrs and attrs[name] != encoded: raise RuntimeError('Existing Bifrost attribute conflicts: '+repr(pair)+' '+name)
        attrs[name] = encoded
    entries.append({'provider': pair[0], 'model': pair[1], 'additional_attributes': attrs})

# In v2 the attribute endpoint updates existing rows only. No name-based provider mapping.
values = ','.join('('+literal(m['name'])+','+literal(m['provider'])+",'chat')" for m in models)
if values:
    sql('bifrost', 'INSERT INTO governance_model_pricing (model,provider,mode) VALUES '+values+' ON CONFLICT (model,provider,mode) DO NOTHING;')
if entries: gateway('PUT', '/api/models/catalog', entries)
else: gateway('PUT', '/api/models/catalog', [])  # reload the catalog cache after preparing rows
after = {(m['provider'], m['name']): m for m in catalog()}
for entry in entries:
    actual = after[(entry['provider'], entry['model'])].get('additional_attributes', {})
    if actual != entry['additional_attributes']: raise RuntimeError('Bifrost readback mismatch: '+entry['model'])
print(json.dumps({'catalogRowsChecked':len(models),'profilesMigratedAndVerified':len(entries)}, ensure_ascii=False))
