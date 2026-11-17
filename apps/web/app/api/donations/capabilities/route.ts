import type { NextRequest } from "next/server";
import { donorBff } from "@/lib/donor-bff";
export async function GET(request: NextRequest) { return donorBff(request, "donations/capabilities"); }
