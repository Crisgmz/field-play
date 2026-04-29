import { supabase } from '@/lib/supabase';

type RegistrationEmailPayload = {
  email: string;
  firstName: string;
  lastName?: string;
};

interface BookingReceivedEmailPayload {
  email: string;
  firstName: string;
  clubName?: string;
  fieldName?: string;
  unitName?: string;
  fieldType: string;
  date: string;
  startTime: string;
  endTime: string;
  paymentMethod?: string;
}

interface AdminBookingAlertPayload {
  adminEmail: string;
  adminName?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clubName?: string;
  fieldName?: string;
  unitName?: string;
  fieldType: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice?: number;
  proofUrl?: string;
  panelUrl?: string;
}

interface BookingConfirmedEmailPayload {
  email: string;
  firstName: string;
  clubName?: string;
  clubLocation?: string;
  fieldName?: string;
  unitName?: string;
  fieldType: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice?: number;
  policyHours?: number;
}

interface BookingCancelledEmailPayload {
  email: string;
  firstName: string;
  clubName?: string;
  fieldName?: string;
  unitName?: string;
  fieldType: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice?: number;
  reason?: string | null;
  cancelledBy?: 'client' | 'admin';
  isRejection?: boolean;
}

const formatDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('es-DO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

export async function sendRegistrationWelcomeEmail(payload: RegistrationEmailPayload) {
  const { error } = await supabase.functions.invoke('send-welcome-email', {
    body: payload,
  });

  if (error) {
    throw error;
  }
}

export async function sendBookingReceivedEmail(payload: BookingReceivedEmailPayload) {
  const { error } = await supabase.functions.invoke('send-booking-received-email', {
    body: {
      ...payload,
      formattedDate: formatDate(payload.date),
    },
  });

  if (error) {
    throw error;
  }
}

export async function sendAdminBookingAlert(payload: AdminBookingAlertPayload) {
  const { error } = await supabase.functions.invoke('send-admin-booking-alert', {
    body: {
      ...payload,
      formattedDate: formatDate(payload.date),
    },
  });

  if (error) {
    throw error;
  }
}

export async function sendBookingConfirmedEmail(payload: BookingConfirmedEmailPayload) {
  const { error } = await supabase.functions.invoke('send-booking-confirmed-email', {
    body: {
      ...payload,
      formattedDate: formatDate(payload.date),
    },
  });

  if (error) {
    throw error;
  }
}

export async function sendBookingCancelledEmail(payload: BookingCancelledEmailPayload) {
  const { error } = await supabase.functions.invoke('send-booking-cancelled-email', {
    body: {
      ...payload,
      formattedDate: formatDate(payload.date),
    },
  });

  if (error) {
    throw error;
  }
}
