import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
const {channelOnboardingSchema,parseChannelModels,channelTemplates,chatOnlyRequests} = await import(pathToFileURL(`${process.env.BIFROST_SOURCE}/ui/lib/channelOnboarding.ts`));
const valid={name:'channel-A',baseUrl:'https://example.com/v1',apiKey:'test-only',models:'model-one\nmodel-two',enabled:true};
test('official channel presets have valid base URLs and identifiers',()=>{
 for(const [key,value] of Object.entries(channelTemplates)) {
  if(key==='custom')continue;
  assert.equal(channelOnboardingSchema.safeParse({...valid,name:value.name,baseUrl:value.baseUrl,models:value.example}).success,true);
 }
});
test('rejects full API paths, embedded credentials and missing fields in Chinese',()=>{
 for(const patch of [{baseUrl:'https://example.com/v1/chat/completions'}, {baseUrl:'https://user:secret@example.com/v1'}, {baseUrl:'https://example.com/v1?key=secret'}, {name:'with space'}, {apiKey:''}, {models:'*'}, {models:''}]) {
  const parsed=channelOnboardingSchema.safeParse({...valid,...patch});
  assert.equal(parsed.success,false);assert.match(parsed.error.issues[0].message,/[\u4e00-\u9fff]/);
 }
});
test('model binding deduplicates without losing slash or case',()=>{
 assert.deepEqual(parseChannelModels(' org/Model-A，model-b\norg/Model-A '),['org/Model-A','model-b']);
});
test('only chat endpoints are enabled by the onboarding wizard',()=>{
 assert.deepEqual(Object.keys(chatOnlyRequests).filter(key=>chatOnlyRequests[key]).sort(),['chat_completion','chat_completion_stream']);
});
