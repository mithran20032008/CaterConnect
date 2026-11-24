export type UserRole = 'worker' | 'organisation' | 'admin';

export interface NotificationPrefs {
  emergency: boolean;
  bookings: boolean;
  attendance: boolean;
  payments: boolean;
  support: boolean;
}

export interface User {
  id: number;
  role: UserRole;
  phone: string;
  full_name: string;
  address: string;
  living_location: string;
  lat: number | null;
  lng: number | null;
  city: string;
  photo_url: string;
  work_category: string;
  skills: string;
  experience: string;
  preferred_areas: string;
  availability: string;
  language: 'en' | 'ta';
  notif_prefs: string;
  registered_at: string;
  verified_at: string | null;
  verified_by: string;
  rating_avg: number;
  rating_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Organisation {
  id: number;
  user_id: number;
  owner_name: string;
  phone: string;
  business_name: string;
  category: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  logo_url: string;
  contact_details: string;
  is_demo: number;
  registered_at: string;
  verified_at: string | null;
  verified_by: string;
  rating_avg: number;
  rating_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: number;
  organisation_id: number;
  org_name: string;
  org_logo: string;
  org_verified: boolean;
  org_rating: number;
  org_rating_count: number;
  work_name: string;
  serve_type: string;
  event_date: string;
  reporting_time: string;
  service_start: string;
  service_end: string;
  location_name: string;
  city: string;
  lat: number | null;
  lng: number | null;
  workers_required: number;
  booked_count: number;
  remaining_spots: number;
  dress_code: string;
  base_pay: number;
  bus_fare: number;
  total_pay: number;
  food_provided: number;
  transport_provided: number;
  special_instructions: string;
  show_contact: number;
  contact_phone: string;
  allow_partial_group: number;
  is_urgent: number;
  is_demo: number;
  status: string;
  created_at: string;
  distance_km?: number | null;
  is_saved?: boolean;
  my_application_status?: string | null;
  my_application_can_withdraw?: boolean;
  my_booking_status?: string | null;
  time_conflict?: boolean;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  data_json: string;
  is_read: number;
  status: string;
  created_at: string;
}
