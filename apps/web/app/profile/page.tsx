import type { Metadata } from "next";

import { MyHelp } from "@/components/donor/MyHelp";

export const metadata: Metadata = {
  title: "Моя помощь",
};

export default function Page() {
  return <MyHelp />;
}
