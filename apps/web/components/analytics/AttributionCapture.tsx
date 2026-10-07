"use client";

import { useEffect } from "react";

import { captureFirstTouch } from "@/lib/attribution";

/**
 * Запоминает UTM-метки первого захода (first-touch, 30 дней).
 * Ничего не рисует. Стоит в корневом layout, чтобы сработать на любой
 * странице входа — главной, региональной ссылке, отчётах.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureFirstTouch();
  }, []);

  return null;
}
