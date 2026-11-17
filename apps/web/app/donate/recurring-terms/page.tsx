import { redirect } from "next/navigation";
import { RECURRING_TERMS_VERSION } from "@/lib/recurring-terms";

export default function Page() { redirect(`/donate/recurring-terms/${RECURRING_TERMS_VERSION}`); }
