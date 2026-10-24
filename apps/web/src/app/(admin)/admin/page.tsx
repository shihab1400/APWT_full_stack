"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import type { AccountStatus, AdminUserRow } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { ReasonAction } from "@/components/appointment-parts";
import { Alert, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { ADMIN_NAV } from "./nav";

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

export default function AdminDashboard() {
  return (
    <AppShell role="ADMIN" nav={ADMIN_NAV}>
      {(me) => <UsersTable currentUserId={me.id} />}
    </AppShell>
  );
}

function UsersTable({ currentUserId }: { currentUserId: string }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  // Don't query on every keystroke.
  const search = useDeferredValue(q.trim());
  const query = new URLSearchParams(
    Object.entries({ q: search, role, status }).filter(([, v]) => v),
  ).toString();
  const users = useQuery({
    queryKey: ["admin", "users", query],
    queryFn: () => api<AdminUserRow[]>(`/admin/users${query ? `?${query}` : ""}`),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-muted">
            Search by name or email
          </label>
          <input id="q" type="search" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="role" className="text-xs font-medium text-muted">
            Role
          </label>
          <select id="role" className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All</option>
            <option value="USER">Patients</option>
            <option value="DOCTOR">Doctors</option>
            <option value="ADMIN">Admins</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-muted">
            Status
          </label>
          <select id="status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="DEACTIVATED">Suspended</option>
          </select>
        </div>
      </Card>
      <Card className="overflow-x-auto p-0">
        {users.isPending ? (
          <p className="p-6 text-sm text-muted">Loading…</p>
        ) : users.error ? (
          <div className="p-6">
            <Alert>{users.error.message}</Alert>
          </div>
        ) : users.data.length === 0 ? (
          <p className="p-6 text-sm text-muted">No users match.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <UserRow key={u.id} user={u} self={u.id === currentUserId} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function UserRow({ user: u, self }: { user: AdminUserRow; self: boolean }) {
  const qc = useQueryClient();
  const setStatus = useMutation({
    mutationFn: (v: { status: AccountStatus; reason: string }) =>
      api<AdminUserRow>(`/admin/users/${u.id}/status`, { method: "PATCH", body: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const active = u.status === "ACTIVE";

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3">
        {u.name}
        <span className="block text-xs text-muted">{u.email}</span>
      </td>
      <td className="px-4 py-3">{u.role}</td>
      <td className="px-4 py-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            active ? "bg-primary-soft text-primary" : "bg-danger-soft text-danger"
          }`}
        >
          {active ? "Active" : "Suspended"}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(u.createdAt)}</td>
      <td className="min-w-56 px-4 py-3 text-right">
        {!self && (
          <ReasonAction
            label={active ? "Deactivate" : "Reactivate"}
            confirmLabel="Confirm"
            prompt={active ? "Reason for deactivating (logged)" : "Reason for reactivating (logged)"}
            required
            variant="ghost"
            pending={setStatus.isPending}
            onConfirm={(reason) => setStatus.mutate({ status: active ? "DEACTIVATED" : "ACTIVE", reason })}
          />
        )}
        {setStatus.error && <span className="block text-xs text-danger">{setStatus.error.message}</span>}
      </td>
    </tr>
  );
}
