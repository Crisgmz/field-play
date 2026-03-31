import { supabase } from '@/lib/supabase';

interface BookingConfirmationEmailPayload {
  email: string;
  firstName: string;
  clubName?: string;
  fieldName?: string;
  unitName?: string;
  fieldType: string;
  date: string;
  startTime: string;
  endTime: string;
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

export async function sendBookingReceivedEmail(payload: BookingConfirmationEmailPayload) {
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
