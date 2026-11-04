import type { Metadata } from "next";

import { ProfileSettings } from "@/components/donor/ProfileSettings";

export const metadata: Metadata = {
  title: "Настройки",
};

export default function Page() {
  return <ProfileSettings />;
}
