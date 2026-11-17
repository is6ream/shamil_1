import { redirect } from "next/navigation";
// Old bookmarks converge on one cabinet; obsolete query tokens are not forwarded.
export default function Page() { redirect("/donor"); }
