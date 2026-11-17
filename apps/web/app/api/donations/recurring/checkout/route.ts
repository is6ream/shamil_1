import type { NextRequest } from "next/server";
import { donorBff } from "@/lib/donor-bff";
export async function POST(request: NextRequest) { return donorBff(request, "donations/recurring/checkout"); }
