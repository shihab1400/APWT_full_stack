"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountStatus, Role } from "@mindease/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { ADMIN_NAV } from "./nav";

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  emailVerified: boolean;
  createdAt: string;
}

export default function AdminDashboard() {
  return (
    <AppShell role="ADMIN" nav={ADMIN_NAV}>
      {(me) => <UsersTable currentUserId={me.id} />}
    </AppShell>
  );
}

function UsersTable({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api<AdminUserRow[]>("/admin/users"),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: AccountStatus; reason: string }) =>
      api<AdminUserRow>(`/admin/users/${v.id}/status`, {
        method: "PATCH",
        body: { status: v.status, reason: v.reason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  function toggle(user: AdminUserRow) {
    const next = user.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE";
    const reason = window.prompt(
      `Reason for ${next === "ACTIVE" ? "reactivating" : "deactivating"} ${user.email}:`,
    );
    if (reason?.trim()) setStatus.mutate({ id: user.id, status: next, reason });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      {setStatus.error && <Alert>{setStatus.error.message}</Alert>}
      <Card className="overflow-x-auto p-0">
        {users.isPending ? (
          <p className="p-6 text-sm text-muted">Loading…</p>
        ) : users.error ? (
          <div className="p-6">
            <Alert>{users.error.message}</Alert>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">{u.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.status === "ACTIVE"
                          ? "bg-primary-soft text-primary"
                          : "bg-danger-soft text-danger"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== currentUserId && (
                      <Button
                        variant="ghost"
                        onClick={() => toggle(u)}
                        disabled={setStatus.isPending}
                      >
                        {u.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
