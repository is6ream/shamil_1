"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { API_URL } from "@/lib/site";

import { createAdminClient } from "./api-client";
import type { AdminClient } from "./api-client";
import { AUTH_PATHS, parseAccessToken, parseAdminUser } from "./endpoints";
import type { AdminUser, LoginBody } from "./endpoints";
import { loginRequest } from "./login";
import { can } from "./roles";
import type { AdminPermission } from "./roles";

/**
 * Сессия админки на клиенте (D-05).
 *
 * При загрузке вкладки access-токена нет (он только в памяти), поэтому
 * первым делом — refresh по httpOnly-cookie и `/me`. Пользователь и токен
 * не попадают ни в какое браузерное хранилище.
 */

export type SessionState =
  | { readonly status: "loading" }
  | { readonly status: "anonymous" }
  | { readonly status: "authenticated"; readonly user: AdminUser };

interface SessionContextValue {
  readonly state: SessionState;
  readonly client: AdminClient;
  login(body: LoginBody): Promise<void>;
  logout(): Promise<void>;
  /** Только для интерфейса: API всё равно проверит права сам. */
  can(permission: AdminPermission): boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function loadMe(client: AdminClient): Promise<AdminUser> {
  return parseAdminUser(await client.request<unknown>(AUTH_PATHS.me));
}

export function AdminSessionProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const [client] = useState(() =>
    createAdminClient({
      baseUrl: API_URL,
      onSessionExpired: () => setState({ status: "anonymous" }),
    }),
  );

  useEffect(() => {
    let isActive = true;

    async function restore(): Promise<SessionState> {
      if (!(await client.refresh())) {
        return { status: "anonymous" };
      }

      try {
        return { status: "authenticated", user: await loadMe(client) };
      } catch {
        return { status: "anonymous" };
      }
    }

    void restore().then((next) => {
      if (isActive) {
        setState(next);
      }
    });

    return () => {
      isActive = false;
    };
  }, [client]);

  const login = useCallback(
    async (body: LoginBody) => {
      const response = await loginRequest(client, body);

      client.setAccessToken(parseAccessToken(response));

      let user: AdminUser;

      try {
        user = parseAdminUser(response);
      } catch {
        user = await loadMe(client);
      }

      setState({ status: "authenticated", user });
    },
    [client],
  );

  const logout = useCallback(async () => {
    try {
      await client.request(AUTH_PATHS.logout, { method: "POST", skipAuthRetry: true });
    } catch {
      // Выходим локально в любом случае: refresh-cookie без access бесполезна
      // до следующего входа, а держать человека в админке из-за сбоя сети нельзя.
    }

    client.setAccessToken(null);
    setState({ status: "anonymous" });
  }, [client]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      client,
      login,
      logout,
      can: (permission) => state.status === "authenticated" && can(state.user.role, permission),
    }),
    [state, client, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useAdminSession(): SessionContextValue {
  const value = useContext(SessionContext);

  if (value === null) {
    throw new Error("useAdminSession вне AdminSessionProvider");
  }

  return value;
}
