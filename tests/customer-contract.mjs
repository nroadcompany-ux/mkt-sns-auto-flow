import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateVideo,fromKst,localKst,MAX_VIDEO_BYTES,loginEmail,isOwner} from '../lib/customer.ts'
test('Upload boundary rejects non-video, empty and oversized files',()=>{
 assert.ok(validateVideo({size:1,type:'text/plain'}));assert.ok(validateVideo({size:0,type:'video/mp4'}))
 assert.ok(validateVideo({size:MAX_VIDEO_BYTES+1,type:'video/mp4'}));assert.equal(validateVideo({size:MAX_VIDEO_BYTES,type:'video/mp4'}),null)
})
test('Korean reservation time is independent of the browser timezone',()=>{
 assert.equal(fromKst('2026-10-20T09:30'),'2026-10-20T00:30:00.000Z')
 assert.equal(localKst('2026-10-20T00:30:00Z'),'2026-10-20T09:30')
 assert.equal(fromKst(''),null)
})

test('Reserved operator IDs are case-insensitive while customer email login is preserved',()=>{
 assert.equal(loginEmail(' Alex '),'alex@staff.marketingplay.internal')
 assert.equal(loginEmail('DAVID'),'david@staff.marketingplay.internal')
 assert.equal(loginEmail(' client@example.test '),'client@example.test')
 assert.equal(loginEmail('unknown'),'unknown')
})
test('Highest permission requires both server-managed role and access',()=>{
 assert.equal(isOwner(null),false)
 assert.equal(isOwner({app_metadata:{mp_role:'operator'}}),false)
 assert.equal(isOwner({app_metadata:{mp_access:'owner'}}),false)
 assert.equal(isOwner({app_metadata:{mp_role:'operator',mp_access:'owner'}}),true)
})
