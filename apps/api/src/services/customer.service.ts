import type { NormalizedCustomerProfile, Platform } from '@mcc/shared'
import { Prisma } from '@prisma/client'
import prisma from '../db/prisma'
import { registry } from '../adapters/registry'

export class CustomerService {
  /**
   * Finds an existing customer by their platform ID, or creates one.
   * Also enriches the profile from the platform API if the customer is new
   * or has no name yet.
   */
  async findOrCreate(profile: NormalizedCustomerProfile) {
    const where =
      profile.platform === 'whatsapp'
        ? { whatsappPhone: profile.platformId }
        : { messengerPsid: profile.platformId }

    const existing = await prisma.customer.findFirst({ where })

    if (existing) {
      // Enrich name/avatar if we have new info
      if (profile.name && (!existing.name || !existing.avatarUrl)) {
        return prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: existing.name ?? profile.name,
            avatarUrl: existing.avatarUrl ?? profile.avatarUrl,
          },
        })
      }
      return existing
    }

    // New customer: try to fetch full profile from platform
    let enriched = profile
    try {
      const adapter = registry.get(profile.platform)
      enriched = await adapter.getProfile(profile.platformId)
    } catch {
      // Profile fetch is best-effort
    }

    return prisma.customer.create({
      data: {
        whatsappPhone: profile.platform === 'whatsapp' ? profile.platformId : undefined,
        messengerPsid: profile.platform === 'messenger' ? profile.platformId : undefined,
        name: enriched.name ?? profile.name,
        avatarUrl: enriched.avatarUrl ?? profile.avatarUrl,
        firstContactAt: new Date(),
      },
    })
  }

  async findById(id: string) {
    return prisma.customer.findUnique({ where: { id } })
  }

  async list(params: {
    search?: string
    platform?: Platform
    page?: number
    limit?: number
  }) {
    const { search, platform, page = 1, limit = 20 } = params
    const skip = (page - 1) * limit

    const where: Prisma.CustomerWhereInput = {}

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { whatsappPhone: { contains: search } },
      ]
    }

    if (platform === 'whatsapp') {
      where.whatsappPhone = { not: null }
    } else if (platform === 'messenger') {
      where.messengerPsid = { not: null }
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: { conversations: { orderBy: { lastMessageAt: 'desc' }, take: 1 } },
      }),
      prisma.customer.count({ where }),
    ])

    return { customers, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async updateLastMessageAt(customerId: string, timestamp: Date) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { lastMessageAt: timestamp },
    })
  }
}

export const customerService = new CustomerService()
