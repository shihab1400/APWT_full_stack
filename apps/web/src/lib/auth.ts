"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { AuthUser, LoginDto, RegisterInput } from "@mindease/shared";
import { api, ApiError } from "./api";

export const meQueryKey = ["auth", "me"] as const;

/** The signed-in user, or null for a guest. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      try {
        return await api<AuthUser>("/auth/me");
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: LoginDto) => api<AuthUser>("/auth/login", { method: "POST", body: dto }),
    onSuccess: (user) => qc.setQueryData(meQueryKey, user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: RegisterInput) =>
      api<AuthUser>("/auth/register", { method: "POST", body: dto }),
    onSuccess: (user) => qc.setQueryData(meQueryKey, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSettled: () => {
      qc.clear();
      router.replace("/login");
    },
  });
}
