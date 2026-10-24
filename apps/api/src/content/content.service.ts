import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FREE_DAILY_CHAT_LIMIT,
  PAID_PLAN_MONTHLY_PRICE,
  type BlogPostDetail,
  type BlogSummary,
  type FaqGroup,
  type Hotline,
  type Pricing,
} from '@mindease/shared';
import { PrismaService } from '../prisma/prisma.service.js';

const WORDS_PER_MINUTE = 200;
const readMinutes = (body: string) =>
  Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE));

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async listBlogs(category?: string): Promise<BlogSummary[]> {
    const posts = await this.prisma.blogPost.findMany({
      where: { published: true, ...(category ? { category } : {}) },
      orderBy: { publishedAt: 'desc' },
      select: {
        slug: true,
        title: true,
        excerpt: true,
        category: true,
        publishedAt: true,
        body: true,
      },
    });
    return posts.map(({ body, publishedAt, ...p }) => ({
      ...p,
      publishedAt: publishedAt?.toISOString() ?? null,
      readMinutes: readMinutes(body),
    }));
  }

  async getBlog(slug: string): Promise<BlogPostDetail> {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, published: true },
      include: { author: { select: { name: true } } },
    });
    if (!post) throw new NotFoundException('Article not found');
    return {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      category: post.category,
      body: post.body,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      readMinutes: readMinutes(post.body),
      authorName: post.author?.name ?? null,
    };
  }

  async listFaqs(): Promise<FaqGroup[]> {
    const faqs = await this.prisma.faq.findMany({
      where: { published: true },
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
      select: { id: true, category: true, question: true, answer: true },
    });
    const groups = new Map<string, FaqGroup>();
    for (const { category, ...item } of faqs) {
      if (!groups.has(category)) groups.set(category, { category, items: [] });
      groups.get(category)!.items.push(item);
    }
    return [...groups.values()];
  }

  listHotlines(): Promise<Hotline[]> {
    return this.prisma.hotline.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, number: true, description: true, availability: true },
    });
  }

  async getPricing(): Promise<Pricing> {
    const fees = await this.prisma.doctorProfile.aggregate({
      where: publicDoctorWhere,
      _min: { fee: true },
      _max: { fee: true },
      _count: true,
    });

    return {
      currency: 'BDT',
      plans: [
        {
          tier: 'FREE',
          name: 'Free',
          price: 0,
          features: [
            `AI companion chat (${FREE_DAILY_CHAT_LIMIT} messages a day)`,
            'Self-assessment check-ins',
            'Articles, FAQs and emergency resources',
            'Browse verified doctors',
          ],
        },
        {
          tier: 'PAID',
          name: 'Premium',
          price: PAID_PLAN_MONTHLY_PRICE,
          features: [
            'Unlimited AI companion chat',
            'Book online (text) or in-person consultations',
            'Chat and assessment history',
            'Rate and review your doctors',
          ],
        },
      ],
      consultationFees:
        fees._count > 0
          ? { min: Number(fees._min.fee), max: Number(fees._max.fee), doctorCount: fees._count }
          : null,
    };
  }
}

/** Doctors a guest may see: approved, verified, and with an active account. */
export const publicDoctorWhere = {
  approvalStatus: 'APPROVED',
  verified: true,
  user: { status: 'ACTIVE' },
} as const;
