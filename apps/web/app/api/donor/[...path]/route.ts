import type { NextRequest } from "next/server";
import { donorBff } from "@/lib/donor-bff";
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: NextRequest, context: Context) {
  return donorBff(request, "donor/" + (await context.params).path.join("/"));
}
export const GET = handle;
export const POST = handle;
