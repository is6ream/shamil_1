"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import styles from "./SubscriptionManager.module.css";

export function SubscriptionAccess({ saved = false, onSaved }: {
  saved?: boolean; onSaved?: (saved: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/donation-recurring?access=1", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error();
      const { code } = await response.json();
      if (typeof code !== "string" || !/^[0-9a-f]{64}$/.test(code)) throw new Error();
      const url = URL.createObjectURL(new Blob([
        `Секретный код управления пожертвованием. Храните как пароль.\n${location.origin}/donate/subscription\n${code}\n`,
      ], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "shamil-subscription-access.txt";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
    } catch {
      setError("Не удалось сохранить код. Повторите попытку.");
    } finally { setBusy(false); }
  }

  return <div className={styles.access} data-private="true">
    <p>Сохраните секретный код доступа. С ним можно отключить автосписания после очистки cookie и с другого устройства. Контактные данные не нужны. Без cookie и кода самостоятельное восстановление невозможно.</p>
    <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void download()}>
      {busy ? "Сохраняем код…" : "Скачать код доступа"}
    </button>
    {downloaded && <p role="status">Файл с кодом подготовлен. Убедитесь, что он сохранён в безопасном месте. Никому не передавайте код.</p>}
    {downloaded && onSaved && <Checkbox id="subscription-code-saved" name="accessSaved" checked={saved} onChange={onSaved}>
      Я сохранил(-а) код доступа к управлению подпиской
    </Checkbox>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
