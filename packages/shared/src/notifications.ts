export const NotificationType = {
  DOCTOR_SUBMITTED: 'DOCTOR_SUBMITTED',
  DOCTOR_APPROVED: 'DOCTOR_APPROVED',
  DOCTOR_REJECTED: 'DOCTOR_REJECTED',
  APPOINTMENT_REQUESTED: 'APPOINTMENT_REQUESTED',
  APPOINTMENT_ACCEPTED: 'APPOINTMENT_ACCEPTED',
  APPOINTMENT_DECLINED: 'APPOINTMENT_DECLINED',
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  APPOINTMENT_EXPIRED: 'APPOINTMENT_EXPIRED',
  APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REFUND_DUE: 'REFUND_DUE',
  REFUND_SENT: 'REFUND_SENT',
  SUBSCRIPTION_ACTIVATED: 'SUBSCRIPTION_ACTIVATED',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** In-app path to open, e.g. /dashboard/appointments. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationItem[];
  unreadCount: number;
}

/** Events on GET /api/notifications/stream (Server-Sent Events). */
export type NotificationStreamEvent =
  | { event: 'ready'; data: { unreadCount: number } }
  | { event: 'notification'; data: NotificationItem };
