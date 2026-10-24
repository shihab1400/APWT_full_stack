import { z } from 'zod';

export interface PublicDoctor {
  id: string;
  name: string;
  specialization: string | null;
  bio: string | null;
  qualifications: string | null;
  experienceYears: number | null;
  /** Consultation fee in BDT. */
  fee: number;
  /** Average of visible reviews, or null when there are none. */
  rating: number | null;
  reviewCount: number;
}

export interface BlogSummary {
  slug: string;
  title: string;
  excerpt: string | null;
  category: string;
  publishedAt: string | null;
  readMinutes: number;
}

export interface BlogPostDetail extends BlogSummary {
  body: string;
  authorName: string | null;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqGroup {
  category: string;
  items: FaqItem[];
}

export interface Hotline {
  id: string;
  name: string;
  number: string;
  description: string | null;
  availability: string | null;
}

export interface PricingPlan {
  tier: 'FREE' | 'PAID';
  name: string;
  /** Monthly price in BDT; 0 for free. */
  price: number;
  features: string[];
}

export interface Pricing {
  currency: 'BDT';
  plans: PricingPlan[];
  consultationFees: { min: number; max: number; doctorCount: number } | null;
}

export const contactSchema = z.object({
  name: z.string().trim().min(2, { error: 'Please enter your name' }).max(100),
  email: z.email({ error: 'Enter a valid email' }).trim().toLowerCase(),
  subject: z.string().trim().max(150).optional(),
  message: z
    .string()
    .trim()
    .min(10, { error: 'Please write at least 10 characters' })
    .max(5000, { error: 'Message is too long' }),
});
export type ContactInput = z.input<typeof contactSchema>;
export type ContactDto = z.output<typeof contactSchema>;

export interface ContactReceipt {
  reference: string;
  receivedAt: string;
}
