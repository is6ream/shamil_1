"use client";

import { useEffect, useId, useState } from "react";

import field from "@/components/ui/field.module.css";
import { errorMessage } from "@/lib/admin/errors";
import { DONOR_AUTH_PATHS, DONOR_PATHS, PROFILE_PATHS } from "@/lib/donor/endpoints";
import { donorClient, loadLoginMethods, replaceDonorProfile } from "@/lib/donor/session";
import type { DonorProfile } from "@/lib/donor/types";

import styles from "./ProfileSettings.module.css";

/**
 * Вход через VK ID как второй способ. Секция видна, только если VK ID
 * настроен на сервере. Отвязать можно, только если есть почта — иначе
 * войти будет нечем (сервер ответит 409 с объяснением).
 */
export function VkSection({ profile }: { readonly profile: DonorProfile }) {
  const ids = useId();
  const [isEnabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  useEffect(() => {
    let isActive = true;

    void loadLoginMethods().then((methods) => {
      if (isActive) {
        setEnabled(methods.vk);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  if (!isEnabled) {
    return null;
  }

  async function link() {
    setBusy(true);
    setError(null);

    try {
      const { url } = await donorClient().request<{ url: string }>(DONOR_AUTH_PATHS.vkLink, {
        method: "POST",
        body: { returnTo: PROFILE_PATHS.settings },
      });

      window.location.assign(url);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError(null);

    try {
      replaceDonorProfile(await donorClient().request<DonorProfile>(DONOR_PATHS.vk, { method: "DELETE" }));
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`card ${styles.section}`} aria-labelledby={`${ids}-title`}>
      <h2 className={styles.heading} id={`${ids}-title`}>
        Вход через VK
      </h2>
      <div className={styles.row}>
        <span className={styles.muted}>
          {profile.vkLinked ? "VK привязан: в кабинет можно входить в один клик." : "Привяжите VK, чтобы входить без кода из письма."}
        </span>
        {profile.vkLinked ? (
          <button className="btn btn-ghost btn-sm" type="button" aria-busy={isBusy} onClick={() => void unlink()}>
            Отвязать
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" type="button" aria-busy={isBusy} onClick={() => void link()}>
            Привязать VK
          </button>
        )}
      </div>
      {error === null ? null : (
        <p className={field.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
