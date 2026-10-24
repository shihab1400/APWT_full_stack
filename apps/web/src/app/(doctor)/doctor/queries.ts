"use client";

import { useQuery } from "@tanstack/react-query";
import type { AppointmentItem, DoctorSelfProfile } from "@mindease/shared";
import { api } from "@/lib/api";

export const profileKey = ["doctor", "profile"];

export function useDoctorProfile() {
  return useQuery({
    queryKey: profileKey,
    queryFn: () => api<DoctorSelfProfile>("/doctor/profile"),
  });
}

export function useDoctorAppointments() {
  return useQuery({
    queryKey: ["appointments", "doctor"],
    queryFn: () => api<AppointmentItem[]>("/doctor/appointments"),
  });
}
