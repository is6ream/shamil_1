import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { donorIpHeaders } from "./donor-ip-forwarding";
test("BFF IP signing is opt-in and ignores arbitrary XFF", () => {
  const oldSecret=process.env.DONOR_IP_FORWARDING_SECRET, oldHeader=process.env.DONOR_WEB_CLIENT_IP_HEADER;
  const req=new NextRequest("https://example.test/api/donor/auth/request-code", {headers:{"x-forwarded-for":"203.0.113.5", "x-verified-ingress-ip":"198.51.100.4"}});
  try {
    delete process.env.DONOR_IP_FORWARDING_SECRET; delete process.env.DONOR_WEB_CLIENT_IP_HEADER;
    assert.deepEqual(donorIpHeaders(req,"donor/auth/request-code"),{});
    process.env.DONOR_IP_FORWARDING_SECRET="synthetic-forwarding-secret-32-bytes";
    assert.deepEqual(donorIpHeaders(req,"donor/auth/request-code"),{});
    process.env.DONOR_WEB_CLIENT_IP_HEADER="x-verified-ingress-ip";
    assert.match(donorIpHeaders(req,"donor/auth/request-code")["X-Shamil-Donor-Ip"]!, /^\d{13} 198\.51\.100\.4 [0-9a-f]{64}$/);
    assert.deepEqual(donorIpHeaders(req,"donor/auth/session"),{});
    process.env.DONOR_WEB_CLIENT_IP_HEADER="x-forwarded-for";
    const chain=new NextRequest("https://example.test", {headers:{"x-forwarded-for":"forged, 198.51.100.4"}});
    assert.deepEqual(donorIpHeaders(chain,"donor/auth/request-code"),{});
  } finally {
    if(oldSecret===undefined)delete process.env.DONOR_IP_FORWARDING_SECRET;else process.env.DONOR_IP_FORWARDING_SECRET=oldSecret;
    if(oldHeader===undefined)delete process.env.DONOR_WEB_CLIENT_IP_HEADER;else process.env.DONOR_WEB_CLIENT_IP_HEADER=oldHeader;
  }
});
