import assert from "node:assert/strict";
import { test } from "node:test";
import { donorRequest, DonorRequestError } from "./donor-client";
import { donorMoney, donorState } from "./donor-view";

test("donor errors preserve retry delay from JSON or Retry-After", async () => {
 const original = globalThis.fetch;
 try {
  for (const fromBody of [true, false]) {
   globalThis.fetch = async () => new Response(JSON.stringify({error:{code:"RATE_LIMITED",message:"Повторите позже",...(fromBody?{retryAfterSeconds:93}:{})}}),{status:429,headers:{"Retry-After":"72"}});
   await assert.rejects(donorRequest("donor/auth/request-code",{email:"test@example.test"}),e => e instanceof DonorRequestError && e.retryAfterSeconds === (fromBody ? 93 : 72));
  }
 } finally {globalThis.fetch=original;}
});
test("HTML failure stays a recoverable donor error instead of a JSON exception",async()=>{
 const original=globalThis.fetch;
 try {globalThis.fetch=async()=>new Response("<h1>Unavailable</h1>",{status:503});await assert.rejects(donorRequest("donor/subscriptions"),e=>e instanceof DonorRequestError && e.code==="SERVICE_UNAVAILABLE");}
 finally{globalThis.fetch=original;}
});
test("donor checkout retry sends the same caller-owned idempotency key without storing credentials",async()=>{
 const original=globalThis.fetch;const keys:string[]=[];
 try{globalThis.fetch=async(_url,options)=>{keys.push(new Headers(options?.headers).get("Idempotency-Key")!);assert.equal(options?.referrerPolicy,"no-referrer");assert.equal(options?.cache,"no-store");return Response.json({ok:true});};await donorRequest("donations/recurring/checkout",{},"same-key");await donorRequest("donations/recurring/checkout",{},"same-key");assert.deepEqual(keys,["same-key","same-key"]);}
 finally{globalThis.fetch=original;}
});
test("cabinet formats integer kopecks precisely and hides unknown technical states",()=>{
 assert.equal(donorMoney("50025"),"500,25 ₽");assert.equal(donorMoney("1"),"0,01 ₽");assert.equal(donorState("internal_provider_error"),"Состояние уточняется");
});

test("empty successful response cannot confirm a session or checkout", async () => {
 const original=globalThis.fetch;
 try { globalThis.fetch=async()=>new Response("<html>proxy</html>",{status:200}); await assert.rejects(donorRequest("donor/auth/session"),e=>e instanceof DonorRequestError && e.code==="SERVICE_UNAVAILABLE"); } finally {globalThis.fetch=original;}
});
